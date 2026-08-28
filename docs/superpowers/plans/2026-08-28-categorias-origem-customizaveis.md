# Categorias de Origem Customizáveis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin cadastra suas próprias categorias de "como o cliente conheceu a barbearia" (em vez das 5 fixas no código hoje), com uma tela de gerenciamento nova e a lista aparecendo dinamicamente em todo lugar que já pergunta isso.

**Architecture:** Nova tabela `categorias_origem` (por barbearia, RLS igual a `produtos`/`servicos`, com leitura pública pro agendamento anônimo). `clientes.categoria_origem` continua `text`, mas o `CHECK` fixo sai do banco — a validação em `criar_ou_obter_cliente` passa a consultar a tabela. `src/lib/categorias-origem.ts` perde a lista fixa (fica só o alias de tipo). Todo componente que hoje importa essa lista passa a receber via prop, buscada pela página-mãe.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui, Supabase (Postgres + RLS + pgTAP).

**Spec:** `docs/superpowers/specs/2026-08-28-categorias-origem-customizaveis-design.md`

## Global Constraints

- **`clientes.categoria_origem` guarda o nome (texto) da categoria, não um `id`** — sem join necessário em nenhum lugar que só mostra o texto.
- **Dados antigos migram de slug pra texto por extenso** (`indicacao` → `Indicação`, etc.) na mesma migration que remove o `CHECK`.
- **`criar_ou_obter_cliente` mantém a mesma assinatura** (8 parâmetros) — só o corpo muda (validação dinâmica em vez de lista fixa), sem precisar de `drop function`.
- **`CategoriaOrigem` continua existindo como tipo** (`= string`) em `src/lib/categorias-origem.ts`, só a lista `CATEGORIAS_ORIGEM` é removida — minimiza o diff em arquivos que só importam o tipo.
- **`ClienteAutocomplete`/`TelefoneClienteBusca` passam a exigir uma prop `categorias`** (não mais opcional com fallback) — todo call site precisa ser atualizado, o compilador pega qualquer um esquecido.

---

### Task 1: Migration (`categorias_origem`, RLS, seed, migração de dados, `criar_ou_obter_cliente`) + pgTAP

**Files:**
- Create: `supabase/migrations/0037_categorias_origem.sql`
- Create: `supabase/tests/database/0022_categorias_origem.test.sql`

**Interfaces:**
- Produces: tabela `categorias_origem` (`id, barbearia_id, nome, ativo`); `criar_ou_obter_cliente` com validação dinâmica de categoria. Usadas por todas as tasks seguintes.

- [ ] **Step 1: Criar `supabase/migrations/0037_categorias_origem.sql`**

```sql
create table categorias_origem (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true
);

alter table categorias_origem enable row level security;

create policy "membros leem categorias_origem" on categorias_origem for select
  using (barbearia_id = auth_barbearia_id());
create policy "admin gerencia categorias_origem" on categorias_origem for all
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin')
  with check (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
create policy "publico le categorias_origem ativas" on categorias_origem for select
  to anon using (ativo = true);

-- Semeia as 5 categorias atuais pra cada barbearia já existente, como
-- texto por extenso (o que passa a ser gravado em clientes.categoria_origem
-- dali pra frente, não mais o slug).
insert into categorias_origem (barbearia_id, nome)
select id, categoria from barbearias, unnest(array['Indicação', 'Redes sociais', 'Google/Internet', 'Passou na rua', 'Outro']) as categoria;

-- A constraint precisa sair ANTES de reescrever os valores abaixo — ela só
-- aceita os 5 slugs antigos, e "Indicação"/"Redes sociais"/etc. violariam
-- ela se a ordem fosse invertida.
alter table clientes drop constraint clientes_categoria_origem_check;

-- Converte os valores antigos (gravados como slug) pro texto por extenso,
-- pra ficar consistente com o que as categorias novas usam.
update clientes set categoria_origem = 'Indicação' where categoria_origem = 'indicacao';
update clientes set categoria_origem = 'Redes sociais' where categoria_origem = 'redes_sociais';
update clientes set categoria_origem = 'Google/Internet' where categoria_origem = 'google_internet';
update clientes set categoria_origem = 'Passou na rua' where categoria_origem = 'passou_na_rua';
update clientes set categoria_origem = 'Outro' where categoria_origem = 'outro';

-- Validação passa a ser dinâmica (contra a tabela categorias_origem) em
-- vez de uma lista fixa no corpo da função. Assinatura idêntica à versão
-- atual (0036_clientes_dono_status.sql, já com a validação de p_membro_id
-- contra p_barbearia_id) — só a checagem de categoria muda, sem precisar
-- de drop nem de reemitir grants.
create or replace function public.criar_ou_obter_cliente(
  p_barbearia_id uuid, p_nome text, p_telefone text, p_data_nascimento date default null,
  p_bairro text default null, p_cidade text default null, p_categoria_origem text default null,
  p_membro_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cliente_id uuid;
  v_telefone text;
  v_foi_criado boolean;
begin
  if not exists (select 1 from barbearias where id = p_barbearia_id) then
    raise exception 'Barbearia inválida';
  end if;

  if p_categoria_origem is not null and not exists (
    select 1 from categorias_origem where barbearia_id = p_barbearia_id and nome = p_categoria_origem and ativo
  ) then
    raise exception 'Categoria de origem inválida.';
  end if;

  if p_membro_id is not null and not exists (
    select 1 from membros where id = p_membro_id and barbearia_id = p_barbearia_id
  ) then
    raise exception 'Membro inválido para esta barbearia';
  end if;

  v_telefone := regexp_replace(p_telefone, '\D', '', 'g');

  insert into clientes (barbearia_id, nome, telefone, data_nascimento, bairro, cidade, categoria_origem, cadastrado_por_membro_id)
  values (p_barbearia_id, p_nome, v_telefone, p_data_nascimento, p_bairro, p_cidade, p_categoria_origem, p_membro_id)
  on conflict (barbearia_id, telefone)
  do update set
    nome = excluded.nome,
    data_nascimento = coalesce(clientes.data_nascimento, excluded.data_nascimento),
    bairro = coalesce(clientes.bairro, excluded.bairro),
    cidade = coalesce(clientes.cidade, excluded.cidade),
    categoria_origem = coalesce(clientes.categoria_origem, excluded.categoria_origem)
  returning id, (xmax = 0) into v_cliente_id, v_foi_criado;

  if v_foi_criado and p_categoria_origem is null then
    raise exception 'Categoria de origem é obrigatória para clientes novos.';
  end if;

  return v_cliente_id;
end;
$$;
```

- [ ] **Step 2: Criar `supabase/tests/database/0022_categorias_origem.test.sql`**

