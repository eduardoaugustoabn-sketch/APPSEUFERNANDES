# Categoria de origem do cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track how each client first heard about the barbershop (indicação, redes sociais, etc.), captured as required when a genuinely new client is created during any booking flow, and editable later from the existing client ficha screen.

**Architecture:** A new nullable `clientes.categoria_origem` column, enforced as required only for a genuinely-new insert inside `criar_ou_obter_cliente` (detected via the `xmax = 0` trick, never for an existing/conflict-path client). A shared five-option constant drives a `<select>` added to the shared `ClienteAutocomplete` component (covering all three internal booking forms at once), to the standalone public booking form, and to the existing client-edit form.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (Postgres/RLS, pgTAP via `npx supabase test db`), React client components.

**Spec:** docs/superpowers/specs/2026-08-16-categoria-origem-cliente-design.md

## Global Constraints

- `categoria_origem` is nullable at the database level — existing clients keep `null`, and "obrigatório no cadastro novo" is enforced procedurally inside `criar_ou_obter_cliente`, never via a `not null` constraint.
- Allowed values are exactly these five: `indicacao`, `redes_sociais`, `google_internet`, `passou_na_rua`, `outro`.
- The requirement only applies to a genuinely new client (an actual `insert`, detected via `(xmax = 0)` on the `on conflict do update` `returning` clause) — a call that resolves to an already-existing client (by `barbearia_id, telefone`) never raises, regardless of whether a category was sent.
- An existing client's `categoria_origem` is never overwritten once set — only backfilled from `null` (same `coalesce` pattern already used for `bairro`/`cidade`/`data_nascimento`).
- Client-side "required" checks in the booking forms are a courtesy only, to avoid a round-trip failure — the database function is the actual enforcement backstop, and must never be weakened to rely on the client-side check alone.
- `categoria_origem` is never shown, selected, or filtered on the client list screen (`ListaClientes`) — out of scope for this plan.
- `agendamentos.origem` (`'publico' | 'interno'`) is an unrelated, pre-existing column — this plan does not read, write, or rename it.

---

### Task 1: Migração — coluna `categoria_origem` + validação em `criar_ou_obter_cliente` + `criar_agendamento_publico`

**Files:**
- Create: `supabase/migrations/0022_cliente_categoria_origem.sql`
- Test: `supabase/tests/database/0013_categoria_origem.test.sql`

**Interfaces:**
- Produces: `clientes.categoria_origem text` (nullable, checked against the 5 values above); `criar_ou_obter_cliente(p_barbearia_id uuid, p_nome text, p_telefone text, p_data_nascimento date default null, p_bairro text default null, p_cidade text default null, p_categoria_origem text default null) returns uuid`; `criar_agendamento_publico(p_barbearia_id uuid, p_membro_id uuid, p_servico_id uuid, p_data date, p_hora_inicio time, p_nome_cliente text, p_telefone_cliente text, p_bairro text default null, p_cidade text default null, p_categoria_origem text default null) returns uuid`. Every later task's RPC calls use these exact 7-arg / 10-arg positional signatures.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0022_cliente_categoria_origem.sql`:

