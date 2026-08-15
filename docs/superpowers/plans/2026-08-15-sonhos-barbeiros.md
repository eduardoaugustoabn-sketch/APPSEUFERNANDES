# Sonhos dos barbeiros Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each barbeiro register personal "sonhos" (financial goals) and reserve a % of monthly comissão toward each, with live-computed progress; the admin gets a read-only view of every barbeiro's sonhos and progress.

**Architecture:** A new `sonhos` table (RLS: barbeiro full CRUD on own rows, admin select-only) plus a `comissao_acumulada(membro_id, data_inicio)` SQL function mirroring the existing `ociosidade()` RPC pattern — progress is always computed live from accumulated comissão, never stored incrementally. A DB trigger caps the sum of active (non-concluído) sonhos' percentuals at 100 per barbeiro. Two new pages: `/painel/sonhos` (barbeiro CRUD, same row-component pattern as `BarbeiroRow`/`ServicoRow`) and `/admin/sonhos` (read-only list across barbeiros).

**Tech Stack:** Next.js 16.3 App Router, TypeScript, Supabase (Postgres/RLS via `@supabase/supabase-js` and `@supabase/ssr`), Tailwind CSS v4, shadcn/ui, pgTAP (DB tests via `npx supabase test db`).

**Spec:** `docs/superpowers/specs/2026-08-15-sonhos-barbeiros-design.md`

## Global Constraints

- Admin has **select-only** access to `sonhos` — no insert/update/delete RLS policy for admin. Every write (create, edit, delete, mark concluído) happens only through the barbeiro's own screen.
- `valor_acumulado` of a sonho is **always computed**, never stored incrementally: `min(valor_alvo, comissao_acumulada(membro_id, criado_em) × percentual_comissao / 100)`.
- The trigger enforcing "sum of active sonhos' percentuals ≤ 100 per barbeiro" only counts sonhos where `concluido = false`, and excludes the row being inserted/updated from the "others" sum it checks against.
- No `prazo`/data-limite field on sonhos — explicitly out of scope.
- No admin write access to sonhos, no aggregate/summary view on the admin page — just the per-barbeiro list, per spec's "Fora de escopo".

---

### Task 1: Migration — tabela `sonhos`, RLS, trigger de limite, função `comissao_acumulada`

**Files:**
- Create: `supabase/migrations/0018_sonhos.sql`
- Create: `supabase/tests/database/0010_sonhos_isolation.test.sql`

**Interfaces:**
- Produces: table `sonhos` (`id uuid`, `barbearia_id uuid`, `membro_id uuid`, `nome text`, `valor_alvo numeric(10,2)`, `percentual_comissao numeric(5,2)`, `concluido boolean`, `criado_em timestamptz`); function `public.comissao_acumulada(p_membro_id uuid, p_data_inicio timestamptz) returns numeric`. Task 2 and Task 3 both call this RPC and query this table directly.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0018_sonhos.sql`:

```sql
create table sonhos (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  membro_id uuid not null references membros(id),
  nome text not null,
  valor_alvo numeric(10,2) not null check (valor_alvo > 0),
  percentual_comissao numeric(5,2) not null check (percentual_comissao > 0 and percentual_comissao <= 100),
  concluido boolean not null default false,
  criado_em timestamptz not null default now()
);

alter table sonhos enable row level security;

create policy "admin le sonhos da barbearia" on sonhos for select
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
create policy "barbeiro le proprios sonhos" on sonhos for select
  using (membro_id = auth_membro_id());
create policy "barbeiro insere proprios sonhos" on sonhos for insert
  with check (membro_id = auth_membro_id() and barbearia_id = auth_barbearia_id());
create policy "barbeiro atualiza proprios sonhos" on sonhos for update
  using (membro_id = auth_membro_id());
create policy "barbeiro remove proprios sonhos" on sonhos for delete
  using (membro_id = auth_membro_id());

