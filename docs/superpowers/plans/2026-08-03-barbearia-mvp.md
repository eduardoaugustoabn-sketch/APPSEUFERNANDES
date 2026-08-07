# Plataforma de Gestão de Barbearia — MVP (Fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP of a multi-tenant SaaS barbershop management platform: tenant-isolated auth, catálogo (serviços/produtos), planos de carreira com comissão, agenda pública + interna sem overbooking, lançamentos diários com comissão calculada em tempo real, prospecção com meta diária, ficha do cliente com histórico/ranking, e dashboards de barbeiro/admin com ociosidade.

**Architecture:** Next.js (App Router, TypeScript) talking directly to Supabase (Postgres + Auth + Realtime) via `@supabase/ssr` on the server and `@supabase/supabase-js` on the client. All tenant isolation and role-based access is enforced at the database layer through Postgres Row Level Security (RLS) — the app never relies on its own query filtering as the security boundary. Sensitive public-facing operations (booking, client lookup) go through `SECURITY DEFINER` RPC functions rather than direct table grants to the `anon` role, so anonymous clients never get broad table access.

**Tech Stack:** Next.js >=15 (App Router), React >=19, TypeScript >=5.4, Tailwind CSS v4 (CSS-first theming via `@theme inline` in `globals.css` — no `tailwind.config.ts`/`postcss.config.js`), shadcn/ui on Base UI primitives (`components.json` preset `base-nova`, not Radix UI), Supabase (Postgres, Auth, Realtime, CLI), pgTAP (DB-level tests via `supabase test db`), Vitest (pure TypeScript unit tests).

**Amendment (post Task 1 review, human-approved):** the plan originally specified Tailwind ^3.4 and implicitly assumed Radix-based shadcn/ui, reflecting tool versions current when the plan was written. `create-next-app@latest`/`shadcn@latest` now default to Tailwind v4 and a Base UI preset; the human partner chose to accept current tooling defaults rather than pin back to older versions. Every later task's UI work (new shadcn components, custom theming) must target Tailwind v4's CSS-first conventions and Base UI's `useRender`/`mergeProps` component API, not Radix's `asChild`/`Slot` pattern.

## Global Constraints

- Multi-tenant SaaS: every tenant-scoped table carries `barbearia_id`; isolation is enforced via RLS, not app-layer filtering (spec: Arquitetura).
- Tenants (barbearias) are created manually by a super-admin; no self-service signup/billing in this phase (spec: Decisões de escopo).
- No online payment integration; booking is always paid in person (spec: Decisões de escopo).
- No email/WhatsApp notifications in this phase; confirmation is shown on-screen only (spec: Decisões de escopo).
- Single central stock per barbearia — no per-barbeiro consigned stock in this phase (spec: Decisões de escopo).
- Commission is a flat percentage per category (produto/serviço), defined on reusable `planos_carreira` linked to each `membro` — not the full revenue-tier plan (that is Phase 2) (spec: Decisões de escopo, Modelo de dados).
- Every lançamento (`atendimentos`, `vendas_produtos`) requires a `cliente_id` — no anonymous/unlinked sales (spec: Modelo de dados).
- Price and commission percentage are frozen ("snapshot") on the lançamento row at insert time. This freeze is enforced server-side by the `BEFORE INSERT` triggers on `atendimentos`/`vendas_produtos` (Task 12), which overwrite any client-supplied `preco`/`preco_unitario` with the current `servicos.preco`/`produtos.preco_venda` looked up by id — the client-submitted value is never trusted, only used for optimistic UI display before the insert. Later changes to `planos_carreira`, `servicos.preco`, or `produtos.preco_venda` never retroactively alter past lançamentos (spec: Modelo de dados).
- `clientes.telefone` is unique per `barbearia_id`, used to recognize returning clients (spec: Modelo de dados, Tratamento de erros). Phone numbers are normalized to digits-only (`regexp_replace(telefone, '\D', '', 'g')`) inside `criar_ou_obter_cliente`/`reconhecer_cliente` before comparison/storage, so differently-formatted input for the same number (e.g. `(11) 98888-7777` vs `11988887777`) still recognizes the same client.
- No offline mode in this phase — lançamento and booking require connectivity (spec: Tratamento de erros).
- Automated tests focus on the two highest-risk areas per spec: multi-tenant RLS isolation and booking concurrency (no overbooking), plus unit tests for commission/availability/ociosidade calculations. Screens are verified manually in the browser, not via automated UI tests (spec: Testes).
- Barbeiro role: can only `SELECT`/`INSERT` its own rows in `atendimentos`, `vendas_produtos`, `prospeccoes`, `bloqueios_agenda`; cannot `UPDATE`/`DELETE` lançamentos once created (only admin can) (spec: Modelo de dados, Perfis de acesso).
- Migration filenames use plain sequential numbers (`0001_...`, `0002_...`) rather than the Supabase CLI's default timestamp prefixes, purely so this plan's task order is easy to follow. **Amendment (discovered during Task 9 implementation):** the plan originally used letter-suffixed filenames (`0005b_...`, `0006b_...`, `0007b_...`) to slot an extra migration in right after its non-suffixed counterpart. The installed Supabase CLI (v2.111.0) rejects any migration filename whose leading run isn't pure digits — `0006_agenda_rpcs.sql` is silently skipped (never applied) rather than erroring loudly, which is a dangerous silent failure. There is also no purely-numeric filename that sorts strictly between `0005_...` and `0006_...`, because `_` (0x5F) sorts after every digit — so `00051_...` sorts *before* `0005_agenda.sql`, not after. The fix is to never reuse a base number: every migration gets the next unused sequential integer. This renumbers every migration from Task 9 onward: the original `0005b_agenda_rpcs.sql` is now `0006_agenda_rpcs.sql`, `0006_lancamentos.sql` is now `0007_lancamentos.sql`, `0006b_ociosidade.sql` is now `0008_ociosidade.sql`, `0007_prospeccao.sql` is now `0009_prospeccao.sql`, and `0007b_ficha_cliente.sql` is now `0010_ficha_cliente.sql`. All filenames below and in each task's file list reflect the renumbered scheme.
- Admin and barbeiro areas live under real URL segments (`/admin`, `/painel`) rather than bare route groups, so they never collide with each other or with a public booking slug — see Task 3. Because of this, `admin`, `painel`, and `login` are reserved slugs: the super-admin must never create a barbearia with one of these as its `slug`, since that tenant's public booking page would be permanently shadowed by the matching static route.
- The no-overbooking guarantee on `agendamentos` (Task 8) is a GiST exclusion constraint over the appointment's actual time range, not a same-start-time unique index — two appointments of different durations that merely overlap (not share an identical `hora_inicio`) must also be rejected.
- `supabase/config.toml` sets `api.auto_expose_new_tables = true` (Amendment, Task 2, human-approved — see note below). No migration in this plan issues explicit `GRANT` statements to `anon`/`authenticated`/`service_role`; every table's reachability through the Data API depends on this flag, with RLS policies (or their absence) remaining the sole access-control boundary, exactly as stated in Architecture above.

**Amendment (post Task 2 review, human-approved):** the Supabase CLI version in use here defaults to `auto_expose_new_tables = false` (the new cloud default — new tables in `public` are not reachable via the Data API without explicit `GRANT`s), whereas the plan's migrations were written assuming the legacy always-exposed behavior and never include `GRANT` statements. Task 2's pgTAP suite failed with `permission denied for table barbearias` until this was diagnosed. The human partner chose to set `auto_expose_new_tables = true` in `supabase/config.toml` rather than retrofit explicit `GRANT`s into all ~22 migrations — RLS policies still fully govern access (a table with no permissive policy for a role stays inaccessible to it regardless of this flag), so this preserves the plan's stated security model. This flag is marked deprecated by Supabase with removal on 2026-10-30; if the CLI is upgraded past that date, every migration will need explicit `GRANT` statements added retroactively.

---

## File Structure

```
supabase/
  config.toml
  migrations/
    0001_tenant_membros.sql
    0002_catalogo.sql
    0003_planos_carreira.sql
    0004_clientes.sql
    0005_agenda.sql
    0006_agenda_rpcs.sql
    0007_lancamentos.sql
    0008_ociosidade.sql
    0009_prospeccao.sql
    0010_ficha_cliente.sql
  tests/database/
    0001_tenant_isolation.test.sql
    0002_catalogo_isolation.test.sql
    0003_lancamentos.test.sql
    0004_booking_concurrency.test.sql
    0005_prospeccao_isolation.test.sql
src/
  app/
    page.tsx                              -- role-based redirect (admin -> /admin, barbeiro -> /painel)
    login/page.tsx
    [barbeariaSlug]/page.tsx              -- public booking page
    admin/
      layout.tsx
      page.tsx                            -- admin overview dashboard
      barbeiros/page.tsx
      servicos/page.tsx
      produtos/page.tsx
      planos-carreira/page.tsx
      clientes/[id]/page.tsx              -- ficha do cliente (admin view)
    painel/
      layout.tsx
      page.tsx                            -- barbeiro dashboard
      lancamentos/page.tsx
      prospeccao/page.tsx
      agenda/page.tsx
      clientes/[id]/page.tsx              -- ficha do cliente (barbeiro view)
  lib/
    supabase/
      server.ts                           -- server-side Supabase client
      client.ts                           -- browser Supabase client
  components/
    cliente-autocomplete.tsx
    ...
tests/
  unit/
    ociosidade.test.ts
```

---

## Phase A — Project Setup

### Task 1: Scaffold Next.js + Supabase project

**Files:**
- Create: entire Next.js scaffold at repo root (`package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`)
- Create: `supabase/config.toml`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `npm run dev`, `npm run build`, `npm test` (vitest), `npx supabase start`, `npx supabase test db` — all runnable from repo root.

- [ ] **Step 1: Scaffold Next.js into a temp directory (repo root already has `.git`, `docs/`, `.claude/`, so `create-next-app` must not run directly on it)**

```bash
npx create-next-app@latest ../_scaffold_tmp \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-npm --no-turbopack
```

- [ ] **Step 2: Merge scaffold into repo root and clean up**

```bash
cp -r ../_scaffold_tmp/. ./
rm -rf ../_scaffold_tmp
rm -rf .git/../_scaffold_tmp 2>/dev/null || true
```

- [ ] **Step 3: Install Supabase, testing, and UI deps**

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install -D supabase vitest
npx shadcn@latest init -y
npx shadcn@latest add button input card table progress badge
```

- [ ] **Step 4: Init local Supabase project**

```bash
npx supabase init
```

- [ ] **Step 5: Add vitest config and script**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
})
```

Add to `package.json` `"scripts"`: `"test": "vitest run"`.

- [ ] **Step 6: Update `.gitignore`**

Append to `.gitignore`:

```
.env.local
.superpowers/
supabase/.branches
supabase/.temp
```

- [ ] **Step 7: Verify the app boots**

```bash
npm run dev
```

Expected: Next.js dev server starts on `http://localhost:3000` with the default page loading with no errors. Stop the server after confirming.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + Supabase project"
```

---

## Phase B — Tenant, Auth, and Access Control

### Task 2: `barbearias` / `membros` schema, auth helper functions, and RLS

**Files:**
- Create: `supabase/migrations/0001_tenant_membros.sql`
- Create: `supabase/tests/database/0001_tenant_isolation.test.sql`

**Interfaces:**
- Produces SQL functions used by every later migration's RLS policies:
  - `public.auth_barbearia_id() returns uuid`
  - `public.auth_papel() returns text`
  - `public.auth_membro_id() returns uuid`

- [ ] **Step 1: Write the migration**

`supabase/migrations/0001_tenant_membros.sql`:

```sql
create table barbearias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  criado_em timestamptz not null default now()
);

create table membros (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  papel text not null check (papel in ('admin', 'barbeiro')),
  nome text not null,
  telefone text,
  foto_url text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (user_id)
);

alter table barbearias enable row level security;
alter table membros enable row level security;

-- Helper functions: security definer so they can read `membros` even though
-- RLS is enabled on it (the functions themselves bypass RLS via definer
-- rights; callers only ever see the scalar result).
create or replace function public.auth_barbearia_id() returns uuid
language sql stable security definer set search_path = public as $$
  select barbearia_id from membros where user_id = auth.uid() and ativo = true limit 1;
$$;

create or replace function public.auth_papel() returns text
language sql stable security definer set search_path = public as $$
  select papel from membros where user_id = auth.uid() and ativo = true limit 1;
$$;

create or replace function public.auth_membro_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from membros where user_id = auth.uid() and ativo = true limit 1;
$$;

-- barbearias: any authenticated member can read their own barbearia row.
create policy "membros leem a propria barbearia"
  on barbearias for select
  using (id = auth_barbearia_id());

-- membros: admin manages all members of the barbearia; barbeiro reads own row.
create policy "admin le membros da barbearia"
  on membros for select
  using (barbearia_id = auth_barbearia_id());