```sql
alter table clientes add column categoria_origem text
  check (categoria_origem in ('indicacao', 'redes_sociais', 'google_internet', 'passou_na_rua', 'outro'));

-- Dropped and recreated (not just CREATE OR REPLACE) because adding a new
-- parameter changes the function's full type signature — same reasoning
-- documented in 0013_cliente_aniversario.sql and 0019_cliente_bairro_cidade.sql.
drop function if exists public.criar_ou_obter_cliente(uuid, text, text, date, text, text);

create or replace function public.criar_ou_obter_cliente(
  p_barbearia_id uuid, p_nome text, p_telefone text, p_data_nascimento date default null,
  p_bairro text default null, p_cidade text default null, p_categoria_origem text default null
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

  v_telefone := regexp_replace(p_telefone, '\D', '', 'g');

  -- (xmax = 0) is true only for a row that was genuinely just inserted by
  -- THIS statement, never for a row that took the on-conflict update path —
  -- that's how we know whether this call actually created a new client,
  -- as opposed to just resolving to an existing one.
  insert into clientes (barbearia_id, nome, telefone, data_nascimento, bairro, cidade, categoria_origem)
  values (p_barbearia_id, p_nome, v_telefone, p_data_nascimento, p_bairro, p_cidade, p_categoria_origem)
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

grant execute on function public.criar_ou_obter_cliente(uuid, text, text, date, text, text, text) to anon, authenticated;

-- Same reasoning: a new trailing param changes the signature, so drop first.
drop function if exists public.criar_agendamento_publico(uuid, uuid, uuid, date, time, text, text, text, text);

create or replace function public.criar_agendamento_publico(
  p_barbearia_id uuid, p_membro_id uuid, p_servico_id uuid,
  p_data date, p_hora_inicio time, p_nome_cliente text, p_telefone_cliente text,
  p_bairro text default null, p_cidade text default null, p_categoria_origem text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_duracao int;
  v_cliente_id uuid;
  v_agendamento_id uuid;
  v_hora_fim time;
begin
  if not exists (
    select 1 from membros m
    where m.id = p_membro_id and m.barbearia_id = p_barbearia_id and m.papel = 'barbeiro' and m.ativo
  ) then
    raise exception 'Barbeiro inválido para esta barbearia';
  end if;

  select duracao_minutos into v_duracao from servicos where id = p_servico_id and barbearia_id = p_barbearia_id;
  if v_duracao is null then
    raise exception 'Serviço inválido para esta barbearia';
  end if;

  if p_data < current_date then
    raise exception 'Não é possível agendar em uma data passada';
  end if;

  v_hora_fim := p_hora_inicio + (v_duracao || ' minutes')::interval;

  if exists (
    select 1 from agendamentos a
    where a.membro_id = p_membro_id and a.data = p_data and a.status <> 'cancelado'
      and p_hora_inicio < a.hora_fim and v_hora_fim > a.hora_inicio
  ) then
    raise exception 'Esse horário acabou de ser reservado por outra pessoa. Escolha outro horário.';
  end if;

  v_cliente_id := criar_ou_obter_cliente(p_barbearia_id, p_nome_cliente, p_telefone_cliente, null, p_bairro, p_cidade, p_categoria_origem);

  insert into agendamentos (barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem)
  values (
    p_barbearia_id, p_membro_id, v_cliente_id, p_servico_id, p_data, p_hora_inicio, v_hora_fim, 'agendado', 'publico'
  )
  returning id into v_agendamento_id;

  return v_agendamento_id;
end;
$$;

grant execute on function public.criar_agendamento_publico(uuid, uuid, uuid, date, time, text, text, text, text, text) to anon, authenticated;
```

- [ ] **Step 2: Write the pgTAP test**

Create `supabase/tests/database/0013_categoria_origem.test.sql`:

```sql
begin;
select plan(9);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a');
insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com');
insert into membros (id, barbearia_id, user_id, papel, nome, ativo) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João', true);
insert into servicos (id, barbearia_id, nome, duracao_minutos, preco) values
  ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Corte', 40, 60);

set local role anon;

select lives_ok(
  $$ select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Marcos Silva', '11988887777', null, null, null, 'indicacao') $$,
  'creating a new client with categoria_origem provided succeeds'
);

reset role;

select is(
  (select categoria_origem from clientes where telefone = '11988887777'),
  'indicacao',
  'categoria_origem is stored when provided on creation'
);

set local role anon;

select throws_ok(
  $$ select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Sem Categoria', '11977776666') $$,
  'Categoria de origem é obrigatória para clientes novos.',
  'creating a new client without categoria_origem is rejected'
);

select lives_ok(
  $$ select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Marcos Silva', '11988887777', null, null, null, 'outro') $$,
  'calling again for an existing client with a different categoria_origem does not throw'
);

reset role;

select is(
  (select categoria_origem from clientes where telefone = '11988887777'),
  'indicacao',
  'an existing categoria_origem is never overwritten by a later call'
);

-- Simulate a client that predates this feature: created directly, no RPC, no categoria.
insert into clientes (barbearia_id, nome, telefone) values
  ('11111111-1111-1111-1111-111111111111', 'Cliente Legado', '11955554444');

set local role anon;

select lives_ok(
  $$ select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente Legado', '11955554444', null, null, null, 'passou_na_rua') $$,
  'backfilling a pre-existing null categoria_origem on an existing client does not throw'
);

reset role;

select is(
  (select categoria_origem from clientes where telefone = '11955554444'),
  'passou_na_rua',
  'a null categoria_origem is backfilled when provided on a later call'
);

set local role anon;

select lives_ok(
  $$ select criar_agendamento_publico('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', current_date + 1, '09:00', 'Cliente Público', '11933332222', null, null, 'redes_sociais') $$,
  'a public booking for a new client with categoria_origem succeeds'
);

reset role;

select is(
  (select categoria_origem from clientes where telefone = '11933332222'),
  'redes_sociais',
  'categoria_origem passed through criar_agendamento_publico is persisted on the new client'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Run the pgTAP suite**

Run: `npx supabase test db`
Expected: all files pass, including the new `0013_categoria_origem.test.sql` (9/9 assertions), with no regressions in the other 12 files.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0022_cliente_categoria_origem.sql supabase/tests/database/0013_categoria_origem.test.sql
git commit -m "feat: add categoria_origem column, required for new clients only"
```

