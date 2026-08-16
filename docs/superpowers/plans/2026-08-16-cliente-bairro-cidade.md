# Bairro e cidade do cliente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional `bairro`/`cidade` fields to `clientes`, captured at all six places a cliente row is created today, and shown on the ficha do cliente.

**Architecture:** A migration adds the two columns and extends `criar_ou_obter_cliente` (coalesce-on-conflict, same pattern already used for `data_nascimento`) plus `criar_agendamento_publico` (which calls it internally) with two new optional parameters. Six call sites — the shared `ClienteAutocomplete` component (used by 3 internal flows), the public booking flow, the prospecção form, and the ficha do cliente's display — each get the two new fields threaded through or shown.

**Tech Stack:** Next.js 16.3 App Router, TypeScript, Supabase (Postgres/RLS via `@supabase/supabase-js` and `@supabase/ssr`), Tailwind CSS v4, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-08-16-cliente-bairro-cidade-design.md`

## Global Constraints

- `bairro`/`cidade` are always optional, free text, no validation.
- Never overwrite an existing client's `bairro`/`cidade` with a blank value from a later visit — coalesce, exactly like `data_nascimento` already does.
- No RLS change, no new pgTAP test — the spec's own "Testes" section says the existing tenant-isolation coverage on `clientes` is sufficient, since this is columns + function parameters on an already-tested `security definer` function, not new access control.
- Editing an existing client's `bairro`/`cidade` after creation is explicitly out of scope (no edit UI exists yet — deferred to a future spec).

---

### Task 1: Migration — `bairro`/`cidade` columns, `criar_ou_obter_cliente`, `criar_agendamento_publico`

**Files:**
- Create: `supabase/migrations/0019_cliente_bairro_cidade.sql`

**Interfaces:**
- Produces: columns `clientes.bairro text`, `clientes.cidade text`; function `criar_ou_obter_cliente(uuid, text, text, date, text, text) returns uuid` (two new trailing params `p_bairro`, `p_cidade`, both `default null`); function `criar_agendamento_publico(uuid, uuid, uuid, date, time, text, text, text, text) returns uuid` (two new trailing params `p_bairro`, `p_cidade`, both `default null`). Tasks 2, 3, 4 all call one or both of these functions with the new parameters.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0019_cliente_bairro_cidade.sql`:

```sql
alter table clientes add column bairro text;
alter table clientes add column cidade text;

-- Dropped and recreated (not just CREATE OR REPLACE) because adding new
-- parameters changes the function's full type signature — same reasoning
-- documented in 0013_cliente_aniversario.sql for the data_nascimento param.
drop function if exists public.criar_ou_obter_cliente(uuid, text, text, date);

create or replace function public.criar_ou_obter_cliente(
  p_barbearia_id uuid, p_nome text, p_telefone text, p_data_nascimento date default null,
  p_bairro text default null, p_cidade text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cliente_id uuid;
  v_telefone text;
begin
  if not exists (select 1 from barbearias where id = p_barbearia_id) then
    raise exception 'Barbearia inválida';
  end if;

  v_telefone := regexp_replace(p_telefone, '\D', '', 'g');

  insert into clientes (barbearia_id, nome, telefone, data_nascimento, bairro, cidade)
  values (p_barbearia_id, p_nome, v_telefone, p_data_nascimento, p_bairro, p_cidade)
  on conflict (barbearia_id, telefone)
  do update set
    nome = excluded.nome,
    data_nascimento = coalesce(clientes.data_nascimento, excluded.data_nascimento),
    bairro = coalesce(clientes.bairro, excluded.bairro),
    cidade = coalesce(clientes.cidade, excluded.cidade)
  returning id into v_cliente_id;

  return v_cliente_id;
end;
$$;

grant execute on function public.criar_ou_obter_cliente(uuid, text, text, date, text, text) to anon, authenticated;

-- Same reasoning: new trailing params change the signature, so drop first.
drop function if exists public.criar_agendamento_publico(uuid, uuid, uuid, date, time, text, text);

create or replace function public.criar_agendamento_publico(
  p_barbearia_id uuid, p_membro_id uuid, p_servico_id uuid,
  p_data date, p_hora_inicio time, p_nome_cliente text, p_telefone_cliente text,
  p_bairro text default null, p_cidade text default null
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

  v_cliente_id := criar_ou_obter_cliente(p_barbearia_id, p_nome_cliente, p_telefone_cliente, null, p_bairro, p_cidade);

  insert into agendamentos (barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem)
  values (
    p_barbearia_id, p_membro_id, v_cliente_id, p_servico_id, p_data, p_hora_inicio, v_hora_fim, 'agendado', 'publico'
  )
  returning id into v_agendamento_id;

  return v_agendamento_id;
end;
$$;

grant execute on function public.criar_agendamento_publico(uuid, uuid, uuid, date, time, text, text, text, text) to anon, authenticated;
```