create policy "admin insere membros"
  on membros for insert
  with check (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');

create policy "admin atualiza membros"
  on membros for update
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');

create policy "admin remove membros"
  on membros for delete
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
```

- [ ] **Step 2: Start local Supabase and apply the migration**

```bash
npx supabase start
npx supabase db reset
```

Expected: reset runs all migrations with no errors.

- [ ] **Step 3: Write the pgTAP tenant isolation test**

`supabase/tests/database/0001_tenant_isolation.test.sql`:

```sql
begin;
select plan(3);

-- Seed two barbearias with one admin membro each.
insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a'),
  ('22222222-2222-2222-2222-222222222222', 'Barbearia B', 'barbearia-b');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin-a@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'admin-b@example.com');

insert into membros (barbearia_id, user_id, papel, nome) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin', 'Admin A'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000002', 'admin', 'Admin B');

-- Simulate being authenticated as Admin A.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

select is(
  (select count(*)::int from barbearias),
  1,
  'Admin A only sees their own barbearia'
);

select is(
  (select slug from barbearias limit 1),
  'barbearia-a',
  'Admin A sees barbearia-a, not barbearia-b'
);

select is(
  (select count(*)::int from membros),
  1,
  'Admin A only sees membros from their own barbearia'
);

select * from finish();
rollback;
```

- [ ] **Step 4: Run the pgTAP suite**

```bash
npx supabase test db
```

Expected: all 3 assertions pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_tenant_membros.sql supabase/tests/database/0001_tenant_isolation.test.sql
git commit -m "feat: add barbearias/membros schema with tenant-isolating RLS"
```

### Task 3: Login page and session handling

**Files:**
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/client.ts`
- Create: `src/app/login/page.tsx`
- Create: `src/middleware.ts`
- Modify: `src/app/page.tsx` (replace the create-next-app default with a role-based redirect)

**Interfaces:**
- Consumes: Supabase project URL/anon key from `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- Produces: `getServerSupabaseClient()` and `getBrowserSupabaseClient()`, used by every later server component / client component.

- [ ] **Step 1: Add env vars**

Create `.env.local` (values from `npx supabase status`, gitignored — never committed):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase status>
```

Also create `.env.local.example` (committed, no real values, documents which vars a fresh clone needs):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 2: Write the Supabase client helpers**

`src/lib/supabase/server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function getServerSupabaseClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```

`src/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function getBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 3: Write the login page**

`src/app/login/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('E-mail ou senha inválidos.')
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm mx-auto mt-20 flex flex-col gap-3">
      <h1 className="text-xl font-semibold">Entrar</h1>
      <Input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <Input type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit">Entrar</Button>
    </form>
  )
}
```

- [ ] **Step 4: Write middleware that protects only the admin/painel prefixes**

`admin/` and `painel/` are real URL segments (not route groups), so the middleware only needs to gate those two prefixes — it does not need to guess whether an arbitrary single-segment path is a public booking slug or a private page, which removes the ambiguity that a route-group-based scheme would have (see Task 5/Task 11 note on why `admin`/`painel`/`login` are reserved slugs).

`src/middleware.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PROTECTED_PREFIXES = ['/admin', '/painel']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  if (!isProtected) return NextResponse.next()

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

Role-specific access (admin-only vs. barbeiro-only) is still enforced by the `admin/layout.tsx` (Task 5) and `painel/layout.tsx` (Task 11) server components, which redirect based on `membros.papel` — the middleware here only guarantees a `user` session exists before those layouts run.

- [ ] **Step 5: Replace the default root page with a role-based redirect**

`src/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getServerSupabaseClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membro } = await supabase.from('membros').select('papel').eq('user_id', user.id).single()
  redirect(membro?.papel === 'admin' ? '/admin' : '/painel')
}
```

This is why login's `router.push('/')` (Step 3 above) works correctly regardless of role — `/` always resolves onward to the right dashboard.

- [ ] **Step 6: Manually verify**

```bash
npm run dev
```

Visit `http://localhost:3000/login`, confirm the form renders. Create a test user via `npx supabase status` Studio URL, sign in, confirm redirect to `/` and then onward to `/admin` or `/painel` depending on the membro's `papel`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase src/app/login src/app/page.tsx src/middleware.ts .env.local.example
git commit -m "feat: add Supabase auth client helpers, login page, and route middleware"
```

---

## Phase C — Catálogo (Serviços e Produtos)

### Task 4: `servicos` / `servico_barbeiros` / `produtos` schema and RLS

**Files:**
- Create: `supabase/migrations/0002_catalogo.sql`
- Create: `supabase/tests/database/0002_catalogo_isolation.test.sql`

**Interfaces:**
- Consumes: `auth_barbearia_id()`, `auth_papel()`, `auth_membro_id()` from Task 2.
- Produces: `servicos`, `servico_barbeiros`, `produtos` tables, readable by anon (see note) for public catalog display.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0002_catalogo.sql`:

```sql
create table servicos (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  nome text not null,
  duracao_minutos int not null check (duracao_minutos > 0),
  preco numeric(10,2) not null check (preco >= 0),
  ativo boolean not null default true
);

create table servico_barbeiros (
  servico_id uuid not null references servicos(id) on delete cascade,
  membro_id uuid not null references membros(id) on delete cascade,
  primary key (servico_id, membro_id)
);

create table produtos (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  nome text not null,
  categoria text,
  preco_custo numeric(10,2) not null default 0,
  preco_venda numeric(10,2) not null check (preco_venda >= 0),
  quantidade_estoque int not null default 0 check (quantidade_estoque >= 0),
  estoque_minimo int not null default 0,
  unidade_medida text not null default 'un'
);

alter table servicos enable row level security;
alter table servico_barbeiros enable row level security;
alter table produtos enable row level security;

-- Members (admin + barbeiro) manage/read within their own barbearia.
create policy "membros leem servicos" on servicos for select
  using (barbearia_id = auth_barbearia_id());
create policy "admin gerencia servicos" on servicos for all
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin')
  with check (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');

-- Public (anon) catalog read: needed so the public booking page can list
-- active services without a table-level tenant filter (non-sensitive data).
create policy "publico le servicos ativos" on servicos for select
  to anon using (ativo = true);

create policy "membros leem servico_barbeiros" on servico_barbeiros for select
  using (exists (select 1 from servicos s where s.id = servico_id and s.barbearia_id = auth_barbearia_id()));
create policy "admin gerencia servico_barbeiros" on servico_barbeiros for all
  using (exists (select 1 from servicos s where s.id = servico_id and s.barbearia_id = auth_barbearia_id() and auth_papel() = 'admin'))
  with check (exists (select 1 from servicos s where s.id = servico_id and s.barbearia_id = auth_barbearia_id() and auth_papel() = 'admin'));
create policy "publico le servico_barbeiros" on servico_barbeiros for select
  to anon using (true);

create policy "membros leem produtos" on produtos for select
  using (barbearia_id = auth_barbearia_id());
create policy "admin gerencia produtos" on produtos for all
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin')
  with check (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
-- Note: produtos has no anon policy — stock/pricing is not exposed publicly.
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db reset
```

- [ ] **Step 3: Write isolation + public-visibility pgTAP test**

`supabase/tests/database/0002_catalogo_isolation.test.sql`:

```sql
begin;
select plan(2);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a'),
  ('22222222-2222-2222-2222-222222222222', 'Barbearia B', 'barbearia-b');

insert into servicos (id, barbearia_id, nome, duracao_minutos, preco) values
  ('s1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Corte A', 40, 60),
  ('s2222222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Corte B', 40, 60);

insert into produtos (id, barbearia_id, nome, preco_venda) values
  ('p1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Pomada A', 40),
  ('p2222222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Pomada B', 40);

set local role anon;

select is(
  (select count(*)::int from servicos),
  2,
  'anon sees active services from all barbearias (public catalog, by design)'
);

select is(
  (select count(*)::int from produtos),
  0,
  'anon cannot read produtos at all (no anon policy)'
);

select * from finish();
rollback;
```

- [ ] **Step 4: Run tests**

```bash
npx supabase test db
```

Expected: both assertions pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_catalogo.sql supabase/tests/database/0002_catalogo_isolation.test.sql
git commit -m "feat: add servicos/produtos schema with public catalog read policy"
```

### Task 5: Admin CRUD UI for serviços and produtos

**Files:**
- Create: `src/app/admin/layout.tsx`
- Create: `src/app/admin/servicos/page.tsx`
- Create: `src/app/admin/produtos/page.tsx`

**Interfaces:**
- Consumes: `getServerSupabaseClient()` (Task 3), `servicos`/`produtos` tables (Task 4).

- [ ] **Step 1: Write the admin layout with role guard**

`src/app/admin/layout.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getServerSupabaseClient } from '@/lib/supabase/server'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membro } = await supabase
    .from('membros')
    .select('papel')
    .eq('user_id', user.id)
    .single()

  if (membro?.papel !== 'admin') redirect('/')

  return <div className="p-6">{children}</div>
}
```

- [ ] **Step 2: Write the serviços CRUD page**

`src/app/admin/servicos/page.tsx`:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

async function criarServico(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('servicos').insert({
    barbearia_id: membro!.barbearia_id,
    nome: formData.get('nome') as string,
    duracao_minutos: Number(formData.get('duracao_minutos')),
    preco: Number(formData.get('preco')),
  })
  revalidatePath('/servicos')
}

export default async function ServicosPage() {
  const supabase = await getServerSupabaseClient()
  const { data: servicos } = await supabase.from('servicos').select('*').order('nome')

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Serviços</h1>
      <form action={criarServico} className="flex gap-2 mb-6">
        <Input name="nome" placeholder="Nome" required />
        <Input name="duracao_minutos" type="number" placeholder="Duração (min)" required />
        <Input name="preco" type="number" step="0.01" placeholder="Preço" required />
        <Button type="submit">Adicionar</Button>
      </form>
      <table className="w-full text-left">
        <thead><tr><th>Nome</th><th>Duração</th><th>Preço</th></tr></thead>
        <tbody>
          {servicos?.map((s) => (
            <tr key={s.id}><td>{s.nome}</td><td>{s.duracao_minutos}min</td><td>R$ {s.preco}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Write the produtos CRUD page (same pattern)**

`src/app/admin/produtos/page.tsx`:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

async function criarProduto(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('produtos').insert({
    barbearia_id: membro!.barbearia_id,
    nome: formData.get('nome') as string,
    categoria: formData.get('categoria') as string,
    preco_venda: Number(formData.get('preco_venda')),
    quantidade_estoque: Number(formData.get('quantidade_estoque')),
    estoque_minimo: Number(formData.get('estoque_minimo')),
  })
  revalidatePath('/produtos')
}

export default async function ProdutosPage() {
  const supabase = await getServerSupabaseClient()
  const { data: produtos } = await supabase.from('produtos').select('*').order('nome')

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Produtos</h1>
      <form action={criarProduto} className="flex gap-2 mb-6 flex-wrap">
        <Input name="nome" placeholder="Nome" required />
        <Input name="categoria" placeholder="Categoria" />
        <Input name="preco_venda" type="number" step="0.01" placeholder="Preço de venda" required />
        <Input name="quantidade_estoque" type="number" placeholder="Estoque inicial" required />
        <Input name="estoque_minimo" type="number" placeholder="Estoque mínimo" required />
        <Button type="submit">Adicionar</Button>
      </form>
      <table className="w-full text-left">
        <thead><tr><th>Nome</th><th>Categoria</th><th>Preço</th><th>Estoque</th></tr></thead>
        <tbody>
          {produtos?.map((p) => (
            <tr key={p.id} className={p.quantidade_estoque <= p.estoque_minimo ? 'text-red-600' : ''}>
              <td>{p.nome}</td><td>{p.categoria}</td><td>R$ {p.preco_venda}</td><td>{p.quantidade_estoque}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Manually verify**

```bash
npm run dev
```

Log in as an admin membro, visit `/servicos` and `/produtos`, add one of each, confirm they appear in the table and rows below `estoque_minimo` are highlighted red.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin"
git commit -m "feat: add admin CRUD pages for servicos and produtos"
```

---

## Phase D — Planos de Carreira

### Task 6: `planos_carreira` schema, `membros` extra columns, RLS, and admin UI

**Files:**
- Create: `supabase/migrations/0003_planos_carreira.sql`
- Create: `src/app/admin/planos-carreira/page.tsx`
- Create: `src/app/admin/barbeiros/page.tsx` (barbeiro list with plan/goal assignment)

**Interfaces:**
- Produces: `planos_carreira` table; `membros.plano_carreira_id`, `membros.meta_prospeccao_dia` columns.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0003_planos_carreira.sql`:

```sql
create table planos_carreira (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  nome text not null,
  percentual_produto numeric(5,2) not null check (percentual_produto between 0 and 100),
  percentual_servico numeric(5,2) not null check (percentual_servico between 0 and 100)
);

alter table membros
  add column plano_carreira_id uuid references planos_carreira(id),
  add column meta_prospeccao_dia int check (meta_prospeccao_dia >= 0);

alter table planos_carreira enable row level security;