```sql
begin;
select plan(6);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a');

insert into auth.users (id, email) values
  ('bbbbbbbb-0000-0000-0000-000000000002', 'admin@example.com');

insert into membros (id, barbearia_id, user_id, papel, nome) values
  ('a1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000002', 'admin', 'Admin');

-- A migration já semeou 5 categorias pra essa barbearia (seed roda pra
-- toda barbearia existente no momento da migration — como o teste insere
-- a barbearia DEPOIS da migration já ter rodado, precisa semear manualmente
-- aqui pra simular o estado real de uma barbearia existente).
insert into categorias_origem (barbearia_id, nome) values
  ('11111111-1111-1111-1111-111111111111', 'Indicação'),
  ('11111111-1111-1111-1111-111111111111', 'Redes sociais');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);

-- Admin cadastra uma categoria própria.
insert into categorias_origem (barbearia_id, nome) values
  ('11111111-1111-1111-1111-111111111111', 'Instagram Ads');

select is(
  (select count(*)::int from categorias_origem where barbearia_id = '11111111-1111-1111-1111-111111111111' and nome = 'Instagram Ads'),
  1,
  'admin can create a custom categoria_origem'
);

-- criar_ou_obter_cliente aceita a categoria customizada.
select is(
  (select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente Um', '11900000001', null, null, null, 'Instagram Ads') is not null),
  true,
  'criar_ou_obter_cliente accepts a custom categoria registered by the admin'
);

-- criar_ou_obter_cliente rejeita categoria inexistente.
select throws_ok(
  $$select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente Dois', '11900000002', null, null, null, 'Categoria Inexistente')$$,
  'Categoria de origem inválida.',
  'criar_ou_obter_cliente rejects a categoria_origem that does not exist'
);

-- Desativa "Redes sociais" e confirma que passa a ser rejeitada.
update categorias_origem set ativo = false where barbearia_id = '11111111-1111-1111-1111-111111111111' and nome = 'Redes sociais';

select throws_ok(
  $$select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente Tres', '11900000003', null, null, null, 'Redes sociais')$$,
  'Categoria de origem inválida.',
  'criar_ou_obter_cliente rejects a deactivated categoria_origem'
);

-- Leitura pública (anon) só vê categorias ativas.
reset role;
set local role anon;

select is(
  (select count(*)::int from categorias_origem where barbearia_id = '11111111-1111-1111-1111-111111111111'),
  2,
  'anon can only read active categorias_origem (Indicação + Instagram Ads, not the deactivated Redes sociais)'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);

select is(
  (select count(*)::int from categorias_origem where barbearia_id = '11111111-1111-1111-1111-111111111111'),
  3,
  'an authenticated membro reads all categorias_origem for their barbearia, active or not'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Verificação**

Run: `npx supabase db reset` (aplica as migrations do zero, incluindo esta) e depois `npx supabase test db`.
Expected: `Result: PASS`, todos os arquivos incluindo `0022_categorias_origem.test.sql` com as 6 asserções passando.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0037_categorias_origem.sql supabase/tests/database/0022_categorias_origem.test.sql
git commit -m "feat: add customizable categorias_origem, replacing the fixed 5-value list"
```

---

### Task 2: `ClienteAutocomplete`/`TelefoneClienteBusca` recebem `categorias` via prop

**Files:**
- Modify: `src/lib/categorias-origem.ts`
- Modify: `src/components/cliente-autocomplete.tsx`
- Modify: `src/components/telefone-cliente-busca.tsx`

**Interfaces:**
- Produces: `ClienteAutocomplete` e `TelefoneClienteBusca` ganham uma prop obrigatória `categorias: { id: string; nome: string }[]`. Consumida pelas Tasks 4-7.

- [ ] **Step 1: Reescrever `src/lib/categorias-origem.ts`**

```ts
export type CategoriaOrigem = string
```

- [ ] **Step 2: Reescrever `src/components/cliente-autocomplete.tsx`**

Substituir o arquivo inteiro por (idêntico ao original, com: import de `CATEGORIAS_ORIGEM` removido, prop nova `categorias`, o `<Select>` de categoria mapeando `categorias` em vez da lista fixa):

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import type { CategoriaOrigem } from '@/lib/categorias-origem'
import { Select } from '@/components/ui/select'

type ResultadoBusca = {
  id: string
  nome: string
  telefone: string
  total_cortes: number
  data_nascimento: string | null
  bairro: string | null
  cidade: string | null
  cadastrado_por_membro_id: string | null
  cadastrado_por_nome: string | null
}