---

### Task 2: `ClienteAutocomplete` — campo de categoria de origem + rastreamento de "reconhecido"

**Files:**
- Create: `src/lib/categorias-origem.ts`
- Modify: `src/components/cliente-autocomplete.tsx`

**Interfaces:**
- Consumes: nothing new from Task 1 directly (the RPC call itself lives in the three forms modified in Task 3, not in this component).
- Produces: `CATEGORIAS_ORIGEM: { value: string; label: string }[]` (imported by Task 3 is not needed — Task 3 only needs the extended `onResolved` payload; `CATEGORIAS_ORIGEM` is imported directly by Task 4's `PublicBookingFlow` and Task 5's `EditarClienteForm`). `ClienteAutocomplete`'s `onResolved` callback now also reports `reconhecido: boolean` (true when the client was recognized — either pre-filled via `valorInicial` or selected from the phone-search dropdown, false otherwise) and `categoriaOrigem?: string`. Task 3's three forms read both of these new fields.

- [ ] **Step 1: Create the shared categories constant**

Create `src/lib/categorias-origem.ts`:

```ts
export const CATEGORIAS_ORIGEM = [
  { value: 'indicacao', label: 'Indicação' },
  { value: 'redes_sociais', label: 'Redes sociais' },
  { value: 'google_internet', label: 'Google/Internet' },
  { value: 'passou_na_rua', label: 'Passou na rua' },
  { value: 'outro', label: 'Outro' },
] as const
```

- [ ] **Step 2: Rewrite `ClienteAutocomplete`**

Replace the full contents of `src/components/cliente-autocomplete.tsx` with:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { CATEGORIAS_ORIGEM } from '@/lib/categorias-origem'

type ResultadoBusca = {
  id: string
  nome: string
  telefone: string
  total_cortes: number
  data_nascimento: string | null
  bairro: string | null
  cidade: string | null
}

