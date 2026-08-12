# Cadastro de barbeiros — criar, editar, desativar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin create a new barbeiro (with login credentials), edit an existing barbeiro's nome/telefone, and deactivate/reactivate one — all from `/admin/barbeiros`, which today only supports linking an existing barbeiro to a plano de carreira.

**Architecture:** A new service-role Supabase client creates the Supabase Auth user for a new barbeiro (the only operation that needs to bypass RLS); a new `BarbeiroRow` client component gives each row inline edit/deactivate, mirroring the existing `ServicoRow`/`ProdutoRow`/`PlanoCarreiraRow` pattern; `/admin/barbeiros/page.tsx` is rewritten to render a real `Table` instead of one `<form>` per barbeiro, and gains a "criar barbeiro" form at the top.

**Tech Stack:** Next.js 16.3 App Router, TypeScript, Supabase (Postgres/RLS/Auth via `@supabase/supabase-js` and `@supabase/ssr`), Tailwind CSS v4, shadcn/ui.

## Global Constraints

- No new npm dependency — `@supabase/supabase-js` (already a dependency) is used directly for the service-role client; `@supabase/ssr`'s `createServerClient`/`createBrowserClient` stay reserved for cookie-aware, RLS-respecting access.
- No new migration — `membros` already has `ativo`, and the "admin insere membros" / "admin atualiza membros" RLS policies from `supabase/migrations/0001_tenant_membros.sql` already cover every write this plan needs.
- Row-level inline edit/deactivate goes through the **browser** Supabase client (`getBrowserSupabaseClient()`), exactly like `ServicoRow`/`ProdutoRow` — RLS enforces the admin-only write, no server code needed for those two actions.
- A Server Action passed as a prop into a Client Component uses the `...Action` naming suffix, per this project's own Next.js docs (`node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`, section "Passing actions as props") — read that section if anything here is unclear.
- **Any Server Action that uses the service-role client must verify, before calling it, that the caller is authenticated and is an `ativo` admin of a barbearia** — the service-role key bypasses RLS entirely, so this check is the only thing standing between an arbitrary authenticated user and creating accounts in any barbearia. Throw (don't silently return) on failure — this project's Next.js version documents `throw new Error(...)` as the idiom for auth checks inside Server Actions, and it results in Next's default error handling, which is an acceptable (if generic) failure surface for this rollout — no dedicated error UI is in scope.
- Editable fields on an existing barbeiro are **only** nome and telefone. E-mail and senha are set once at creation and are not editable in this plan (deferred — see spec `docs/superpowers/specs/2026-08-12-cadastro-barbeiros-design.md`, "Fora de escopo").

---

### Task 1: `BarbeiroRow` — edit nome/telefone, desativar/reativar, plano/meta form

**Files:**
- Create: `src/components/barbeiro-row.tsx`

**Interfaces:**
- Consumes: `getBrowserSupabaseClient` from `@/lib/supabase/client` (existing, unchanged). `Table`/`TableRow`/`TableCell` from `@/components/ui/table`, `Input`/`Button` from `@/components/ui/input` and `@/components/ui/button` (all existing, unchanged).
- Produces: `BarbeiroRow({ barbeiro, planos, vincularPlanoAction })` — a client component that renders one `<TableRow>` with 4 cells: Nome, Telefone, "Plano de carreira" (a self-contained `<form>` reusing the exact select/input/button markup the current page already has), and Ações (Editar/Desativar). Task 2's rewritten `admin/barbeiros/page.tsx` renders one of these per barbeiro inside a `<Table>`, passing its own `vincularPlano` Server Action through as `vincularPlanoAction`.

- [ ] **Step 1: Write the component**

Create `src/components/barbeiro-row.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TableRow, TableCell } from '@/components/ui/table'

type Barbeiro = {
  id: string
  nome: string
  telefone: string | null
  ativo: boolean
  plano_carreira_id: string | null
  meta_prospeccao_dia: number | null
}
type Plano = { id: string; nome: string; ativo: boolean }

export function BarbeiroRow({
  barbeiro,
  planos,
  vincularPlanoAction,
}: {
  barbeiro: Barbeiro
  planos: Plano[]
  vincularPlanoAction: (formData: FormData) => void
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(barbeiro.nome)
  const [telefone, setTelefone] = useState(barbeiro.telefone ?? '')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('membros').update({ nome, telefone: telefone || null }).eq('id', barbeiro.id)
    setSalvando(false)
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setNome(barbeiro.nome)
    setTelefone(barbeiro.telefone ?? '')
    setEditando(false)
  }

  async function alternarAtivo() {
    const supabase = getBrowserSupabaseClient()
    await supabase.from('membros').update({ ativo: !barbeiro.ativo }).eq('id', barbeiro.id)
    router.refresh()
  }

  const celulaPlano = (
    <TableCell>
      <form
        key={`${barbeiro.id}-${barbeiro.plano_carreira_id ?? 'none'}-${barbeiro.meta_prospeccao_dia ?? 'none'}`}
        action={vincularPlanoAction}
        className="flex gap-2 items-center flex-wrap"
      >
        <input type="hidden" name="membro_id" value={barbeiro.id} />
        <select name="plano_carreira_id" defaultValue={barbeiro.plano_carreira_id ?? ''} className="border rounded px-2 py-1 bg-input">
          <option value="">Sem plano</option>
          {planos.filter((p) => p.ativo || p.id === barbeiro.plano_carreira_id).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <input
          name="meta_prospeccao_dia"
          type="number"
          defaultValue={barbeiro.meta_prospeccao_dia ?? ''}
          placeholder="Meta diária"
          className="border rounded px-2 py-1 w-32 bg-input"
        />
        <Button type="submit" variant="outline">Salvar</Button>
      </form>
    </TableCell>
  )

  if (editando) {
    return (
      <TableRow>
        <TableCell><Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-32" /></TableCell>
        <TableCell><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} className="w-32" /></TableCell>
        {celulaPlano}
        <TableCell className="flex gap-2">
          <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
          <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow className={barbeiro.ativo ? '' : 'opacity-50'}>
      <TableCell>{barbeiro.nome}</TableCell>
      <TableCell>{barbeiro.telefone}</TableCell>
      {celulaPlano}
      <TableCell className="flex gap-2">
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">Editar</button>
        <button type="button" onClick={alternarAtivo} className="text-xs text-destructive underline">{barbeiro.ativo ? 'Desativar' : 'Reativar'}</button>
      </TableCell>
    </TableRow>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds. `BarbeiroRow` is exported but not yet imported anywhere — this is fine, an unused export never fails a Next.js build.

- [ ] **Step 3: Commit**

```bash
git add src/components/barbeiro-row.tsx
git commit -m "feat: add BarbeiroRow component for inline edit/deactivate"
```

---

### Task 2: Service-role client + `criarBarbeiro` action + rewrite `admin/barbeiros/page.tsx`

**Files:**
- Create: `src/lib/supabase/admin.ts`
- Modify: `src/app/admin/barbeiros/page.tsx` (whole file)

**Interfaces:**
- Consumes: `BarbeiroRow` from `@/components/barbeiro-row` (Task 1) — `{ barbeiro, planos, vincularPlanoAction }` as defined above.
- Produces: `getAdminSupabaseClient()` from `src/lib/supabase/admin.ts` — a `@supabase/supabase-js` client authenticated with `SUPABASE_SERVICE_ROLE_KEY` (already present in `.env.local`), for use only inside Server Actions that must bypass RLS (creating an `auth.users` row). Never import this file from a Client Component.

- [ ] **Step 1: Write the service-role client**

Create `src/lib/supabase/admin.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

export function getAdminSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

- [ ] **Step 2: Rewrite the page**

Replace `src/app/admin/barbeiros/page.tsx` in full:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { getAdminSupabaseClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { BarbeiroRow } from '@/components/barbeiro-row'
import { Table, TableHeader, TableBody, TableRow, TableHead } from '@/components/ui/table'

async function vincularPlano(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const metaRaw = formData.get('meta_prospeccao_dia') as string
  const meta = metaRaw === '' ? null : Number(metaRaw)

  await supabase
    .from('membros')
    .update({
      plano_carreira_id: (formData.get('plano_carreira_id') as string) || null,
      meta_prospeccao_dia: meta,
    })
    .eq('id', formData.get('membro_id') as string)
  revalidatePath('/admin/barbeiros')
}

async function criarBarbeiro(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Não autenticado.')
  }

  // O client com service-role usado abaixo ignora RLS por completo — esta
  // checagem é o único ponto que impede um usuário autenticado qualquer
  // (inclusive um barbeiro comum) de criar contas em qualquer barbearia.
  const { data: chamador } = await supabase
    .from('membros')
    .select('barbearia_id, papel, ativo')
    .eq('user_id', user.id)
    .single()
  if (!chamador || chamador.papel !== 'admin' || !chamador.ativo) {
    throw new Error('Apenas administradores podem cadastrar barbeiros.')
  }

  const nome = formData.get('nome') as string
  const telefone = (formData.get('telefone') as string) || null
  const email = formData.get('email') as string
  const senha = formData.get('senha') as string

  const admin = getAdminSupabaseClient()
  const { data: novoUsuario, error: erroCriacao } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })
  if (erroCriacao || !novoUsuario.user) {
    throw new Error(erroCriacao?.message ?? 'Não foi possível criar o usuário.')
  }

  const { error: erroMembro } = await admin.from('membros').insert({
    barbearia_id: chamador.barbearia_id,
    user_id: novoUsuario.user.id,
    papel: 'barbeiro',
    nome,
    telefone,
  })
  if (erroMembro) {
    throw new Error(erroMembro.message)
  }

  revalidatePath('/admin/barbeiros')
}