create policy "membros leem planos_carreira" on planos_carreira for select
  using (barbearia_id = auth_barbearia_id());
create policy "admin gerencia planos_carreira" on planos_carreira for all
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin')
  with check (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db reset
```

- [ ] **Step 3: Write the admin planos de carreira page**

`src/app/admin/planos-carreira/page.tsx`:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

async function criarPlano(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('planos_carreira').insert({
    barbearia_id: membro!.barbearia_id,
    nome: formData.get('nome') as string,
    percentual_produto: Number(formData.get('percentual_produto')),
    percentual_servico: Number(formData.get('percentual_servico')),
  })
  revalidatePath('/planos-carreira')
}

export default async function PlanosCarreiraPage() {
  const supabase = await getServerSupabaseClient()
  const { data: planos } = await supabase.from('planos_carreira').select('*').order('nome')

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Planos de carreira</h1>
      <form action={criarPlano} className="flex gap-2 mb-6">
        <Input name="nome" placeholder="Nome (ex: Sênior)" required />
        <Input name="percentual_produto" type="number" step="0.01" placeholder="% produto" required />
        <Input name="percentual_servico" type="number" step="0.01" placeholder="% serviço" required />
        <Button type="submit">Adicionar</Button>
      </form>
      <table className="w-full text-left">
        <thead><tr><th>Nome</th><th>% produto</th><th>% serviço</th></tr></thead>
        <tbody>
          {planos?.map((p) => (
            <tr key={p.id}><td>{p.nome}</td><td>{p.percentual_produto}%</td><td>{p.percentual_servico}%</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Write the barbeiros list page with plan assignment**

`src/app/admin/barbeiros/page.tsx`:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function vincularPlano(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  await supabase
    .from('membros')
    .update({
      plano_carreira_id: (formData.get('plano_carreira_id') as string) || null,
      meta_prospeccao_dia: Number(formData.get('meta_prospeccao_dia')) || null,
    })
    .eq('id', formData.get('membro_id') as string)
  revalidatePath('/barbeiros')
}

export default async function BarbeirosPage() {
  const supabase = await getServerSupabaseClient()
  const { data: barbeiros } = await supabase.from('membros').select('*').eq('papel', 'barbeiro').order('nome')
  const { data: planos } = await supabase.from('planos_carreira').select('*')

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Barbeiros</h1>
      {barbeiros?.map((b) => (
        <form key={b.id} action={vincularPlano} className="flex gap-2 items-center mb-2">
          <input type="hidden" name="membro_id" value={b.id} />
          <span className="w-32">{b.nome}</span>
          <select name="plano_carreira_id" defaultValue={b.plano_carreira_id ?? ''} className="border rounded px-2 py-1">
            <option value="">Sem plano</option>
            {planos?.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <input
            name="meta_prospeccao_dia"
            type="number"
            defaultValue={b.meta_prospeccao_dia ?? ''}
            placeholder="Meta diária de contatos"
            className="border rounded px-2 py-1 w-48"
          />
          <button type="submit" className="border rounded px-3 py-1">Salvar</button>
        </form>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Manually verify**

Create two planos de carreira, create a barbeiro membro row (via Supabase Studio for now — the invite flow is out of scope for this MVP plan and can be a follow-up task), assign a plano and a meta_prospeccao_dia, confirm it saves and reloads correctly.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0003_planos_carreira.sql "src/app/admin/planos-carreira" "src/app/admin/barbeiros"
git commit -m "feat: add planos de carreira and barbeiro plan/goal assignment"
```

---

## Phase E — Clientes

### Task 7: `clientes` schema, RLS, and recognition/upsert RPCs

**Files:**
- Create: `supabase/migrations/0004_clientes.sql`
- Create: `supabase/tests/database/0003_lancamentos.test.sql` (extended in Task 12; created here with a first clientes-focused assertion)

**Interfaces:**
- Produces:
  - `public.criar_ou_obter_cliente(p_barbearia_id uuid, p_nome text, p_telefone text) returns uuid` — security definer, callable by `anon` and `authenticated`. Upserts on `(barbearia_id, telefone)`.
  - `public.reconhecer_cliente(p_barbearia_id uuid, p_telefone text) returns table(cliente_id uuid, nome text, total_cortes int)` — security definer, callable by `anon` and `authenticated`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0004_clientes.sql`:

```sql
create table clientes (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  nome text not null,
  telefone text not null,
  criado_em timestamptz not null default now(),
  unique (barbearia_id, telefone)
);

alter table clientes enable row level security;

create policy "membros leem clientes da barbearia" on clientes for select
  using (barbearia_id = auth_barbearia_id());
-- No direct anon/authenticated INSERT policy: all client creation goes
-- through criar_ou_obter_cliente() below, which validates and normalizes.

create or replace function public.criar_ou_obter_cliente(
  p_barbearia_id uuid, p_nome text, p_telefone text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cliente_id uuid;
  v_telefone text;
begin
  if not exists (select 1 from barbearias where id = p_barbearia_id) then
    raise exception 'Barbearia inválida';
  end if;

  -- Normalize to digits-only so differently-formatted input for the same
  -- number (e.g. "(11) 98888-7777" vs "11988887777") still matches.
  v_telefone := regexp_replace(p_telefone, '\D', '', 'g');

  insert into clientes (barbearia_id, nome, telefone)
  values (p_barbearia_id, p_nome, v_telefone)
  on conflict (barbearia_id, telefone)
  do update set nome = excluded.nome
  returning id into v_cliente_id;

  return v_cliente_id;
end;
$$;

grant execute on function public.criar_ou_obter_cliente(uuid, text, text) to anon, authenticated;
```

Note: `reconhecer_cliente` (the recognition RPC used by the booking/lançamento UIs) is not defined here — it references `atendimentos`, which does not exist until Task 12's migration. Since `supabase db reset` always replays every migration from scratch in order, that function must physically live in a migration file that loads after `atendimentos` exists. Its definition is in `supabase/migrations/0007_lancamentos.sql` (Task 12) instead.

- [ ] **Step 2: Apply migration**

```bash
npx supabase db reset
```

- [ ] **Step 3: Write a pgTAP test for the upsert RPC**

`supabase/tests/database/0003_lancamentos.test.sql` (first section — more assertions appended in Task 12):

```sql
begin;
select plan(3);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a');

set local role anon;

select is(
  (select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Marcos Silva', '11988887777') is not null),
  true,
  'anon can create a client via criar_ou_obter_cliente'
);

select is(
  (select count(*)::int from clientes where telefone = '11988887777'),
  1,
  'creating a client with the same phone twice does not duplicate the row'
);

select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Marcos Silva Jr', '11988887777');

-- A differently-formatted phone for the same number must normalize to the
-- same digits and recognize the existing client instead of creating a duplicate.
select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Marcos Silva Jr', '(11) 98888-7777');

select is(
  (select count(*)::int from clientes where telefone = '11988887777'),
  1,
  'a formatted phone "(11) 98888-7777" normalizes to the same digits and does not create a duplicate'
);

select * from finish();
rollback;
```

- [ ] **Step 4: Run tests**

```bash
npx supabase test db
```

Expected: all 3 assertions pass — the second and third calls with the same underlying phone number (unformatted, then formatted) do not raise a unique-violation and do not duplicate the row (confirms both the `on conflict` upsert and the phone normalization work).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0004_clientes.sql supabase/tests/database/0003_lancamentos.test.sql
git commit -m "feat: add clientes schema and criar_ou_obter_cliente RPC"
```

---

## Phase F — Agenda

### Task 8: `horarios_trabalho` / `bloqueios_agenda` / `agendamentos` schema and RLS

**Files:**
- Create: `supabase/migrations/0005_agenda.sql`

**Interfaces:**
- Produces: `horarios_trabalho`, `bloqueios_agenda`, `agendamentos` tables. GiST exclusion constraint `agendamento_sem_sobreposicao` — the DB-level no-overbooking guarantee later tasks rely on. Requires the `btree_gist` extension.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0005_agenda.sql`:

```sql
create table horarios_trabalho (
  id uuid primary key default gen_random_uuid(),
  membro_id uuid not null references membros(id) on delete cascade,
  dia_semana int not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fim time not null,
  check (hora_fim > hora_inicio)
);

create table bloqueios_agenda (
  id uuid primary key default gen_random_uuid(),
  membro_id uuid not null references membros(id) on delete cascade,
  data date not null,
  hora_inicio time not null,
  hora_fim time not null,
  motivo text,
  check (hora_fim > hora_inicio)
);

create table agendamentos (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  membro_id uuid not null references membros(id),
  cliente_id uuid not null references clientes(id),
  servico_id uuid not null references servicos(id),
  data date not null,
  hora_inicio time not null,
  hora_fim time not null,
  status text not null default 'confirmado' check (status in ('confirmado', 'cancelado', 'concluido')),
  origem text not null check (origem in ('publico', 'interno')),
  criado_em timestamptz not null default now()
);

-- The no-overbooking guarantee: no two non-cancelled appointments for the same
-- membro can occupy overlapping time ranges, regardless of duration — a plain
-- unique index on (membro_id, data, hora_inicio) would only catch collisions
-- that share the exact same start time, letting different-duration bookings
-- overlap (e.g. 09:00-09:40 and 09:20-10:20). A cancelled appointment frees
-- the slot. btree_gist is required so the uuid `=` term can be combined with
-- the range `&&` term inside a single GiST exclusion constraint.
create extension if not exists btree_gist;

alter table agendamentos add constraint agendamento_sem_sobreposicao
  exclude using gist (
    membro_id with =,
    tsrange((data + hora_inicio)::timestamp, (data + hora_fim)::timestamp) with &&
  )
  where (status <> 'cancelado');

alter table horarios_trabalho enable row level security;
alter table bloqueios_agenda enable row level security;
alter table agendamentos enable row level security;

create policy "membros leem horarios_trabalho" on horarios_trabalho for select
  using (exists (select 1 from membros m where m.id = membro_id and m.barbearia_id = auth_barbearia_id()));
create policy "admin gerencia horarios_trabalho" on horarios_trabalho for all
  using (exists (select 1 from membros m where m.id = membro_id and m.barbearia_id = auth_barbearia_id() and auth_papel() = 'admin'))
  with check (exists (select 1 from membros m where m.id = membro_id and m.barbearia_id = auth_barbearia_id() and auth_papel() = 'admin'));

create policy "membros leem bloqueios da barbearia" on bloqueios_agenda for select
  using (exists (select 1 from membros m where m.id = membro_id and m.barbearia_id = auth_barbearia_id()));
create policy "admin gerencia qualquer bloqueio" on bloqueios_agenda for all
  using (exists (select 1 from membros m where m.id = membro_id and m.barbearia_id = auth_barbearia_id() and auth_papel() = 'admin'))
  with check (exists (select 1 from membros m where m.id = membro_id and m.barbearia_id = auth_barbearia_id() and auth_papel() = 'admin'));
create policy "barbeiro gerencia proprio bloqueio" on bloqueios_agenda for all
  using (membro_id = auth_membro_id())
  with check (membro_id = auth_membro_id());

create policy "admin le agendamentos da barbearia" on agendamentos for select
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
create policy "barbeiro le proprios agendamentos" on agendamentos for select
  using (membro_id = auth_membro_id());
create policy "admin gerencia agendamentos" on agendamentos for all
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin')
  with check (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
create policy "barbeiro atualiza proprio agendamento" on agendamentos for update
  using (membro_id = auth_membro_id())
  with check (membro_id = auth_membro_id());
-- No anon policy on agendamentos: public writes go exclusively through the
-- criar_agendamento_publico() RPC (Task 9), and availability is read
-- exclusively through the horarios_disponiveis() RPC (Task 9) — anon never
-- gets a raw SELECT/INSERT grant on this table, so client PII in it is
-- never directly queryable by the public.
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db reset
```

- [ ] **Step 3: Manually verify constraint behavior**

In Supabase Studio SQL editor, insert two `agendamentos` rows with the same `membro_id`, `data`, `hora_inicio` and `status = 'confirmado'`. Expected: second insert fails with `conflicting key value violates exclusion constraint "agendamento_sem_sobreposicao"`. Cancel the first (`status = 'cancelado'`), retry the second insert — expected: succeeds. Then insert a third row for the same `membro_id`/`data` with a `hora_inicio` that merely overlaps the first (different start time, ranges intersect) — expected: also rejected by the same exclusion constraint.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0005_agenda.sql
git commit -m "feat: add agenda schema with DB-enforced no-overbooking constraint"
```

### Task 9: Availability and public-booking RPCs, with concurrency test

**Files:**
- Create: `supabase/migrations/0006_agenda_rpcs.sql`
- Create: `supabase/tests/database/0004_booking_concurrency.test.sql`

**Interfaces:**
- Produces:
  - `public.horarios_disponiveis(p_barbearia_id uuid, p_membro_id uuid, p_servico_id uuid, p_data date) returns table(hora_inicio time, hora_fim time)`
  - `public.criar_agendamento_publico(p_barbearia_id uuid, p_membro_id uuid, p_servico_id uuid, p_data date, p_hora_inicio time, p_nome_cliente text, p_telefone_cliente text) returns uuid`
- Consumes: `criar_ou_obter_cliente` (Task 7).

- [ ] **Step 1: Write the migration**

Both RPCs take `p_barbearia_id` and validate `p_membro_id` belongs to it (and is an active barbeiro) before doing anything else — otherwise an anonymous caller could pass a `membro_id` from a different tenant (reachable since `membros.id` is a bare uuid, guessable/enumerable) and either read another barbearia's calendar or write a booking into it, e.g. to spam-block a competitor's barbeiro's slots.

`supabase/migrations/0006_agenda_rpcs.sql`:

```sql
create or replace function public.horarios_disponiveis(
  p_barbearia_id uuid, p_membro_id uuid, p_servico_id uuid, p_data date
) returns table(hora_inicio time, hora_fim time)
language plpgsql security definer set search_path = public as $$
declare
  v_duracao int;
  v_dia_semana int;
  v_slot time;
  v_expediente record;
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

  v_dia_semana := extract(dow from p_data);

  for v_expediente in
    select ht.hora_inicio, ht.hora_fim
    from horarios_trabalho ht
    where ht.membro_id = p_membro_id and ht.dia_semana = v_dia_semana
  loop
    v_slot := v_expediente.hora_inicio;
    while v_slot + (v_duracao || ' minutes')::interval <= v_expediente.hora_fim loop
      if not exists (
        select 1 from bloqueios_agenda b
        where b.membro_id = p_membro_id and b.data = p_data
          and v_slot < b.hora_fim and (v_slot + (v_duracao || ' minutes')::interval) > b.hora_inicio
      ) and not exists (
        select 1 from agendamentos a
        where a.membro_id = p_membro_id and a.data = p_data and a.status <> 'cancelado'
          and v_slot < a.hora_fim and (v_slot + (v_duracao || ' minutes')::interval) > a.hora_inicio
      ) then
        hora_inicio := v_slot;
        hora_fim := v_slot + (v_duracao || ' minutes')::interval;
        return next;
      end if;
      v_slot := v_slot + (v_duracao || ' minutes')::interval;
    end loop;
  end loop;
end;
$$;

grant execute on function public.horarios_disponiveis(uuid, uuid, uuid, date) to anon, authenticated;

create or replace function public.criar_agendamento_publico(
  p_barbearia_id uuid, p_membro_id uuid, p_servico_id uuid,
  p_data date, p_hora_inicio time, p_nome_cliente text, p_telefone_cliente text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_duracao int;
  v_cliente_id uuid;
  v_agendamento_id uuid;
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

  v_cliente_id := criar_ou_obter_cliente(p_barbearia_id, p_nome_cliente, p_telefone_cliente);

  begin
    insert into agendamentos (barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem)
    values (
      p_barbearia_id, p_membro_id, v_cliente_id, p_servico_id, p_data, p_hora_inicio,
      p_hora_inicio + (v_duracao || ' minutes')::interval, 'confirmado', 'publico'
    )
    returning id into v_agendamento_id;
  exception when exclusion_violation then
    -- Raised by the agendamento_sem_sobreposicao GiST constraint (Task 8) —
    -- covers both an identical start time and a merely-overlapping range.
    raise exception 'Esse horário acabou de ser reservado por outra pessoa. Escolha outro horário.';
  end;

  return v_agendamento_id;
end;
$$;

grant execute on function public.criar_agendamento_publico(uuid, uuid, uuid, date, time, text, text) to anon, authenticated;
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db reset
```

- [ ] **Step 3: Write the concurrency pgTAP test**

`supabase/tests/database/0004_booking_concurrency.test.sql`:

```sql
begin;
select plan(5);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a'),
  ('22222222-2222-2222-2222-222222222222', 'Barbearia B', 'barbearia-b');
insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com');
insert into membros (id, barbearia_id, user_id, papel, nome) values
  ('m0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João');
insert into servicos (id, barbearia_id, nome, duracao_minutos, preco) values
  ('s0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Corte', 40, 60),
  ('s0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Corte + Barba', 60, 90);
insert into horarios_trabalho (membro_id, dia_semana, hora_inicio, hora_fim) values
  ('m0000000-0000-0000-0000-000000000001', extract(dow from current_date + 1)::int, '09:00', '18:00');

set local role anon;

-- First booking for tomorrow at 09:00 succeeds.
select lives_ok(
  $$ select criar_agendamento_publico('11111111-1111-1111-1111-111111111111', 'm0000000-0000-0000-0000-000000000001', 's0000000-0000-0000-0000-000000000001', current_date + 1, '09:00', 'Cliente 1', '11900000001') $$,
  'first booking for the slot succeeds'
);

-- Second booking for the exact same slot must fail (this is the no-overbooking guarantee).
select throws_ok(
  $$ select criar_agendamento_publico('11111111-1111-1111-1111-111111111111', 'm0000000-0000-0000-0000-000000000001', 's0000000-0000-0000-0000-000000000001', current_date + 1, '09:00', 'Cliente 2', '11900000002') $$,
  'Esse horário acabou de ser reservado por outra pessoa. Escolha outro horário.',
  'second booking for the same slot is rejected'
);

-- A booking that starts at a different time but overlaps the first (09:00-09:40)
-- must also be rejected — proves the guarantee is a real interval overlap check,
-- not just a same-start-time unique index.
select throws_ok(
  $$ select criar_agendamento_publico('11111111-1111-1111-1111-111111111111', 'm0000000-0000-0000-0000-000000000001', 's0000000-0000-0000-0000-000000000002', current_date + 1, '09:20', 'Cliente 3', '11900000003') $$,
  'Esse horário acabou de ser reservado por outra pessoa. Escolha outro horário.',
  'an overlapping booking with a different start time and duration is also rejected'
);

select is(
  (select count(*)::int from agendamentos where membro_id = 'm0000000-0000-0000-0000-000000000001' and status <> 'cancelado'),
  1,
  'only one confirmed appointment exists for that slot'
);

-- Cross-tenant membro_id: passing Barbearia B's id with João's (Barbearia A) membro_id must be rejected.
select throws_ok(
  $$ select criar_agendamento_publico('22222222-2222-2222-2222-222222222222', 'm0000000-0000-0000-0000-000000000001', 's0000000-0000-0000-0000-000000000001', current_date + 1, '11:00', 'Cliente 4', '11900000004') $$,
  'Barbeiro inválido para esta barbearia',
  'a membro_id belonging to a different barbearia than p_barbearia_id is rejected'
);

select * from finish();
rollback;
```

- [ ] **Step 4: Run tests**

```bash
npx supabase test db
```

Expected: all 5 assertions pass — this is the automated proof of the spec's "sem overbooking" requirement, including the overlapping-different-duration case and cross-tenant membro_id rejection.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_agenda_rpcs.sql supabase/tests/database/0004_booking_concurrency.test.sql
git commit -m "feat: add booking availability and public booking RPCs with concurrency test"
```

### Task 10: Public booking page UI

**Files:**
- Create: `src/app/[barbeariaSlug]/page.tsx`
- Create: `src/components/public-booking-flow.tsx`

**Interfaces:**
- Consumes: `horarios_disponiveis`, `criar_agendamento_publico`, `reconhecer_cliente` RPCs (Tasks 9, 12).

- [ ] **Step 1: Write the server page that resolves the slug and lists services/barbeiros**

`src/app/[barbeariaSlug]/page.tsx`:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PublicBookingFlow } from '@/components/public-booking-flow'

export default async function PublicBookingPage({ params }: { params: Promise<{ barbeariaSlug: string }> }) {
  const { barbeariaSlug } = await params
  const supabase = await getServerSupabaseClient()

  const { data: barbearia } = await supabase.from('barbearias').select('id, nome').eq('slug', barbeariaSlug).single()
  if (!barbearia) notFound()

  const { data: servicos } = await supabase.from('servicos').select('*').eq('barbearia_id', barbearia.id).eq('ativo', true)
  const { data: barbeiros } = await supabase.from('membros').select('id, nome').eq('barbearia_id', barbearia.id).eq('papel', 'barbeiro').eq('ativo', true)

  return <PublicBookingFlow barbearia={barbearia} servicos={servicos ?? []} barbeiros={barbeiros ?? []} />
}
```

- [ ] **Step 2: Write the client-side booking flow component**

`src/components/public-booking-flow.tsx`:

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
  const [reconhecimento, setReconhecimento] = useState<string | null>(null)
  const [confirmado, setConfirmado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function carregarHorarios(s: Servico, b: Barbeiro) {
    setServico(s)
    setBarbeiro(b)
    const supabase = getBrowserSupabaseClient()
    const { data: slots } = await supabase.rpc('horarios_disponiveis', {
      p_barbearia_id: barbearia.id, p_membro_id: b.id, p_servico_id: s.id, p_data: data,
    })
    setHorarios(slots ?? [])
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
    })
    if (error) { setErro(error.message); return }
    setConfirmado(true)
  }

  if (confirmado) {
    return <p className="p-6">✓ Agendamento confirmado! {servico?.nome} com {barbeiro?.nome} às {horario}.</p>
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">{barbearia.nome}</h1>

      <p className="font-medium mt-4">1. Escolha o serviço</p>
      <div className="flex gap-2 flex-wrap">
        {servicos.map((s) => (
          <button key={s.id} onClick={() => barbeiro && carregarHorarios(s, barbeiro)} className="border rounded px-3 py-1">
            {s.nome} ({s.duracao_minutos}min · R${s.preco})
          </button>
        ))}
      </div>

      <p className="font-medium mt-4">2. Escolha o barbeiro</p>
      <div className="flex gap-2 flex-wrap">
        {barbeiros.map((b) => (
          <button key={b.id} onClick={() => servico && carregarHorarios(servico, b)} className="border rounded px-3 py-1">
            {b.nome}
          </button>
        ))}
      </div>

      {horarios.length > 0 && (
        <>
          <p className="font-medium mt-4">3. Escolha o horário</p>
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
          <p className="font-medium mt-4">4. Seus dados</p>
          <Input placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} className="mb-2" />
          <Input placeholder="Telefone" value={telefone} onBlur={(e) => verificarCliente(e.target.value)} onChange={(e) => setTelefone(e.target.value)} />
          {reconhecimento && <p className="text-sm text-green-700 mt-2">{reconhecimento}</p>}
          {erro && <p className="text-sm text-red-600 mt-2">{erro}</p>}
          <Button onClick={confirmar} className="w-full mt-4">Confirmar agendamento</Button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Manually verify the full public flow**

```bash
npm run dev
```

Create a barbearia, servico, membro (barbeiro), and `horarios_trabalho` row via Studio. Visit `http://localhost:3000/<slug>`, walk through all 4 steps, confirm booking succeeds and the confirmation message shows. Open the same URL in two tabs, pick the same slot in both, confirm the second one gets the "horário acabou de ser reservado" error.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[barbeariaSlug]" src/components/public-booking-flow.tsx
git commit -m "feat: add public booking page with realtime-safe slot selection"
```

### Task 11: Internal booking UI (admin/barbeiro) and bloqueio creation

**Files:**
- Create: `src/app/painel/layout.tsx`
- Create: `src/app/painel/agenda/page.tsx`
- Create: `src/components/internal-booking-form.tsx`
- Create: `src/components/bloqueio-form.tsx`

**Interfaces:**
- Consumes: `horarios_disponiveis` RPC (Task 9), `criar_ou_obter_cliente` RPC (Task 7).
- Produces: the `painel/` route guard — every later page under `src/app/painel/` (Tasks 13, 15, 17, 20) relies on this layout already redirecting unauthenticated or non-barbeiro users before the page itself runs.

- [ ] **Step 1: Write the barbeiro layout with role guard (mirrors the admin layout from Task 5)**

`src/app/painel/layout.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getServerSupabaseClient } from '@/lib/supabase/server'

export default async function BarbeiroLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membro } = await supabase
    .from('membros')
    .select('papel')
    .eq('user_id', user.id)
    .single()

  if (membro?.papel !== 'barbeiro') redirect('/')

  return <div className="p-6">{children}</div>
}
```

Note: every page created under `painel/` in later tasks (Tasks 13, 15, 17, 20) already wraps its own content in a `<div className="p-6">`; since this layout now also applies `p-6`, remove the duplicate wrapper `<div className="p-6">` from those pages' own JSX when implementing them, keeping only the layout's.

- [ ] **Step 2: Write the internal booking form (reuses `horarios_disponiveis`, inserts directly since caller is authenticated and RLS on `agendamentos` already scopes writes)**

`src/components/internal-booking-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function InternalBookingForm({
  barbeariaId, membroId, servicos,
}: { barbeariaId: string; membroId: string; servicos: { id: string; nome: string; duracao_minutos: number }[] }) {
  const [servicoId, setServicoId] = useState('')
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [horarios, setHorarios] = useState<{ hora_inicio: string; hora_fim: string }[]>([])
  const [horario, setHorario] = useState('')
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [mensagem, setMensagem] = useState<string | null>(null)

  async function buscarHorarios() {
    const supabase = getBrowserSupabaseClient()
    const { data: slots } = await supabase.rpc('horarios_disponiveis', { p_barbearia_id: barbeariaId, p_membro_id: membroId, p_servico_id: servicoId, p_data: data })
    setHorarios(slots ?? [])
  }

  async function agendar() {
    const supabase = getBrowserSupabaseClient()
    const clienteId = await supabase.rpc('criar_ou_obter_cliente', { p_barbearia_id: barbeariaId, p_nome: nome, p_telefone: telefone })
    if (clienteId.error) { setMensagem(clienteId.error.message); return }

    const servico = servicos.find((s) => s.id === servicoId)!
    const horaFim = new Date(`1970-01-01T${horario}`)
    horaFim.setMinutes(horaFim.getMinutes() + servico.duracao_minutos)

    const { error } = await supabase.from('agendamentos').insert({
      barbearia_id: barbeariaId, membro_id: membroId, cliente_id: clienteId.data,
      servico_id: servicoId, data, hora_inicio: horario,
      hora_fim: horaFim.toTimeString().slice(0, 8), status: 'confirmado', origem: 'interno',
    })
    setMensagem(error ? error.message : 'Agendado com sucesso!')
  }

  return (
    <div className="flex flex-col gap-2 max-w-sm">
      <select value={servicoId} onChange={(e) => setServicoId(e.target.value)} className="border rounded px-2 py-1">
        <option value="">Serviço</option>
        {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
      </select>
      <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
      <Button type="button" onClick={buscarHorarios}>Ver horários</Button>
      <select value={horario} onChange={(e) => setHorario(e.target.value)} className="border rounded px-2 py-1">
        <option value="">Horário</option>
        {horarios.map((h) => <option key={h.hora_inicio} value={h.hora_inicio}>{h.hora_inicio}</option>)}
      </select>
      <Input placeholder="Nome do cliente" value={nome} onChange={(e) => setNome(e.target.value)} />
      <Input placeholder="Telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
      <Button type="button" onClick={agendar}>Confirmar</Button>
      {mensagem && <p className="text-sm">{mensagem}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Write the bloqueio (lunch/absence) form**

`src/components/bloqueio-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function BloqueioForm({ membroId }: { membroId: string }) {
  const [data, setData] = useState('')
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFim, setHoraFim] = useState('')
  const [motivo, setMotivo] = useState('')

  async function salvar() {
    const supabase = getBrowserSupabaseClient()
    await supabase.from('bloqueios_agenda').insert({ membro_id: membroId, data, hora_inicio: horaInicio, hora_fim: horaFim, motivo })
  }

  return (
    <div className="flex gap-2 items-end">
      <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
      <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
      <Input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
      <Input placeholder="Motivo (almoço, ausência...)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      <Button type="button" onClick={salvar}>Bloquear</Button>
    </div>
  )
}
```

- [ ] **Step 4: Wire both into the barbeiro agenda page**

`src/app/painel/agenda/page.tsx`:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { InternalBookingForm } from '@/components/internal-booking-form'
import { BloqueioForm } from '@/components/bloqueio-form'

export default async function AgendaPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()
  const { data: servicos } = await supabase.from('servicos').select('id, nome, duracao_minutos').eq('barbearia_id', membro!.barbearia_id)

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Agenda</h1>
      <InternalBookingForm barbeariaId={membro!.barbearia_id} membroId={membro!.id} servicos={servicos ?? []} />
      <h2 className="text-lg font-medium mt-8 mb-2">Bloquear horário</h2>
      <BloqueioForm membroId={membro!.id} />
    </div>
  )
}
```

- [ ] **Step 5: Manually verify**

Log in as a barbeiro, visit `/agenda`, create a bloqueio for lunch, confirm a subsequent `horarios_disponiveis` call (via the booking form) excludes that window. Book an internal appointment and confirm it appears via Studio.

- [ ] **Step 6: Commit**

```bash
git add "src/app/painel" src/components/internal-booking-form.tsx src/components/bloqueio-form.tsx
git commit -m "feat: add barbeiro route guard, internal booking, and agenda blocking UI"
```

---

## Phase G — Lançamentos (Faturamento + Comissão)

### Task 12: `atendimentos` / `vendas_produtos` schema, commission + stock triggers, RLS

**Files:**
- Create: `supabase/migrations/0007_lancamentos.sql`
- Modify: `supabase/tests/database/0003_lancamentos.test.sql` (append trigger assertions)

**Interfaces:**
- Consumes: `planos_carreira` (Task 6), `membros.plano_carreira_id`.
- Produces: `atendimentos`, `vendas_produtos` tables with `preco`/`preco_unitario`, `comissao_percentual_aplicado`, and `comissao_valor` all auto-populated (and any client-supplied `preco`/`preco_unitario` overwritten) by the `BEFORE INSERT` triggers. `public.reconhecer_cliente(...)` (moved here from Task 7 to resolve the forward reference to `atendimentos`; also normalizes phone input).

- [ ] **Step 1: Write the migration**

`supabase/migrations/0007_lancamentos.sql`:

```sql
create table atendimentos (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  membro_id uuid not null references membros(id),
  cliente_id uuid not null references clientes(id),
  servico_id uuid not null references servicos(id),
  preco numeric(10,2) not null,
  comissao_percentual_aplicado numeric(5,2),
  comissao_valor numeric(10,2),
  data date not null default current_date,
  agendamento_id uuid references agendamentos(id),
  criado_em timestamptz not null default now()
);

create table vendas_produtos (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  membro_id uuid not null references membros(id),
  cliente_id uuid not null references clientes(id),
  produto_id uuid not null references produtos(id),
  quantidade int not null check (quantidade > 0),
  preco_unitario numeric(10,2) not null,
  comissao_percentual_aplicado numeric(5,2),
  comissao_valor numeric(10,2),
  data date not null default current_date,
  criado_em timestamptz not null default now()
);

create or replace function public.aplicar_comissao_atendimento()
returns trigger language plpgsql as $$
declare
  v_percentual numeric;
  v_preco numeric;
begin
  -- Price is looked up server-side and overwrites whatever the client sent —
  -- an INSERT into this table only ever comes from an authenticated barbeiro
  -- (RLS insert policy), and a client-supplied preco could otherwise be used
  -- to inflate or deflate that barbeiro's own commission.
  select preco into v_preco from servicos where id = new.servico_id and barbearia_id = new.barbearia_id;
  if v_preco is null then
    raise exception 'Serviço inválido para esta barbearia';
  end if;
  new.preco := v_preco;

  select pc.percentual_servico into v_percentual
  from membros m join planos_carreira pc on pc.id = m.plano_carreira_id
  where m.id = new.membro_id;

  new.comissao_percentual_aplicado := coalesce(v_percentual, 0);
  new.comissao_valor := round(new.preco * coalesce(v_percentual, 0) / 100, 2);
  return new;
end;
$$;

create trigger trg_comissao_atendimento
  before insert on atendimentos
  for each row execute function public.aplicar_comissao_atendimento();

create or replace function public.processar_venda_produto()
returns trigger language plpgsql as $$
declare
  v_percentual numeric;
  v_estoque int;
  v_preco numeric;
begin
  select quantidade_estoque, preco_venda into v_estoque, v_preco
  from produtos where id = new.produto_id and barbearia_id = new.barbearia_id for update;
  if v_estoque is null then
    raise exception 'Produto inválido para esta barbearia';
  end if;
  if v_estoque < new.quantidade then
    raise exception 'Estoque insuficiente para este produto';
  end if;

  update produtos set quantidade_estoque = quantidade_estoque - new.quantidade where id = new.produto_id;

  -- Same reasoning as aplicar_comissao_atendimento(): preco_unitario is
  -- looked up server-side, never trusted from the client insert.
  new.preco_unitario := v_preco;

  select pc.percentual_produto into v_percentual
  from membros m join planos_carreira pc on pc.id = m.plano_carreira_id
  where m.id = new.membro_id;

  new.comissao_percentual_aplicado := coalesce(v_percentual, 0);
  new.comissao_valor := round(new.preco_unitario * new.quantidade * coalesce(v_percentual, 0) / 100, 2);
  return new;
end;
$$;

create trigger trg_venda_produto
  before insert on vendas_produtos
  for each row execute function public.processar_venda_produto();

alter table atendimentos enable row level security;
alter table vendas_produtos enable row level security;

create policy "admin le atendimentos da barbearia" on atendimentos for select
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
create policy "barbeiro le proprios atendimentos" on atendimentos for select
  using (membro_id = auth_membro_id());
create policy "barbeiro insere proprios atendimentos" on atendimentos for insert
  with check (membro_id = auth_membro_id() and barbearia_id = auth_barbearia_id());
create policy "admin edita atendimentos" on atendimentos for update
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
create policy "admin remove atendimentos" on atendimentos for delete
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');

create policy "admin le vendas_produtos da barbearia" on vendas_produtos for select
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
create policy "barbeiro le proprias vendas_produtos" on vendas_produtos for select
  using (membro_id = auth_membro_id());
create policy "barbeiro insere proprias vendas_produtos" on vendas_produtos for insert
  with check (membro_id = auth_membro_id() and barbearia_id = auth_barbearia_id());
create policy "admin edita vendas_produtos" on vendas_produtos for update
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
create policy "admin remove vendas_produtos" on vendas_produtos for delete
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');

-- Moved here (from Task 7) because it queries atendimentos, which must exist first.
create or replace function public.reconhecer_cliente(
  p_barbearia_id uuid, p_telefone text
) returns table(cliente_id uuid, nome text, total_cortes int)
language sql security definer set search_path = public as $$
  select
    c.id,
    c.nome,
    (select count(*)::int from atendimentos a where a.cliente_id = c.id) as total_cortes
  from clientes c
  where c.barbearia_id = p_barbearia_id and c.telefone = regexp_replace(p_telefone, '\D', '', 'g');
$$;

grant execute on function public.reconhecer_cliente(uuid, text) to anon, authenticated;
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db reset
```

- [ ] **Step 3: Append trigger and RLS assertions to the pgTAP suite**

Append to `supabase/tests/database/0003_lancamentos.test.sql` (bump `select plan(2)` to `select plan(6)` and add before `select * from finish();`):

```sql
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'admin@example.com');

insert into planos_carreira (id, barbearia_id, nome, percentual_produto, percentual_servico) values
  ('pc000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Sênior', 10, 30);

insert into membros (id, barbearia_id, user_id, papel, nome, plano_carreira_id) values
  ('m0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João', 'pc000000-0000-0000-0000-000000000001'),
  ('m0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000002', 'admin', 'Admin');

insert into servicos (id, barbearia_id, nome, duracao_minutos, preco) values
  ('s0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Corte', 40, 60);

insert into clientes (id, barbearia_id, nome, telefone) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Marcos', '11900000009');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

-- Deliberately send a bogus preco (999999) — the trigger must ignore it and
-- overwrite with the real servico price, proving commission can't be
-- inflated/deflated by a client sending a fabricated preco on insert.
insert into atendimentos (barbearia_id, membro_id, cliente_id, servico_id, preco) values
  ('11111111-1111-1111-1111-111111111111', 'm0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 's0000000-0000-0000-0000-000000000001', 999999);

select is(
  (select preco from atendimentos order by criado_em desc limit 1),
  60.00,
  'client-supplied preco (999999) is ignored — trigger overwrites it with the real servico price'
);

select is(
  (select comissao_valor from atendimentos order by criado_em desc limit 1),
  18.00,
  'commission is frozen at 30% of the real R$60 price (not the bogus 999999) for a Sênior plano'
);

-- Admin can edit an existing atendimento.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);

update atendimentos set preco = 65 where membro_id = 'm0000000-0000-0000-0000-000000000001';

select is(
  (select preco from atendimentos where membro_id = 'm0000000-0000-0000-0000-000000000001'),
  65.00,
  'admin can edit an existing atendimento'
);

-- Barbeiro cannot edit their own atendimento (no UPDATE policy grants this to barbeiro,
-- so the RLS-filtered UPDATE matches zero rows and silently no-ops rather than erroring).
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

update atendimentos set preco = 1 where membro_id = 'm0000000-0000-0000-0000-000000000001';

select is(
  (select preco from atendimentos where membro_id = 'm0000000-0000-0000-0000-000000000001'),
  65.00,
  'barbeiro update is silently blocked by RLS — preco is unchanged'
);
```

- [ ] **Step 4: Run tests**

```bash
npx supabase test db
```

Expected: all assertions pass, confirming (a) commission is computed and frozen correctly, (b) admin can edit lançamentos, (c) barbeiro cannot.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0007_lancamentos.sql supabase/tests/database/0003_lancamentos.test.sql
git commit -m "feat: add atendimentos/vendas_produtos with commission and stock triggers"
```

### Task 13: Barbeiro lançamento UI

**Files:**
- Create: `src/app/painel/lancamentos/page.tsx`
- Create: `src/components/cliente-autocomplete.tsx`
- Create: `src/components/lancamento-servico-form.tsx`
- Create: `src/components/lancamento-produto-form.tsx`

**Interfaces:**
- Consumes: `reconhecer_cliente`, `criar_ou_obter_cliente` RPCs.
- Produces: `<ClienteAutocomplete onSelect={(cliente) => void}>` reused by Task 20 (ficha do cliente link).

- [ ] **Step 1: Write the shared client-recognition input**

`src/components/cliente-autocomplete.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'

export function ClienteAutocomplete({
  barbeariaId, onResolved,
}: { barbeariaId: string; onResolved: (info: { nome: string; telefone: string; totalCortes: number }) => void }) {
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [info, setInfo] = useState<string | null>(null)

  async function verificar(tel: string) {
    setTelefone(tel)
    if (tel.length < 10) return
    const supabase = getBrowserSupabaseClient()
    const { data: rows } = await supabase.rpc('reconhecer_cliente', { p_barbearia_id: barbeariaId, p_telefone: tel })
    const encontrado = rows?.[0]
    if (encontrado) {
      setNome(encontrado.nome)
      setInfo(`${encontrado.total_cortes}º corte deste cliente aqui`)
      onResolved({ nome: encontrado.nome, telefone: tel, totalCortes: encontrado.total_cortes })
    } else {
      setInfo(null)
      onResolved({ nome, telefone: tel, totalCortes: 0 })
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Input placeholder="Nome do cliente" value={nome} onChange={(e) => { setNome(e.target.value); onResolved({ nome: e.target.value, telefone, totalCortes: 0 }) }} />
      <Input placeholder="Telefone" value={telefone} onChange={(e) => verificar(e.target.value)} />
      {info && <span className="text-xs text-muted-foreground">{info}</span>}
    </div>
  )
}
```

- [ ] **Step 2: Write the corte/serviço lançamento form**

`src/components/lancamento-servico-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { ClienteAutocomplete } from './cliente-autocomplete'
import { Button } from '@/components/ui/button'

export function LancamentoServicoForm({
  barbeariaId, membroId, servicos,
}: { barbeariaId: string; membroId: string; servicos: { id: string; nome: string; preco: number }[] }) {
  const [servicoId, setServicoId] = useState('')
  const [cliente, setCliente] = useState<{ nome: string; telefone: string } | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)

  async function lancar() {
    if (!servicoId || !cliente) return
    const supabase = getBrowserSupabaseClient()
    const clienteId = await supabase.rpc('criar_ou_obter_cliente', { p_barbearia_id: barbeariaId, p_nome: cliente.nome, p_telefone: cliente.telefone })
    if (clienteId.error) { setMensagem(clienteId.error.message); return }

    const servico = servicos.find((s) => s.id === servicoId)!
    const { error } = await supabase.from('atendimentos').insert({
      barbearia_id: barbeariaId, membro_id: membroId, cliente_id: clienteId.data,
      servico_id: servicoId, preco: servico.preco,
    })
    setMensagem(error ? error.message : 'Lançado com sucesso!')
  }

  return (
    <div className="flex flex-col gap-2 max-w-sm border rounded p-4">
      <h3 className="font-medium">+ Corte / serviço</h3>
      <select value={servicoId} onChange={(e) => setServicoId(e.target.value)} className="border rounded px-2 py-1">
        <option value="">Serviço</option>
        {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome} (R${s.preco})</option>)}
      </select>
      <ClienteAutocomplete barbeariaId={barbeariaId} onResolved={setCliente} />
      <Button type="button" onClick={lancar}>Salvar</Button>
      {mensagem && <p className="text-sm">{mensagem}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Write the produto lançamento form**

`src/components/lancamento-produto-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { ClienteAutocomplete } from './cliente-autocomplete'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function LancamentoProdutoForm({
  barbeariaId, membroId, produtos,
}: { barbeariaId: string; membroId: string; produtos: { id: string; nome: string; preco_venda: number; quantidade_estoque: number }[] }) {
  const [produtoId, setProdutoId] = useState('')
  const [quantidade, setQuantidade] = useState(1)
  const [cliente, setCliente] = useState<{ nome: string; telefone: string } | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)

  async function lancar() {
    if (!produtoId || !cliente) return
    const supabase = getBrowserSupabaseClient()
    const clienteId = await supabase.rpc('criar_ou_obter_cliente', { p_barbearia_id: barbeariaId, p_nome: cliente.nome, p_telefone: cliente.telefone })
    if (clienteId.error) { setMensagem(clienteId.error.message); return }

    const produto = produtos.find((p) => p.id === produtoId)!
    const { error } = await supabase.from('vendas_produtos').insert({
      barbearia_id: barbeariaId, membro_id: membroId, cliente_id: clienteId.data,
      produto_id: produtoId, quantidade, preco_unitario: produto.preco_venda,
    })
    setMensagem(error ? error.message : 'Venda lançada com sucesso!')
  }

  return (
    <div className="flex flex-col gap-2 max-w-sm border rounded p-4">
      <h3 className="font-medium">+ Venda de produto</h3>
      <select value={produtoId} onChange={(e) => setProdutoId(e.target.value)} className="border rounded px-2 py-1">
        <option value="">Produto</option>
        {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome} (estoque: {p.quantidade_estoque})</option>)}
      </select>
      <Input type="number" min={1} value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value))} />
      <ClienteAutocomplete barbeariaId={barbeariaId} onResolved={setCliente} />
      <Button type="button" onClick={lancar}>Salvar</Button>
      {mensagem && <p className="text-sm">{mensagem}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Wire both forms into the lançamentos page**

`src/app/painel/lancamentos/page.tsx`:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { LancamentoServicoForm } from '@/components/lancamento-servico-form'
import { LancamentoProdutoForm } from '@/components/lancamento-produto-form'

export default async function LancamentosPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()
  const { data: servicos } = await supabase.from('servicos').select('id, nome, preco').eq('barbearia_id', membro!.barbearia_id)
  const { data: produtos } = await supabase.from('produtos').select('id, nome, preco_venda, quantidade_estoque').eq('barbearia_id', membro!.barbearia_id)

  return (
    <div className="flex gap-4 flex-wrap">
      <LancamentoServicoForm barbeariaId={membro!.barbearia_id} membroId={membro!.id} servicos={servicos ?? []} />
      <LancamentoProdutoForm barbeariaId={membro!.barbearia_id} membroId={membro!.id} produtos={produtos ?? []} />
    </div>
  )
}
```

- [ ] **Step 5: Manually verify**

Log in as a barbeiro linked to a plano de carreira, lançar um corte and a venda de produto for an existing and a brand-new cliente (by phone), confirm both save, the stock decrements, and trying to sell more than available stock shows the "Estoque insuficiente" error.

- [ ] **Step 6: Commit**

```bash
git add "src/app/painel/lancamentos" src/components/cliente-autocomplete.tsx src/components/lancamento-servico-form.tsx src/components/lancamento-produto-form.tsx
git commit -m "feat: add barbeiro lancamento UI for servicos and produtos"
```

---

## Phase H — Barbeiro Dashboard (Comissão + Ociosidade)

### Task 14: Ociosidade calculation RPC and unit test

**Files:**
- Create: `supabase/migrations/0008_ociosidade.sql`
- Create: `tests/unit/ociosidade.test.ts`
- Create: `src/lib/ociosidade.ts`

**Interfaces:**
- Produces:
  - SQL function `public.ociosidade(p_membro_id uuid, p_data_inicio date, p_data_fim date) returns table(minutos_disponiveis int, minutos_ocupados int, faturamento_servicos numeric)`
  - TS helper `calcularOciosidade(input: { minutosDisponiveis: number; minutosOcupados: number; faturamentoServicos: number }): { percentualOcupacao: number; ganhoPorHoraOcupada: number; valorPerdidoEstimado: number }` — kept as pure TS so the dashboard math is unit-testable without spinning up Postgres.

- [ ] **Step 1: Write the SQL aggregation function**

`supabase/migrations/0008_ociosidade.sql`:

```sql
create or replace function public.ociosidade(
  p_membro_id uuid, p_data_inicio date, p_data_fim date
) returns table(minutos_disponiveis int, minutos_ocupados int, faturamento_servicos numeric)
language sql stable as $$
  with dias as (
    select generate_series(p_data_inicio, p_data_fim, interval '1 day')::date as dia
  ),
  disponivel as (
    select coalesce(sum(extract(epoch from (ht.hora_fim - ht.hora_inicio)) / 60), 0)::int as minutos
    from dias d
    join horarios_trabalho ht on ht.membro_id = p_membro_id and ht.dia_semana = extract(dow from d.dia)
  ),
  bloqueado as (
    select coalesce(sum(extract(epoch from (b.hora_fim - b.hora_inicio)) / 60), 0)::int as minutos
    from bloqueios_agenda b
    where b.membro_id = p_membro_id and b.data between p_data_inicio and p_data_fim
  ),
  ocupado as (
    select
      coalesce(sum(s.duracao_minutos), 0)::int as minutos,
      coalesce(sum(a.preco), 0)::numeric as faturamento
    from atendimentos a
    join servicos s on s.id = a.servico_id
    where a.membro_id = p_membro_id and a.data between p_data_inicio and p_data_fim
  )
  select
    greatest((select minutos from disponivel) - (select minutos from bloqueado), 0),
    (select minutos from ocupado),
    (select faturamento from ocupado);
