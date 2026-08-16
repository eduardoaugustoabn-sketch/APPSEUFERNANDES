# Busca de cliente por telefone parcial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o reconhecimento por telefone completo em `ClienteAutocomplete` e no formulário de prospecção por uma busca com lista suspensa a partir de 4 dígitos, que preenche todos os campos já conhecidos do cliente ao clicar.

**Architecture:** Uma função SQL nova, `buscar_clientes_por_telefone`, escopada pela barbearia do chamador autenticado (não por um parâmetro), retorna até 10 clientes cujo telefone contém os dígitos buscados. `ClienteAutocomplete` (3 consumidores internos) e um novo componente cliente dedicado em `painel/prospeccao` chamam essa função com debounce e mostram os resultados numa lista suspensa. A página de agendamento público não é tocada.

**Tech Stack:** Next.js 16.3 App Router, TypeScript, Supabase (Postgres/RLS via `@supabase/supabase-js` e `@supabase/ssr`), Tailwind CSS v4, shadcn/ui, pgTAP (testes de banco via `npx supabase test db`).

**Spec:** `docs/superpowers/specs/2026-08-16-busca-cliente-parcial-design.md`

## Global Constraints

- A busca é só para telas internas autenticadas. A página de agendamento público (`PublicBookingFlow`) não é tocada — continua usando `reconhecer_cliente`, que também não é tocada.
- `buscar_clientes_por_telefone` usa `auth_barbearia_id()` internamente — sem parâmetro de barbearia vindo do cliente. Grant só para `authenticated`, nunca `anon`.
- Casa os dígitos digitados em qualquer posição do telefone armazenado (`like '%digitos%'`). Exige pelo menos 4 dígitos — abaixo disso, retorna vazio (checagem dentro da própria função, não só na UI).
- Sempre mostra a lista suspensa ao encontrar resultados, mesmo com telefone completo e 1 único resultado — sem caso especial de auto-preenchimento silencioso.
- Selecionar um resultado preenche nome, telefone, data de nascimento, bairro e cidade — tudo que aquele cliente já tiver cadastrado.
- Sem navegação por teclado na lista — só clique do mouse.

---

### Task 1: Migração — função `buscar_clientes_por_telefone`

**Files:**
- Create: `supabase/migrations/0020_busca_cliente_parcial.sql`
- Create: `supabase/tests/database/0011_busca_cliente_isolation.test.sql`

**Interfaces:**
- Produces: função `buscar_clientes_por_telefone(text) returns table(id uuid, nome text, telefone text, total_cortes int, data_nascimento date, bairro text, cidade text)`. Tasks 2 e 3 chamam essa função via `.rpc('buscar_clientes_por_telefone', { p_busca: <texto digitado> })`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0020_busca_cliente_parcial.sql`:

```sql
-- Diferente de reconhecer_cliente() (que fica intocada, servindo só a
-- página pública anônima): esta função nunca recebe barbearia_id como
-- parâmetro — usa auth_barbearia_id() do chamador autenticado, fechando
-- a possibilidade de um barbeiro forjar o parâmetro pra ver clientes de
-- outra barbearia. E é concedida só pra authenticated, nunca anon —
-- retornar múltiplos clientes por 4 dígitos parciais seria um
-- vazamento de dados se alcançável por um visitante anônimo.
create or replace function public.buscar_clientes_por_telefone(p_busca text)
returns table(
  id uuid, nome text, telefone text, total_cortes int,
  data_nascimento date, bairro text, cidade text
)
language sql security definer set search_path = public as $$
  select
    c.id, c.nome, c.telefone,
    (select count(*)::int from atendimentos a where a.cliente_id = c.id) as total_cortes,
    c.data_nascimento, c.bairro, c.cidade
  from clientes c
  where c.barbearia_id = auth_barbearia_id()
    and length(regexp_replace(p_busca, '\D', '', 'g')) >= 4
    and c.telefone like '%' || regexp_replace(p_busca, '\D', '', 'g') || '%'
  order by c.nome
  limit 10;
$$;

grant execute on function public.buscar_clientes_por_telefone(text) to authenticated;
```

- [ ] **Step 2: Apply the migration locally**

Check `npx supabase status` first to confirm the local stack is running; start it with `npx supabase start` if not.

Run: `npx supabase db reset`
Expected: all migrations (including the new `0020_busca_cliente_parcial`) replay from scratch with no errors.

- [ ] **Step 3: Write the pgTAP isolation + grant tests**

Create `supabase/tests/database/0011_busca_cliente_isolation.test.sql`:

```sql
begin;
select plan(4);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a'),
  ('22222222-2222-2222-2222-222222222222', 'Barbearia B', 'barbearia-b');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com');

insert into membros (id, barbearia_id, user_id, papel, nome) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João');