-- A sonho concluído (concluido = true) is excluded from both sides of this
-- sum — it no longer counts against the 100% cap, freeing its percentual
-- for a new sonho. Excluding the row being written itself (by id) is what
-- lets an UPDATE that only changes percentual_comissao on an existing row
-- re-validate correctly instead of double-counting its own old value.
create or replace function public.checar_limite_percentual_sonhos()
returns trigger language plpgsql as $$
declare
  soma_outros numeric;
begin
  if new.concluido then
    return new;
  end if;

  select coalesce(sum(percentual_comissao), 0) into soma_outros
  from sonhos
  where membro_id = new.membro_id
    and concluido = false
    and id != coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if soma_outros + new.percentual_comissao > 100 then
    raise exception 'A soma dos percentuais dos sonhos ativos nao pode ultrapassar 100';
  end if;

  return new;
end;
$$;

create trigger checar_limite_percentual_sonhos
  before insert or update on sonhos
  for each row execute function public.checar_limite_percentual_sonhos();

-- Mirrors ociosidade()'s pattern: language sql stable, no security definer
-- — RLS on atendimentos/vendas_produtos already scopes the result to what
-- the caller (barbeiro or admin) is allowed to see, so a barbeiro passing
-- another membro_id here just gets 0, never another barbeiro's data.
create or replace function public.comissao_acumulada(
  p_membro_id uuid, p_data_inicio timestamptz
) returns numeric
language sql stable as $$
  select
    coalesce((select sum(comissao_valor) from atendimentos where membro_id = p_membro_id and data >= p_data_inicio::date), 0)
    + coalesce((select sum(comissao_valor) from vendas_produtos where membro_id = p_membro_id and data >= p_data_inicio::date), 0);
$$;

grant execute on function public.comissao_acumulada(uuid, timestamptz) to authenticated;
```

- [ ] **Step 2: Apply the migration locally**

Check `npx supabase status` first to confirm the local stack is running; start it with `npx supabase start` if not.

Run: `npx supabase db reset`
Expected: all migrations (including the new `0018_sonhos`) replay from scratch with no errors — this project's established convention (see every prior plan's migration-application step) rather than `supabase migration up`, since `db reset` is also what re-seeds the DB before `supabase test db` runs.

- [ ] **Step 3: Write the pgTAP isolation + trigger + RPC tests**

Create `supabase/tests/database/0010_sonhos_isolation.test.sql`:

```sql
begin;
select plan(8);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a'),
  ('22222222-2222-2222-2222-222222222222', 'Barbearia B', 'barbearia-b');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'pedro@example.com'),
  ('cccccccc-0000-0000-0000-000000000003', 'admin@example.com');

insert into membros (id, barbearia_id, user_id, papel, nome) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João'),
  ('a1000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000002', 'barbeiro', 'Pedro'),
  ('a1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000003', 'admin', 'Admin A');

insert into sonhos (id, barbearia_id, membro_id, nome, valor_alvo, percentual_comissao) values
  ('d1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'Moto nova', 15000, 40),
  ('d1000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'a1000000-0000-0000-0000-000000000002', 'Viagem', 5000, 30);

-- barbeiro João only sees his own sonho
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

select is(
  (select count(*)::int from sonhos),
  1,
  'barbeiro João only sees his own sonho, not Pedro''s from another barbearia'
);

select is(
  (select nome from sonhos limit 1),
  'Moto nova',
  'the visible row is Joao''s own'
);

-- adding a second active sonho whose percentual would push the total over
-- 100 (40 already + 65 = 105) is rejected by the trigger
select throws_ok(
  $$ insert into sonhos (barbearia_id, membro_id, nome, valor_alvo, percentual_comissao)
     values ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'Carro', 30000, 65) $$,
  'A soma dos percentuais dos sonhos ativos nao pode ultrapassar 100',
  'a second active sonho that would push the total over 100% is rejected'
);

-- a second active sonho within the remaining budget (40 + 60 = 100) is fine
select lives_ok(
  $$ insert into sonhos (barbearia_id, membro_id, nome, valor_alvo, percentual_comissao)
     values ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'Carro', 30000, 60) $$,
  'a second active sonho that exactly fills the remaining budget to 100% is accepted'
);