$$;

grant execute on function public.ociosidade(uuid, date, date) to authenticated;
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db reset
```

- [ ] **Step 3: Write the pure TS calculation helper**

`src/lib/ociosidade.ts`:

```typescript
export function calcularOciosidade(input: {
  minutosDisponiveis: number
  minutosOcupados: number
  faturamentoServicos: number
}): { percentualOcupacao: number; ganhoPorHoraOcupada: number; valorPerdidoEstimado: number } {
  const { minutosDisponiveis, minutosOcupados, faturamentoServicos } = input

  if (minutosDisponiveis <= 0) {
    return { percentualOcupacao: 0, ganhoPorHoraOcupada: 0, valorPerdidoEstimado: 0 }
  }

  const percentualOcupacao = Math.min(minutosOcupados / minutosDisponiveis, 1) * 100
  const horasOcupadas = minutosOcupados / 60
  const ganhoPorHoraOcupada = horasOcupadas > 0 ? faturamentoServicos / horasOcupadas : 0
  const minutosOciosos = Math.max(minutosDisponiveis - minutosOcupados, 0)
  const valorPerdidoEstimado = (minutosOciosos / 60) * ganhoPorHoraOcupada

  return {
    percentualOcupacao: Math.round(percentualOcupacao * 10) / 10,
    ganhoPorHoraOcupada: Math.round(ganhoPorHoraOcupada * 100) / 100,
    valorPerdidoEstimado: Math.round(valorPerdidoEstimado * 100) / 100,
  }
}
```

- [ ] **Step 4: Write the failing unit test first**

`tests/unit/ociosidade.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { calcularOciosidade } from '@/lib/ociosidade'