-- Telefones deliberadamente compartilham os dígitos "9999" — se a
-- isolação por tenant falhar, a busca de João por "9999" retornaria
-- os dois clientes em vez de só o da própria barbearia.
insert into clientes (id, barbearia_id, nome, telefone) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Cliente A', '11999998888'),
  ('c1000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Cliente B', '11999997777');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

select is(
  (select count(*)::int from buscar_clientes_por_telefone('9999')),
  1,
  'barbeiro João buscando digitos compartilhados pelas duas barbearias só vê o cliente da própria'
);

select is(
  (select nome from buscar_clientes_por_telefone('9999') limit 1),
  'Cliente A',
  'o resultado visível é o Cliente A, nunca o Cliente B de outra barbearia'
);

select is(
  (select count(*)::int from buscar_clientes_por_telefone('999')),
  0,
  'menos de 4 dígitos não retorna nada, mesmo que tecnicamente bateria'
);

set local role anon;
select throws_ok(
  $$ select * from buscar_clientes_por_telefone('9999') $$,
  'permission denied for function buscar_clientes_por_telefone',
  'anon não tem grant de execução em buscar_clientes_por_telefone'
);

select * from finish();
rollback;
```

- [ ] **Step 4: Run the pgTAP tests**

Run: `npx supabase test db`
Expected: `0011_busca_cliente_isolation.test.sql` — todas as 4 asserções passam, sem regressão em nenhum outro arquivo de teste existente.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0020_busca_cliente_parcial.sql supabase/tests/database/0011_busca_cliente_isolation.test.sql
git commit -m "feat: add buscar_clientes_por_telefone RPC scoped by auth_barbearia_id, authenticated-only"
```

---

### Task 2: `ClienteAutocomplete` — lista suspensa + 3 consumidores

**Files:**
- Modify: `src/components/cliente-autocomplete.tsx` (whole file)
- Modify: `src/components/agendar-slot-form.tsx:89`
- Modify: `src/components/atender-agora-form.tsx:73`
- Modify: `src/components/lancamento-form.tsx:198-202`

**Interfaces:**
- Consumes: `buscar_clientes_por_telefone` RPC (Task 1).
- Produces: `ClienteAutocomplete`'s prop list drops `barbeariaId` (não é mais usado internamente pelo componente — a nova função não recebe barbearia como parâmetro). Os 3 consumidores param de passar essa prop.

- [ ] **Step 1: Rewrite `ClienteAutocomplete`**