-- marking the first sonho concluído frees its 40% back up
update sonhos set concluido = true where id = 'd1000000-0000-0000-0000-000000000001';

select lives_ok(
  $$ insert into sonhos (barbearia_id, membro_id, nome, valor_alvo, percentual_comissao)
     values ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'Reforma', 8000, 40) $$,
  'once the first sonho is concluido, its percentual no longer counts toward the 100% cap'
);

-- barbeiro João cannot insert a sonho for another membro_id
select throws_ok(
  $$ insert into sonhos (barbearia_id, membro_id, nome, valor_alvo, percentual_comissao)
     values ('22222222-2222-2222-2222-222222222222', 'a1000000-0000-0000-0000-000000000002', 'Fake', 100, 10) $$,
  'new row violates row-level security policy for table "sonhos"',
  'a barbeiro cannot insert a sonho for a different membro_id'
);

-- admin of barbearia A reads all sonhos of barbearia A (2 remain visible:
-- Carro at 60% and Reforma at 40%; Moto nova is concluido but still a row)
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', true);

select is(
  (select count(*)::int from sonhos),
  3,
  'admin of barbearia A sees all 3 sonhos belonging to barbearia A (including the concluido one), never Pedro''s from barbearia B'
);

-- admin cannot write — no insert policy exists for admin
select throws_ok(
  $$ insert into sonhos (barbearia_id, membro_id, nome, valor_alvo, percentual_comissao)
     values ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'Admin tentando', 100, 10) $$,
  'new row violates row-level security policy for table "sonhos"',
  'admin has no insert policy on sonhos — read-only access'
);

select * from finish();
rollback;
```

- [ ] **Step 4: Run the pgTAP tests**

Run: `npx supabase test db`
Expected: `0010_sonhos_isolation.test.sql` — all 8 assertions pass. If `checar_limite_percentual_sonhos` or the RLS policies have a bug, the corresponding `throws_ok`/`lives_ok`/`is` will fail with a clear pgTAP diagnostic — fix the migration (not the test) unless the test itself has a mistake.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0018_sonhos.sql supabase/tests/database/0010_sonhos_isolation.test.sql
git commit -m "feat: add sonhos table, RLS, 100% cap trigger, and comissao_acumulada RPC"
```

---

### Task 2: Barbeiro UI — `/painel/sonhos`, `SonhoRow`, nav item

**Files:**
- Create: `src/components/sonho-row.tsx`
- Create: `src/app/painel/sonhos/page.tsx`
- Modify: `src/app/painel/layout.tsx` (add nav item)

**Interfaces:**
- Consumes: table `sonhos` and RPC `comissao_acumulada(uuid, timestamptz)` from Task 1. `getBrowserSupabaseClient` from `@/lib/supabase/client`, `getServerSupabaseClient` from `@/lib/supabase/server` (both existing, unchanged). `Card`/`CardContent` from `@/components/ui/card`, `Input`/`Button` from `@/components/ui/input`/`@/components/ui/button` (all existing, unchanged).
- Produces: `SonhoRow({ sonho, valorAcumulado })` — a client component rendering one sonho as a `Card` with inline edit/delete. `/painel/sonhos` page renders one `SonhoRow` per sonho plus a creation form.

- [ ] **Step 1: Write `SonhoRow`**