export function ClienteAutocomplete({
  onResolved, valorInicial,
}: {
  onResolved: (info: {
    nome: string; telefone: string; totalCortes: number; reconhecido: boolean
    dataNascimento?: string; bairro?: string; cidade?: string; categoriaOrigem?: string
  }) => void
  valorInicial?: { nome: string; telefone: string }
}) {
  const [nome, setNome] = useState(valorInicial?.nome ?? '')
  const [telefone, setTelefone] = useState(valorInicial?.telefone ?? '')
  const [dataNascimento, setDataNascimento] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [categoriaOrigem, setCategoriaOrigem] = useState('')
  const [resultados, setResultados] = useState<ResultadoBusca[]>([])
  const [mostrarLista, setMostrarLista] = useState(false)
  // Refs (not just state) so onResolved always reads the latest value
  // regardless of render timing.
  const nomeRef = useRef(valorInicial?.nome ?? '')
  const telefoneRef = useRef(valorInicial?.telefone ?? '')
  const dataNascimentoRef = useRef('')
  const bairroRef = useRef('')
  const cidadeRef = useRef('')
  const categoriaOrigemRef = useRef('')
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
    onResolved({
      nome: cliente.nome, telefone: cliente.telefone, totalCortes: cliente.total_cortes, reconhecido: true,
      dataNascimento: cliente.data_nascimento ?? undefined,
      bairro: cliente.bairro ?? undefined, cidade: cliente.cidade ?? undefined,
      categoriaOrigem: categoriaOrigemRef.current || undefined,
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <Input placeholder="Nome do cliente" value={nome} onChange={(e) => handleNomeChange(e.target.value)} />
      <div className="relative">
        <Input
          placeholder="Telefone"
          value={telefone}
          onChange={(e) => verificar(e.target.value)}
          onBlur={() => setMostrarLista(false)}
        />
        {mostrarLista && resultados.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-card border rounded shadow-md max-h-48 overflow-y-auto">
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
      <Input type="date" placeholder="Data de nascimento (opcional)" value={dataNascimento} onChange={(e) => handleDataNascimentoChange(e.target.value)} />
      <Input placeholder="Bairro (opcional)" value={bairro} onChange={(e) => handleBairroChange(e.target.value)} />
      <Input placeholder="Cidade (opcional)" value={cidade} onChange={(e) => handleCidadeChange(e.target.value)} />
      <select
        value={categoriaOrigem}
        onChange={(e) => handleCategoriaOrigemChange(e.target.value)}
        className="border rounded px-2 py-1"
      >
        <option value="">Como conheceu a barbearia?</option>
        {CATEGORIAS_ORIGEM.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
    </div>
  )
}
```

Note deliberately NOT done here (do not add): extending `buscar_clientes_por_telefone` to return `categoria_origem` so `selecionar()` could pre-fill it. That RPC and its return columns are out of scope for this plan — selecting an existing client from the dropdown leaves the categoria field exactly as it was (blank, or whatever the user already typed), which is fine because `reconhecido` is already `true` at that point and the field is not required.

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: succeeds with no type errors (this component's new prop shape doesn't break its three existing consumers yet — Task 3 updates them next).

- [ ] **Step 4: Commit**

```bash
git add src/lib/categorias-origem.ts src/components/cliente-autocomplete.tsx
git commit -m "feat: add categoria de origem field and recognized-client tracking to ClienteAutocomplete"
```

---

### Task 3: Formulários internos — `AgendarSlotForm`, `AtenderAgoraForm`, `LancamentoForm`

**Files:**
- Modify: `src/components/agendar-slot-form.tsx`
- Modify: `src/components/atender-agora-form.tsx`
- Modify: `src/components/lancamento-form.tsx`

**Interfaces:**
- Consumes: `ClienteAutocomplete`'s extended `onResolved` payload from Task 2 (`reconhecido: boolean`, `categoriaOrigem?: string`); `criar_ou_obter_cliente`'s new `p_categoria_origem` param from Task 1.
- Produces: nothing new consumed by later tasks — this task's three forms are leaf consumers.

All three files get the identical shape of change: extend the local `cliente` state type with `reconhecido?: boolean` and `categoriaOrigem?: string` (optional here, even though `ClienteAutocomplete` always reports `reconhecido`, so each form's own hand-written initial state literals — e.g. `LancamentoForm`'s `{ nome: modoAgenda.clienteNome, telefone: modoAgenda.clienteTelefone }` — stay valid without extra edits); add one guard line; add one RPC parameter.

- [ ] **Step 1: Update `agendar-slot-form.tsx`**

In `src/components/agendar-slot-form.tsx`, change the `cliente` state type (currently `useState<{ nome: string; telefone: string; dataNascimento?: string; bairro?: string; cidade?: string } | null>(null)`) to:

```tsx
const [cliente, setCliente] = useState<{ nome: string; telefone: string; dataNascimento?: string; bairro?: string; cidade?: string; categoriaOrigem?: string; reconhecido?: boolean } | null>(null)
```

In `confirmar()`, add the guard right after the existing "Preencha o cliente" check:

```tsx
function confirmar() {
  if (!cliente || !cliente.nome || !cliente.telefone) { setMensagem('Preencha o cliente.'); return }
  if (!cliente.reconhecido && !cliente.categoriaOrigem) { setMensagem('Escolha como o cliente conheceu a barbearia.'); return }
  if (!servicoId) { setMensagem('Escolha o serviço.'); return }
  if (conflito && !pedindoConfirmacao) { setPedindoConfirmacao(true); return }
  gravar()
}
```

In `gravar()`, add `p_categoria_origem` to the existing `criar_ou_obter_cliente` call:

```tsx
const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
  p_barbearia_id: barbeariaId, p_nome: cliente!.nome, p_telefone: cliente!.telefone,
  p_data_nascimento: cliente!.dataNascimento ?? null,
  p_bairro: cliente!.bairro ?? null, p_cidade: cliente!.cidade ?? null,
  p_categoria_origem: cliente!.categoriaOrigem ?? null,
})
```

- [ ] **Step 2: Update `atender-agora-form.tsx`**

In `src/components/atender-agora-form.tsx`, change the `cliente` state type the same way:

```tsx
const [cliente, setCliente] = useState<{ nome: string; telefone: string; dataNascimento?: string; bairro?: string; cidade?: string; categoriaOrigem?: string; reconhecido?: boolean } | null>(null)
```

In `criar()`, add the guard right after the existing "Preencha o cliente" check:

```tsx
async function criar() {
  if (!cliente || !cliente.nome || !cliente.telefone) { setMensagem('Preencha o cliente.'); return }
  if (!cliente.reconhecido && !cliente.categoriaOrigem) { setMensagem('Escolha como o cliente conheceu a barbearia.'); return }
  if (!servicoId) { setMensagem('Escolha o serviço.'); return }

  setSalvando(true)
  setMensagem(null)
  const supabase = getBrowserSupabaseClient()

  const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
    p_barbearia_id: barbeariaId, p_nome: cliente.nome, p_telefone: cliente.telefone,
    p_data_nascimento: cliente.dataNascimento ?? null,
    p_bairro: cliente.bairro ?? null, p_cidade: cliente.cidade ?? null,
    p_categoria_origem: cliente.categoriaOrigem ?? null,
  })
  if (clienteId.error) { setMensagem(clienteId.error.message); setSalvando(false); return }
  // ... rest of the function is unchanged
