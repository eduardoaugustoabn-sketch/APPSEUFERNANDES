# Lista de clientes cadastrados + campo de observação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar uma tela de lista de clientes cadastrados (admin e painel) com busca, e permitir editar bairro/cidade/observação de um cliente existente na ficha — a primeira escrita que `clientes` já teve além da criação.

**Architecture:** Uma migration adiciona a coluna `observacao` e a primeira policy de UPDATE em `clientes` (escopada por barbearia, sem distinção de papel — mesmo escopo da policy de leitura já existente). Um componente cliente novo, `EditarClienteForm`, dá à ficha do cliente um editor inline de bairro/cidade/observação (nunca nome/telefone). Um componente cliente compartilhado, `ListaClientes`, filtra uma lista já carregada por nome/telefone e é reaproveitado pelas duas páginas novas (`/admin/clientes` e `/painel/clientes`), que diferem só no link de destino de cada linha.

**Tech Stack:** Next.js 16.3 App Router, TypeScript, Supabase (Postgres/RLS via `@supabase/supabase-js` e `@supabase/ssr`), Tailwind CSS v4, shadcn/ui, pgTAP (testes de banco via `npx supabase test db`).

**Spec:** `docs/superpowers/specs/2026-08-16-lista-clientes-observacao-design.md`

## Global Constraints

- A policy de UPDATE em `clientes` não distingue papel — qualquer membro ativo (admin ou barbeiro) da barbearia pode editar qualquer cliente dela, mesmo escopo da policy de leitura já existente.
- O formulário de edição só envia `bairro`/`cidade`/`observacao` no payload do update — nunca `nome`/`telefone`, que ficam fora de escopo desta feature.
- A busca na lista é client-side (filtra a lista já carregada, sem round-trip novo ao banco) — diferente da busca parcial por telefone construída no ciclo anterior, que usa uma RPC.
- Sem paginação — lista simples, adequada à escala de uma barbearia.

---

### Task 1: Migração — coluna `observacao` + policy de UPDATE em `clientes`

**Files:**
- Create: `supabase/migrations/0021_cliente_observacao_update.sql`
- Create: `supabase/tests/database/0012_clientes_update_isolation.test.sql`

**Interfaces:**
- Produces: coluna `clientes.observacao text`; policy `"membros atualizam clientes da barbearia"` (UPDATE, escopada por `auth_barbearia_id()`). Task 2 usa essa coluna e essa policy pra editar clientes; Task 3 seleciona a coluna `cidade` (já existente) mas não `observacao` (a lista não mostra observação).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0021_cliente_observacao_update.sql`:

```sql
alter table clientes add column observacao text;

-- Primeira policy de escrita que clientes já teve além da criação (que
-- passa por criar_ou_obter_cliente). Mesmo escopo da policy de leitura
-- "membros leem clientes da barbearia" — sem distinção de papel, admin
-- e barbeiro editam igual. Não há restrição column-level: a proteção
-- contra editar nome/telefone por acidente vem do payload que a UI
-- envia (só bairro/cidade/observacao), não de uma regra de banco —
-- mesmo padrão já usado em BarbeiroRow.salvar().
create policy "membros atualizam clientes da barbearia" on clientes for update
  using (barbearia_id = auth_barbearia_id())
  with check (barbearia_id = auth_barbearia_id());
```

- [ ] **Step 2: Apply the migration locally**

Check `npx supabase status` first to confirm the local stack is running; start it with `npx supabase start` if not.

Run: `npx supabase db reset`
Expected: all migrations (including the new `0021_cliente_observacao_update`) replay from scratch with no errors.

- [ ] **Step 3: Write the pgTAP isolation test**

Create `supabase/tests/database/0012_clientes_update_isolation.test.sql`:

```sql
begin;
select plan(2);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a'),
  ('22222222-2222-2222-2222-222222222222', 'Barbearia B', 'barbearia-b');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com');

insert into membros (id, barbearia_id, user_id, papel, nome) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João');

insert into clientes (id, barbearia_id, nome, telefone) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Cliente A', '11999998888'),
  ('c1000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Cliente B', '11999997777');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

update clientes set observacao = 'Gosta de corte baixo' where id = 'c1000000-0000-0000-0000-000000000001';

select is(
  (select observacao from clientes where id = 'c1000000-0000-0000-0000-000000000001'),
  'Gosta de corte baixo',
  'barbeiro João consegue atualizar um cliente da própria barbearia'
);

-- RLS em UPDATE não levanta erro para uma linha fora do escopo da
-- policy — ela simplesmente não entra no conjunto afetado (0 linhas),
-- diferente de INSERT/WITH CHECK, que rejeitaria com exceção.
update clientes set observacao = 'Tentativa indevida' where id = 'c1000000-0000-0000-0000-000000000002';

select is(
  (select observacao from clientes where id = 'c1000000-0000-0000-0000-000000000002'),
  null,
  'a tentativa de atualizar um cliente de outra barbearia não teve efeito nenhum'
);