Replace `src/components/cliente-autocomplete.tsx` in full:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'

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
  onResolved: (info: { nome: string; telefone: string; totalCortes: number; dataNascimento?: string; bairro?: string; cidade?: string }) => void
  valorInicial?: { nome: string; telefone: string }
}) {
  const [nome, setNome] = useState(valorInicial?.nome ?? '')
  const [telefone, setTelefone] = useState(valorInicial?.telefone ?? '')
  const [dataNascimento, setDataNascimento] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [resultados, setResultados] = useState<ResultadoBusca[]>([])
  const [mostrarLista, setMostrarLista] = useState(false)
  // Refs (not just state) so onResolved always reads the latest value
  // regardless of render timing.
  const nomeRef = useRef(valorInicial?.nome ?? '')
  const telefoneRef = useRef(valorInicial?.telefone ?? '')
  const dataNascimentoRef = useRef('')
  const bairroRef = useRef('')
  const cidadeRef = useRef('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Report the pre-filled value once on mount, so the parent (e.g.
  // LancamentoForm opened from an existing agendamento) has it immediately
  // instead of only after the user types something.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (valorInicial) onResolved({ nome: valorInicial.nome, telefone: valorInicial.telefone, totalCortes: 0 })
  }, [])

  function handleNomeChange(value: string) {
    nomeRef.current = value
    setNome(value)
    onResolved({
      nome: value, telefone: telefoneRef.current, totalCortes: 0,
      dataNascimento: dataNascimentoRef.current || undefined,
      bairro: bairroRef.current || undefined, cidade: cidadeRef.current || undefined,
    })
  }

  function handleDataNascimentoChange(value: string) {
    dataNascimentoRef.current = value
    setDataNascimento(value)
    onResolved({
      nome: nomeRef.current, telefone: telefoneRef.current, totalCortes: 0,
      dataNascimento: value || undefined,
      bairro: bairroRef.current || undefined, cidade: cidadeRef.current || undefined,
    })
  }

  function handleBairroChange(value: string) {
    bairroRef.current = value
    setBairro(value)
    onResolved({
      nome: nomeRef.current, telefone: telefoneRef.current, totalCortes: 0,
      dataNascimento: dataNascimentoRef.current || undefined,
      bairro: value || undefined, cidade: cidadeRef.current || undefined,
    })
  }

  function handleCidadeChange(value: string) {
    cidadeRef.current = value
    setCidade(value)
    onResolved({
      nome: nomeRef.current, telefone: telefoneRef.current, totalCortes: 0,
      dataNascimento: dataNascimentoRef.current || undefined,
      bairro: bairroRef.current || undefined, cidade: value || undefined,
    })
  }

  function verificar(tel: string) {
    telefoneRef.current = tel
    setTelefone(tel)
    // Resolve synchronously with the raw typed value first — the caller
    // (LancamentoForm's salvar()) reads whatever onResolved last reported,
    // and buscar_clientes_por_telefone below is an async, debounced
    // network round-trip. Without this synchronous resolve, a click on
    // "Salvar" landing before the debounce/round-trip completes would
    // submit with an empty/stale telefone.
    onResolved({
      nome: nomeRef.current, telefone: tel, totalCortes: 0,
      dataNascimento: dataNascimentoRef.current || undefined,
      bairro: bairroRef.current || undefined, cidade: cidadeRef.current || undefined,
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
    setNome(cliente.nome)
    setTelefone(cliente.telefone)
    setDataNascimento(cliente.data_nascimento ?? '')
    setBairro(cliente.bairro ?? '')
    setCidade(cliente.cidade ?? '')
    setMostrarLista(false)
    setResultados([])
    onResolved({
      nome: cliente.nome, telefone: cliente.telefone, totalCortes: cliente.total_cortes,
      dataNascimento: cliente.data_nascimento ?? undefined,
      bairro: cliente.bairro ?? undefined, cidade: cliente.cidade ?? undefined,
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
    </div>
  )
}
```

Note: o `useEffect` que reporta `valorInicial` uma vez ao montar fica exatamente igual ao de antes — ele nunca dependeu de `barbeariaId`, só precisa continuar rodando depois do commit (não durante o render), já que `onResolved` é o `setState` do componente pai; trocar isso por um inicializador de `useState` chamaria `onResolved` durante a fase de render do `ClienteAutocomplete`, violando as regras do React sobre atualizar outro componente enquanto se renderiza.

A caixa de "Xº corte deste cliente aqui" que existia antes (fora do dropdown) foi removida — essa informação agora aparece dentro de cada item da lista suspensa.

`onMouseDown` (não `onClick`) no botão de cada resultado é deliberado: o evento `mousedown` dispara antes do `blur` do campo Telefone, então a seleção é processada antes do `onBlur` fechar a lista — com `onClick` a lista fecharia (por causa do blur) antes do clique ser processado.

- [ ] **Step 2: Update `agendar-slot-form.tsx`**

In `src/components/agendar-slot-form.tsx`, change line 89:

```tsx
      <ClienteAutocomplete onResolved={setCliente} />
```

(remove `barbeariaId={barbeariaId}` — the prop no longer exists on `ClienteAutocomplete`. The `barbeariaId` variable itself stays in this file, still used elsewhere for `criar_ou_obter_cliente` and the `agendamentos` insert.)

- [ ] **Step 3: Update `atender-agora-form.tsx`**

In `src/components/atender-agora-form.tsx`, change line 73:

```tsx
      <ClienteAutocomplete onResolved={setCliente} />
```

(same removal, same reasoning — `barbeariaId` stays used elsewhere in this file.)

- [ ] **Step 4: Update `lancamento-form.tsx`**

In `src/components/lancamento-form.tsx`, find the `<ClienteAutocomplete ... />` block (around lines 198-202) and remove the `barbeariaId={barbeariaId}` line, keeping `key`, `onResolved`, and `valorInicial`:

```tsx
      <ClienteAutocomplete
        key={clienteAutocompleteKey}
        onResolved={setCliente}
        valorInicial={{ nome: modoAgenda.clienteNome, telefone: modoAgenda.clienteTelefone }}
      />
```

- [ ] **Step 5: Type-check**

Run: `npm run build`
Expected: succeeds, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/cliente-autocomplete.tsx src/components/agendar-slot-form.tsx src/components/atender-agora-form.tsx src/components/lancamento-form.tsx
git commit -m "feat: replace exact-phone recognition with a partial-search suggestion list in ClienteAutocomplete"
```

---

### Task 3: Busca com lista suspensa na tela de prospecção

**Files:**
- Create: `src/components/telefone-cliente-busca.tsx`
- Modify: `src/app/painel/prospeccao/page.tsx:72-77`

**Interfaces:**
- Consumes: `buscar_clientes_por_telefone` RPC (Task 1).
- Produces: `TelefoneClienteBusca()` — client component with no props, rendering the `nome`/`telefone`/`bairro`/`cidade` form fields (each with a `name` attribute matching what `novoContato`'s `FormData` reads), self-contained (its own state, its own dropdown). Renders as a direct child inside `ProspeccaoPage`'s existing `<form action={novoContato}>` — a client component's rendered `<input name="...">` elements are picked up by the enclosing native form's `FormData` on submit regardless of the component boundary.

- [ ] **Step 1: Write `TelefoneClienteBusca`**

Create `src/components/telefone-cliente-busca.tsx`:

```tsx
'use client'

import { useRef, useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'

type ResultadoBusca = {
  id: string
  nome: string
  telefone: string
  total_cortes: number
  data_nascimento: string | null
  bairro: string | null
  cidade: string | null
}

// Não reaproveita ClienteAutocomplete de propósito — esta tela tem seu
// próprio formulário inline via Server Action (novoContato), sem o
// callback onResolved que ClienteAutocomplete usa pra reportar mudanças
// pro componente pai. Os campos aqui postam direto pelo <form> nativo,
// via os atributos name.
export function TelefoneClienteBusca() {
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [resultados, setResultados] = useState<ResultadoBusca[]>([])
  const [mostrarLista, setMostrarLista] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function verificar(tel: string) {
    setTelefone(tel)

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
  }

  return (
    <>
      <Input name="nome" placeholder="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
      <div className="relative">
        <Input
          name="telefone"
          placeholder="Telefone"
          required
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
      <Input name="bairro" placeholder="Bairro (opcional)" value={bairro} onChange={(e) => setBairro(e.target.value)} />
      <Input name="cidade" placeholder="Cidade (opcional)" value={cidade} onChange={(e) => setCidade(e.target.value)} />
    </>
  )
}
```

- [ ] **Step 2: Wire it into the prospecção form**

In `src/app/painel/prospeccao/page.tsx`, add the import alongside the existing ones:

```tsx
import { TelefoneClienteBusca } from '@/components/telefone-cliente-busca'
```

Then replace the four `<Input name="nome" .../>`, `<Input name="telefone" .../>`, `<Input name="bairro" .../>`, `<Input name="cidade" .../>` lines (currently lines 73-76) with:

```tsx
        <TelefoneClienteBusca />
```

The rest of the `<form action={novoContato}>` block — the `canal` select, the `oferta_corte_gratis` checkbox, the submit button — stays exactly as it is.

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: succeeds, no type errors.

- [ ] **Step 4: Manual verification**

No browser tools available in this environment — verify by tracing the code against these points instead of launching a browser:
- `novoContato` (the Server Action) still reads `formData.get('nome')`, `formData.get('telefone')`, `formData.get('bairro')`, `formData.get('cidade')` — unchanged from before this task, since `TelefoneClienteBusca` renders inputs with the exact same `name` attributes.
- `TelefoneClienteBusca` has no `onResolved` prop and doesn't need one — it's a self-contained set of named form fields, not a callback-driven component like `ClienteAutocomplete`.

If a browser is available when this task runs, also do this by hand: as a barbeiro, open `/painel/prospeccao`, type 4+ digits of an existing client's phone number, confirm the list appears; click a result, confirm nome/telefone/bairro/cidade all fill in; submit, confirm the contact is recorded correctly.

- [ ] **Step 5: Commit**

```bash
git add src/components/telefone-cliente-busca.tsx src/app/painel/prospeccao/page.tsx
git commit -m "feat: add partial-phone search with suggestion list to the prospecção form"
```

---

### Task 4: Regressão final

**Files:** none (verification only).

- [ ] **Step 1: Full automated regression**

Run:
```bash
npm test
npm run build
npx supabase test db
```
Expected: `npm test` shows all existing unit tests still passing (this plan adds no new ones — no pure-function logic, per the spec's testing section, which asks only for pgTAP coverage); `npm run build` succeeds with no type errors; `npx supabase test db` shows all pgTAP suites passing including the new `0011_busca_cliente_isolation.test.sql`.

- [ ] **Step 2: Manual end-to-end walkthrough (if a browser is available)**

As a barbeiro, in each of the 3 `ClienteAutocomplete`-based flows (agendar horário, atender agora, lançamento avulso) and in the prospecção form:
- Type 4 digits from the middle of an existing client's phone number. Confirm the suggestion list appears showing that client.
- Click the suggestion. Confirm nome, telefone, and (where the client has them) data de nascimento/bairro/cidade all populate.
- Type digits that don't match anyone. Confirm no list appears, and you can still type a fresh nome/telefone to register a new client.
- Type a client's complete phone number. Confirm the list still appears (with exactly one match) rather than auto-filling silently — this is the deliberate "always show the list" behavior from the spec.

If no browser is available, document that limitation in the ledger instead of skipping the check silently — same pattern used in every prior plan this session.

- [ ] **Step 3: No commit for this task** — it's verification-only; if any issue surfaces, fix it as a small follow-up commit referencing which task's step regressed.