```

(Only the guard line and the added `p_categoria_origem` field change — everything else in `criar()` after this point stays exactly as it is today.)

- [ ] **Step 3: Update `lancamento-form.tsx`**

In `src/components/lancamento-form.tsx`, change the `cliente` state type the same way:

```tsx
const [cliente, setCliente] = useState<{ nome: string; telefone: string; dataNascimento?: string; bairro?: string; cidade?: string; categoriaOrigem?: string; reconhecido?: boolean } | null>(
  { nome: modoAgenda.clienteNome, telefone: modoAgenda.clienteTelefone }
)
```

In `salvar()`, add the guard right after the existing "Preencha o cliente" check:

```tsx
async function salvar() {
  if (!cliente || !cliente.nome || !cliente.telefone) { setMensagem('Preencha o cliente.'); return }
  if (!cliente.reconhecido && !cliente.categoriaOrigem) { setMensagem('Escolha como o cliente conheceu a barbearia.'); return }
  // A produto-only sale (client just buys a pomada, no corte) is valid —
  // only require that at least one of the two lists isn't empty.
  if (servicosSelecionados.length === 0 && produtosSelecionados.length === 0) {
    setMensagem('Adicione ao menos um serviço ou produto.')
    return
  }
  if (agendarRetorno && !retornoHorario) { setMensagem('Escolha um horário para o retorno, ou desmarque "Agendar próxima visita".'); return }

  setSalvando(true)
  setMensagem(null)
  const supabase = getBrowserSupabaseClient()

  const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
    p_barbearia_id: barbeariaId, p_nome: cliente.nome, p_telefone: cliente.telefone,
    p_data_nascimento: cliente.dataNascimento ?? null,
    p_bairro: cliente.bairro ?? null, p_cidade: cliente.cidade ?? null,
    p_categoria_origem: cliente.categoriaOrigem ?? null,
  })
  if (clienteId.error) { setMensagem(clienteId.error.message); setSalvando(false); return }
  // ... rest of the function is unchanged
```

(Only the guard line and the added `p_categoria_origem` field change — everything else in `salvar()`, including the `atendimentos`/`vendas_produtos`/`agendamentos` inserts and the reset logic at the end, stays exactly as it is today.)

Note on this file specifically: `modoAgenda` always describes an appointment that already exists (opened from `AgendaDia`), so its client is by definition already in `clientes`. `ClienteAutocomplete`'s own mount effect (Task 2) reports `reconhecido: true` for this `valorInicial` case immediately on mount, so the guard above will not block the normal "conclude an existing appointment" path — do not add any special-casing for `modoAgenda` here.

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/agendar-slot-form.tsx src/components/atender-agora-form.tsx src/components/lancamento-form.tsx
git commit -m "feat: require categoria de origem for new clients in the internal booking forms"
```