Create `src/components/sonho-row.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type Sonho = {
  id: string
  nome: string
  valor_alvo: number
  percentual_comissao: number
  concluido: boolean
}

export function SonhoRow({ sonho, valorAcumulado }: { sonho: Sonho; valorAcumulado: number }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(sonho.nome)
  const [valorAlvo, setValorAlvo] = useState(String(sonho.valor_alvo))
  const [percentual, setPercentual] = useState(String(sonho.percentual_comissao))
  const [salvando, setSalvando] = useState(false)

  const percentualProgresso = Math.min(Math.round((valorAcumulado / sonho.valor_alvo) * 100), 100)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase
      .from('sonhos')
      .update({ nome, valor_alvo: Number(valorAlvo), percentual_comissao: Number(percentual) })
      .eq('id', sonho.id)
    setSalvando(false)
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setNome(sonho.nome)
    setValorAlvo(String(sonho.valor_alvo))
    setPercentual(String(sonho.percentual_comissao))
    setEditando(false)
  }

  async function excluir() {
    const supabase = getBrowserSupabaseClient()
    await supabase.from('sonhos').delete().eq('id', sonho.id)
    router.refresh()
  }

  if (editando) {
    return (
      <Card className="mb-4">
        <CardContent className="p-6 flex gap-2 flex-wrap items-center">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-40" />
          <Input type="number" value={valorAlvo} onChange={(e) => setValorAlvo(e.target.value)} className="w-32" placeholder="Valor-alvo" />
          <Input type="number" value={percentual} onChange={(e) => setPercentual(e.target.value)} className="w-24" placeholder="%" />
          <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
          <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mb-4">
      <CardContent className="p-6">
        <div className="flex justify-between items-center mb-2">
          <p className="font-heading text-base font-bold">
            {sonho.nome}
            {sonho.concluido && (
              <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 text-xs font-bold">
                Concluído
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">Editar</button>
            <button type="button" onClick={excluir} className="text-xs text-destructive underline">Excluir</button>
          </div>
        </div>
        <div className="w-full bg-muted rounded-full h-6 overflow-hidden mb-2">
          <div className="bg-primary h-full text-primary-foreground text-xs flex items-center justify-center" style={{ width: `${percentualProgresso}%` }}>
            {percentualProgresso}%
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          R$ {valorAcumulado.toFixed(2)} de R$ {Number(sonho.valor_alvo).toFixed(2)} · {sonho.percentual_comissao}% da comissão reservado
        </p>
      </CardContent>
    </Card>
  )
}
```

`Number(sonho.valor_alvo)` above is deliberate, not optional: this project's Supabase client returns Postgres `numeric` columns as strings (see `Number(a.preco)`/`Number(v.preco_unitario)` throughout `src/app/painel/page.tsx`), and `sonho.valor_alvo` is a raw DB value passed straight into this component's props — calling `.toFixed(2)` on it directly would throw at runtime if it comes back as a string. `valorAcumulado` doesn't need the same wrap: it's always the return value of `Math.min(...)`, which coerces to a genuine JS number.

- [ ] **Step 2: Write the page**

Create `src/app/painel/sonhos/page.tsx`:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SonhoRow } from '@/components/sonho-row'

async function criarSonho(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('sonhos').insert({
    barbearia_id: membro!.barbearia_id,
    membro_id: membro!.id,
    nome: formData.get('nome') as string,
    valor_alvo: Number(formData.get('valor_alvo')),
    percentual_comissao: Number(formData.get('percentual_comissao')),
  })
  revalidatePath('/painel/sonhos')
}