describe('calcularOciosidade', () => {
  it('calculates occupancy, hourly earnings, and estimated lost revenue', () => {
    const result = calcularOciosidade({
      minutosDisponiveis: 480, // 8h
      minutosOcupados: 336,    // 5h36 = 70%
      faturamentoServicos: 420,
    })
    expect(result.percentualOcupacao).toBe(70)
    expect(result.ganhoPorHoraOcupada).toBe(75)
    expect(result.valorPerdidoEstimado).toBe(180) // 2.4h ociosas * R$75/h
  })

  it('returns zeros when there is no available time', () => {
    const result = calcularOciosidade({ minutosDisponiveis: 0, minutosOcupados: 0, faturamentoServicos: 0 })
    expect(result).toEqual({ percentualOcupacao: 0, ganhoPorHoraOcupada: 0, valorPerdidoEstimado: 0 })
  })
})
```

- [ ] **Step 5: Run the test to verify it fails (before `src/lib/ociosidade.ts` existed) — since Step 3 already created it, instead run it now to verify it passes**

```bash
npm test
```

Expected: both assertions pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0008_ociosidade.sql src/lib/ociosidade.ts tests/unit/ociosidade.test.ts
git commit -m "feat: add ociosidade aggregation RPC and pure calculation helper with unit tests"
```