---

### Task 4: `PublicBookingFlow` — captura no agendamento público

**Files:**
- Modify: `src/components/public-booking-flow.tsx`

**Interfaces:**
- Consumes: `CATEGORIAS_ORIGEM` from Task 2 (`src/lib/categorias-origem.ts`); `criar_agendamento_publico`'s new `p_categoria_origem` param from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the category state and select**

In `src/components/public-booking-flow.tsx`:

Add the import:

```tsx
import { CATEGORIAS_ORIGEM } from '@/lib/categorias-origem'
```

Add a new state variable next to the existing `cidade` state:

```tsx
const [categoriaOrigem, setCategoriaOrigem] = useState('')
```

Add the client-side guard at the top of `confirmar()`, and pass the new param to the RPC call:

```tsx
async function confirmar() {
  if (!servico || !barbeiro || !horario) return
  if (!reconhecimento && !categoriaOrigem) { setErro('Escolha como você conheceu a barbearia.'); return }
  const supabase = getBrowserSupabaseClient()
  const { error } = await supabase.rpc('criar_agendamento_publico', {
    p_barbearia_id: barbearia.id, p_membro_id: barbeiro.id, p_servico_id: servico.id,
    p_data: data, p_hora_inicio: horario, p_nome_cliente: nome, p_telefone_cliente: telefone,
    p_bairro: bairro || null, p_cidade: cidade || null, p_categoria_origem: categoriaOrigem || null,
  })
  if (error) { setErro(error.message); return }
  setConfirmado(true)
}
```

In the JSX, add `className="mb-2"` to the existing cidade `Input` (it's no longer the last field in the group) and add the new `<select>` right after it, before the `reconhecimento`/`erro` messages:

```tsx
<Input placeholder="Bairro (opcional)" value={bairro} onChange={(e) => setBairro(e.target.value)} className="mb-2" />
<Input placeholder="Cidade (opcional)" value={cidade} onChange={(e) => setCidade(e.target.value)} className="mb-2" />
<select
  value={categoriaOrigem}
  onChange={(e) => setCategoriaOrigem(e.target.value)}
  className="border rounded px-2 py-1 w-full"
>
  <option value="">Como conheceu a barbearia?</option>
  {CATEGORIAS_ORIGEM.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
</select>
{reconhecimento && <p className="text-sm text-primary mt-2">{reconhecimento}</p>}
{erro && <p className="text-sm text-destructive mt-2">{erro}</p>}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/public-booking-flow.tsx
git commit -m "feat: require categoria de origem for new clients on the public booking page"
```

---

### Task 5: `EditarClienteForm` + `FichaCliente` — editar categoria de origem depois

**Files:**
- Modify: `src/components/editar-cliente-form.tsx`
- Modify: `src/components/ficha-cliente.tsx`

**Interfaces:**
- Consumes: `CATEGORIAS_ORIGEM` from Task 2 (`src/lib/categorias-origem.ts`); `clientes.categoria_origem` column from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Rewrite `editar-cliente-form.tsx`**

Replace the full contents of `src/components/editar-cliente-form.tsx` with:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CATEGORIAS_ORIGEM } from '@/lib/categorias-origem'