select * from finish();
rollback;
```

- [ ] **Step 4: Run the pgTAP tests**

Run: `npx supabase test db`
Expected: `0012_clientes_update_isolation.test.sql` — as 2 asserções passam, sem regressão em nenhum outro arquivo de teste existente.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0021_cliente_observacao_update.sql supabase/tests/database/0012_clientes_update_isolation.test.sql
git commit -m "feat: add observacao column and the first UPDATE policy on clientes"
```

---

### Task 2: `EditarClienteForm` — editor de bairro/cidade/observação na ficha

**Files:**
- Create: `src/components/editar-cliente-form.tsx`
- Modify: `src/components/ficha-cliente.tsx:10,34-42`

**Interfaces:**
- Consumes: coluna `clientes.observacao` e a policy de UPDATE (Task 1).
- Produces: `EditarClienteForm({ clienteId, bairroAtual, cidadeAtual, observacaoAtual })` — componente cliente renderizado no topo de `FichaCliente`. Nenhuma outra task depende dele.

- [ ] **Step 1: Write `EditarClienteForm`**

Create `src/components/editar-cliente-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function EditarClienteForm({
  clienteId, bairroAtual, cidadeAtual, observacaoAtual,
}: {
  clienteId: string
  bairroAtual: string | null
  cidadeAtual: string | null
  observacaoAtual: string | null
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [bairro, setBairro] = useState(bairroAtual ?? '')
  const [cidade, setCidade] = useState(cidadeAtual ?? '')
  const [observacao, setObservacao] = useState(observacaoAtual ?? '')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase
      .from('clientes')
      .update({ bairro: bairro || null, cidade: cidade || null, observacao: observacao || null })
      .eq('id', clienteId)
    setSalvando(false)
    if (error) {
      alert(error.message)
      return
    }
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setBairro(bairroAtual ?? '')
    setCidade(cidadeAtual ?? '')
    setObservacao(observacaoAtual ?? '')
    setEditando(false)
  }

  if (!editando) {
    return (
      <div className="mb-4">
        {observacaoAtual && <p className="text-sm text-muted-foreground mb-2">Observação: {observacaoAtual}</p>}
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">
          Editar bairro/cidade/observação
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
      <div className="flex gap-2">
        <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
        <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
      </div>
    </div>
  )
}
```

Note: `salvar()` verifica `error` explicitamente e mostra via `alert()` antes de fechar o editor — se o update falhar, o formulário continua aberto com os valores digitados, permitindo tentar de novo. Não fecha silenciosamente em caso de erro.

- [ ] **Step 2: Wire it into `FichaCliente`**

In `src/components/ficha-cliente.tsx`, add the import alongside the existing one:

```tsx
import { EditarClienteForm } from '@/components/editar-cliente-form'
```

Change the `clientes` query (line 10) to also select `observacao`:

```tsx
  const { data: cliente } = await supabase.from('clientes').select('nome, telefone, criado_em, data_nascimento, bairro, cidade, observacao').eq('id', clienteId).single()
```

Then insert `<EditarClienteForm .../>` right after the header block and before "Mais usados por ele" (the return block currently starts with the header `<p>`s at lines 36-42):

```tsx
      <p className="font-heading text-lg font-semibold">
        {cliente?.nome} · {cliente?.telefone}
        {cliente?.data_nascimento ? ` · nasc. ${new Date(cliente.data_nascimento).toLocaleDateString()}` : ''}
        {cliente?.bairro ? ` · ${cliente.bairro}` : ''}
        {cliente?.cidade ? ` · ${cliente.cidade}` : ''}
      </p>
      <p className="text-xs text-muted-foreground mb-4">Cliente desde {cliente?.criado_em ? new Date(cliente.criado_em).toLocaleDateString() : ''}</p>

      <EditarClienteForm
        clienteId={clienteId}
        bairroAtual={cliente?.bairro ?? null}
        cidadeAtual={cliente?.cidade ?? null}
        observacaoAtual={cliente?.observacao ?? null}
      />

      <h3 className="font-heading text-base font-semibold mt-4 mb-2">Mais usados por ele</h3>
```

Everything else in the file (ranking, histórico, agendamentos, prospecção sections) stays exactly as it is.

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: succeeds, no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/editar-cliente-form.tsx src/components/ficha-cliente.tsx
git commit -m "feat: let admin/barbeiro edit bairro/cidade/observação on the ficha do cliente"
```

---

### Task 3: Lista de clientes — `ListaClientes` compartilhado + páginas admin/painel

**Files:**
- Create: `src/components/lista-clientes.tsx`
- Create: `src/app/admin/clientes/page.tsx`
- Create: `src/app/painel/clientes/page.tsx`
- Modify: `src/app/admin/layout.tsx:6-14`
- Modify: `src/app/painel/layout.tsx:6-11`

**Interfaces:**
- Produces: `ListaClientes({ clientes, baseHref })` — componente cliente compartilhado. Nenhuma outra task depende dele.

- [ ] **Step 1: Write the shared `ListaClientes` component**

Create `src/components/lista-clientes.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'

type Cliente = { id: string; nome: string; telefone: string; cidade: string | null }