### Task 15: Barbeiro dashboard UI

**Files:**
- Create: `src/app/painel/page.tsx`

**Interfaces:**
- Consumes: `public.ociosidade(...)` RPC (Task 14), `calcularOciosidade(...)` (Task 14), `atendimentos`/`vendas_produtos` tables (Task 12).

- [ ] **Step 1: Write the dashboard page**

`src/app/painel/page.tsx`:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { calcularOciosidade } from '@/lib/ociosidade'

export default async function BarbeiroDashboardPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, nome').eq('user_id', user!.id).single()

  const hoje = new Date()
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10)
  const fimMes = hoje.toISOString().slice(0, 10)

  const { data: atendimentos } = await supabase
    .from('atendimentos')
    .select('preco, comissao_valor')
    .eq('membro_id', membro!.id)
    .gte('data', inicioMes)

  const { data: vendas } = await supabase
    .from('vendas_produtos')
    .select('quantidade, preco_unitario, comissao_valor')
    .eq('membro_id', membro!.id)
    .gte('data', inicioMes)

  const faturamentoServicos = (atendimentos ?? []).reduce((sum, a) => sum + Number(a.preco), 0)
  const comissaoServicos = (atendimentos ?? []).reduce((sum, a) => sum + Number(a.comissao_valor ?? 0), 0)
  const faturamentoProdutos = (vendas ?? []).reduce((sum, v) => sum + Number(v.preco_unitario) * v.quantidade, 0)
  const comissaoProdutos = (vendas ?? []).reduce((sum, v) => sum + Number(v.comissao_valor ?? 0), 0)

  const { data: ociosidadeRaw } = await supabase
    .rpc('ociosidade', { p_membro_id: membro!.id, p_data_inicio: inicioMes, p_data_fim: fimMes })
    .single()

  const ociosidade = calcularOciosidade({
    minutosDisponiveis: ociosidadeRaw?.minutos_disponiveis ?? 0,
    minutosOcupados: ociosidadeRaw?.minutos_ocupados ?? 0,
    faturamentoServicos: Number(ociosidadeRaw?.faturamento_servicos ?? 0),
  })

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Olá, {membro!.nome}</h1>

      <div className="flex gap-4 flex-wrap mb-6">
        <div className="border rounded p-4 flex-1 min-w-[160px]">
          <p className="text-xs uppercase text-muted-foreground">Faturamento do mês</p>
          <p className="text-2xl font-bold">R$ {(faturamentoServicos + faturamentoProdutos).toFixed(2)}</p>
        </div>
        <div className="border rounded p-4 flex-1 min-w-[160px]">
          <p className="text-xs uppercase text-muted-foreground">Comissão do mês</p>
          <p className="text-2xl font-bold">R$ {(comissaoServicos + comissaoProdutos).toFixed(2)}</p>
        </div>
        <div className="border rounded p-4 flex-1 min-w-[160px]">
          <p className="text-xs uppercase text-muted-foreground">Ocupação da agenda</p>
          <p className="text-2xl font-bold">{ociosidade.percentualOcupacao}%</p>
        </div>
      </div>

      <h2 className="font-medium mb-2">Ganhos por categoria</h2>
      <p>Cortes e serviços: R$ {faturamentoServicos.toFixed(2)} → comissão R$ {comissaoServicos.toFixed(2)}</p>
      <p>Produtos: R$ {faturamentoProdutos.toFixed(2)} → comissão R$ {comissaoProdutos.toFixed(2)}</p>

      <h2 className="font-medium mt-6 mb-2">Tempo de cadeira (mês)</h2>
      <div className="w-full bg-muted rounded h-6 overflow-hidden flex">
        <div className="bg-green-600 flex items-center justify-center text-white text-xs" style={{ width: `${ociosidade.percentualOcupacao}%` }}>
          Ocupado {ociosidade.percentualOcupacao}%
        </div>
      </div>
      <div className="flex gap-4 mt-2">
        <p>Ganho médio por hora ocupada: <strong>R$ {ociosidade.ganhoPorHoraOcupada.toFixed(2)}</strong></p>
        <p className="text-red-600">Estimativa perdida no mês: <strong>R$ {ociosidade.valorPerdidoEstimado.toFixed(2)}</strong></p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Manually verify**