export function ClienteAutocomplete({
  onResolved, valorInicial, meuMembroId, categorias,
}: {
  onResolved: (info: {
    nome: string; telefone: string; totalCortes: number; reconhecido: boolean
    dataNascimento?: string; bairro?: string; cidade?: string; categoriaOrigem?: CategoriaOrigem
  }) => void
  valorInicial?: { nome: string; telefone: string }
  meuMembroId?: string
  categorias: { id: string; nome: string }[]
}) {
  const [nome, setNome] = useState(valorInicial?.nome ?? '')
  const [telefone, setTelefone] = useState(valorInicial?.telefone ?? '')
  const [dataNascimento, setDataNascimento] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [categoriaOrigem, setCategoriaOrigem] = useState<CategoriaOrigem | ''>('')
  const [resultados, setResultados] = useState<ResultadoBusca[]>([])
  const [mostrarLista, setMostrarLista] = useState(false)
  const [donoAtual, setDonoAtual] = useState<string | null>(null)
  // Refs (not just state) so onResolved always reads the latest value
  // regardless of render timing.
  const nomeRef = useRef(valorInicial?.nome ?? '')
  const telefoneRef = useRef(valorInicial?.telefone ?? '')
  const dataNascimentoRef = useRef('')
  const bairroRef = useRef('')
  const cidadeRef = useRef('')
  const categoriaOrigemRef = useRef<CategoriaOrigem | ''>('')
  // Pré-preenchido via valorInicial (aberto a partir de um agendamento já
  // existente) e selecionado da lista de sugestões são as duas únicas
  // formas de saber que é um cliente já cadastrado — nos dois casos a
  // categoria de origem não é obrigatória. Qualquer edição manual do
  // telefone depois disso volta a marcar como não reconhecido, porque não
  // há mais garantia de que o telefone digitado é o mesmo cliente.
  const reconhecidoRef = useRef(!!valorInicial)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const buscaSeqRef = useRef(0)

  // Report the pre-filled value once on mount, so the parent (e.g.
  // LancamentoForm opened from an existing agendamento) has it immediately
  // instead of only after the user types something.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (valorInicial) onResolved({ nome: valorInicial.nome, telefone: valorInicial.telefone, totalCortes: 0, reconhecido: true })
  }, [])

  function handleNomeChange(value: string) {
    nomeRef.current = value
    setNome(value)
    onResolved({
      nome: value, telefone: telefoneRef.current, totalCortes: 0, reconhecido: reconhecidoRef.current,
      dataNascimento: dataNascimentoRef.current || undefined,
      bairro: bairroRef.current || undefined, cidade: cidadeRef.current || undefined,
      categoriaOrigem: categoriaOrigemRef.current || undefined,
    })
  }

  function handleDataNascimentoChange(value: string) {
    dataNascimentoRef.current = value
    setDataNascimento(value)
    onResolved({
      nome: nomeRef.current, telefone: telefoneRef.current, totalCortes: 0, reconhecido: reconhecidoRef.current,
      dataNascimento: value || undefined,
      bairro: bairroRef.current || undefined, cidade: cidadeRef.current || undefined,
      categoriaOrigem: categoriaOrigemRef.current || undefined,
    })
  }

  function handleBairroChange(value: string) {
    bairroRef.current = value
    setBairro(value)
    onResolved({
      nome: nomeRef.current, telefone: telefoneRef.current, totalCortes: 0, reconhecido: reconhecidoRef.current,
      dataNascimento: dataNascimentoRef.current || undefined,
      bairro: value || undefined, cidade: cidadeRef.current || undefined,
      categoriaOrigem: categoriaOrigemRef.current || undefined,
    })
  }

  function handleCidadeChange(value: string) {
    cidadeRef.current = value
    setCidade(value)
    onResolved({
      nome: nomeRef.current, telefone: telefoneRef.current, totalCortes: 0, reconhecido: reconhecidoRef.current,
      dataNascimento: dataNascimentoRef.current || undefined,
      bairro: bairroRef.current || undefined, cidade: value || undefined,
      categoriaOrigem: categoriaOrigemRef.current || undefined,
    })
  }

  function handleCategoriaOrigemChange(value: string) {
    categoriaOrigemRef.current = value
    setCategoriaOrigem(value)
    onResolved({
      nome: nomeRef.current, telefone: telefoneRef.current, totalCortes: 0, reconhecido: reconhecidoRef.current,
      dataNascimento: dataNascimentoRef.current || undefined,
      bairro: bairroRef.current || undefined, cidade: cidadeRef.current || undefined,
      categoriaOrigem: value || undefined,
    })
  }

  function verificar(tel: string) {
    telefoneRef.current = tel
    setTelefone(tel)
    reconhecidoRef.current = false
    setDonoAtual(null)
    const seq = ++buscaSeqRef.current
    // Resolve synchronously with the raw typed value first — the caller
    // (LancamentoForm's salvar()) reads whatever onResolved last reported,
    // and buscar_clientes_por_telefone below is an async, debounced
    // network round-trip. Without this synchronous resolve, a click on
    // "Salvar" landing before the debounce/round-trip completes would
    // submit with an empty/stale telefone.
    onResolved({
      nome: nomeRef.current, telefone: tel, totalCortes: 0, reconhecido: false,
      dataNascimento: dataNascimentoRef.current || undefined,
      bairro: bairroRef.current || undefined, cidade: cidadeRef.current || undefined,
      categoriaOrigem: categoriaOrigemRef.current || undefined,
    })

    if (debounceRef.current) clearTimeout(debounceRef.current)

    const digitos = tel.replace(/\D/g, '')
    if (digitos.length < 4) {
      setResultados([])
      setMostrarLista(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      const supabase = getBrowserSupabaseClient()
      const { data: rows } = await supabase.rpc('buscar_clientes_por_telefone', { p_busca: tel })
      if (seq !== buscaSeqRef.current) return
      setResultados(rows ?? [])
      setMostrarLista((rows ?? []).length > 0)
    }, 300)
  }

  function selecionar(cliente: ResultadoBusca) {
    nomeRef.current = cliente.nome
    telefoneRef.current = cliente.telefone
    dataNascimentoRef.current = cliente.data_nascimento ?? ''
    bairroRef.current = cliente.bairro ?? ''
    cidadeRef.current = cliente.cidade ?? ''
    reconhecidoRef.current = true
    setNome(cliente.nome)
    setTelefone(cliente.telefone)
    setDataNascimento(cliente.data_nascimento ?? '')
    setBairro(cliente.bairro ?? '')
    setCidade(cliente.cidade ?? '')
    setMostrarLista(false)
    setResultados([])
    setDonoAtual(
      cliente.cadastrado_por_membro_id && cliente.cadastrado_por_membro_id !== meuMembroId
        ? cliente.cadastrado_por_nome
        : null
    )
    onResolved({
      nome: cliente.nome, telefone: cliente.telefone, totalCortes: cliente.total_cortes, reconhecido: true,
      dataNascimento: cliente.data_nascimento ?? undefined,
      bairro: cliente.bairro ?? undefined, cidade: cliente.cidade ?? undefined,
      categoriaOrigem: categoriaOrigemRef.current || undefined,
    })
  }

  return (
    <div className="flex flex-col gap-2.5">
      <Input placeholder="Nome do cliente" value={nome} onChange={(e) => handleNomeChange(e.target.value)} />
      <div className="relative">
        <Input
          placeholder="Telefone"
          value={telefone}
          onChange={(e) => verificar(e.target.value)}
          onBlur={() => setMostrarLista(false)}
        />
        {mostrarLista && resultados.length > 0 && (
          <div className="absolute z-10 w-full mt-1.5 bg-card border border-border rounded-2xl shadow-[0_1px_2px_rgba(20,32,27,0.04)] max-h-48 overflow-y-auto">
            {resultados.map((r) => (
              <button
                key={r.id}
                type="button"
                onMouseDown={() => selecionar(r)}
                className="w-full text-left px-3.5 py-2.5 text-[13.5px] hover:bg-muted border-b border-muted last:border-b-0"
              >
                {r.nome} · {r.telefone} · {r.total_cortes}º corte aqui
              </button>
            ))}
          </div>
        )}
      </div>
      {donoAtual && (
        <p className="text-[12.5px] text-amber-text bg-amber-tint rounded-xl px-3 py-2">
          Este cliente já é atendido por {donoAtual}.
        </p>
      )}
      <Input type="date" placeholder="Data de nascimento (opcional)" value={dataNascimento} onChange={(e) => handleDataNascimentoChange(e.target.value)} />
      <Input placeholder="Bairro (opcional)" value={bairro} onChange={(e) => handleBairroChange(e.target.value)} />
      <Input placeholder="Cidade (opcional)" value={cidade} onChange={(e) => handleCidadeChange(e.target.value)} />
      <Select
        value={categoriaOrigem}
        onChange={(e) => handleCategoriaOrigemChange(e.target.value)}
      >
        <option value="">Como conheceu a barbearia?</option>
        {categorias.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
      </Select>
    </div>
  )
}
```

- [ ] **Step 3: Reescrever `src/components/telefone-cliente-busca.tsx`**

Substituir o arquivo inteiro por (mesmo tratamento — import de `CATEGORIAS_ORIGEM` removido, prop nova `categorias`):

```tsx
'use client'