- [ ] **Step 2: Apply the migration locally**

Check `npx supabase status` first to confirm the local stack is running; start it with `npx supabase start` if not.

Run: `npx supabase db reset`
Expected: all migrations (including the new `0019_cliente_bairro_cidade`) replay from scratch with no errors.

- [ ] **Step 3: Manual verification**

No pgTAP test needed per the spec (columns + params on an already-tested `security definer` function, no RLS change). Verify by querying directly:

```bash
docker exec supabase_db_barbearia-mvp psql -U postgres -d postgres -c "select criar_ou_obter_cliente('00000000-0000-0000-0000-000000000000'::uuid, 'Teste', '11999998888', null, 'Centro', 'São Paulo');"
```
Expected: raises `Barbearia inválida` (the placeholder UUID doesn't exist) — confirms the new signature is callable and the function body still validates barbearia_id first, same as before.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0019_cliente_bairro_cidade.sql
git commit -m "feat: add bairro/cidade to clientes, thread through criar_ou_obter_cliente and criar_agendamento_publico"
```

---

### Task 2: `ClienteAutocomplete` + its 3 consumers (agendar horário, atender agora, lançamento avulso)

**Files:**
- Modify: `src/components/cliente-autocomplete.tsx` (whole file)
- Modify: `src/components/agendar-slot-form.tsx:26,58-60`
- Modify: `src/components/atender-agora-form.tsx:25,38-40`
- Modify: `src/components/lancamento-form.tsx:42-44,126-128`

**Interfaces:**
- Consumes: `criar_ou_obter_cliente` RPC (Task 1) with `p_bairro`/`p_cidade` params.
- Produces: `ClienteAutocomplete`'s `onResolved` callback shape gains `bairro?: string` and `cidade?: string`. All three consumers' local `cliente` state type gains the same two optional fields.

- [ ] **Step 1: Add bairro/cidade fields to `ClienteAutocomplete`**

Replace `src/components/cliente-autocomplete.tsx` in full:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'

export function ClienteAutocomplete({
  barbeariaId, onResolved, valorInicial,
}: {
  barbeariaId: string
  onResolved: (info: { nome: string; telefone: string; totalCortes: number; dataNascimento?: string; bairro?: string; cidade?: string }) => void
  valorInicial?: { nome: string; telefone: string }
}) {
  const [nome, setNome] = useState(valorInicial?.nome ?? '')
  const [telefone, setTelefone] = useState(valorInicial?.telefone ?? '')
  const [dataNascimento, setDataNascimento] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [info, setInfo] = useState<string | null>(null)
  // Refs (not just state) so onResolved always reads the latest value
  // regardless of render timing.
  const nomeRef = useRef(valorInicial?.nome ?? '')
  const telefoneRef = useRef(valorInicial?.telefone ?? '')
  const dataNascimentoRef = useRef('')
  const bairroRef = useRef('')
  const cidadeRef = useRef('')

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

  async function verificar(tel: string) {
    telefoneRef.current = tel
    setTelefone(tel)
    // Resolve synchronously with the raw typed value first — the caller
    // (LancamentoForm's salvar()) reads whatever onResolved last reported,
    // and reconhecer_cliente() below is
    // an async network round-trip. Without this synchronous resolve, a
    // click on "Salvar" landing before that round-trip completes would
    // submit with an empty/stale telefone, since the only onResolved call
    // for this field previously fired after the await.
    onResolved({
      nome: nomeRef.current, telefone: tel, totalCortes: 0,
      dataNascimento: dataNascimentoRef.current || undefined,
      bairro: bairroRef.current || undefined, cidade: cidadeRef.current || undefined,
    })
    if (tel.length < 10) return
    const supabase = getBrowserSupabaseClient()
    const { data: rows } = await supabase.rpc('reconhecer_cliente', { p_barbearia_id: barbeariaId, p_telefone: tel })
    const encontrado = rows?.[0]
    if (encontrado) {
      nomeRef.current = encontrado.nome
      setNome(encontrado.nome)
      setInfo(`${encontrado.total_cortes}º corte deste cliente aqui`)
      onResolved({
        nome: encontrado.nome, telefone: tel, totalCortes: encontrado.total_cortes,
        dataNascimento: dataNascimentoRef.current || undefined,
        bairro: bairroRef.current || undefined, cidade: cidadeRef.current || undefined,
      })
    } else {
      setInfo(null)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Input placeholder="Nome do cliente" value={nome} onChange={(e) => handleNomeChange(e.target.value)} />
      <Input placeholder="Telefone" value={telefone} onChange={(e) => verificar(e.target.value)} />
      <Input type="date" placeholder="Data de nascimento (opcional)" value={dataNascimento} onChange={(e) => handleDataNascimentoChange(e.target.value)} />
      <Input placeholder="Bairro (opcional)" value={bairro} onChange={(e) => handleBairroChange(e.target.value)} />
      <Input placeholder="Cidade (opcional)" value={cidade} onChange={(e) => handleCidadeChange(e.target.value)} />
      {info && <span className="text-xs text-muted-foreground">{info}</span>}
    </div>
  )
}
```

Note: `reconhecer_cliente` is deliberately NOT modified by this plan — it doesn't return `bairro`/`cidade`, so recognizing a returning client doesn't pre-fill those two fields. This is fine: if staff leaves them blank for a returning client, `criar_ou_obter_cliente`'s `coalesce` (Task 1) keeps whatever was already on file — a blank param never erases an existing value.

- [ ] **Step 2: Thread `bairro`/`cidade` through `agendar-slot-form.tsx`**

In `src/components/agendar-slot-form.tsx`, change the `cliente` state type (line 26):

```tsx
const [cliente, setCliente] = useState<{ nome: string; telefone: string; dataNascimento?: string; bairro?: string; cidade?: string } | null>(null)
```

And the `criar_ou_obter_cliente` call inside `gravar()` (lines 58-60):

```tsx
    const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
      p_barbearia_id: barbeariaId, p_nome: cliente!.nome, p_telefone: cliente!.telefone,
      p_data_nascimento: cliente!.dataNascimento ?? null,
      p_bairro: cliente!.bairro ?? null, p_cidade: cliente!.cidade ?? null,
    })
```

- [ ] **Step 3: Thread `bairro`/`cidade` through `atender-agora-form.tsx`**

In `src/components/atender-agora-form.tsx`, change the `cliente` state type (line 25):

```tsx
const [cliente, setCliente] = useState<{ nome: string; telefone: string; dataNascimento?: string; bairro?: string; cidade?: string } | null>(null)
```

And the `criar_ou_obter_cliente` call inside `criar()` (lines 38-40):

```tsx
    const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
      p_barbearia_id: barbeariaId, p_nome: cliente.nome, p_telefone: cliente.telefone,
      p_data_nascimento: cliente.dataNascimento ?? null,
      p_bairro: cliente.bairro ?? null, p_cidade: cliente.cidade ?? null,
    })
```

- [ ] **Step 4: Thread `bairro`/`cidade` through `lancamento-form.tsx`**

In `src/components/lancamento-form.tsx`, change the `cliente` state type (lines 42-44):

```tsx
  const [cliente, setCliente] = useState<{ nome: string; telefone: string; dataNascimento?: string; bairro?: string; cidade?: string } | null>(
    { nome: modoAgenda.clienteNome, telefone: modoAgenda.clienteTelefone }
  )
```

And the `criar_ou_obter_cliente` call inside `salvar()` (lines 126-128):

```tsx
    const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
      p_barbearia_id: barbeariaId, p_nome: cliente.nome, p_telefone: cliente.telefone,
      p_data_nascimento: cliente.dataNascimento ?? null,
      p_bairro: cliente.bairro ?? null, p_cidade: cliente.cidade ?? null,
    })
```

- [ ] **Step 5: Type-check**

Run: `npm run build`
Expected: succeeds, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/cliente-autocomplete.tsx src/components/agendar-slot-form.tsx src/components/atender-agora-form.tsx src/components/lancamento-form.tsx
git commit -m "feat: capture bairro/cidade in ClienteAutocomplete and its 3 consumers"
```

---

### Task 3: `PublicBookingFlow`

**Files:**
- Modify: `src/components/public-booking-flow.tsx` (whole file)

**Interfaces:**
- Consumes: `criar_agendamento_publico` RPC (Task 1) with `p_bairro`/`p_cidade` params.

- [ ] **Step 1: Add bairro/cidade fields and thread them through**

Replace `src/components/public-booking-flow.tsx` in full:

```tsx
'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Servico = { id: string; nome: string; duracao_minutos: number; preco: number }
type Barbeiro = { id: string; nome: string }

export function PublicBookingFlow({
  barbearia, servicos, barbeiros,
}: { barbearia: { id: string; nome: string }; servicos: Servico[]; barbeiros: Barbeiro[] }) {
  const [servico, setServico] = useState<Servico | null>(null)
  const [barbeiro, setBarbeiro] = useState<Barbeiro | null>(null)
  const [data] = useState(() => new Date().toISOString().slice(0, 10))
  const [horarios, setHorarios] = useState<{ hora_inicio: string; hora_fim: string }[]>([])
  const [horario, setHorario] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [reconhecimento, setReconhecimento] = useState<string | null>(null)
  const [confirmado, setConfirmado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function buscarHorarios(s: Servico, b: Barbeiro) {
    const supabase = getBrowserSupabaseClient()
    const { data: slots } = await supabase.rpc('horarios_disponiveis', {
      p_barbearia_id: barbearia.id, p_membro_id: b.id, p_servico_id: s.id, p_data: data,
    })
    setHorarios(slots ?? [])
    setHorario(null)
  }

  // Each button sets only its own piece of state — loading horários only
  // requires BOTH servico and barbeiro, so whichever click completes the
  // pair (in either order) is the one that triggers the RPC.
  function selecionarServico(s: Servico) {
    setServico(s)
    if (barbeiro) buscarHorarios(s, barbeiro)
  }

  function selecionarBarbeiro(b: Barbeiro) {
    setBarbeiro(b)
    if (servico) buscarHorarios(servico, b)
  }

  async function verificarCliente(tel: string) {
    setTelefone(tel)
    if (tel.length < 10) { setReconhecimento(null); return }
    const supabase = getBrowserSupabaseClient()
    const { data: rows } = await supabase.rpc('reconhecer_cliente', { p_barbearia_id: barbearia.id, p_telefone: tel })
    const encontrado = rows?.[0]
    if (encontrado) {
      setNome(encontrado.nome)
      setReconhecimento(`Bem-vindo de volta, ${encontrado.nome}! Este será seu ${encontrado.total_cortes + 1}º corte aqui.`)
    } else {
      setReconhecimento(null)
    }
  }

  async function confirmar() {
    if (!servico || !barbeiro || !horario) return
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase.rpc('criar_agendamento_publico', {
      p_barbearia_id: barbearia.id, p_membro_id: barbeiro.id, p_servico_id: servico.id,
      p_data: data, p_hora_inicio: horario, p_nome_cliente: nome, p_telefone_cliente: telefone,
      p_bairro: bairro || null, p_cidade: cidade || null,
    })
    if (error) { setErro(error.message); return }
    setConfirmado(true)
  }

  if (confirmado) {
    return <p className="p-6">✓ Agendamento confirmado! {servico?.nome} com {barbeiro?.nome} às {horario}.</p>
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="font-heading text-2xl font-bold mb-4">{barbearia.nome}</h1>

      <p className="font-heading text-base font-semibold mt-4">1. Escolha o serviço</p>
      <div className="flex gap-2 flex-wrap">
        {servicos.map((s) => (
          <button
            key={s.id}
            onClick={() => selecionarServico(s)}
            className={`border rounded px-3 py-1 ${servico?.id === s.id ? 'bg-primary text-primary-foreground' : ''}`}
          >
            {s.nome} ({s.duracao_minutos}min · R${s.preco})
          </button>
        ))}
      </div>

      <p className="font-heading text-base font-semibold mt-4">2. Escolha o barbeiro</p>
      <div className="flex gap-2 flex-wrap">
        {barbeiros.map((b) => (
          <button
            key={b.id}
            onClick={() => selecionarBarbeiro(b)}
            className={`border rounded px-3 py-1 ${barbeiro?.id === b.id ? 'bg-primary text-primary-foreground' : ''}`}
          >
            {b.nome}
          </button>
        ))}
      </div>

      {horarios.length > 0 && (
        <>
          <p className="font-heading text-base font-semibold mt-4">3. Escolha o horário</p>
          <div className="flex gap-2 flex-wrap">
            {horarios.map((h) => (
              <button key={h.hora_inicio} onClick={() => setHorario(h.hora_inicio)} className="border rounded px-3 py-1">
                {h.hora_inicio}
              </button>
            ))}
          </div>
        </>
      )}

      {horario && (
        <>
          <p className="font-heading text-base font-semibold mt-4">4. Seus dados</p>
          <Input placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} className="mb-2" />
          <Input placeholder="Telefone" value={telefone} onBlur={(e) => verificarCliente(e.target.value)} onChange={(e) => setTelefone(e.target.value)} className="mb-2" />
          <Input placeholder="Bairro (opcional)" value={bairro} onChange={(e) => setBairro(e.target.value)} className="mb-2" />
          <Input placeholder="Cidade (opcional)" value={cidade} onChange={(e) => setCidade(e.target.value)} />
          {reconhecimento && <p className="text-sm text-primary mt-2">{reconhecimento}</p>}
          {erro && <p className="text-sm text-destructive mt-2">{erro}</p>}
          <Button onClick={confirmar} className="w-full mt-4">Confirmar agendamento</Button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds, no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/public-booking-flow.tsx
git commit -m "feat: capture bairro/cidade on the public booking flow"
```

---

### Task 4: Formulário de prospecção

**Files:**
- Modify: `src/app/painel/prospeccao/page.tsx:7-31,69-84`

**Interfaces:**
- Consumes: `criar_ou_obter_cliente` RPC (Task 1) with `p_bairro`/`p_cidade` params.

- [ ] **Step 1: Read the two new fields in `novoContato` and pass them through**

In `src/app/painel/prospeccao/page.tsx`, change the `novoContato` Server Action (lines 7-31):

```tsx
async function novoContato(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()

  const nome = formData.get('nome') as string
  const telefone = formData.get('telefone') as string
  const bairro = (formData.get('bairro') as string) || null
  const cidade = (formData.get('cidade') as string) || null

  const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
    p_barbearia_id: membro!.barbearia_id, p_nome: nome, p_telefone: telefone,
    p_bairro: bairro, p_cidade: cidade,
  })
  if (clienteId.error) return

  await supabase.from('prospeccoes').insert({
    barbearia_id: membro!.barbearia_id,
    membro_id: membro!.id,
    nome,
    telefone,
    cliente_id: clienteId.data,
    canal: (formData.get('canal') as string) || null,
    oferta_corte_gratis: formData.get('oferta_corte_gratis') === 'on',
  })
  revalidatePath('/painel/prospeccao')
}
```

Note: `criar_ou_obter_cliente`'s signature is `(uuid, text, text, date default null, text default null, text default null)` — since this call doesn't pass `p_data_nascimento`, it must name every parameter it does pass (already true here — this call was already using named params, not positional).

- [ ] **Step 2: Add the two fields to the form**

In the same file's `ProspeccaoPage` component, change the `<form action={novoContato}>` block (lines 69-84):

```tsx
      <form action={novoContato} className="flex gap-2 items-center mt-4 flex-wrap">
        <Input name="nome" placeholder="Nome" required />
        <Input name="telefone" placeholder="Telefone" required />
        <Input name="bairro" placeholder="Bairro (opcional)" />
        <Input name="cidade" placeholder="Cidade (opcional)" />
        <select name="canal" className="border rounded px-2 py-1 bg-input">
          <option value="">Canal (opcional)</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="indicacao">Indicação</option>
          <option value="rua">Na rua</option>
          <option value="redes_sociais">Redes sociais</option>
          <option value="outro">Outro</option>
        </select>
        <label className="text-sm flex items-center gap-1">
          <input type="checkbox" name="oferta_corte_gratis" /> Ofereci corte grátis + consultoria
        </label>
        <Button type="submit">+ Novo contato prospectado</Button>
      </form>
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: succeeds, no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/painel/prospeccao/page.tsx
git commit -m "feat: capture bairro/cidade on the prospecção form"
```

---

### Task 5: Exibir bairro/cidade na ficha do cliente

**Files:**
- Modify: `src/components/ficha-cliente.tsx:10,36`

**Interfaces:**
- Consumes: columns `clientes.bairro`, `clientes.cidade` (Task 1).

- [ ] **Step 1: Select and display the two new columns**

In `src/components/ficha-cliente.tsx`, change the `clientes` query (line 10):

```tsx
  const { data: cliente } = await supabase.from('clientes').select('nome, telefone, criado_em, data_nascimento, bairro, cidade').eq('id', clienteId).single()
```

And the header line that already summarizes nome/telefone/nascimento (line 36):

```tsx
      <p className="font-heading text-lg font-semibold">
        {cliente?.nome} · {cliente?.telefone}
        {cliente?.data_nascimento ? ` · nasc. ${new Date(cliente.data_nascimento).toLocaleDateString()}` : ''}
        {cliente?.bairro ? ` · ${cliente.bairro}` : ''}
        {cliente?.cidade ? ` · ${cliente.cidade}` : ''}
      </p>
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds, no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ficha-cliente.tsx
git commit -m "feat: show bairro/cidade on the ficha do cliente"
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
Expected: `npm test` shows all existing unit tests still passing (this plan adds no new ones — no pure-function logic, per the spec's "Testes" section); `npm run build` succeeds with no type errors; `npx supabase test db` shows all existing pgTAP suites still passing (this plan adds no new test file, per the spec's own stated reasoning — no RLS change on an already-tested `security definer` function).

- [ ] **Step 2: Manual end-to-end walkthrough (if a browser is available)**

For each of the four internal flows (agendar horário, atender agora, lançamento avulso, prospecção): create a new cliente with a fresh phone number, fill bairro/cidade, save, then open that cliente's ficha (`/admin/clientes/[id]` or `/painel/clientes/[id]`, using the id from the database if there's still no list page linking to it — that's Part 3 of this round, not yet built) and confirm bairro/cidade show in the header line.

On the public booking page (`/[barbeariaSlug]`), complete a booking with bairro/cidade filled and confirm the same.

Then, using the same phone number again in a second flow, leave bairro/cidade blank this time, save, and confirm in the database that the original values were NOT overwritten (the `coalesce` behavior from Task 1).

If no browser is available, document that limitation in the ledger instead of skipping the check silently — same pattern used in every prior plan this session.

- [ ] **Step 3: No commit for this task** — it's verification-only; if any issue surfaces, fix it as a small follow-up commit referencing which task's step regressed.