Log in as a barbeiro with a few atendimentos/vendas lançadas this month, visit `/`, confirm the cards, category breakdown, and occupancy bar all show numbers consistent with what was lançado (cross-check against Supabase Studio).

- [ ] **Step 3: Commit**

```bash
git add "src/app/painel/page.tsx"
git commit -m "feat: add barbeiro dashboard with real-time commission and ociosidade"
```

---

## Phase I — Prospecção

### Task 16: `prospeccoes` schema and RLS

**Files:**
- Create: `supabase/migrations/0009_prospeccao.sql`
- Create: `supabase/tests/database/0005_prospeccao_isolation.test.sql`

**Interfaces:**
- Consumes: `membros.meta_prospeccao_dia` (Task 6), `criar_ou_obter_cliente` (Task 7).
- Produces: `prospeccoes` table.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0009_prospeccao.sql`:

```sql
create table prospeccoes (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  membro_id uuid not null references membros(id),
  data date not null default current_date,
  canal text check (canal in ('whatsapp', 'indicacao', 'rua', 'redes_sociais', 'outro')),
  oferta_corte_gratis boolean not null default false,
  status text not null default 'contactado' check (status in ('contactado', 'convertido')),
  cliente_id uuid references clientes(id),
  convertido_em timestamptz,
  criado_em timestamptz not null default now()
);

alter table prospeccoes enable row level security;

create policy "admin le prospeccoes da barbearia" on prospeccoes for select
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
create policy "barbeiro le proprias prospeccoes" on prospeccoes for select
  using (membro_id = auth_membro_id());
create policy "barbeiro insere proprias prospeccoes" on prospeccoes for insert
  with check (membro_id = auth_membro_id() and barbearia_id = auth_barbearia_id());
create policy "barbeiro atualiza proprias prospeccoes" on prospeccoes for update
  using (membro_id = auth_membro_id())
  with check (membro_id = auth_membro_id());
create policy "admin gerencia todas prospeccoes" on prospeccoes for all
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin')
  with check (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db reset
```

- [ ] **Step 3: Write the isolation pgTAP test**

`supabase/tests/database/0005_prospeccao_isolation.test.sql`:

```sql
begin;
select plan(2);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a'),
  ('22222222-2222-2222-2222-222222222222', 'Barbearia B', 'barbearia-b');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'pedro@example.com');

insert into membros (id, barbearia_id, user_id, papel, nome) values
  ('m0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João'),
  ('m0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000002', 'barbeiro', 'Pedro');

insert into prospeccoes (barbearia_id, membro_id, canal) values
  ('11111111-1111-1111-1111-111111111111', 'm0000000-0000-0000-0000-000000000001', 'whatsapp'),
  ('22222222-2222-2222-2222-222222222222', 'm0000000-0000-0000-0000-000000000002', 'rua');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

select is(
  (select count(*)::int from prospeccoes),
  1,
  'barbeiro João only sees his own prospeccoes, not Pedro''s from another barbearia'
);

select is(
  (select canal from prospeccoes limit 1),
  'whatsapp',
  'the visible row is Joao''s own'
);

select * from finish();
rollback;
```

- [ ] **Step 4: Run tests**

```bash
npx supabase test db
```

Expected: both assertions pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0009_prospeccao.sql supabase/tests/database/0005_prospeccao_isolation.test.sql
git commit -m "feat: add prospeccoes schema with per-barbeiro isolation"
```

### Task 17: Prospecção UI

**Files:**
- Create: `src/app/painel/prospeccao/page.tsx`
- Create: `src/components/prospeccao-converter-form.tsx`

**Interfaces:**
- Consumes: `prospeccoes` table (Task 16), `criar_ou_obter_cliente` RPC (Task 7).

- [ ] **Step 1: Write the converter form (marks a pending prospecção as converted, linking a cliente)**

`src/components/prospeccao-converter-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function ProspeccaoConverterForm({ barbeariaId, prospeccaoId }: { barbeariaId: string; prospeccaoId: string }) {
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')

  async function converter() {
    const supabase = getBrowserSupabaseClient()
    const clienteId = await supabase.rpc('criar_ou_obter_cliente', { p_barbearia_id: barbeariaId, p_nome: nome, p_telefone: telefone })
    if (clienteId.error) return
    await supabase.from('prospeccoes').update({ status: 'convertido', cliente_id: clienteId.data, convertido_em: new Date().toISOString() }).eq('id', prospeccaoId)
    window.location.reload()
  }

  if (!aberto) return <Button type="button" onClick={() => setAberto(true)}>Converteu</Button>

  return (
    <div className="flex gap-2 items-center">
      <Input placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} className="w-32" />
      <Input placeholder="Telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} className="w-32" />
      <Button type="button" onClick={converter}>Confirmar</Button>
    </div>
  )
}
```

- [ ] **Step 2: Write the prospecção page**

`src/app/painel/prospeccao/page.tsx`:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { ProspeccaoConverterForm } from '@/components/prospeccao-converter-form'

async function novoContato(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('prospeccoes').insert({
    barbearia_id: membro!.barbearia_id,
    membro_id: membro!.id,
    canal: (formData.get('canal') as string) || null,
    oferta_corte_gratis: formData.get('oferta_corte_gratis') === 'on',
  })
}

export default async function ProspeccaoPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id, meta_prospeccao_dia').eq('user_id', user!.id).single()

  const hoje = new Date().toISOString().slice(0, 10)
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

  const { data: contatosHoje } = await supabase.from('prospeccoes').select('id').eq('membro_id', membro!.id).eq('data', hoje)
  const { data: convertidosHoje } = await supabase.from('prospeccoes').select('id').eq('membro_id', membro!.id).gte('convertido_em', `${hoje}T00:00:00`)
  const { data: pendentes } = await supabase.from('prospeccoes').select('*').eq('membro_id', membro!.id).eq('status', 'contactado').order('criado_em')
  const { data: contatosMes } = await supabase.from('prospeccoes').select('status').eq('membro_id', membro!.id).gte('data', inicioMes)

  const totalContatosHoje = contatosHoje?.length ?? 0
  const meta = membro!.meta_prospeccao_dia ?? 0
  const totalMes = contatosMes?.length ?? 0
  const convertidosMes = contatosMes?.filter((c) => c.status === 'convertido').length ?? 0
  const taxaMes = totalMes > 0 ? Math.round((convertidosMes / totalMes) * 100) : 0

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Prospecção</h1>

      {meta > 0 && (
        <>
          <p className="text-sm mb-1">Meta diária de contatos</p>
          <div className="w-full bg-muted rounded h-6 overflow-hidden">
            <div className="bg-green-600 h-full text-white text-xs flex items-center justify-center" style={{ width: `${Math.min((totalContatosHoje / meta) * 100, 100)}%` }}>
              {totalContatosHoje} / {meta}
            </div>
          </div>
        </>
      )}

      <form action={novoContato} className="flex gap-2 items-center mt-4">
        <select name="canal" className="border rounded px-2 py-1">
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
        <button type="submit" className="border rounded px-3 py-1">+ Novo contato prospectado</button>
      </form>

      <h2 className="font-medium mt-6 mb-2">Pendentes de conversão ({pendentes?.length ?? 0})</h2>
      {pendentes?.map((p) => (
        <div key={p.id} className="flex justify-between items-center border-b py-2">
          <span>{p.canal ?? 'sem canal'} {p.oferta_corte_gratis && '· corte grátis'} · {new Date(p.criado_em).toLocaleDateString()}</span>
          <ProspeccaoConverterForm barbeariaId={membro!.barbearia_id} prospeccaoId={p.id} />
        </div>
      ))}

      <h2 className="font-medium mt-6 mb-2">Conversão</h2>
      <p>Convertidos hoje: {convertidosHoje?.length ?? 0}</p>
      <p>Taxa dos contatos deste mês: {taxaMes}% (contatos recentes ainda podem converter)</p>
    </div>
  )
}
```

- [ ] **Step 3: Manually verify**

Set a `meta_prospeccao_dia` for a barbeiro via `/barbeiros`, log in as that barbeiro, add several contatos, confirm the progress bar updates, mark one "Converteu" with a new cliente, confirm it moves out of "pendentes" and the monthly conversion rate updates.

- [ ] **Step 4: Commit**

```bash
git add "src/app/painel/prospeccao" src/components/prospeccao-converter-form.tsx
git commit -m "feat: add prospeccao UI with daily goal and lagged conversion tracking"
```

---

## Phase J — Admin Dashboard

### Task 18: Admin overview dashboard

**Files:**
- Create: `src/app/admin/page.tsx`

**Interfaces:**
- Consumes: `atendimentos`, `vendas_produtos`, `produtos`, `membros` tables (admin RLS grants full-barbearia visibility, already in place from Tasks 4, 6, 12).

- [ ] **Step 1: Write the admin overview page**

`src/app/admin/page.tsx`:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { calcularOciosidade } from '@/lib/ociosidade'

export default async function AdminOverviewPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const hoje = new Date().toISOString().slice(0, 10)

  const { data: atendimentos } = await supabase.from('atendimentos').select('membro_id, preco, comissao_valor').eq('barbearia_id', membro!.barbearia_id).gte('data', inicioMes)
  const { data: vendas } = await supabase.from('vendas_produtos').select('membro_id, quantidade, preco_unitario, comissao_valor').eq('barbearia_id', membro!.barbearia_id).gte('data', inicioMes)
  const { data: produtosBaixos } = await supabase.from('produtos').select('id').eq('barbearia_id', membro!.barbearia_id).filter('quantidade_estoque', 'lte', 'estoque_minimo')
  const { data: barbeiros } = await supabase.from('membros').select('id, nome, plano_carreira_id').eq('barbearia_id', membro!.barbearia_id).eq('papel', 'barbeiro')

  const faturamentoTotal =
    (atendimentos ?? []).reduce((sum, a) => sum + Number(a.preco), 0) +
    (vendas ?? []).reduce((sum, v) => sum + Number(v.preco_unitario) * v.quantidade, 0)
  const comissaoTotal =
    (atendimentos ?? []).reduce((sum, a) => sum + Number(a.comissao_valor ?? 0), 0) +
    (vendas ?? []).reduce((sum, v) => sum + Number(v.comissao_valor ?? 0), 0)

  const linhas = await Promise.all(
    (barbeiros ?? []).map(async (b) => {
      const atendimentosB = (atendimentos ?? []).filter((a) => a.membro_id === b.id)
      const vendasB = (vendas ?? []).filter((v) => v.membro_id === b.id)
      const faturamentoB = atendimentosB.reduce((s, a) => s + Number(a.preco), 0) + vendasB.reduce((s, v) => s + Number(v.preco_unitario) * v.quantidade, 0)
      const comissaoB = atendimentosB.reduce((s, a) => s + Number(a.comissao_valor ?? 0), 0) + vendasB.reduce((s, v) => s + Number(v.comissao_valor ?? 0), 0)

      const { data: ociosidadeRaw } = await supabase.rpc('ociosidade', { p_membro_id: b.id, p_data_inicio: inicioMes, p_data_fim: hoje }).single()
      const ocupacao = calcularOciosidade({
        minutosDisponiveis: ociosidadeRaw?.minutos_disponiveis ?? 0,
        minutosOcupados: ociosidadeRaw?.minutos_ocupados ?? 0,
        faturamentoServicos: Number(ociosidadeRaw?.faturamento_servicos ?? 0),
      }).percentualOcupacao

      return { nome: b.nome, faturamentoB, comissaoB, ocupacao }
    })
  )

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Visão geral</h1>
      <div className="flex gap-4 flex-wrap mb-6">
        <div className="border rounded p-4 flex-1 min-w-[160px]">
          <p className="text-xs uppercase text-muted-foreground">Faturamento do mês (todos)</p>
          <p className="text-2xl font-bold">R$ {faturamentoTotal.toFixed(2)}</p>
        </div>
        <div className="border rounded p-4 flex-1 min-w-[160px]">
          <p className="text-xs uppercase text-muted-foreground">Comissões acumuladas no mês</p>
          <p className="text-2xl font-bold">R$ {comissaoTotal.toFixed(2)}</p>
        </div>
        <div className="border rounded p-4 flex-1 min-w-[160px] border-red-300">
          <p className="text-xs uppercase text-muted-foreground">Produtos com estoque baixo</p>
          <p className="text-2xl font-bold text-red-600">{produtosBaixos?.length ?? 0} itens</p>
        </div>
      </div>

      <h2 className="font-medium mb-2">Barbeiros</h2>
      <table className="w-full text-left">
        <thead><tr><th>Nome</th><th>Faturamento mês</th><th>Comissão mês</th><th>Ocupação</th></tr></thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.nome}><td>{l.nome}</td><td>R$ {l.faturamentoB.toFixed(2)}</td><td>R$ {l.comissaoB.toFixed(2)}</td><td>{l.ocupacao}%</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Manually verify**

Log in as admin with lançamentos from more than one barbeiro this month, visit `/`, confirm totals match the sum of individual barbeiro dashboards, and a product below `estoque_minimo` shows in the count.

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/page.tsx"
git commit -m "feat: add admin overview dashboard with per-barbeiro comparison table"
```