import { useRef, useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

type ResultadoBusca = {
  id: string
  nome: string
  telefone: string
  total_cortes: number
  data_nascimento: string | null
  bairro: string | null
  cidade: string | null
  cadastrado_por_membro_id: string | null
  cadastrado_por_nome: string | null
}

// Não reaproveita ClienteAutocomplete de propósito — esta tela tem seu
// próprio formulário inline via Server Action (novoContato), sem o
// callback onResolved que ClienteAutocomplete usa pra reportar mudanças
// pro componente pai. Os campos aqui postam direto pelo <form> nativo,
// via os atributos name.
export function TelefoneClienteBusca({ meuMembroId, categorias }: { meuMembroId?: string; categorias: { id: string; nome: string }[] }) {
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [resultados, setResultados] = useState<ResultadoBusca[]>([])
  const [mostrarLista, setMostrarLista] = useState(false)
  const [donoAtual, setDonoAtual] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const buscaSeqRef = useRef(0)

  function verificar(tel: string) {
    setTelefone(tel)
    setDonoAtual(null)
    const seq = ++buscaSeqRef.current

    if (debounceRef.current) clearTimeout(debounceRef.current)

    const digitos = tel.replace(/\D/g, '')
    if (digitos.length < 4) {
      setResultados([])
      setMostrarLista(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      const supabase = getBrowserSupabaseClient()
      const { data: rows } = await supabase.rpc('buscar_clientes_por_telefone', { p_busca: tel })
      if (seq !== buscaSeqRef.current) return
      setResultados(rows ?? [])
      setMostrarLista((rows ?? []).length > 0)
    }, 300)
  }

  function selecionar(cliente: ResultadoBusca) {
    setNome(cliente.nome)
    setTelefone(cliente.telefone)
    setBairro(cliente.bairro ?? '')
    setCidade(cliente.cidade ?? '')
    setMostrarLista(false)
    setResultados([])
    setDonoAtual(
      cliente.cadastrado_por_membro_id && cliente.cadastrado_por_membro_id !== meuMembroId
        ? cliente.cadastrado_por_nome
        : null
    )
  }

  return (
    <>
      <Input name="nome" placeholder="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} className="w-40" />
      <div className="relative">
        <Input
          name="telefone"
          placeholder="Telefone"
          required
          value={telefone}
          onChange={(e) => verificar(e.target.value)}
          onBlur={() => setMostrarLista(false)}
          className="w-40"
        />
        {mostrarLista && resultados.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-card border rounded-lg shadow-md max-h-48 overflow-y-auto">
            {resultados.map((r) => (
              <button
                key={r.id}
                type="button"
                onMouseDown={() => selecionar(r)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0"
              >
                {r.nome} · {r.telefone} · {r.total_cortes}º corte aqui
              </button>
            ))}
          </div>
        )}
      </div>
      {donoAtual && (
        <p className="text-[12.5px] text-amber-text bg-amber-tint rounded-xl px-3 py-2 w-full">
          Este cliente já é atendido por {donoAtual}.
        </p>
      )}
      <Input name="bairro" placeholder="Bairro (opcional)" value={bairro} onChange={(e) => setBairro(e.target.value)} className="w-32" />
      <Input name="cidade" placeholder="Cidade (opcional)" value={cidade} onChange={(e) => setCidade(e.target.value)} className="w-32" />
      <Select name="categoria_origem" aria-label="Como conheceu a barbearia?" className="w-56" defaultValue="">
        <option value="">Como conheceu a barbearia?</option>
        {categorias.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
      </Select>
    </>
  )
}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: **erros de tipo esperados** nos consumidores de `ClienteAutocomplete`/`TelefoneClienteBusca` que ainda não passam `categorias` (Tasks 4-7 resolvem isso). Confirme que os únicos erros são "Property 'categorias' is missing" nesses componentes — nenhum outro tipo de erro.

- [ ] **Step 5: Commit**

```bash
git add src/lib/categorias-origem.ts src/components/cliente-autocomplete.tsx src/components/telefone-cliente-busca.tsx
git commit -m "feat: ClienteAutocomplete/TelefoneClienteBusca receive categorias via prop"
```

---

### Task 3: Página admin `/admin/categorias-origem` + navegação

**Files:**
- Create: `src/components/categoria-origem-row.tsx`
- Create: `src/app/admin/categorias-origem/page.tsx`
- Modify: `src/app/admin/layout.tsx`
- Modify: `src/components/admin/sidebar.tsx`

**Interfaces:**
- Consumes: `categorias_origem` (Task 1).

- [ ] **Step 1: Criar `src/components/categoria-origem-row.tsx`**

Mesmo padrão de `src/components/plano-carreira-row.tsx`, mas só com `nome`/`ativo` (sem percentuais):

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TableRow, TableCell } from '@/components/ui/table'

type CategoriaOrigem = { id: string; nome: string; ativo: boolean }

export function CategoriaOrigemRow({ categoria }: { categoria: CategoriaOrigem }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(categoria.nome)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('categorias_origem').update({ nome }).eq('id', categoria.id)
    setSalvando(false)
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setNome(categoria.nome)
    setEditando(false)
  }

  async function alternarAtivo() {
    const supabase = getBrowserSupabaseClient()
    await supabase.from('categorias_origem').update({ ativo: !categoria.ativo }).eq('id', categoria.id)
    router.refresh()
  }

  if (editando) {
    return (
      <TableRow>
        <TableCell><Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-48" /></TableCell>
        <TableCell className="flex gap-2">
          <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
          <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow className={categoria.ativo ? '' : 'opacity-50'}>
      <TableCell>{categoria.nome}</TableCell>
      <TableCell className="flex gap-2">
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">Editar</button>
        <button type="button" onClick={alternarAtivo} className="text-xs text-destructive underline">{categoria.ativo ? 'Desativar' : 'Reativar'}</button>
      </TableCell>
    </TableRow>
  )
}
```

- [ ] **Step 2: Criar `src/app/admin/categorias-origem/page.tsx`**

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CategoriaOrigemRow } from '@/components/categoria-origem-row'
import { Table, TableHeader, TableBody, TableRow, TableHead } from '@/components/ui/table'

async function criarCategoria(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('categorias_origem').insert({
    barbearia_id: membro!.barbearia_id,
    nome: formData.get('nome') as string,
  })
  revalidatePath('/admin/categorias-origem')
}

export default async function CategoriasOrigemPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const { data: categorias } = await supabase.from('categorias_origem').select('*').eq('barbearia_id', membro!.barbearia_id).order('nome')

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Categorias de origem</h1>

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Adicionar categoria</h2>
          <form action={criarCategoria} className="flex gap-2 flex-wrap">
            <Input name="nome" placeholder="Nome (ex: Instagram Ads)" required className="w-56" />
            <Button type="submit">Adicionar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Categorias cadastradas</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {categorias?.map((c) => <CategoriaOrigemRow key={c.id} categoria={c} />)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Adicionar "Categorias de origem" ao `NAV_ITEMS` de `src/app/admin/layout.tsx`**

Encontrar:
```ts
  { href: '/admin/clientes', label: 'Clientes' },
  { href: '/admin/sonhos', label: 'Sonhos' },
```
Substituir por:
```ts
  { href: '/admin/clientes', label: 'Clientes' },
  { href: '/admin/categorias-origem', label: 'Categorias de origem' },
  { href: '/admin/sonhos', label: 'Sonhos' },
```

- [ ] **Step 4: Adicionar o ícone de "Categorias de origem" ao `ICON_PATHS` de `src/components/admin/sidebar.tsx`**

Encontrar:
```tsx
  '/admin/clientes': (
    <>
      <circle cx="9" cy="8" r="3.6" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5.5a3.5 3.5 0 0 1 0 7M17.5 14.4c2.1.8 3.5 2.6 3.5 5.6" />
    </>
  ),
  '/admin/sonhos': (
```
Substituir por:
```tsx
  '/admin/clientes': (
    <>
      <circle cx="9" cy="8" r="3.6" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5.5a3.5 3.5 0 0 1 0 7M17.5 14.4c2.1.8 3.5 2.6 3.5 5.6" />
    </>
  ),
  '/admin/categorias-origem': (
    <>
      <path d="M4 6h16M4 12h10M4 18h6" />
    </>
  ),
  '/admin/sonhos': (
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 6: Verificação visual manual**

Login como admin, confirmar o item "Categorias de origem" na sidebar. Abrir a página, cadastrar uma categoria nova, editar o nome de uma existente, desativar e reativar.

- [ ] **Step 7: Commit**

```bash
git add src/components/categoria-origem-row.tsx src/app/admin/categorias-origem/page.tsx src/app/admin/layout.tsx src/components/admin/sidebar.tsx
git commit -m "feat: add admin categorias-origem management page"
```

---

### Task 4: Encadear `categorias` pela cadeia da Agenda (3 dos 4 usos de `ClienteAutocomplete`)

**Files:**
- Modify: `src/app/painel/agenda/page.tsx`
- Modify: `src/app/admin/agenda/page.tsx`
- Modify: `src/components/admin-agenda.tsx`
- Modify: `src/components/agenda-dia.tsx`
- Modify: `src/components/agendar-slot-form.tsx`
- Modify: `src/components/atender-agora-form.tsx`
- Modify: `src/components/lancamento-form.tsx`

**Interfaces:**
- Consumes: `ClienteAutocomplete` com prop `categorias` (Task 2).

- [ ] **Step 1: `src/app/painel/agenda/page.tsx`**

Encontrar:
```tsx
  const { data: servicos } = await supabase.from('servicos').select('id, nome, preco, duracao_minutos, ativo').eq('barbearia_id', membro!.barbearia_id)
  const { data: produtos } = await supabase.from('produtos').select('id, nome, preco_venda, quantidade_estoque, ativo').eq('barbearia_id', membro!.barbearia_id)
```
Substituir por:
```tsx
  const { data: servicos } = await supabase.from('servicos').select('id, nome, preco, duracao_minutos, ativo').eq('barbearia_id', membro!.barbearia_id)
  const { data: produtos } = await supabase.from('produtos').select('id, nome, preco_venda, quantidade_estoque, ativo').eq('barbearia_id', membro!.barbearia_id)
  const { data: categorias } = await supabase.from('categorias_origem').select('id, nome').eq('barbearia_id', membro!.barbearia_id).eq('ativo', true).order('nome')
```

Encontrar:
```tsx
      <AgendaDia
        barbeariaId={membro!.barbearia_id}
        membroId={membro!.id}
        servicos={servicos ?? []}
        produtos={produtos ?? []}
      />
```
Substituir por:
```tsx
      <AgendaDia
        barbeariaId={membro!.barbearia_id}
        membroId={membro!.id}
        servicos={servicos ?? []}
        produtos={produtos ?? []}
        categorias={categorias ?? []}
      />
```

- [ ] **Step 2: `src/app/admin/agenda/page.tsx`**

Encontrar:
```tsx
  const { data: servicos } = await supabase.from('servicos').select('id, nome, preco, duracao_minutos, ativo').eq('barbearia_id', membro!.barbearia_id)
  const { data: produtos } = await supabase.from('produtos').select('id, nome, preco_venda, quantidade_estoque, ativo').eq('barbearia_id', membro!.barbearia_id)
```
Substituir por:
```tsx
  const { data: servicos } = await supabase.from('servicos').select('id, nome, preco, duracao_minutos, ativo').eq('barbearia_id', membro!.barbearia_id)
  const { data: produtos } = await supabase.from('produtos').select('id, nome, preco_venda, quantidade_estoque, ativo').eq('barbearia_id', membro!.barbearia_id)
  const { data: categorias } = await supabase.from('categorias_origem').select('id, nome').eq('barbearia_id', membro!.barbearia_id).eq('ativo', true).order('nome')
```

Encontrar:
```tsx
      <AdminAgenda
        barbeariaId={membro!.barbearia_id}
        barbeiros={barbeiros ?? []}
        servicos={servicos ?? []}
        produtos={produtos ?? []}
      />
```
Substituir por:
```tsx
      <AdminAgenda
        barbeariaId={membro!.barbearia_id}
        barbeiros={barbeiros ?? []}
        servicos={servicos ?? []}
        produtos={produtos ?? []}
        categorias={categorias ?? []}
      />
```

- [ ] **Step 3: Reescrever `src/components/admin-agenda.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { Select } from '@/components/ui/select'
import { AgendaDia } from './agenda-dia'
import { AgendaTodosBarbeiros } from './agenda-todos-barbeiros'

type Barbeiro = { id: string; nome: string }
type Servico = { id: string; nome: string; preco: number; duracao_minutos: number; ativo: boolean }
type Produto = { id: string; nome: string; preco_venda: number; quantidade_estoque: number; ativo: boolean }
type Categoria = { id: string; nome: string }

export function AdminAgenda({
  barbeariaId, barbeiros, servicos, produtos, categorias,
}: { barbeariaId: string; barbeiros: Barbeiro[]; servicos: Servico[]; produtos: Produto[]; categorias: Categoria[] }) {
  const [barbeiroId, setBarbeiroId] = useState('')

  return (
    <div className="flex flex-col gap-5">
      <Select value={barbeiroId} onChange={(e) => setBarbeiroId(e.target.value)} aria-label="Barbeiro" className="w-56">
        <option value="">Todos os barbeiros</option>
        {barbeiros.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
      </Select>

      {barbeiroId ? (
        <AgendaDia barbeariaId={barbeariaId} membroId={barbeiroId} servicos={servicos} produtos={produtos} categorias={categorias} />
      ) : (
        <AgendaTodosBarbeiros barbeiros={barbeiros} />
      )}
    </div>
  )
}
```

- [ ] **Step 4: `src/components/agenda-dia.tsx`**

Encontrar:
```tsx
type Servico = { id: string; nome: string; preco: number; duracao_minutos: number; ativo: boolean }
type Produto = { id: string; nome: string; preco_venda: number; quantidade_estoque: number; ativo: boolean }
```
Substituir por:
```tsx
type Servico = { id: string; nome: string; preco: number; duracao_minutos: number; ativo: boolean }
type Produto = { id: string; nome: string; preco_venda: number; quantidade_estoque: number; ativo: boolean }
type Categoria = { id: string; nome: string }
```

Encontrar:
```tsx
export function AgendaDia({
  barbeariaId, membroId, servicos, produtos,
}: { barbeariaId: string; membroId: string; servicos: Servico[]; produtos: Produto[] }) {
```
Substituir por:
```tsx
export function AgendaDia({
  barbeariaId, membroId, servicos, produtos, categorias,
}: { barbeariaId: string; membroId: string; servicos: Servico[]; produtos: Produto[]; categorias: Categoria[] }) {
```

Encontrar:
```tsx
          {slotParaAgendar && (
            <AgendarSlotForm
              barbeariaId={barbeariaId}
              membroId={membroId}
              servicos={servicos}
              data={data}
              horaInicio={slotParaAgendar}
              agendamentosExistentes={agendamentos}
              onAgendado={() => { fecharPaineis(); carregar() }}
            />
          )}
```
Substituir por:
```tsx
          {slotParaAgendar && (
            <AgendarSlotForm
              barbeariaId={barbeariaId}
              membroId={membroId}
              servicos={servicos}
              data={data}
              horaInicio={slotParaAgendar}
              agendamentosExistentes={agendamentos}
              categorias={categorias}
              onAgendado={() => { fecharPaineis(); carregar() }}
            />
          )}
```

Encontrar:
```tsx
          {atendendoAgora && (
            <AtenderAgoraForm
              barbeariaId={barbeariaId}
              membroId={membroId}
              servicos={servicos}
              onCriado={(modo) => { fecharPaineis(); setModoAgenda(modo) }}
              onCancelar={fecharPaineis}
            />
          )}
```
Substituir por:
```tsx
          {atendendoAgora && (
            <AtenderAgoraForm
              barbeariaId={barbeariaId}
              membroId={membroId}
              servicos={servicos}
              categorias={categorias}
              onCriado={(modo) => { fecharPaineis(); setModoAgenda(modo) }}
              onCancelar={fecharPaineis}
            />
          )}
```

Encontrar:
```tsx
          {modoAgenda && (
            <LancamentoForm
              barbeariaId={barbeariaId}
              membroId={membroId}
              servicos={servicos}
              produtos={produtos}
              modoAgenda={modoAgenda}
              onSalvo={() => { fecharPaineis(); carregar() }}
            />
          )}
```
Substituir por:
```tsx
          {modoAgenda && (
            <LancamentoForm
              barbeariaId={barbeariaId}
              membroId={membroId}
              servicos={servicos}
              produtos={produtos}
              modoAgenda={modoAgenda}
              categorias={categorias}
              onSalvo={() => { fecharPaineis(); carregar() }}
            />
          )}
```

- [ ] **Step 5: `src/components/agendar-slot-form.tsx`**

Encontrar:
```tsx
export function AgendarSlotForm({
  barbeariaId, membroId, servicos, data, horaInicio, agendamentosExistentes, onAgendado,
}: {
  barbeariaId: string
  membroId: string
  servicos: Servico[]
  data: string
  horaInicio: string
  agendamentosExistentes: AgendamentoExistente[]
  onAgendado?: () => void
}) {
```
Substituir por:
```tsx
export function AgendarSlotForm({
  barbeariaId, membroId, servicos, data, horaInicio, agendamentosExistentes, categorias, onAgendado,
}: {
  barbeariaId: string
  membroId: string
  servicos: Servico[]
  data: string
  horaInicio: string
  agendamentosExistentes: AgendamentoExistente[]
  categorias: { id: string; nome: string }[]
  onAgendado?: () => void
}) {
```

Encontrar:
```tsx
          <ClienteAutocomplete onResolved={setCliente} />
```
Substituir por:
```tsx
          <ClienteAutocomplete onResolved={setCliente} meuMembroId={membroId} categorias={categorias} />
```

- [ ] **Step 6: `src/components/atender-agora-form.tsx`**

Encontrar:
```tsx
export function AtenderAgoraForm({
  barbeariaId, membroId, servicos, onCriado, onCancelar,
}: {
  barbeariaId: string
  membroId: string
  servicos: Servico[]
  onCriado: (modoAgenda: ModoAgenda) => void
  onCancelar?: () => void
}) {
```
Substituir por:
```tsx
export function AtenderAgoraForm({
  barbeariaId, membroId, servicos, categorias, onCriado, onCancelar,
}: {
  barbeariaId: string
  membroId: string
  servicos: Servico[]
  categorias: { id: string; nome: string }[]
  onCriado: (modoAgenda: ModoAgenda) => void
  onCancelar?: () => void
}) {
```

Encontrar:
```tsx
          <ClienteAutocomplete onResolved={setCliente} />
```
Substituir por:
```tsx
          <ClienteAutocomplete onResolved={setCliente} meuMembroId={membroId} categorias={categorias} />
```

- [ ] **Step 7: `src/components/lancamento-form.tsx`**

Encontrar:
```tsx
export function LancamentoForm({
  barbeariaId, membroId, servicos, produtos, modoAgenda, onSalvo,
}: {
  barbeariaId: string
  membroId: string
  servicos: Servico[]
  produtos: Produto[]
  modoAgenda: ModoAgenda
  onSalvo?: () => void
}) {
```
Substituir por:
```tsx
export function LancamentoForm({
  barbeariaId, membroId, servicos, produtos, modoAgenda, categorias, onSalvo,
}: {
  barbeariaId: string
  membroId: string
  servicos: Servico[]
  produtos: Produto[]
  modoAgenda: ModoAgenda
  categorias: { id: string; nome: string }[]
  onSalvo?: () => void
}) {
```

Encontrar:
```tsx
        <ClienteAutocomplete
          key={clienteAutocompleteKey}
          onResolved={setCliente}
          valorInicial={{ nome: modoAgenda.clienteNome, telefone: modoAgenda.clienteTelefone }}
          meuMembroId={membroId}
        />
```
Substituir por:
```tsx
        <ClienteAutocomplete
          key={clienteAutocompleteKey}
          onResolved={setCliente}
          valorInicial={{ nome: modoAgenda.clienteNome, telefone: modoAgenda.clienteTelefone }}
          meuMembroId={membroId}
          categorias={categorias}
        />
```

- [ ] **Step 8: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo (a cadeia inteira da agenda agora fornece `categorias`).

- [ ] **Step 9: Verificação visual manual**

Como barbeiro, `/painel/agenda`: "Atender agora" e "+ agendar outro aqui" (que abre `AgendarSlotForm`) mostram o seletor de categoria com as categorias cadastradas pelo admin. Como admin, `/admin/agenda`, mesma verificação no modo de barbeiro específico.

- [ ] **Step 10: Commit**

```bash
git add src/app/painel/agenda/page.tsx src/app/admin/agenda/page.tsx src/components/admin-agenda.tsx src/components/agenda-dia.tsx src/components/agendar-slot-form.tsx src/components/atender-agora-form.tsx src/components/lancamento-form.tsx
git commit -m "feat: thread categorias through the agenda component chain"
```

---

### Task 5: Encadear `categorias` pela cadeia da Loja (4º uso de `ClienteAutocomplete`)

**Files:**
- Modify: `src/app/admin/loja/page.tsx`
- Modify: `src/components/admin-venda-loja.tsx`
- Modify: `src/app/painel/loja/page.tsx`
- Modify: `src/components/venda-loja-form.tsx`

**Interfaces:**
- Consumes: `ClienteAutocomplete` com prop `categorias` (Task 2).

- [ ] **Step 1: `src/app/admin/loja/page.tsx`**

Encontrar:
```tsx
  const { data: barbeiros } = await supabase
    .from('membros').select('id, nome')
    .eq('barbearia_id', membro!.barbearia_id).eq('papel', 'barbeiro').eq('ativo', true)
    .order('nome')
```
Substituir por:
```tsx
  const { data: barbeiros } = await supabase
    .from('membros').select('id, nome')
    .eq('barbearia_id', membro!.barbearia_id).eq('papel', 'barbeiro').eq('ativo', true)
    .order('nome')
  const { data: categorias } = await supabase.from('categorias_origem').select('id, nome').eq('barbearia_id', membro!.barbearia_id).eq('ativo', true).order('nome')
```

Encontrar:
```tsx
      <div className="mb-6">
        <AdminVendaLoja barbeariaId={membro!.barbearia_id} barbeiros={barbeiros ?? []} produtos={(produtos ?? []).filter((p) => p.ativo)} />
      </div>
```
Substituir por:
```tsx
      <div className="mb-6">
        <AdminVendaLoja barbeariaId={membro!.barbearia_id} barbeiros={barbeiros ?? []} produtos={(produtos ?? []).filter((p) => p.ativo)} categorias={categorias ?? []} />
      </div>
```

- [ ] **Step 2: Reescrever `src/components/admin-venda-loja.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { Select } from '@/components/ui/select'
import { VendaLojaForm } from './venda-loja-form'

type Barbeiro = { id: string; nome: string }
type ProdutoLoja = { id: string; nome: string; preco_venda: number; quantidade_estoque: number; ativo: boolean }
type Categoria = { id: string; nome: string }

export function AdminVendaLoja({
  barbeariaId, barbeiros, produtos, categorias,
}: { barbeariaId: string; barbeiros: Barbeiro[]; produtos: ProdutoLoja[]; categorias: Categoria[] }) {
  const [barbeiroId, setBarbeiroId] = useState('')

  return (
    <div className="flex flex-col gap-4">
      <Select value={barbeiroId} onChange={(e) => setBarbeiroId(e.target.value)} aria-label="Barbeiro" className="w-56">
        <option value="">Selecione um barbeiro</option>
        {barbeiros.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
      </Select>

      {barbeiroId && <VendaLojaForm barbeariaId={barbeariaId} membroId={barbeiroId} produtos={produtos} categorias={categorias} />}
    </div>
  )
}
```

- [ ] **Step 3: `src/app/painel/loja/page.tsx`**

Encontrar:
```tsx
  const { data: produtos } = await supabase.from('produtos_loja').select('*').eq('barbearia_id', membro!.barbearia_id).eq('ativo', true).order('nome')
```
Substituir por:
```tsx
  const { data: produtos } = await supabase.from('produtos_loja').select('*').eq('barbearia_id', membro!.barbearia_id).eq('ativo', true).order('nome')
  const { data: categorias } = await supabase.from('categorias_origem').select('id, nome').eq('barbearia_id', membro!.barbearia_id).eq('ativo', true).order('nome')
```

Encontrar:
```tsx
      <div className="mb-6">
        <VendaLojaForm barbeariaId={membro!.barbearia_id} membroId={membro!.id} produtos={produtos ?? []} />
      </div>
```
Substituir por:
```tsx
      <div className="mb-6">
        <VendaLojaForm barbeariaId={membro!.barbearia_id} membroId={membro!.id} produtos={produtos ?? []} categorias={categorias ?? []} />
      </div>
```

- [ ] **Step 4: `src/components/venda-loja-form.tsx`**

Encontrar:
```tsx
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { ClienteAutocomplete } from './cliente-autocomplete'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { CategoriaOrigem } from '@/lib/categorias-origem'

type ProdutoLoja = { id: string; nome: string; preco_venda: number; quantidade_estoque: number; ativo: boolean }

export function VendaLojaForm({
  barbeariaId, membroId, produtos, onSalvo,
}: {
  barbeariaId: string
  membroId: string
  produtos: ProdutoLoja[]
  onSalvo?: () => void
}) {
```
Substituir por:
```tsx
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { ClienteAutocomplete } from './cliente-autocomplete'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { CategoriaOrigem } from '@/lib/categorias-origem'

type ProdutoLoja = { id: string; nome: string; preco_venda: number; quantidade_estoque: number; ativo: boolean }

export function VendaLojaForm({
  barbeariaId, membroId, produtos, categorias, onSalvo,
}: {
  barbeariaId: string
  membroId: string
  produtos: ProdutoLoja[]
  categorias: { id: string; nome: string }[]
  onSalvo?: () => void
}) {
```

Encontrar:
```tsx
        <ClienteAutocomplete key={clienteAutocompleteKey} onResolved={setCliente} meuMembroId={membroId} />
```
Substituir por:
```tsx
        <ClienteAutocomplete key={clienteAutocompleteKey} onResolved={setCliente} meuMembroId={membroId} categorias={categorias} />
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 6: Verificação visual manual**

`/admin/loja` e `/painel/loja`: registrar uma venda pra um cliente novo, confirmar que o seletor "Como conheceu a barbearia?" mostra as categorias cadastradas.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/loja/page.tsx src/components/admin-venda-loja.tsx src/app/painel/loja/page.tsx src/components/venda-loja-form.tsx
git commit -m "feat: thread categorias through the loja component chain"
```

---

### Task 6: Encadear `categorias` pela Prospecção e pela Ficha do Cliente

**Files:**
- Modify: `src/app/painel/prospeccao/page.tsx`
- Modify: `src/components/ficha-cliente.tsx`
- Modify: `src/components/editar-cliente-form.tsx`

**Interfaces:**
- Consumes: `TelefoneClienteBusca` com prop `categorias` (Task 2).

- [ ] **Step 1: `src/app/painel/prospeccao/page.tsx`**

Encontrar:
```tsx
export default async function ProspeccaoPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase
    .from('membros')
    .select('id, barbearia_id, meta_prospeccao_dia, meta_prospeccao_semana')
    .eq('user_id', user!.id)
    .single()
```
Substituir por:
```tsx
export default async function ProspeccaoPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase
    .from('membros')
    .select('id, barbearia_id, meta_prospeccao_dia, meta_prospeccao_semana')
    .eq('user_id', user!.id)
    .single()

  const { data: categorias } = await supabase.from('categorias_origem').select('id, nome').eq('barbearia_id', membro!.barbearia_id).eq('ativo', true).order('nome')
```

Encontrar:
```tsx
            <TelefoneClienteBusca meuMembroId={membro!.id} />
```
Substituir por:
```tsx
            <TelefoneClienteBusca meuMembroId={membro!.id} categorias={categorias ?? []} />
```

- [ ] **Step 2: `src/components/ficha-cliente.tsx`**

Encontrar:
```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { EditarClienteForm } from '@/components/editar-cliente-form'
import { ReatribuirDonoForm } from '@/components/reatribuir-dono-form'
import { Card, CardContent } from '@/components/ui/card'
```
Substituir por:
```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { EditarClienteForm } from '@/components/editar-cliente-form'
import { ReatribuirDonoForm } from '@/components/reatribuir-dono-form'
import { Card, CardContent } from '@/components/ui/card'

type Categoria = { id: string; nome: string }
```

Encontrar:
```tsx
  const { data: cliente } = await supabase.from('clientes').select('nome, telefone, criado_em, cpf, data_nascimento, bairro, cidade, observacao, categoria_origem, prazo_retorno_dias').eq('id', clienteId).single()
```
Substituir por:
```tsx
  const { data: cliente } = await supabase.from('clientes').select('nome, telefone, criado_em, cpf, data_nascimento, bairro, cidade, observacao, categoria_origem, prazo_retorno_dias').eq('id', clienteId).single()
  const { data: categorias } = await supabase.from('categorias_origem').select('id, nome').eq('barbearia_id', euMembro!.barbearia_id).eq('ativo', true).order('nome') as { data: Categoria[] | null }
```

Encontrar:
```tsx
          <EditarClienteForm
            clienteId={clienteId}
            cpfAtual={cliente?.cpf ?? null}
            bairroAtual={cliente?.bairro ?? null}
            cidadeAtual={cliente?.cidade ?? null}
            observacaoAtual={cliente?.observacao ?? null}
            categoriaOrigemAtual={cliente?.categoria_origem ?? null}
            prazoRetornoAtual={cliente?.prazo_retorno_dias ?? null}
          />
```
Substituir por:
```tsx
          <EditarClienteForm
            clienteId={clienteId}
            cpfAtual={cliente?.cpf ?? null}
            bairroAtual={cliente?.bairro ?? null}
            cidadeAtual={cliente?.cidade ?? null}
            observacaoAtual={cliente?.observacao ?? null}
            categoriaOrigemAtual={cliente?.categoria_origem ?? null}
            prazoRetornoAtual={cliente?.prazo_retorno_dias ?? null}
            categorias={categorias ?? []}
          />
```

- [ ] **Step 3: `src/components/editar-cliente-form.tsx`**

Encontrar:
```tsx
export function EditarClienteForm({
  clienteId, cpfAtual, bairroAtual, cidadeAtual, observacaoAtual, categoriaOrigemAtual, prazoRetornoAtual,
}: {
  clienteId: string
  cpfAtual: string | null
  bairroAtual: string | null
  cidadeAtual: string | null
  observacaoAtual: string | null
  categoriaOrigemAtual: CategoriaOrigem | null
  prazoRetornoAtual: number | null
}) {
```
Substituir por:
```tsx
export function EditarClienteForm({
  clienteId, cpfAtual, bairroAtual, cidadeAtual, observacaoAtual, categoriaOrigemAtual, prazoRetornoAtual, categorias,
}: {
  clienteId: string
  cpfAtual: string | null
  bairroAtual: string | null
  cidadeAtual: string | null
  observacaoAtual: string | null
  categoriaOrigemAtual: CategoriaOrigem | null
  prazoRetornoAtual: number | null
  categorias: { id: string; nome: string }[]
}) {
```

Encontrar:
```tsx
  const categoriaLabel = CATEGORIAS_ORIGEM.find((c) => c.value === categoriaOrigemAtual)?.label

  if (!editando) {
    return (
      <div>
        {observacaoAtual && <p className="text-sm text-muted-foreground mb-2">Observação: {observacaoAtual}</p>}
        {categoriaLabel && <p className="text-sm text-muted-foreground mb-2">Como conheceu: {categoriaLabel}</p>}
```
Substituir por:
```tsx
  if (!editando) {
    return (
      <div>
        {observacaoAtual && <p className="text-sm text-muted-foreground mb-2">Observação: {observacaoAtual}</p>}
        {categoriaOrigemAtual && <p className="text-sm text-muted-foreground mb-2">Como conheceu: {categoriaOrigemAtual}</p>}
```

Encontrar:
```tsx
      <Select value={categoriaOrigem} onChange={(e) => setCategoriaOrigem(e.target.value as CategoriaOrigem | '')}>
        <option value="">Como conheceu a barbearia?</option>
        {CATEGORIAS_ORIGEM.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </Select>
```
Substituir por:
```tsx
      <Select value={categoriaOrigem} onChange={(e) => setCategoriaOrigem(e.target.value as CategoriaOrigem | '')}>
        <option value="">Como conheceu a barbearia?</option>
        {categorias.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
      </Select>
```

Encontrar (o import, pra remover `CATEGORIAS_ORIGEM` que não existe mais):
```tsx
import { CATEGORIAS_ORIGEM, type CategoriaOrigem } from '@/lib/categorias-origem'
```
Substituir por:
```tsx
import type { CategoriaOrigem } from '@/lib/categorias-origem'
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 5: Verificação visual manual**

`/painel/prospeccao`: o seletor de categoria no "Novo contato prospectado" mostra as categorias cadastradas. Abrir a ficha de um cliente e confirmar que "Editar CPF/bairro/..." mostra o seletor de categoria com as opções certas, e que um cliente com categoria antiga (migrada de slug) mostra o nome por extenso corretamente em "Como conheceu".

- [ ] **Step 6: Commit**

```bash
git add src/app/painel/prospeccao/page.tsx src/components/ficha-cliente.tsx src/components/editar-cliente-form.tsx
git commit -m "feat: thread categorias through prospeccao and ficha do cliente"
```

---

### Task 7: Encadear `categorias` pelo Agendamento Público

**Files:**
- Modify: `src/app/[barbeariaSlug]/page.tsx`
- Modify: `src/components/public-booking-flow.tsx`

**Interfaces:**
- Consumes: `categorias_origem` via a policy pública `ativo = true` (Task 1) — leitura sem autenticação.

- [ ] **Step 1: `src/app/[barbeariaSlug]/page.tsx`**

Encontrar:
```tsx
  const { data: servicos } = await supabase.from('servicos').select('*').eq('barbearia_id', barbearia.id).eq('ativo', true)
  const { data: barbeiros } = await supabase.from('membros').select('id, nome').eq('barbearia_id', barbearia.id).eq('papel', 'barbeiro').eq('ativo', true)

  return <PublicBookingFlow barbearia={barbearia} servicos={servicos ?? []} barbeiros={barbeiros ?? []} />
```
Substituir por:
```tsx
  const { data: servicos } = await supabase.from('servicos').select('*').eq('barbearia_id', barbearia.id).eq('ativo', true)
  const { data: barbeiros } = await supabase.from('membros').select('id, nome').eq('barbearia_id', barbearia.id).eq('papel', 'barbeiro').eq('ativo', true)
  const { data: categorias } = await supabase.from('categorias_origem').select('id, nome').eq('barbearia_id', barbearia.id).eq('ativo', true).order('nome')

  return <PublicBookingFlow barbearia={barbearia} servicos={servicos ?? []} barbeiros={barbeiros ?? []} categorias={categorias ?? []} />
```

- [ ] **Step 2: `src/components/public-booking-flow.tsx`**

Encontrar:
```tsx
import { CATEGORIAS_ORIGEM, type CategoriaOrigem } from '@/lib/categorias-origem'

type Servico = { id: string; nome: string; duracao_minutos: number; preco: number }
type Barbeiro = { id: string; nome: string }

const CHIP_BASE = 'rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors'
const CHIP_SELECIONADO = 'border border-primary bg-primary text-primary-foreground'
const CHIP_PADRAO = 'border border-input bg-input-bg hover:border-ring'

export function PublicBookingFlow({
  barbearia, servicos, barbeiros,
}: { barbearia: { id: string; nome: string }; servicos: Servico[]; barbeiros: Barbeiro[] }) {
```
Substituir por:
```tsx
import type { CategoriaOrigem } from '@/lib/categorias-origem'

type Servico = { id: string; nome: string; duracao_minutos: number; preco: number }
type Barbeiro = { id: string; nome: string }
type Categoria = { id: string; nome: string }

const CHIP_BASE = 'rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors'
const CHIP_SELECIONADO = 'border border-primary bg-primary text-primary-foreground'
const CHIP_PADRAO = 'border border-input bg-input-bg hover:border-ring'

export function PublicBookingFlow({
  barbearia, servicos, barbeiros, categorias,
}: { barbearia: { id: string; nome: string }; servicos: Servico[]; barbeiros: Barbeiro[]; categorias: Categoria[] }) {
```

Encontrar:
```tsx
                <Select value={categoriaOrigem} onChange={(e) => setCategoriaOrigem(e.target.value as CategoriaOrigem | '')} aria-label="Como conheceu a barbearia?">
                  <option value="">Como conheceu a barbearia?</option>
                  {CATEGORIAS_ORIGEM.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </Select>
```
Substituir por:
```tsx
                <Select value={categoriaOrigem} onChange={(e) => setCategoriaOrigem(e.target.value as CategoriaOrigem | '')} aria-label="Como conheceu a barbearia?">
                  <option value="">Como conheceu a barbearia?</option>
                  {categorias.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                </Select>
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 4: Verificação visual manual**

Abrir `/<slug-da-barbearia>` (sem login, aba anônima), avançar até "4. Seus dados" e confirmar que o seletor "Como conheceu a barbearia?" mostra as categorias cadastradas pelo admin.

- [ ] **Step 5: Commit**

```bash
git add src/app/[barbeariaSlug]/page.tsx src/components/public-booking-flow.tsx
git commit -m "feat: thread categorias through the public booking flow"
```