export function EditarClienteForm({
  clienteId, bairroAtual, cidadeAtual, observacaoAtual, categoriaOrigemAtual,
}: {
  clienteId: string
  bairroAtual: string | null
  cidadeAtual: string | null
  observacaoAtual: string | null
  categoriaOrigemAtual: string | null
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [bairro, setBairro] = useState(bairroAtual ?? '')
  const [cidade, setCidade] = useState(cidadeAtual ?? '')
  const [observacao, setObservacao] = useState(observacaoAtual ?? '')
  const [categoriaOrigem, setCategoriaOrigem] = useState(categoriaOrigemAtual ?? '')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    const { data, error } = await supabase
      .from('clientes')
      .update({
        bairro: bairro.trim() || null, cidade: cidade.trim() || null, observacao: observacao.trim() || null,
        categoria_origem: categoriaOrigem || null,
      })
      .eq('id', clienteId)
      .select('id')
    setSalvando(false)
    if (error) {
      alert(error.message)
      return
    }
    if (!data || data.length === 0) {
      alert('Não foi possível salvar — você não tem permissão para editar este cliente.')
      return
    }
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setBairro(bairroAtual ?? '')
    setCidade(cidadeAtual ?? '')
    setObservacao(observacaoAtual ?? '')
    setCategoriaOrigem(categoriaOrigemAtual ?? '')
    setEditando(false)
  }

  const categoriaLabel = CATEGORIAS_ORIGEM.find((c) => c.value === categoriaOrigemAtual)?.label

  if (!editando) {
    return (
      <div className="mb-4">
        {observacaoAtual && <p className="text-sm text-muted-foreground mb-2">Observação: {observacaoAtual}</p>}
        {categoriaLabel && <p className="text-sm text-muted-foreground mb-2">Como conheceu: {categoriaLabel}</p>}
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">
          Editar bairro/cidade/observação/origem
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 mb-4 border rounded p-3">
      <Input placeholder="Bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
      <Input placeholder="Cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
      <textarea
        placeholder="Observação"
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
        className="border rounded px-2 py-1 bg-input text-sm min-h-20"
      />
      <select value={categoriaOrigem} onChange={(e) => setCategoriaOrigem(e.target.value)} className="border rounded px-2 py-1">
        <option value="">Como conheceu a barbearia?</option>
        {CATEGORIAS_ORIGEM.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
      <div className="flex gap-2">
        <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
        <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire it into `ficha-cliente.tsx`**

In `src/components/ficha-cliente.tsx`, extend the `.select()` call (currently `.select('nome, telefone, criado_em, data_nascimento, bairro, cidade, observacao')`) to:

```tsx
const { data: cliente } = await supabase.from('clientes').select('nome, telefone, criado_em, data_nascimento, bairro, cidade, observacao, categoria_origem').eq('id', clienteId).single()
```

And extend the `<EditarClienteForm>` call:

```tsx
<EditarClienteForm
  clienteId={clienteId}
  bairroAtual={cliente?.bairro ?? null}
  cidadeAtual={cliente?.cidade ?? null}
  observacaoAtual={cliente?.observacao ?? null}
  categoriaOrigemAtual={cliente?.categoria_origem ?? null}
/>
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: succeeds with no type errors; `/admin/clientes/[id]` and `/painel/clientes/[id]` still compile.

- [ ] **Step 4: Commit**

```bash
git add src/components/editar-cliente-form.tsx src/components/ficha-cliente.tsx
git commit -m "feat: show and let admin/barbeiro edit categoria de origem on the ficha do cliente"
```

---

### Task 6: Regressão final

**Files:** none (verification only).

- [ ] **Step 1: Full automated regression**

Run:
```bash
npm test
npm run build
npx supabase test db
```
Expected: `npm test` shows all existing unit tests still passing (this plan adds no new ones — no pure-function logic, same precedent as every prior client-related plan this session); `npm run build` succeeds with no type errors; `npx supabase test db` shows all 13 pgTAP suites passing, including the new `0013_categoria_origem.test.sql`.

- [ ] **Step 2: Manual end-to-end walkthrough (if a browser is available)**

As admin or barbeiro, open the agenda and start a new agendamento (`AgendarSlotForm`) for a phone number that has never been used before: type a name and that new phone number, leave "Como conheceu a barbearia?" unselected, and confirm — expect the message "Escolha como o cliente conheceu a barbearia." and no agendamento created. Now pick a category and confirm — expect it to succeed. Start a second, unrelated new booking, this time selecting an EXISTING client from the phone-search dropdown (a recognized client) — confirm the booking succeeds without needing to pick a category. Repeat the "new client blocked without a category, succeeds with one" check once via "Atender agora" (`AtenderAgoraForm`) and once via the public booking page at `/[barbeariaSlug]` (a genuinely new phone number, `PublicBookingFlow`). Finally, open a client's ficha, click "Editar bairro/cidade/observação/origem", set a category (or change an existing one that was never set), Salvar, and confirm the ficha now shows a "Como conheceu:" line with the chosen label.

If no browser is available, document that limitation in the ledger instead of skipping the check silently — same pattern used in every prior plan this session.

- [ ] **Step 3: No commit for this task** — it's verification-only; if any issue surfaces, fix it as a small follow-up commit referencing which task's step regressed.