export default async function SonhosPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id').eq('user_id', user!.id).single()

  const { data: sonhos } = await supabase
    .from('sonhos')
    .select('*')
    .eq('membro_id', membro!.id)
    .order('concluido')
    .order('criado_em')

  const sonhosComProgresso = await Promise.all(
    (sonhos ?? []).map(async (sonho) => {
      const { data: comissao } = await supabase.rpc('comissao_acumulada', {
        p_membro_id: membro!.id,
        p_data_inicio: sonho.criado_em,
      })
      const valorAcumulado = Math.min(
        Number(comissao ?? 0) * (sonho.percentual_comissao / 100),
        sonho.valor_alvo
      )
      if (!sonho.concluido && valorAcumulado >= sonho.valor_alvo) {
        await supabase.from('sonhos').update({ concluido: true }).eq('id', sonho.id)
        sonho.concluido = true
      }
      return { sonho, valorAcumulado }
    })
  )

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Sonhos</h1>

      <form action={criarSonho} className="flex gap-2 mb-6 flex-wrap items-center">
        <Input name="nome" placeholder="Nome do sonho" className="w-40" required />
        <Input name="valor_alvo" type="number" step="0.01" min="0.01" placeholder="Valor-alvo" className="w-32" required />
        <Input name="percentual_comissao" type="number" step="0.01" min="0.01" max="100" placeholder="% da comissão" className="w-32" required />
        <Button type="submit">+ Novo sonho</Button>
      </form>

      {sonhosComProgresso.map(({ sonho, valorAcumulado }) => (
        <SonhoRow key={sonho.id} sonho={sonho} valorAcumulado={valorAcumulado} />
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Add the nav item**

Modify `src/app/painel/layout.tsx` — in `NAV_ITEMS`, add after Prospecção:

```tsx
const NAV_ITEMS = [
  { href: '/painel', label: 'Dashboard' },
  { href: '/painel/agenda', label: 'Agenda' },
  { href: '/painel/prospeccao', label: 'Prospecção' },
  { href: '/painel/sonhos', label: 'Sonhos' },
]
```

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: succeeds, `/painel/sonhos` appears in the route list.

- [ ] **Step 5: Commit**

```bash
git add src/components/sonho-row.tsx src/app/painel/sonhos/page.tsx src/app/painel/layout.tsx
git commit -m "feat: let barbeiro create, edit, delete sonhos and track progress"
```

---

### Task 3: Admin UI — `/admin/sonhos`, nav item

**Files:**
- Create: `src/app/admin/sonhos/page.tsx`
- Modify: `src/app/admin/layout.tsx` (add nav item)

**Interfaces:**
- Consumes: table `sonhos` and RPC `comissao_acumulada` from Task 1, same computation formula as Task 2's page (duplicated here deliberately — this page is read-only and has no shared state with the barbeiro's page to extract a helper around; keep it a plain, self-contained server component per this project's existing per-page style).

- [ ] **Step 1: Write the page**

Create `src/app/admin/sonhos/page.tsx`. This project never uses PostgREST's embedded-resource select syntax (`select('*, tabela(...)')`) anywhere — every existing page fetches related tables as separate queries and joins in TypeScript (see `src/app/painel/page.tsx`). Follow that same established pattern here: fetch active barbeiros and all sonhos as two separate queries, then join by `membro_id` in JS.

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'

export default async function AdminSonhosPage() {
  const supabase = await getServerSupabaseClient()

  const { data: barbeiros } = await supabase
    .from('membros')
    .select('id, nome')
    .eq('papel', 'barbeiro')
    .eq('ativo', true)

  const { data: sonhos } = await supabase
    .from('sonhos')
    .select('*')
    .order('criado_em')

  const nomesPorMembroId = new Map((barbeiros ?? []).map((b) => [b.id, b.nome]))

  const sonhosComProgresso = await Promise.all(
    (sonhos ?? [])
      .filter((sonho) => nomesPorMembroId.has(sonho.membro_id))
      .map(async (sonho) => {
        const { data: comissao } = await supabase.rpc('comissao_acumulada', {
          p_membro_id: sonho.membro_id,
          p_data_inicio: sonho.criado_em,
        })
        const valorAcumulado = Math.min(
          Number(comissao ?? 0) * (sonho.percentual_comissao / 100),
          sonho.valor_alvo
        )
        return { sonho, nomeBarbeiro: nomesPorMembroId.get(sonho.membro_id)!, valorAcumulado }
      })
  )

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Sonhos dos barbeiros</h1>

      {sonhosComProgresso.length === 0 && (
        <p className="text-muted-foreground">Nenhum sonho cadastrado ainda.</p>
      )}

      {sonhosComProgresso.map(({ sonho, nomeBarbeiro, valorAcumulado }) => {
        const percentualProgresso = Math.min(Math.round((valorAcumulado / sonho.valor_alvo) * 100), 100)
        const concluidoNaTela = sonho.concluido || valorAcumulado >= sonho.valor_alvo
        return (
          <Card key={sonho.id} className="mb-4">
            <CardContent className="p-6">
              <div className="flex justify-between items-center mb-2">
                <p className="font-heading text-base font-bold">
                  {nomeBarbeiro} — {sonho.nome}
                  {concluidoNaTela && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 text-xs font-bold">
                      Concluído
                    </span>
                  )}
                </p>
              </div>
              <div className="w-full bg-muted rounded-full h-6 overflow-hidden mb-2">
                <div className="bg-primary h-full text-primary-foreground text-xs flex items-center justify-center" style={{ width: `${percentualProgresso}%` }}>
                  {percentualProgresso}%
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                R$ {valorAcumulado.toFixed(2)} de R$ {Number(sonho.valor_alvo).toFixed(2)} · {sonho.percentual_comissao}% da comissão reservado
              </p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Add the nav item**

Modify `src/app/admin/layout.tsx` — in `NAV_ITEMS`, add after Prospecção:

```tsx
const NAV_ITEMS = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/servicos', label: 'Serviços' },
  { href: '/admin/produtos', label: 'Produtos' },
  { href: '/admin/planos-carreira', label: 'Planos de carreira' },
  { href: '/admin/barbeiros', label: 'Barbeiros' },
  { href: '/admin/prospeccao', label: 'Prospecção' },
  { href: '/admin/sonhos', label: 'Sonhos' },
]
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: succeeds, `/admin/sonhos` appears in the route list.

- [ ] **Step 4: Manual verification**

No browser tools available in this environment — verify by tracing the code against the brief instead of launching a browser (browser tools may be flaky or disconnected; do not spend time retrying). Confirm by reading the diff:
- The page never writes to `sonhos` — only `.select()` and the read-only `comissao_acumulada` RPC call.
- `concluidoNaTela` computes the badge from the live value even when `sonho.concluido` is still `false` in the DB (per spec: admin's view must show "concluído" correctly even if the barbeiro hasn't opened their own page since crossing the target).
- Deactivated barbeiros (`membros.ativo = false`) are filtered out of the list.

If a browser is available when this task runs, also do this by hand: as `admin@teste.com`, open `/admin/sonhos`, confirm sonhos from all active barbeiros show with correct progress bars.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/sonhos/page.tsx src/app/admin/layout.tsx
git commit -m "feat: let admin view all barbeiros' sonhos and progress (read-only)"
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
Expected: `npm test` shows all existing unit tests still passing (this plan adds no new vitest unit tests — no pure-function logic was introduced, per the spec's "Testes" section); `npm run build` succeeds with no type errors and `/painel/sonhos` + `/admin/sonhos` present; `npx supabase test db` shows all pgTAP suites passing including the new `0010_sonhos_isolation.test.sql`.

- [ ] **Step 2: Manual end-to-end walkthrough (if a browser is available)**

As a barbeiro: `/painel/sonhos` — create a sonho (nome, valor-alvo, %), confirm it appears with 0% progress. Create a second sonho whose % would push the total over 100%, confirm the page errors (expected — no dedicated error UI per this project's existing pattern for `criarBarbeiro`/`criarServico`). Create a second sonho within budget, confirm both show. Edit the first sonho's nome/valor_alvo/%, Salvar, confirm it persists. Excluir a sonho, confirm it's gone and its % is free again (create a new one using the freed %).

As admin: `/admin/sonhos` — confirm the barbeiro's sonhos show with matching progress bars.

If no browser is available, document that limitation in the ledger instead of skipping the check silently — same pattern used in the `cadastro-barbeiros` plan's Task 3.

- [ ] **Step 3: No commit for this task** — it's verification-only; if any issue surfaces, fix it as a small follow-up commit referencing which task's step regressed.