---

## Phase K — Ficha do Cliente

### Task 19: Ficha do cliente ranking RPC

**Files:**
- Create: `supabase/migrations/0010_ficha_cliente.sql`

**Interfaces:**
- Produces: `public.ranking_cliente(p_cliente_id uuid) returns table(item text, tipo text, quantidade int, valor_total numeric)`. **Deliberately `SECURITY INVOKER` (the default)** — it relies on the caller's existing RLS on `atendimentos`/`vendas_produtos` to auto-scope results (barbeiro sees only their own interactions with the client; admin sees all), so no extra access-control logic is needed here.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0010_ficha_cliente.sql`:

```sql
create or replace function public.ranking_cliente(p_cliente_id uuid)
returns table(item text, tipo text, quantidade int, valor_total numeric)
language sql stable as $$
  select s.nome as item, 'servico' as tipo, count(*)::int as quantidade, sum(a.preco) as valor_total
  from atendimentos a
  join servicos s on s.id = a.servico_id
  where a.cliente_id = p_cliente_id
  group by s.nome

  union all

  select p.nome as item, 'produto' as tipo, sum(vp.quantidade)::int as quantidade, sum(vp.preco_unitario * vp.quantidade) as valor_total
  from vendas_produtos vp
  join produtos p on p.id = vp.produto_id
  where vp.cliente_id = p_cliente_id
  group by p.nome

  order by quantidade desc;
$$;

grant execute on function public.ranking_cliente(uuid) to authenticated;
```

Note: this function is `SECURITY INVOKER` by default (no `security definer` clause), so when a barbeiro calls it, the `atendimentos`/`vendas_produtos` scans inside it are filtered by the barbeiro's own RLS policies (`membro_id = auth_membro_id()`), automatically limiting the ranking to that barbeiro's own interactions with the client. When an admin calls it, admin's broader SELECT policy applies, returning the full history. No parameter or branch is needed to distinguish the two cases.

- [ ] **Step 2: Apply migration**

```bash
npx supabase db reset
```

- [ ] **Step 3: Manually verify the auto-scoping behavior**

In Supabase Studio, seed one cliente with atendimentos from two different barbeiros. Call `select * from ranking_cliente('<cliente_id>')` while impersonating each barbeiro (`set local role authenticated; select set_config('request.jwt.claim.sub', '<user_id>', true);`) and confirm each only sees their own rows, while the same call as admin returns the combined ranking.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0010_ficha_cliente.sql
git commit -m "feat: add ranking_cliente RPC that auto-scopes via caller RLS"
```

### Task 20: Ficha do cliente UI

**Files:**
- Create: `src/app/admin/clientes/[id]/page.tsx`
- Create: `src/app/painel/clientes/[id]/page.tsx`
- Create: `src/components/ficha-cliente.tsx`

**Interfaces:**
- Consumes: `ranking_cliente(...)` RPC (Task 19), `atendimentos`/`vendas_produtos` (RLS-scoped automatically).

- [ ] **Step 1: Write the shared ficha component**

`src/components/ficha-cliente.tsx`:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'

export async function FichaCliente({ clienteId }: { clienteId: string }) {
  const supabase = await getServerSupabaseClient()

  const { data: cliente } = await supabase.from('clientes').select('nome, telefone, criado_em').eq('id', clienteId).single()
  const { data: ranking } = await supabase.rpc('ranking_cliente', { p_cliente_id: clienteId })
  const { data: atendimentos } = await supabase.from('atendimentos').select('data, preco, servicos(nome)').eq('cliente_id', clienteId).order('data', { ascending: false })
  const { data: vendas } = await supabase.from('vendas_produtos').select('data, preco_unitario, quantidade, produtos(nome)').eq('cliente_id', clienteId).order('data', { ascending: false })

  const maiorQuantidade = Math.max(1, ...(ranking ?? []).map((r) => r.quantidade))

  const historico = [
    ...(atendimentos ?? []).map((a: any) => ({ data: a.data, texto: a.servicos.nome, valor: a.preco })),
    ...(vendas ?? []).map((v: any) => ({ data: v.data, texto: `${v.produtos.nome} (produto)`, valor: v.preco_unitario * v.quantidade })),
  ].sort((a, b) => (a.data < b.data ? 1 : -1))

  return (
    <div>
      <p className="font-medium">{cliente?.nome} · {cliente?.telefone}</p>
      <p className="text-xs text-muted-foreground mb-4">Cliente desde {cliente?.criado_em ? new Date(cliente.criado_em).toLocaleDateString() : ''}</p>

      <h3 className="font-medium mt-4 mb-2">Mais usados por ele</h3>
      {ranking?.map((r) => (
        <div key={`${r.tipo}-${r.item}`} className="mb-2">
          <div className="flex justify-between text-sm">
            <span>{r.item}</span>
            <span>{r.quantidade}x · <strong>R$ {Number(r.valor_total).toFixed(2)}</strong></span>
          </div>
          <div className="w-full bg-muted rounded h-2 overflow-hidden">
            <div className="bg-green-600 h-full" style={{ width: `${(r.quantidade / maiorQuantidade) * 100}%` }} />
          </div>
        </div>
      ))}

      <h3 className="font-medium mt-4 mb-2">Histórico completo</h3>
      {historico.map((h, i) => (
        <div key={i} className="flex justify-between text-sm border-b py-1">
          <span>{new Date(h.data).toLocaleDateString()} — {h.texto}</span>
          <span>R$ {Number(h.valor).toFixed(2)}</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Wire it into both admin and barbeiro routes**

`src/app/admin/clientes/[id]/page.tsx`:

```tsx
import { FichaCliente } from '@/components/ficha-cliente'

export default async function ClienteAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <FichaCliente clienteId={id} />
}
```

`src/app/painel/clientes/[id]/page.tsx`:

```tsx
import { FichaCliente } from '@/components/ficha-cliente'

export default async function ClienteBarbeiroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <FichaCliente clienteId={id} />
}
```

- [ ] **Step 3: Manually verify**

As a barbeiro, navigate to `/clientes/<id>` for a client you've served — confirm you see only your own interactions in both the ranking and histórico. As admin, visit the same client — confirm you see every barbeiro's interactions combined.

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/clientes" "src/app/painel/clientes" src/components/ficha-cliente.tsx
git commit -m "feat: add ficha do cliente UI with role-scoped history and ranking"
```

---

## Phase L — Final Cross-Cutting Verification

### Task 21: Complete RLS isolation coverage across remaining tables

**Files:**
- Modify: `supabase/tests/database/0001_tenant_isolation.test.sql`

**Interfaces:**
- Consumes: all RLS policies from Tasks 2, 4, 6–9, 12, 16.

- [ ] **Step 1: Append cross-tenant isolation assertions covering every remaining sensitive table**

Append to `supabase/tests/database/0001_tenant_isolation.test.sql` (bump `select plan(3)` to `select plan(8)`):

```sql
insert into planos_carreira (id, barbearia_id, nome, percentual_produto, percentual_servico) values
  ('pc000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Sênior', 10, 30),
  ('pc000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Sênior', 10, 30);

insert into clientes (id, barbearia_id, nome, telefone) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Cliente A', '11900000001'),
  ('c0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Cliente B', '11900000002');

insert into servicos (id, barbearia_id, nome, duracao_minutos, preco) values
  ('s0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Corte A', 40, 60),
  ('s0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Corte B', 40, 60);

-- Reuses the Admin A membro row already inserted earlier in this same file (Task 2's block).
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

select is(
  (select count(*)::int from planos_carreira),
  1,
  'admin A only sees planos_carreira from their own barbearia'
);

select is(
  (select count(*)::int from clientes),
  1,
  'admin A only sees clientes from their own barbearia'
);

select is(
  (select count(*)::int from servicos where barbearia_id <> '11111111-1111-1111-1111-111111111111'),
  0,
  'admin A cannot read another barbearia''s servicos row by id filter (RLS still applies even with an explicit filter)'
);

select is(
  (select count(*)::int from horarios_trabalho),
  0,
  'no horarios_trabalho exist yet, but the query itself must not error under RLS'
);

select is(
  (select count(*)::int from prospeccoes),
  0,
  'no prospeccoes exist yet, but the query itself must not error under RLS'
);
```

- [ ] **Step 2: Run the full pgTAP suite**

```bash
npx supabase test db
```

Expected: all assertions across every `.test.sql` file pass.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/database/0001_tenant_isolation.test.sql
git commit -m "test: extend RLS isolation coverage to planos_carreira, clientes, servicos"
```

### Task 22: Full regression pass

**Files:** none (verification-only task)

- [ ] **Step 1: Run the complete automated suite**

```bash
npx supabase test db
npm test
npm run build
```

Expected: pgTAP suite passes (isolation + concurrency + commission), Vitest suite passes (ociosidade calculation), and the Next.js production build completes with no type errors.

- [ ] **Step 2: Manual end-to-end walkthrough**

With `npm run dev` running: sign in as admin, cadastrar um plano de carreira, um serviço, um produto, vincular o plano a um barbeiro com meta de prospecção; sign in as that barbeiro, lançar um corte and a venda de produto, confirm the dashboard reflects the commission and ociosidade correctly; open the public booking link in an incognito window, complete a booking, confirm it shows up in the barbeiro's agenda; register a prospecção and convert it; open the ficha do cliente from both the admin and barbeiro side and confirm the scoping difference.

- [ ] **Step 3: Commit (only if the walkthrough surfaced fixes)**

```bash
git add -A
git commit -m "fix: address issues found during MVP end-to-end walkthrough"
```