export function ListaClientes({ clientes, baseHref }: { clientes: Cliente[]; baseHref: string }) {
  const [busca, setBusca] = useState('')

  const buscaLower = busca.toLowerCase()
  const buscaDigitos = busca.replace(/\D/g, '')
  const filtrados = clientes.filter((c) => {
    if (busca === '') return true
    const nomeBate = c.nome.toLowerCase().includes(buscaLower)
    const telefoneBate = buscaDigitos.length > 0 && c.telefone.includes(buscaDigitos)
    return nomeBate || telefoneBate
  })

  return (
    <div>
      <Input placeholder="Buscar por nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} className="mb-4" />
      {filtrados.map((c) => (
        <Link key={c.id} href={`${baseHref}/${c.id}`} className="flex justify-between border-b py-2 hover:bg-muted/50">
          <span>{c.nome}</span>
          <span className="text-muted-foreground text-sm">{c.telefone}{c.cidade ? ` · ${c.cidade}` : ''}</span>
        </Link>
      ))}
      {filtrados.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>}
    </div>
  )
}
```

- [ ] **Step 2: Write the admin page**

Create `src/app/admin/clientes/page.tsx`:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { ListaClientes } from '@/components/lista-clientes'

export default async function ClientesAdminPage() {
  const supabase = await getServerSupabaseClient()
  const { data: clientes } = await supabase.from('clientes').select('id, nome, telefone, cidade').order('nome')

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Clientes</h1>
      <ListaClientes clientes={clientes ?? []} baseHref="/admin/clientes" />
    </div>
  )
}
```

- [ ] **Step 3: Write the painel page**

Create `src/app/painel/clientes/page.tsx`:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { ListaClientes } from '@/components/lista-clientes'

export default async function ClientesPainelPage() {
  const supabase = await getServerSupabaseClient()
  const { data: clientes } = await supabase.from('clientes').select('id, nome, telefone, cidade').order('nome')

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Clientes</h1>
      <ListaClientes clientes={clientes ?? []} baseHref="/painel/clientes" />
    </div>
  )
}
```

- [ ] **Step 4: Add the nav items**

In `src/app/admin/layout.tsx`, add `{ href: '/admin/clientes', label: 'Clientes' }` to `NAV_ITEMS` (after Prospecção, before Sonhos — order doesn't matter functionally, just keep it readable):

```tsx
const NAV_ITEMS = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/servicos', label: 'Serviços' },
  { href: '/admin/produtos', label: 'Produtos' },
  { href: '/admin/planos-carreira', label: 'Planos de carreira' },
  { href: '/admin/barbeiros', label: 'Barbeiros' },
  { href: '/admin/prospeccao', label: 'Prospecção' },
  { href: '/admin/clientes', label: 'Clientes' },
  { href: '/admin/sonhos', label: 'Sonhos' },
]
```

In `src/app/painel/layout.tsx`, add `{ href: '/painel/clientes', label: 'Clientes' }` to `NAV_ITEMS`:

```tsx
const NAV_ITEMS = [
  { href: '/painel', label: 'Dashboard' },
  { href: '/painel/agenda', label: 'Agenda' },
  { href: '/painel/prospeccao', label: 'Prospecção' },
  { href: '/painel/clientes', label: 'Clientes' },
  { href: '/painel/sonhos', label: 'Sonhos' },
]
```

- [ ] **Step 5: Type-check**

Run: `npm run build`
Expected: succeeds, no type errors, `/admin/clientes` and `/painel/clientes` appear in the route list.

- [ ] **Step 6: Commit**

```bash
git add src/components/lista-clientes.tsx src/app/admin/clientes/page.tsx src/app/painel/clientes/page.tsx src/app/admin/layout.tsx src/app/painel/layout.tsx
git commit -m "feat: add a client list page (admin and painel) with a name/phone filter"
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
Expected: `npm test` shows all existing unit tests still passing (this plan adds no new ones — no pure-function logic, per the spec's testing section, which asks only for pgTAP coverage); `npm run build` succeeds with no type errors and both `/admin/clientes` and `/painel/clientes` present; `npx supabase test db` shows all pgTAP suites passing including the new `0012_clientes_update_isolation.test.sql`.

- [ ] **Step 2: Manual end-to-end walkthrough (if a browser is available)**

As admin: open `/admin/clientes`, confirm the list shows all registered clients sorted by name. Type a few letters of an existing client's name — confirm the list filters down. Clear it and type digits from a client's phone number instead — confirm it filters by that too. Click a client — confirm it opens their ficha. On the ficha, click "Editar bairro/cidade/observação", change all three, Salvar, confirm the page shows the updated values and the "Observação" line appears above the edit button. Confirm nome/telefone are nowhere editable on this screen.

Repeat the same walkthrough as a barbeiro at `/painel/clientes` to confirm both sides work identically.

If no browser is available, document that limitation in the ledger instead of skipping the check silently — same pattern used in every prior plan this session.

- [ ] **Step 3: No commit for this task** — it's verification-only; if any issue surfaces, fix it as a small follow-up commit referencing which task's step regressed.