export default async function BarbeirosPage() {
  const supabase = await getServerSupabaseClient()
  const { data: barbeiros } = await supabase.from('membros').select('*').eq('papel', 'barbeiro').order('nome')
  const { data: planos } = await supabase.from('planos_carreira').select('*')

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Barbeiros</h1>

      <form action={criarBarbeiro} className="flex gap-2 mb-6 flex-wrap">
        <Input name="nome" placeholder="Nome" required />
        <Input name="telefone" placeholder="Telefone" />
        <Input name="email" type="email" placeholder="E-mail" required />
        <Input name="senha" type="password" placeholder="Senha" required minLength={6} />
        <Button type="submit">Adicionar</Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Telefone</TableHead>
            <TableHead>Plano de carreira</TableHead>
            <TableHead>Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {barbeiros?.map((b) => (
            <BarbeiroRow key={b.id} barbeiro={b} planos={planos ?? []} vincularPlanoAction={vincularPlano} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual verification**

No browser tools available in this environment — verify by tracing the code against the brief instead of launching a browser (Playwright/Chrome MCP tools may be flaky or disconnected; do not spend time retrying them). Confirm by reading the diff:
- `criarBarbeiro` never reads `barbearia_id` from `formData` — it always uses `chamador.barbearia_id` from the authenticated caller's own row.
- `criarBarbeiro` throws before calling `getAdminSupabaseClient()` if `chamador` is missing, not `papel === 'admin'`, or not `ativo`.
- `BarbeiroRow`'s edit/deactivate calls go through `getBrowserSupabaseClient()` (RLS-protected), never the admin client.

If a browser is available when this task runs, also do this by hand: as `admin@teste.com`, open `/admin/barbeiros`, create a barbeiro with a real e-mail/senha, confirm it appears in the table; log out, log in as that new barbeiro, confirm access to `/painel`; back as admin, click Editar on a row, change nome/telefone, Salvar, confirm it persists after refresh; click Desativar, confirm the row dims and the barbeiro no longer appears in `/painel/agenda`'s "novo agendamento" barbeiro picker; click Reativar, confirm it reappears.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/admin.ts src/app/admin/barbeiros/page.tsx
git commit -m "feat: let admin create, edit, and deactivate barbeiros"
```

---

### Task 3: Regressão final

**Files:** none (verification only).

- [ ] **Step 1: Full automated regression**

Run:
```bash
npm test
npm run build
```
Expected: `npm test` shows all existing unit tests still passing (this plan adds no new ones — it's CRUD over existing tables and RLS policies, already covered by `supabase/tests/database/0001_tenant_isolation.test.sql`); `npm run build` succeeds with no type errors and all routes present.

- [ ] **Step 2: Manual end-to-end walkthrough (if a browser is available)**

As `admin@teste.com`: `/admin/barbeiros` — create a new barbeiro (nome, telefone, e-mail, senha with 6+ characters), confirm the row appears with the correct nome/telefone and "Sem plano". Edit that row's nome, Salvar, confirm it persists. Vincular a plano de carreira via the row's own form, confirm it saves independently of the nome/telefone edit state. Desativar the row, confirm it dims and disappears from `/painel/agenda`'s barbeiro picker and from `/admin/page.tsx`'s barbeiros table (which already filters — no change needed there). Reativar, confirm it reappears everywhere.

Then, in a separate browser session (or after logging out): log in as the e-mail/senha just created, confirm it lands on `/painel` as that barbeiro.

If no browser is available, document that limitation in the ledger instead of skipping the check silently — same pattern used in the `visual-saas-clean` plan's Task 5.

- [ ] **Step 3: No commit for this task** — it's verification-only; if any issue surfaces, fix it as a small follow-up commit referencing which task's step regressed.
