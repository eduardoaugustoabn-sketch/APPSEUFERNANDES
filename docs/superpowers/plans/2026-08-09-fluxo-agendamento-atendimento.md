# Fluxo Agendamento → Atendimento → Faturamento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the standalone "Lançamentos" area, rework `agendamentos` into a 5-status lifecycle (agendado/confirmado/realizado/nao_compareceu/cancelado) with internal-only overbooking, and link `prospeccoes` to `agendamentos`/`atendimentos` automatically, so agendamento ≠ faturamento/comissão/atendimento-realizado everywhere in the app.

**Architecture:** Same stack as the MVP (Next.js App Router + Supabase Postgres/RLS, no generated types). Backend changes (migrations, RPCs, triggers) land first per subsystem, immediately followed by the frontend that depends on them, so the app stays green after each task. Prospecção conversion moves from a manual "Converteu" button to two `security definer` triggers on `agendamentos` that write `prospeccoes.status`, mirroring the existing `aplicar_comissao_atendimento`/`processar_venda_produto` pattern of doing privileged cross-row writes from a trigger rather than granting broader RLS.

**Tech Stack:** Next.js 16.3 (TypeScript, App Router, Turbopack), Supabase (Postgres, Auth, RLS), Tailwind CSS, shadcn/ui primitives (`Button`, `Input`), pgTAP for database tests, Vitest for pure-function unit tests.

## Global Constraints

- Design source of truth: `docs/superpowers/specs/2026-08-09-fluxo-agendamento-atendimento-design.md`. Follow it exactly; do not reintroduce the manual "Converteu" step, the standalone Lançamentos route, or table-wide overbooking blocking.
- Migration filenames must be plain sequential integers (`0011_*.sql`, `0012_*.sql`, ...) — the installed Supabase CLI silently skips any migration whose leading run isn't pure digits (a letter-suffix scheme broke this on the original MVP, see `docs/superpowers/plans/2026-08-03-barbearia-mvp.md` Task 9).
- No generated Supabase types exist in this project. Any `.rpc(...).single()` call needs an explicit cast to its known return shape, same as `src/app/painel/page.tsx`'s existing `ociosidade` cast.
- Every RLS INSERT/UPDATE policy that references a foreign key must validate that FK belongs to the caller's own `barbearia_id` (the recurring cross-tenant-FK pattern fixed repeatedly across the MVP's Tasks 4/6/8/11/12/16) — new policies in this plan must include the same `exists (select 1 from <table> t where t.id = <fk> and t.barbearia_id = auth_barbearia_id())` shape.
- Cross-table writes from a trigger (writing to a table the invoking role has no direct RLS grant for) must use `security definer set search_path = public`, matching `processar_venda_produto()`.
- Local dev stack: Docker Desktop + `npx supabase start` already running (see this session). Apply migrations with `npx supabase db reset`; run pgTAP with `npx supabase test db`; run unit tests with `npm test`; type-check/build with `npm run build`.
- Currency/price snapshots, comissão-freeze-at-insert, and stock-decrement-via-trigger are existing patterns — do not touch `aplicar_comissao_atendimento()` or `processar_venda_produto()` in this plan, they are out of scope.

---

### Task 1: `agendamentos` status rework — 5-value lifecycle, drop overbooking constraint, remarcação counter

**Files:**
- Create: `supabase/migrations/0011_agendamentos_status_rework.sql`
- Create: `supabase/tests/database/0006_agendamentos_status.test.sql`
- Modify: `src/components/agenda-dia.tsx:144` (literal rename, see Step 5)
- Modify: `src/components/lancamento-form.tsx:155` (literal rename, see Step 5)

**Interfaces:**
- Produces: `agendamentos.status` now accepts `'agendado' | 'confirmado' | 'realizado' | 'nao_compareceu' | 'cancelado'` (the old `'concluido'` value is gone, renamed to `'realizado'`). New column `agendamentos.vezes_remarcado int not null default 0`, auto-incremented by a `before update` trigger whenever `data`/`hora_inicio`/`hora_fim` changes on the same row (so no frontend code ever writes it directly). The exclusion constraint `agendamento_sem_sobreposicao` is gone — inserting an overlapping `agendamentos` row for the same `membro_id` now succeeds at the DB level for every caller (public-only blocking is added back in Task 2, inside the RPC, not the table).

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/database/0006_agendamentos_status.test.sql`:

```sql
begin;
select plan(6);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a');
insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com');
insert into membros (id, barbearia_id, user_id, papel, nome) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João');
insert into clientes (id, barbearia_id, nome, telefone) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Marcos', '11900000001');
insert into servicos (id, barbearia_id, nome, duracao_minutos, preco) values
  ('b1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Corte', 40, 60);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

select throws_ok(
  $$ insert into agendamentos (barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem)
     values ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', current_date + 1, '09:00', '09:40', 'concluido', 'interno') $$,
  'new row for relation "agendamentos" violates check constraint "agendamentos_status_check"',
  'the old status value concluido is rejected by the new check constraint'
);

select lives_ok(
  $$ insert into agendamentos (id, barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem)
     values ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', current_date + 1, '09:00', '09:40', 'nao_compareceu', 'interno') $$,
  'the new status value nao_compareceu is accepted'
);

-- Overlaps the row above (same membro_id, same date/time range) — must now
-- succeed since agendamento_sem_sobreposicao is gone.
select lives_ok(
  $$ insert into agendamentos (id, barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem)
     values ('d0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', current_date + 1, '09:00', '09:40', 'confirmado', 'interno') $$,
  'an internally-created agendamento overlapping an existing one is now allowed (no more DB-level block)'
);

select is(
  (select vezes_remarcado from agendamentos where id = 'd0000000-0000-0000-0000-000000000002'),
  0,
  'vezes_remarcado defaults to 0 on a new agendamento'
);

update agendamentos set hora_inicio = '11:00', hora_fim = '11:40' where id = 'd0000000-0000-0000-0000-000000000002';

select is(
  (select vezes_remarcado from agendamentos where id = 'd0000000-0000-0000-0000-000000000002'),
  1,
  'changing hora_inicio/hora_fim auto-increments vezes_remarcado'
);

update agendamentos set status = 'realizado' where id = 'd0000000-0000-0000-0000-000000000002';

select is(
  (select vezes_remarcado from agendamentos where id = 'd0000000-0000-0000-0000-000000000002'),
  1,
  'changing only status (not date/time) does not increment vezes_remarcado'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL on `0006_agendamentos_status.test.sql` — `agendamentos_status_check` still only allows `confirmado`/`cancelado`/`concluido`, `vezes_remarcado` column doesn't exist yet.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0011_agendamentos_status_rework.sql`:

```sql
-- Existing 'concluido' rows must be renamed before the check constraint is
-- swapped, or they'd violate the new constraint immediately.
update agendamentos set status = 'realizado' where status = 'concluido';

alter table agendamentos drop constraint agendamentos_status_check;
alter table agendamentos add constraint agendamentos_status_check
  check (status in ('agendado', 'confirmado', 'realizado', 'nao_compareceu', 'cancelado'));

alter table agendamentos add column vezes_remarcado int not null default 0;

create or replace function public.trg_conta_remarcacao()
returns trigger language plpgsql as $$
begin
  if (new.data, new.hora_inicio, new.hora_fim) is distinct from (old.data, old.hora_inicio, old.hora_fim) then
    new.vezes_remarcado := old.vezes_remarcado + 1;
  end if;
  return new;
end;
$$;

create trigger trg_agendamento_conta_remarcacao
  before update on agendamentos
  for each row execute function public.trg_conta_remarcacao();

-- Overbooking becomes an Agenda-UI decision (warn, don't block) for
-- internally-created agendamentos. A GiST exclusion constraint applies its
-- WHERE predicate symmetrically to both sides of the comparison, so it
-- can't express "check against every row, but only enforce for public
-- inserts" — the public-only no-overbooking guarantee moves into
-- criar_agendamento_publico() itself (Task 2).
alter table agendamentos drop constraint agendamento_sem_sobreposicao;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS — all 6 assertions in `0006_agendamentos_status.test.sql`, plus every pre-existing test file still green (`0001`, `0003`, `0004`, `0005`).

- [ ] **Step 5: Rename the two frontend spots that hardcode the old `'concluido'` literal**

This migration renames the value out from under the frontend — without this step the app breaks the moment the migration lands (`agenda-dia.tsx` would stop recognizing finished agendamentos, `lancamento-form.tsx` would write a status value the new constraint rejects). Both call sites get fully rewritten later (Tasks 6–10), this is just enough to keep the app working in the meantime.

In `src/components/agenda-dia.tsx:144`, change:
```tsx
            const concluido = info.agendamento.status === 'concluido'
```
to:
```tsx
            const concluido = info.agendamento.status === 'realizado'
```

In `src/components/lancamento-form.tsx:155`, change:
```tsx
      const { error } = await supabase.from('agendamentos').update({ status: 'concluido' }).eq('id', modoAgenda.agendamentoId)
```
to:
```tsx
      const { error } = await supabase.from('agendamentos').update({ status: 'realizado' }).eq('id', modoAgenda.agendamentoId)
```

- [ ] **Step 6: Type-check**

Run: `npm run build`
Expected: succeeds, no type errors (these are plain string literal changes, no type surface changed).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0011_agendamentos_status_rework.sql supabase/tests/database/0006_agendamentos_status.test.sql src/components/agenda-dia.tsx src/components/lancamento-form.tsx
git commit -m "feat: rework agendamentos into a 5-status lifecycle, drop the table-wide overbooking constraint"
```

---

### Task 2: `criar_agendamento_publico` — nasce `agendado`, bloqueio de conflito movido para a função

**Files:**
- Create: `supabase/migrations/0012_agendamento_publico_agendado.sql`
- Create: `supabase/tests/database/0007_agendamento_publico_status.test.sql`

**Interfaces:**
- Consumes: `agendamentos.vezes_remarcado`/new status constraint from Task 1 (no direct reference, but relies on the exclusion constraint being gone).
- Produces: `criar_agendamento_publico(p_barbearia_id uuid, p_membro_id uuid, p_servico_id uuid, p_data date, p_hora_inicio time, p_nome_cliente text, p_telefone_cliente text) returns uuid` — same signature as before, now inserts with `status = 'agendado'` and raises `'Esse horário acabou de ser reservado por outra pessoa. Escolha outro horário.'` via an explicit overlap query instead of catching `exclusion_violation` (that exception can no longer be raised, the constraint is gone).

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/database/0007_agendamento_publico_status.test.sql`:

```sql
begin;
select plan(3);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a');
insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com');
insert into membros (id, barbearia_id, user_id, papel, nome) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João');
insert into servicos (id, barbearia_id, nome, duracao_minutos, preco) values
  ('b1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Corte', 40, 60);
insert into horarios_trabalho (membro_id, dia_semana, hora_inicio, hora_fim) values
  ('a1000000-0000-0000-0000-000000000001', extract(dow from current_date + 1)::int, '09:00', '18:00');

set local role anon;

select lives_ok(
  $$ select criar_agendamento_publico('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', current_date + 1, '09:00', 'Cliente 1', '11900000001') $$,
  'public booking into a free slot still succeeds'
);

reset role;

select is(
  (select status from agendamentos where hora_inicio = '09:00' order by criado_em desc limit 1),
  'agendado',
  'a publicly-created agendamento starts as agendado, not confirmado'
);

set local role anon;

-- Overlapping booking for the same slot must still be rejected — the
-- guarantee moved from the dropped exclusion constraint into this function's
-- own explicit overlap check.
select throws_ok(
  $$ select criar_agendamento_publico('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', current_date + 1, '09:00', 'Cliente 2', '11900000002') $$,
  'Esse horário acabou de ser reservado por outra pessoa. Escolha outro horário.',
  'a second public booking for the same slot is still rejected'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `criar_agendamento_publico` still inserts `status = 'confirmado'`, and the second call would now succeed (not throw) since the exclusion constraint from Task 1 is already gone and no replacement check exists yet.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0012_agendamento_publico_agendado.sql`:

```sql
create or replace function public.criar_agendamento_publico(
  p_barbearia_id uuid, p_membro_id uuid, p_servico_id uuid,
  p_data date, p_hora_inicio time, p_nome_cliente text, p_telefone_cliente text
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

  -- The no-overbooking guarantee used to be a table-wide GiST exclusion
  -- constraint (agendamento_sem_sobreposicao, dropped in Task 1) so that
  -- internal bookings can overbook on purpose. The public flow still must
  -- never overbook, so the same overlap check moves here as an explicit
  -- query, same interval-overlap shape horarios_disponiveis() already uses.
  if exists (
    select 1 from agendamentos a
    where a.membro_id = p_membro_id and a.data = p_data and a.status <> 'cancelado'
      and p_hora_inicio < a.hora_fim and v_hora_fim > a.hora_inicio
  ) then
    raise exception 'Esse horário acabou de ser reservado por outra pessoa. Escolha outro horário.';
  end if;

  v_cliente_id := criar_ou_obter_cliente(p_barbearia_id, p_nome_cliente, p_telefone_cliente);

  insert into agendamentos (barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem)
  values (
    p_barbearia_id, p_membro_id, v_cliente_id, p_servico_id, p_data, p_hora_inicio, v_hora_fim, 'agendado', 'publico'
  )
  returning id into v_agendamento_id;

  return v_agendamento_id;
end;
$$;

grant execute on function public.criar_agendamento_publico(uuid, uuid, uuid, date, time, text, text) to anon, authenticated;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS — all 3 assertions, plus `0004_booking_concurrency.test.sql` still green (it exercises the same function and error message, unaffected by the status-literal change since it never asserts on `status`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0012_agendamento_publico_agendado.sql supabase/tests/database/0007_agendamento_publico_status.test.sql
git commit -m "feat: public booking now starts agendado, conflict check moves off the dropped exclusion constraint"
```

---

### Task 3: Cliente — aniversário (`data_nascimento`)

**Files:**
- Create: `supabase/migrations/0013_cliente_aniversario.sql`
- Create: `supabase/tests/database/0008_cliente_aniversario.test.sql`

**Interfaces:**
- Produces: `clientes.data_nascimento date` (nullable). `criar_ou_obter_cliente(p_barbearia_id uuid, p_nome text, p_telefone text, p_data_nascimento date default null) returns uuid` — same behavior as before when called with 3 args (existing call sites keep compiling and working unchanged until Task 12 updates them to pass a birthday); a provided `p_data_nascimento` is stored on creation and backfilled on conflict only if the existing row doesn't have one yet (never overwrites an already-known birthday).

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/database/0008_cliente_aniversario.test.sql`:

```sql
begin;
select plan(3);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a');

set local role anon;

select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Marcos Silva', '11988887777', '1990-05-20');

reset role;

select is(
  (select data_nascimento from clientes where telefone = '11988887777'),
  '1990-05-20'::date,
  'data_nascimento is stored when provided on creation'
);

set local role anon;

-- Calling again without a birthday must not erase the one already saved.
select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Marcos Silva', '11988887777');

reset role;

select is(
  (select data_nascimento from clientes where telefone = '11988887777'),
  '1990-05-20'::date,
  'an update without data_nascimento does not overwrite the existing one'
);

set local role anon;

select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Outro Cliente', '11977776666');

reset role;

select is(
  (select data_nascimento from clientes where telefone = '11977776666'),
  null,
  'data_nascimento stays null when never provided'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `criar_ou_obter_cliente` doesn't accept a 4th argument yet, `clientes.data_nascimento` doesn't exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0013_cliente_aniversario.sql`:

```sql
alter table clientes add column data_nascimento date;

-- Dropped and recreated (not just CREATE OR REPLACE) because adding a new
-- parameter changes the function's full type signature (uuid,text,text) ->
-- (uuid,text,text,date) — REPLACE would otherwise leave two overloaded
-- functions in the catalog instead of one.
drop function if exists public.criar_ou_obter_cliente(uuid, text, text);

create or replace function public.criar_ou_obter_cliente(
  p_barbearia_id uuid, p_nome text, p_telefone text, p_data_nascimento date default null
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

  insert into clientes (barbearia_id, nome, telefone, data_nascimento)
  values (p_barbearia_id, p_nome, v_telefone, p_data_nascimento)
  on conflict (barbearia_id, telefone)
  do update set nome = excluded.nome, data_nascimento = coalesce(clientes.data_nascimento, excluded.data_nascimento)
  returning id into v_cliente_id;

  return v_cliente_id;
end;
$$;

grant execute on function public.criar_ou_obter_cliente(uuid, text, text, date) to anon, authenticated;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS — all 3 assertions, plus `0003_lancamentos.test.sql` still green (it calls `criar_ou_obter_cliente` with 3 args, which now resolves via the default 4th parameter).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0013_cliente_aniversario.sql supabase/tests/database/0008_cliente_aniversario.test.sql
git commit -m "feat: add cliente data_nascimento, optional 4th arg on criar_ou_obter_cliente"
```

---

### Task 4: `prospeccoes` — telefone/nome obrigatórios, cliente_id na criação, novos status

**Files:**
- Create: `supabase/migrations/0014_prospeccao_rework.sql`
- Modify: `supabase/tests/database/0005_prospeccao_isolation.test.sql` (fixture fix, see Step 1)

**Interfaces:**
- Produces: `prospeccoes` gains `nome text not null`, `telefone text not null`, `agendamento_id uuid references agendamentos(id)` (nullable). `cliente_id` becomes `not null`. `status` now checks `'novo_lead' | 'em_contato' | 'interessado' | 'agendou' | 'compareceu' | 'convertido' | 'nao_convertido'`, defaulting to `'em_contato'`. INSERT policy requires `status = 'em_contato'` and a `cliente_id` that resolves to the caller's own tenant. UPDATE policy (manual edits only) restricts `status` to the three pre-visit values (`novo_lead`/`em_contato`/`interessado`) — the automatic transitions in Task 5 write through a `security definer` trigger, which bypasses this restriction the same way `processar_venda_produto()` bypasses `produtos`' RLS.

- [ ] **Step 1: Fix the existing test's fixtures for the new NOT NULL columns**

The existing `supabase/tests/database/0005_prospeccao_isolation.test.sql` inserts `prospeccoes` rows without `nome`/`telefone`/`cliente_id` — those become `not null` in this task's migration, so the fixture must be updated first (in the same commit as the migration, so the suite never has a broken intermediate state).

In `supabase/tests/database/0005_prospeccao_isolation.test.sql`, replace the whole file with:

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
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João'),
  ('a1000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000002', 'barbeiro', 'Pedro');

insert into clientes (id, barbearia_id, nome, telefone) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Lead João', '11900000001'),
  ('c1000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Lead Pedro', '11900000002');

insert into prospeccoes (barbearia_id, membro_id, canal, nome, telefone, cliente_id) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'whatsapp', 'Lead João', '11900000001', 'c1000000-0000-0000-0000-000000000001'),
  ('22222222-2222-2222-2222-222222222222', 'a1000000-0000-0000-0000-000000000002', 'rua', 'Lead Pedro', '11900000002', 'c1000000-0000-0000-0000-000000000002');

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

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `prospeccoes` doesn't have `nome`/`telefone` columns yet, and `cliente_id` insert would work today but the test as written now depends on the schema this task adds; confirm the failure is "column nome of relation prospeccoes does not exist" (or similar), not a logic error.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0014_prospeccao_rework.sql`:

```sql
alter table prospeccoes add column nome text;
alter table prospeccoes add column telefone text;
alter table prospeccoes add column agendamento_id uuid references agendamentos(id);

-- No production data exists yet for this project (see progress notes on the
-- MVP plan), so there are no legacy rows to backfill — nome/telefone/
-- cliente_id go straight to NOT NULL.
alter table prospeccoes alter column nome set not null;
alter table prospeccoes alter column telefone set not null;
alter table prospeccoes alter column cliente_id set not null;

alter table prospeccoes drop constraint prospeccoes_status_check;
alter table prospeccoes add constraint prospeccoes_status_check
  check (status in ('novo_lead', 'em_contato', 'interessado', 'agendou', 'compareceu', 'convertido', 'nao_convertido'));
alter table prospeccoes alter column status set default 'em_contato';

drop policy "barbeiro insere proprias prospeccoes" on prospeccoes;
create policy "barbeiro insere proprias prospeccoes" on prospeccoes for insert
  with check (
    membro_id = auth_membro_id()
    and barbearia_id = auth_barbearia_id()
    and status = 'em_contato'
    and exists (select 1 from clientes c where c.id = cliente_id and c.barbearia_id = auth_barbearia_id())
  );

-- Manual edits (via the UI) may only move a prospeccao between the three
-- pre-visit statuses — agendou/compareceu/convertido/nao_convertido are only
-- ever written by the security-definer triggers added in Task 5, which
-- bypass this policy (same mechanism as processar_venda_produto() bypassing
-- produtos' RLS), so a barbeiro can never forge a conversion by hand.
drop policy "barbeiro atualiza proprias prospeccoes" on prospeccoes;
create policy "barbeiro atualiza proprias prospeccoes" on prospeccoes for update
  using (membro_id = auth_membro_id())
  with check (
    membro_id = auth_membro_id()
    and exists (select 1 from clientes c where c.id = cliente_id and c.barbearia_id = auth_barbearia_id())
    and status in ('novo_lead', 'em_contato', 'interessado')
  );
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS — `0005_prospeccao_isolation.test.sql`'s 2 assertions, plus every other test file still green.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0014_prospeccao_rework.sql supabase/tests/database/0005_prospeccao_isolation.test.sql
git commit -m "feat: prospeccoes require nome/telefone/cliente_id upfront, expand status lifecycle"
```

---

### Task 5: Prospecção — transições automáticas (agendou / convertido / não_convertido)

**Files:**
- Create: `supabase/migrations/0015_prospeccao_auto_conversao.sql`
- Create: `supabase/tests/database/0009_prospeccao_conversao_automatica.test.sql`

**Interfaces:**
- Consumes: `prospeccoes.agendamento_id`/expanded status constraint (Task 4), `agendamentos.status` 5-value lifecycle (Task 1).
- Produces: two `security definer` triggers on `agendamentos` — `trg_agendamento_liga_prospeccao` (`after insert`) links the most recently-created open prospecção (`status in ('novo_lead','em_contato','interessado')`, `agendamento_id is null`) for the same `cliente_id`, setting its `status = 'agendou'` and `agendamento_id = new.id`; `trg_agendamento_atualiza_prospeccao` (`after update of status`) moves that linked prospecção to `'convertido'` (+ `convertido_em = now()`) when the agendamento becomes `'realizado'`, or to `'nao_convertido'` when it becomes `'nao_compareceu'`/`'cancelado'`. Neither trigger touches a prospecção already in a terminal state (`convertido`/`nao_convertido`).

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/database/0009_prospeccao_conversao_automatica.test.sql`:

```sql
begin;
select plan(5);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a');
insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com');
insert into membros (id, barbearia_id, user_id, papel, nome) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João');
insert into servicos (id, barbearia_id, nome, duracao_minutos, preco) values
  ('b1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Corte', 40, 60);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

-- Scenario 1: prospecção → agenda → realizado → convertido.
select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente Um', '11900000001');

insert into prospeccoes (barbearia_id, membro_id, canal, nome, telefone, cliente_id)
values (
  '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'whatsapp',
  'Cliente Um', '11900000001', (select id from clientes where telefone = '11900000001')
);

insert into agendamentos (id, barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem)
values (
  'd1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001',
  (select id from clientes where telefone = '11900000001'), 'b1000000-0000-0000-0000-000000000001',
  current_date + 1, '09:00', '09:40', 'confirmado', 'interno'
);

select is(
  (select status from prospeccoes where telefone = '11900000001'),
  'agendou',
  'creating an agendamento for a prospected cliente auto-links it and moves status to agendou'
);

update agendamentos set status = 'realizado' where id = 'd1000000-0000-0000-0000-000000000001';

select is(
  (select status from prospeccoes where telefone = '11900000001'),
  'convertido',
  'marking the linked agendamento realizado auto-converts the prospeccao'
);

select isnt(
  (select convertido_em from prospeccoes where telefone = '11900000001'),
  null,
  'convertido_em is stamped on auto-conversion'
);

-- Scenario 2: prospecção → agenda → não compareceu → não convertido.
select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente Dois', '11900000002');

insert into prospeccoes (barbearia_id, membro_id, canal, nome, telefone, cliente_id)
values (
  '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'rua',
  'Cliente Dois', '11900000002', (select id from clientes where telefone = '11900000002')
);

insert into agendamentos (id, barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem)
values (
  'd1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001',
  (select id from clientes where telefone = '11900000002'), 'b1000000-0000-0000-0000-000000000001',
  current_date + 2, '10:00', '10:40', 'confirmado', 'interno'
);

update agendamentos set status = 'nao_compareceu' where id = 'd1000000-0000-0000-0000-000000000002';

select is(
  (select status from prospeccoes where telefone = '11900000002'),
  'nao_convertido',
  'marking the linked agendamento as nao_compareceu auto-marks the prospeccao nao_convertido'
);

select is(
  (select agendamento_id from prospeccoes where telefone = '11900000002'),
  'd1000000-0000-0000-0000-000000000002',
  'the prospeccao stores which agendamento it was linked to'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — no triggers exist yet, so `prospeccoes.status` never changes from `'em_contato'`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0015_prospeccao_auto_conversao.sql`:

```sql
create or replace function public.trg_prospeccao_agendou()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prospeccao_id uuid;
begin
  select id into v_prospeccao_id
  from prospeccoes
  where cliente_id = new.cliente_id
    and status in ('novo_lead', 'em_contato', 'interessado')
    and agendamento_id is null
  order by criado_em desc
  limit 1;

  if v_prospeccao_id is not null then
    update prospeccoes set status = 'agendou', agendamento_id = new.id where id = v_prospeccao_id;
  end if;

  return new;
end;
$$;

create trigger trg_agendamento_liga_prospeccao
  after insert on agendamentos
  for each row execute function public.trg_prospeccao_agendou();

create or replace function public.trg_prospeccao_resultado_agendamento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'realizado' then
      update prospeccoes
      set status = 'convertido', convertido_em = now()
      where agendamento_id = new.id and status not in ('convertido', 'nao_convertido');
    elsif new.status in ('nao_compareceu', 'cancelado') then
      update prospeccoes
      set status = 'nao_convertido'
      where agendamento_id = new.id and status not in ('convertido', 'nao_convertido');
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_agendamento_atualiza_prospeccao
  after update of status on agendamentos
  for each row execute function public.trg_prospeccao_resultado_agendamento();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS — all 5 assertions, plus the full suite (`0001`–`0009`) green.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0015_prospeccao_auto_conversao.sql supabase/tests/database/0009_prospeccao_conversao_automatica.test.sql
git commit -m "feat: auto-link prospeccao to agendamento and auto-convert on atendimento realizado"
```

---

### Task 6: Remover a tela "Lançamentos"

**Files:**
- Delete: `src/app/painel/lancamentos/page.tsx`
- Modify: `src/app/painel/layout.tsx:6-11`
- Modify: `src/components/lancamento-form.tsx` (whole file — `modoAgenda` becomes required)

**Interfaces:**
- Produces: `LancamentoForm({ barbeariaId, membroId, servicos, produtos, modoAgenda, onSalvo }: { ...; modoAgenda: ModoAgenda; onSalvo?: () => void })` — `modoAgenda` is no longer optional. This is the only remaining consumer-facing change; `ModoAgenda`'s own shape is unchanged (still `{ agendamentoId, clienteNome, clienteTelefone, servicoId, horaInicio }`), so `agenda-dia.tsx`'s existing call site keeps compiling unmodified.

- [ ] **Step 1: Delete the standalone route**

```bash
git rm src/app/painel/lancamentos/page.tsx
```

- [ ] **Step 2: Remove the nav item**

In `src/app/painel/layout.tsx`, change:
```tsx
const NAV_ITEMS = [
  { href: '/painel', label: 'Dashboard' },
  { href: '/painel/lancamentos', label: 'Lançamentos' },
  { href: '/painel/agenda', label: 'Agenda' },
  { href: '/painel/prospeccao', label: 'Prospecção' },
]
```
to:
```tsx
const NAV_ITEMS = [
  { href: '/painel', label: 'Dashboard' },
  { href: '/painel/agenda', label: 'Agenda' },
  { href: '/painel/prospeccao', label: 'Prospecção' },
]
```

- [ ] **Step 3: Make `modoAgenda` required and drop the standalone branch in `LancamentoForm`**

Rewrite `src/components/lancamento-form.tsx` in full:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { ClienteAutocomplete } from './cliente-autocomplete'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type Servico = { id: string; nome: string; preco: number; duracao_minutos: number }
type Produto = { id: string; nome: string; preco_venda: number; quantidade_estoque: number }
type ServicoSelecionado = Servico
type ProdutoSelecionado = Produto & { quantidade: number }

// Opened from an agendamento (AgendaDia, "Atender agora") to record what
// actually happened when the cliente showed up: pré-preenche o cliente/
// serviço já marcado, deixa adicionar produto/serviço extra, e ao salvar
// linka os atendimentos ao agendamento e marca ele como realizado. Um
// agendamento só vira realizado aqui — nunca automaticamente ao ser criado
// — porque as métricas do dashboard (faturamento, comissão, ociosidade) só
// devem contar quem de fato foi atendido e pagou, não quem apenas marcou um
// horário e pode nem aparecer.
export type ModoAgenda = {
  agendamentoId: string
  clienteNome: string
  clienteTelefone: string
  servicoId: string
  horaInicio: string
}

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
  const router = useRouter()
  const [cliente, setCliente] = useState<{ nome: string; telefone: string } | null>(
    { nome: modoAgenda.clienteNome, telefone: modoAgenda.clienteTelefone }
  )
  const [servicosSelecionados, setServicosSelecionados] = useState<ServicoSelecionado[]>(() => {
    const servico = servicos.find((s) => s.id === modoAgenda.servicoId)
    return servico ? [servico] : []
  })
  const [produtosSelecionados, setProdutosSelecionados] = useState<ProdutoSelecionado[]>([])
  const [servicoParaAdicionar, setServicoParaAdicionar] = useState('')
  const [produtoParaAdicionar, setProdutoParaAdicionar] = useState('')
  const [quantidadeParaAdicionar, setQuantidadeParaAdicionar] = useState(1)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [clienteAutocompleteKey, setClienteAutocompleteKey] = useState(0)

  // Agendar a próxima visita do cliente sem sair da tela de lançamento.
  const [agendarRetorno, setAgendarRetorno] = useState(false)
  const [retornoServicoId, setRetornoServicoId] = useState('')
  const [retornoData, setRetornoData] = useState(() => new Date().toISOString().slice(0, 10))
  const [retornoHorarios, setRetornoHorarios] = useState<{ hora_inicio: string; hora_fim: string }[]>([])
  const [retornoHorario, setRetornoHorario] = useState('')
  const [buscandoHorarios, setBuscandoHorarios] = useState(false)

  async function buscarHorariosRetorno() {
    if (!retornoServicoId) return
    setBuscandoHorarios(true)
    setRetornoHorario('')
    const supabase = getBrowserSupabaseClient()
    const { data: slots } = await supabase.rpc('horarios_disponiveis', {
      p_barbearia_id: barbeariaId, p_membro_id: membroId, p_servico_id: retornoServicoId, p_data: retornoData,
    })
    setRetornoHorarios(slots ?? [])
    setBuscandoHorarios(false)
  }

  // Every catalog item stays selectable (not filtered down as items get
  // added) — a visit can need the same serviço twice (e.g. corte + corte
  // infantil for two kids under one cliente) or another round of a produto.
  function adicionarServico() {
    const servico = servicos.find((s) => s.id === servicoParaAdicionar)
    if (!servico) return
    setServicosSelecionados((atual) => [...atual, servico])
    setServicoParaAdicionar('')
  }

  function adicionarProduto() {
    const produto = produtos.find((p) => p.id === produtoParaAdicionar)
    if (!produto) return
    setProdutosSelecionados((atual) => {
      const existente = atual.find((p) => p.id === produto.id)
      if (existente) {
        return atual.map((p) => (p.id === produto.id ? { ...p, quantidade: p.quantidade + quantidadeParaAdicionar } : p))
      }
      return [...atual, { ...produto, quantidade: quantidadeParaAdicionar }]
    })
    setProdutoParaAdicionar('')
    setQuantidadeParaAdicionar(1)
  }

  // By index, not id — the same serviço can appear more than once in the
  // list (see adicionarServico above), so removing "by id" would drop every
  // instance of it instead of just the one the user clicked "remover" on.
  function removerServico(index: number) {
    setServicosSelecionados((atual) => atual.filter((_, i) => i !== index))
  }

  function removerProduto(id: string) {
    setProdutosSelecionados((atual) => atual.filter((p) => p.id !== id))
  }

  async function salvar() {
    if (!cliente || !cliente.nome || !cliente.telefone) { setMensagem('Preencha o cliente.'); return }
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
    })
    if (clienteId.error) { setMensagem(clienteId.error.message); setSalvando(false); return }

    for (const servico of servicosSelecionados) {
      const { error } = await supabase.from('atendimentos').insert({
        barbearia_id: barbeariaId, membro_id: membroId, cliente_id: clienteId.data,
        servico_id: servico.id, preco: servico.preco, agendamento_id: modoAgenda.agendamentoId,
      })
      if (error) { setMensagem(error.message); setSalvando(false); return }
    }

    for (const produto of produtosSelecionados) {
      const { error } = await supabase.from('vendas_produtos').insert({
        barbearia_id: barbeariaId, membro_id: membroId, cliente_id: clienteId.data,
        produto_id: produto.id, quantidade: produto.quantidade, preco_unitario: produto.preco_venda,
      })
      if (error) { setMensagem(error.message); setSalvando(false); return }
    }

    // Um agendamento só vira realizado aqui, quando o cliente de fato foi
    // atendido e o lançamento foi salvo — nunca no momento de marcar o
    // horário. É esse status que separa "quem agendou" de "quem realmente
    // foi e pagou" nos números do dashboard (que só somam atendimentos).
    const { error } = await supabase.from('agendamentos').update({ status: 'realizado' }).eq('id', modoAgenda.agendamentoId)
    if (error) { setMensagem(`Lançamento salvo, mas não deu pra marcar o agendamento como realizado: ${error.message}`); setSalvando(false); return }

    if (agendarRetorno && retornoHorario) {
      const servicoRetorno = servicos.find((s) => s.id === retornoServicoId)!
      const horaFim = new Date(`1970-01-01T${retornoHorario}`)
      horaFim.setMinutes(horaFim.getMinutes() + servicoRetorno.duracao_minutos)
      const { error } = await supabase.from('agendamentos').insert({
        barbearia_id: barbeariaId, membro_id: membroId, cliente_id: clienteId.data,
        servico_id: retornoServicoId, data: retornoData, hora_inicio: retornoHorario,
        hora_fim: horaFim.toTimeString().slice(0, 8), status: 'confirmado', origem: 'interno',
      })
      if (error) {
        setMensagem(`Lançamento salvo, mas o agendamento de retorno falhou: ${error.message}.`)
        setSalvando(false)
        return
      }
    }

    setMensagem(agendarRetorno && retornoHorario ? 'Concluído e retorno agendado com sucesso!' : 'Concluído com sucesso!')
    setServicosSelecionados([])
    setProdutosSelecionados([])
    setCliente(null)
    setClienteAutocompleteKey((atual) => atual + 1)
    setAgendarRetorno(false)
    setRetornoServicoId('')
    setRetornoHorarios([])
    setRetornoHorario('')
    setSalvando(false)
    // The insert above went through the browser Supabase client, not a
    // server action — the page's own `produtos`/`servicos` props (fetched
    // once on load, server-side) never re-run on their own, so "estoque: N"
    // and the AgendaDia grid would keep showing stale data until a manual
    // reload. router.refresh() re-runs the page's own server fetch;
    // onSalvo (from AgendaDia) additionally refetches its own client-side
    // agendamentos list.
    router.refresh()
    onSalvo?.()
  }

  return (
    <div className="flex flex-col gap-4 max-w-md border rounded p-4">
      <h3 className="font-medium">Atender agendamento — {modoAgenda.horaInicio.slice(0, 5)}</h3>

      <ClienteAutocomplete
        key={clienteAutocompleteKey}
        barbeariaId={barbeariaId}
        onResolved={setCliente}
        valorInicial={{ nome: modoAgenda.clienteNome, telefone: modoAgenda.clienteTelefone }}
      />

      <div>
        <p className="text-sm font-medium mb-1">Serviços (corte, serviço extra...)</p>
        {servicosSelecionados.map((s, index) => (
          <div key={`${s.id}-${index}`} className="flex justify-between items-center text-sm border-b py-1">
            <span>{s.nome} (R${s.preco})</span>
            <button type="button" onClick={() => removerServico(index)} className="text-red-600 text-xs">remover</button>
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <select value={servicoParaAdicionar} onChange={(e) => setServicoParaAdicionar(e.target.value)} className="border rounded px-2 py-1 flex-1">
            <option value="">Serviço</option>
            {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome} (R${s.preco})</option>)}
          </select>
          <Button type="button" variant="outline" onClick={adicionarServico} disabled={!servicoParaAdicionar}>+ Adicionar</Button>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-1">Produtos (opcional)</p>
        {produtosSelecionados.map((p) => (
          <div key={p.id} className="flex justify-between items-center text-sm border-b py-1">
            <span>{p.quantidade}x {p.nome} (R${p.preco_venda})</span>
            <button type="button" onClick={() => removerProduto(p.id)} className="text-red-600 text-xs">remover</button>
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <select value={produtoParaAdicionar} onChange={(e) => setProdutoParaAdicionar(e.target.value)} className="border rounded px-2 py-1 flex-1">
            <option value="">Produto</option>
            {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome} (estoque: {p.quantidade_estoque})</option>)}
          </select>
          <Input type="number" min={1} value={quantidadeParaAdicionar} onChange={(e) => setQuantidadeParaAdicionar(Number(e.target.value))} className="w-16" />
          <Button type="button" variant="outline" onClick={adicionarProduto} disabled={!produtoParaAdicionar}>+ Adicionar</Button>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium flex items-center gap-2">
          <input type="checkbox" checked={agendarRetorno} onChange={(e) => setAgendarRetorno(e.target.checked)} />
          Agendar próxima visita deste cliente
        </label>
        {agendarRetorno && (
          <div className="flex flex-col gap-2 mt-2">
            <select value={retornoServicoId} onChange={(e) => { setRetornoServicoId(e.target.value); setRetornoHorarios([]); setRetornoHorario('') }} className="border rounded px-2 py-1">
              <option value="">Serviço do retorno</option>
              {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
            <Input type="date" value={retornoData} onChange={(e) => { setRetornoData(e.target.value); setRetornoHorarios([]); setRetornoHorario('') }} />
            <Button type="button" variant="outline" onClick={buscarHorariosRetorno} disabled={!retornoServicoId || buscandoHorarios}>Ver horários</Button>
            {retornoHorarios.length > 0 && (
              <select value={retornoHorario} onChange={(e) => setRetornoHorario(e.target.value)} className="border rounded px-2 py-1">
                <option value="">Horário</option>
                {retornoHorarios.map((h) => <option key={h.hora_inicio} value={h.hora_inicio}>{h.hora_inicio.slice(0, 5)}</option>)}
              </select>
            )}
            {retornoHorarios.length === 0 && !buscandoHorarios && retornoServicoId && (
              <p className="text-xs text-muted-foreground">Clique em &quot;Ver horários&quot; para escolher.</p>
            )}
          </div>
        )}
      </div>

      <Button type="button" onClick={salvar} disabled={salvando}>Concluir atendimento</Button>
      {mensagem && <p className="text-sm">{mensagem}</p>}
    </div>
  )
}
```

(This drops the `23P01`-specific message branch on the retorno insert — that error code came from the exclusion constraint, which Task 1 removed; a retorno insert is always internal/`origem: 'interno'`, so it can no longer collide-and-reject at the DB level. Any other insert error still surfaces via `error.message`.)

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: succeeds. `agenda-dia.tsx`'s existing `<LancamentoForm modoAgenda={modoAgenda} .../>` call (inside `{modoAgenda && (...)}`) already only renders when `modoAgenda` is truthy, so it satisfies the new required prop with no change needed there.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: remove the standalone Lançamentos screen, fold it into the agendamento flow"
```

---

### Task 7: Agenda — slots de 1 hora, clique em qualquer data

**Files:**
- Modify: `src/components/agenda-dia.tsx` (see Steps 1–2)
- Modify: `src/app/painel/agenda/page.tsx` (see Step 3)
- Delete: `src/components/internal-booking-form.tsx`

**Interfaces:**
- Produces: `AgendaDia`'s exported props/shape are unchanged; internally, `PASSO_MINUTOS` is `60`, and slot cells are clickable regardless of which date is selected (the `ehHoje`-gated `disabled` props and the "only works for today" hint paragraph are gone).

- [ ] **Step 1: Change the slot step to 60 minutes**

In `src/components/agenda-dia.tsx`, change:
```tsx
const PASSO_MINUTOS = 30
```
to:
```tsx
const PASSO_MINUTOS = 60
```

- [ ] **Step 2: Allow clicking any date, remove the "only today" gating**

In `src/components/agenda-dia.tsx`, change `clicarSlot`:
```tsx
  function clicarSlot(slot: string) {
    if (!ehHoje) return
    const info = statusDoSlot(slot)
```
to:
```tsx
  function clicarSlot(slot: string) {
    const info = statusDoSlot(slot)
```

Then remove the `disabled={!ehHoje || concluido}` / `disabled={!ehHoje}` gates on the two buttons inside the `slotsUnicos.map(...)` render (the "ocupado" button and the "livre" button), leaving only their existing other condition:
```tsx
                  disabled={!ehHoje || concluido}
```
becomes:
```tsx
                  disabled={concluido}
```
and:
```tsx
              disabled={!ehHoje}
```
(on the "livre" button) is removed entirely — that button has no other condition, so drop the `disabled` prop.

Finally, remove the trailing hint block, changing:
```tsx
        {!ehHoje && slotsUnicos.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">Clique nos horários só funciona para o dia de hoje — use &quot;Novo agendamento&quot; abaixo para marcar em outra data.</p>
        )}
```
to nothing (delete the block). The `hoje`/`ehHoje` constants stay — they're still used to decide whether "Atender agora" (Task 11) shows.

- [ ] **Step 3: Remove the permanent booking form below the Agenda**

In `src/app/painel/agenda/page.tsx`, remove the `InternalBookingForm` import and its section:
```tsx
import { InternalBookingForm } from '@/components/internal-booking-form'
```
and:
```tsx
      <h2 className="text-lg font-medium mt-8 mb-2">Novo agendamento (outra data)</h2>
      <InternalBookingForm barbeariaId={membro!.barbearia_id} membroId={membro!.id} servicos={servicos ?? []} />

```
The `BloqueioForm` section right after it stays untouched — bloqueios are unrelated to this rework.

Delete the now-unused component:
```bash
git rm src/components/internal-booking-form.tsx
```

- [ ] **Step 4: Manual verification**

Start the dev server (`npm run dev`, already running per this session) and, logged in as the seeded `barbeiro@teste.com`:
1. Open `/painel/agenda` — confirm slots are listed hourly (09:00, 10:00, 11:00...) instead of every 30 minutes.
2. Change the date picker to tomorrow — confirm clicking a free slot now opens `AgendarSlotForm` (it didn't before this task).
3. Confirm there's no "Novo agendamento (outra data)" heading/form below the grid anymore.

- [ ] **Step 5: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: agenda slots to 1h intervals, allow clicking any date, remove the fixed booking form"
```

---

### Task 8: Agenda — múltiplos agendamentos por horário (overbooking empilhado)

**Files:**
- Modify: `src/components/agenda-dia.tsx` (`statusDoSlot`, the "ocupado" render branch)

**Interfaces:**
- Produces: `statusDoSlot(slot)` now returns `{ tipo: 'ocupado', agendamentos: AgendamentoDia[] }` (plural, an array of every non-cancelled agendamento overlapping that slot) instead of `{ tipo: 'ocupado', agendamento, primeiroSlot }` (singular). Every occupied cell renders one row per agendamento in the array, each independently clickable, plus a standing "+ agendar outro aqui" action that opens `AgendarSlotForm` for that same slot regardless of what's already booked there.

- [ ] **Step 1: Rewrite `statusDoSlot` to return an array**

In `src/components/agenda-dia.tsx`, change:
```tsx
  function statusDoSlot(slot: string) {
    const bloqueio = bloqueios.find((b) => b.hora_inicio.slice(0, 5) <= slot.slice(0, 5) && slot.slice(0, 5) < b.hora_fim.slice(0, 5))
    if (bloqueio) return { tipo: 'bloqueado' as const, bloqueio }
    const agendamento = agendamentos.find((a) => a.hora_inicio.slice(0, 5) <= slot.slice(0, 5) && slot.slice(0, 5) < a.hora_fim.slice(0, 5))
    if (agendamento) return { tipo: 'ocupado' as const, agendamento, primeiroSlot: agendamento.hora_inicio.slice(0, 5) === slot.slice(0, 5) }
    return { tipo: 'livre' as const }
  }
```
to:
```tsx
  function statusDoSlot(slot: string) {
    const bloqueio = bloqueios.find((b) => b.hora_inicio.slice(0, 5) <= slot.slice(0, 5) && slot.slice(0, 5) < b.hora_fim.slice(0, 5))
    if (bloqueio) return { tipo: 'bloqueado' as const, bloqueio }
    const doSlot = agendamentos.filter((a) => a.hora_inicio.slice(0, 5) <= slot.slice(0, 5) && slot.slice(0, 5) < a.hora_fim.slice(0, 5))
    if (doSlot.length > 0) return { tipo: 'ocupado' as const, agendamentos: doSlot }
    return { tipo: 'livre' as const }
  }
```

- [ ] **Step 2: Update `clicarSlot` for the new shape**

`clicarSlot` currently opens the atender-form when the (singular) occupied agendamento is `confirmado`, or opens the booking form otherwise. With multiple agendamentos possible per slot, clicking the *cell* itself (as opposed to one specific row inside it) should always offer to book another one — per-row "atender this one" clicks are wired individually in Step 3. Change:
```tsx
  function clicarSlot(slot: string) {
    const info = statusDoSlot(slot)
    if (info.tipo === 'bloqueado') return
    if (info.tipo === 'ocupado') {
      if (info.agendamento.status !== 'confirmado' || !info.agendamento.servicos) return
      fecharPaineis()
      setModoAgenda({
        agendamentoId: info.agendamento.id,
        clienteNome: info.agendamento.clientes?.nome ?? '',
        clienteTelefone: info.agendamento.clientes?.telefone ?? '',
        servicoId: info.agendamento.servicos.id,
        horaInicio: info.agendamento.hora_inicio,
      })
    } else {
      fecharPaineis()
      setSlotParaAgendar(slot)
    }
  }
```
to:
```tsx
  function clicarSlot(slot: string) {
    const info = statusDoSlot(slot)
    if (info.tipo === 'bloqueado') return
    fecharPaineis()
    setSlotParaAgendar(slot)
  }

  function atenderAgendamento(agendamento: AgendamentoDia) {
    if (agendamento.status !== 'confirmado' || !agendamento.servicos) return
    fecharPaineis()
    setModoAgenda({
      agendamentoId: agendamento.id,
      clienteNome: agendamento.clientes?.nome ?? '',
      clienteTelefone: agendamento.clientes?.telefone ?? '',
      servicoId: agendamento.servicos.id,
      horaInicio: agendamento.hora_inicio,
    })
  }
```

- [ ] **Step 3: Render every agendamento in the cell, stacked**

Replace the "ocupado" branch of the `slotsUnicos.map(...)` render:
```tsx
          if (info.tipo === 'ocupado') {
            const concluido = info.agendamento.status === 'realizado'
            return (
              <div key={slot} className={`flex justify-between items-center text-sm py-1.5 px-2 rounded ${concluido ? 'opacity-60' : 'bg-muted'}`}>
                <button
                  type="button"
                  onClick={() => clicarSlot(slot)}
                  disabled={concluido}
                  className="text-left flex-1 disabled:cursor-default"
                >
                  {info.primeiroSlot
                    ? `${rotulo} — ${info.agendamento.clientes?.nome ?? 'cliente'} · ${info.agendamento.servicos?.nome ?? ''}${concluido ? ' · concluído' : ''}`
                    : `${rotulo} — ↳`}
                </button>
                {info.primeiroSlot && !concluido && (
                  <span className="flex gap-2 ml-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => { fecharPaineis(); setRemarcando({ id: info.agendamento.id, servicoId: info.agendamento.servicos?.id ?? '', clienteNome: info.agendamento.clientes?.nome ?? '' }) }}
                      className="text-xs underline"
                    >
                      remarcar
                    </button>
                    <button type="button" onClick={() => cancelar(info.agendamento.id)} className="text-red-600 text-xs">cancelar</button>
                  </span>
                )}
              </div>
            )
          }
```
with:
```tsx
          if (info.tipo === 'ocupado') {
            return (
              <div key={slot} className="rounded bg-muted px-2 py-1.5">
                <span className="block text-sm font-medium mb-1">{rotulo}</span>
                {info.agendamentos.map((agendamento) => {
                  const concluido = agendamento.status === 'realizado'
                  const eDesteSlot = agendamento.hora_inicio.slice(0, 5) === slot.slice(0, 5)
                  return (
                    <div key={agendamento.id} className={`flex justify-between items-center text-sm py-1 ${concluido ? 'opacity-60' : ''}`}>
                      <button
                        type="button"
                        onClick={() => atenderAgendamento(agendamento)}
                        disabled={concluido}
                        className="text-left flex-1 disabled:cursor-default"
                      >
                        {eDesteSlot
                          ? `${agendamento.clientes?.nome ?? 'cliente'} · ${agendamento.servicos?.nome ?? ''}${concluido ? ' · concluído' : ''}`
                          : '↳ continua'}
                      </button>
                      {eDesteSlot && !concluido && (
                        <span className="flex gap-2 ml-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => { fecharPaineis(); setRemarcando({ id: agendamento.id, servicoId: agendamento.servicos?.id ?? '', clienteNome: agendamento.clientes?.nome ?? '' }) }}
                            className="text-xs underline"
                          >
                            remarcar
                          </button>
                          <button type="button" onClick={() => cancelar(agendamento.id)} className="text-red-600 text-xs">cancelar</button>
                        </span>
                      )}
                    </div>
                  )
                })}
                <button type="button" onClick={() => clicarSlot(slot)} className="text-xs underline mt-1">+ agendar outro aqui</button>
              </div>
            )
          }
```

The "livre" branch's button still calls `onClick={() => clicarSlot(slot)}`, unchanged.

- [ ] **Step 4: Manual verification**

With the dev server running, as `barbeiro@teste.com`:
1. Book two different clientes into the same hourly slot (via "+ agendar outro aqui" the second time) — confirm both render stacked in the same cell, each independently clickable.
2. Confirm remarcar/cancelar still work per-row.
3. Confirm a slot with only one agendamento still displays and behaves correctly (no regression for the common case).

- [ ] **Step 5: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/agenda-dia.tsx
git commit -m "feat: agenda cells stack multiple agendamentos per slot, add + agendar outro aqui"
```

---

### Task 9: Aviso de conflito em vez de bloqueio (`AgendarSlotForm`)

**Files:**
- Modify: `src/components/agendar-slot-form.tsx` (whole file)

**Interfaces:**
- Produces: same props/exports as before. Internally, `conflito = true` no longer disables the confirm button — the first click reveals a warning + a "Confirmar mesmo assim"/"Cancelar" pair; a second click proceeds with the same insert as before.

- [ ] **Step 1: Rewrite the component**

Replace `src/components/agendar-slot-form.tsx` in full:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { ClienteAutocomplete } from './cliente-autocomplete'
import { Button } from '@/components/ui/button'

type Servico = { id: string; nome: string; duracao_minutos: number }

// Só reserva o horário (agendamento status confirmado) — nenhum
// atendimento/venda é criado aqui. O lançamento real (e a conclusão do
// agendamento) acontece depois, reabrindo esse mesmo horário já ocupado
// (ver AgendaDia + LancamentoForm), que é quando o cliente de fato chega.
export function AgendarSlotForm({
  barbeariaId, membroId, servicos, data, horaInicio, onAgendado,
}: {
  barbeariaId: string
  membroId: string
  servicos: Servico[]
  data: string
  horaInicio: string
  onAgendado?: () => void
}) {
  const [cliente, setCliente] = useState<{ nome: string; telefone: string } | null>(null)
  const [servicoId, setServicoId] = useState('')
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  // O grid marca um horário como "livre" olhando só se ELE MESMO cai dentro
  // de outro agendamento — mas não sabe, até o serviço ser escolhido aqui,
  // se a duração desse serviço vai esbarrar no PRÓXIMO agendamento (ex:
  // clicar às 09:00 livre, mas um corte de 40min vai até 09:40, e já tem
  // alguém marcado às 09:30). Isso não trava mais o agendamento (overbooking
  // interno é permitido de propósito) — só avisa, e pede uma segunda
  // confirmação antes de gravar.
  const [conflito, setConflito] = useState(false)
  const [verificando, setVerificando] = useState(false)
  const [pedindoConfirmacao, setPedindoConfirmacao] = useState(false)

  useEffect(() => {
    setPedindoConfirmacao(false)
    if (!servicoId) { setConflito(false); return }
    let cancelado = false
    async function verificar() {
      setVerificando(true)
      const supabase = getBrowserSupabaseClient()
      const { data: slots } = await supabase.rpc('horarios_disponiveis', {
        p_barbearia_id: barbeariaId, p_membro_id: membroId, p_servico_id: servicoId, p_data: data,
      })
      if (!cancelado) {
        const disponivel = (slots ?? []).some((s: { hora_inicio: string }) => s.hora_inicio === horaInicio)
        setConflito(!disponivel)
        setVerificando(false)
      }
    }
    verificar()
    return () => { cancelado = true }
  }, [servicoId, barbeariaId, membroId, data, horaInicio])

  async function gravar() {
    setSalvando(true)
    setMensagem(null)
    const supabase = getBrowserSupabaseClient()

    const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
      p_barbearia_id: barbeariaId, p_nome: cliente!.nome, p_telefone: cliente!.telefone,
    })
    if (clienteId.error) { setMensagem(clienteId.error.message); setSalvando(false); return }

    const servico = servicos.find((s) => s.id === servicoId)!
    const horaFim = new Date(`1970-01-01T${horaInicio}`)
    horaFim.setMinutes(horaFim.getMinutes() + servico.duracao_minutos)

    const { error } = await supabase.from('agendamentos').insert({
      barbearia_id: barbeariaId, membro_id: membroId, cliente_id: clienteId.data,
      servico_id: servicoId, data, hora_inicio: horaInicio,
      hora_fim: horaFim.toTimeString().slice(0, 8), status: 'confirmado', origem: 'interno',
    })
    setSalvando(false)
    if (error) { setMensagem(error.message); return }
    onAgendado?.()
  }

  function confirmar() {
    if (!cliente || !cliente.nome || !cliente.telefone) { setMensagem('Preencha o cliente.'); return }
    if (!servicoId) { setMensagem('Escolha o serviço.'); return }
    if (conflito && !pedindoConfirmacao) { setPedindoConfirmacao(true); return }
    gravar()
  }

  return (
    <div className="flex flex-col gap-3 max-w-md border rounded p-4">
      <h3 className="font-medium">Agendar horário — {horaInicio.slice(0, 5)}</h3>
      <ClienteAutocomplete barbeariaId={barbeariaId} onResolved={setCliente} />
      <select value={servicoId} onChange={(e) => { setServicoId(e.target.value); setPedindoConfirmacao(false) }} className="border rounded px-2 py-1">
        <option value="">Serviço</option>
        {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
      </select>

      {pedindoConfirmacao && (
        <div className="border border-amber-400 bg-amber-50 rounded p-3 flex flex-col gap-2">
          <p className="text-sm">Este horário já possui um serviço agendado. Tem certeza de que deseja confirmar este agendamento?</p>
          <div className="flex gap-2">
            <Button type="button" onClick={gravar} disabled={salvando}>Confirmar mesmo assim</Button>
            <Button type="button" variant="outline" onClick={() => setPedindoConfirmacao(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {!pedindoConfirmacao && (
        <Button type="button" onClick={confirmar} disabled={salvando || verificando}>Confirmar agendamento</Button>
      )}
      {mensagem && <p className="text-sm">{mensagem}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Manual verification**

With the dev server running, as `barbeiro@teste.com`, book a slot that overlaps an existing one (via "+ agendar outro aqui" from Task 8): confirm the first click shows the amber warning box with the exact wording from the spec, and only the second click ("Confirmar mesmo assim") actually creates the agendamento. Confirm a non-conflicting booking still saves on the first click, no warning shown.

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/agendar-slot-form.tsx
git commit -m "feat: internal booking conflict becomes a warning + confirm, not a hard block"
```

---

### Task 10: Ações por status na Agenda — Confirmar (agendado) e Não compareceu

**Files:**
- Modify: `src/components/agenda-dia.tsx` (query, render branch, two new handlers)

**Interfaces:**
- Consumes: `agendamentos.status` 5-value lifecycle (Task 1), stacked-cell render from Task 8.
- Produces: no new exported interface — purely adds two mutations (`confirmarAgendamento(id)`, `marcarNaoCompareceu(id)`) and status-conditional buttons inside the existing stacked-cell render.

- [ ] **Step 1: Add the two new handlers**

In `src/components/agenda-dia.tsx`, right after the existing `cancelar` function, add:

```tsx
  async function confirmarAgendamento(id: string) {
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase.from('agendamentos').update({ status: 'confirmado' }).eq('id', id)
    if (!error) carregar()
  }

  async function marcarNaoCompareceu(id: string) {
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase.from('agendamentos').update({ status: 'nao_compareceu' }).eq('id', id)
    if (!error) carregar()
  }
```

- [ ] **Step 2: Extend the stacked-cell render with status-conditional actions**

Inside the `info.agendamentos.map((agendamento) => { ... })` block from Task 8, a row already computes `concluido` and `eDesteSlot`. Add a helper right above it for whether the slot's date/time has passed (needed for "Não compareceu", which only makes sense for a past slot):

```tsx
                  const jaPassou = `${data}T${agendamento.hora_inicio}` < new Date().toISOString()
```

Then extend the action buttons. Replace:
```tsx
                      {eDesteSlot && !concluido && (
                        <span className="flex gap-2 ml-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => { fecharPaineis(); setRemarcando({ id: agendamento.id, servicoId: agendamento.servicos?.id ?? '', clienteNome: agendamento.clientes?.nome ?? '' }) }}
                            className="text-xs underline"
                          >
                            remarcar
                          </button>
                          <button type="button" onClick={() => cancelar(agendamento.id)} className="text-red-600 text-xs">cancelar</button>
                        </span>
                      )}
```
with:
```tsx
                      {eDesteSlot && agendamento.status === 'agendado' && (
                        <span className="flex gap-2 ml-2 shrink-0">
                          <button type="button" onClick={() => confirmarAgendamento(agendamento.id)} className="text-xs underline">confirmar</button>
                          <button type="button" onClick={() => cancelar(agendamento.id)} className="text-red-600 text-xs">cancelar</button>
                        </span>
                      )}
                      {eDesteSlot && agendamento.status === 'confirmado' && (
                        <span className="flex gap-2 ml-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => { fecharPaineis(); setRemarcando({ id: agendamento.id, servicoId: agendamento.servicos?.id ?? '', clienteNome: agendamento.clientes?.nome ?? '' }) }}
                            className="text-xs underline"
                          >
                            remarcar
                          </button>
                          <button type="button" onClick={() => cancelar(agendamento.id)} className="text-red-600 text-xs">cancelar</button>
                          {jaPassou && (
                            <button type="button" onClick={() => marcarNaoCompareceu(agendamento.id)} className="text-amber-700 text-xs">não compareceu</button>
                          )}
                        </span>
                      )}
```

Note `concluido` (used for opacity/disabling `atenderAgendamento`) already covers both `'realizado'` and — after this task — should also cover `'nao_compareceu'` (both are end states that shouldn't be clickable to "atender"). Update its definition:
```tsx
                  const concluido = agendamento.status === 'realizado'
```
to:
```tsx
                  const concluido = agendamento.status === 'realizado' || agendamento.status === 'nao_compareceu'
```

And the label line should distinguish the two rather than always saying "concluído":
```tsx
                          ? `${agendamento.clientes?.nome ?? 'cliente'} · ${agendamento.servicos?.nome ?? ''}${concluido ? ' · concluído' : ''}`
```
to:
```tsx
                          ? `${agendamento.clientes?.nome ?? 'cliente'} · ${agendamento.servicos?.nome ?? ''}${agendamento.status === 'realizado' ? ' · realizado' : ''}${agendamento.status === 'nao_compareceu' ? ' · não compareceu' : ''}`
```

- [ ] **Step 3: `atenderAgendamento` already guards on `status !== 'confirmado'`**

No change needed — `atenderAgendamento` (Task 8) already only opens the lançamento form when `agendamento.status === 'confirmado'`, which now correctly excludes `'agendado'` (needs confirming first), `'realizado'`, and `'nao_compareceu'`.

- [ ] **Step 4: Manual verification**

With the dev server running: create a public booking (via the seeded barbearia's public link `/teste`) so it lands as `agendado`; open the Agenda as `barbeiro@teste.com` and confirm the row shows "confirmar"/"cancelar" (not "remarcar", not clickable to atender). Click "confirmar", confirm it flips to the `confirmado` row actions. Book an internal slot in the past (pick yesterday's date before this task, or temporarily use a past `data` value in the date picker) and confirm "não compareceu" appears and works.

- [ ] **Step 5: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/agenda-dia.tsx
git commit -m "feat: agenda gains confirmar (agendado) and não compareceu actions"
```

---

### Task 11: Walk-in — "Atender agora"

**Files:**
- Create: `src/components/atender-agora-form.tsx`
- Modify: `src/components/agenda-dia.tsx` (state + button + render)

**Interfaces:**
- Produces: `AtenderAgoraForm({ barbeariaId, membroId, servicos, onCriado }: { barbeariaId: string; membroId: string; servicos: Servico[]; onCriado: (modoAgenda: ModoAgenda) => void })` — creates an `agendamentos` row for right now (`status: 'confirmado'`, `origem: 'interno'`) and calls `onCriado` with the same `ModoAgenda` shape `LancamentoForm` already expects, so `AgendaDia` can immediately render the existing atender-flow with zero new lançamento code path.

- [ ] **Step 1: Write `AtenderAgoraForm`**

Create `src/components/atender-agora-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { ClienteAutocomplete } from './cliente-autocomplete'
import { Button } from '@/components/ui/button'
import type { ModoAgenda } from './lancamento-form'

type Servico = { id: string; nome: string; duracao_minutos: number }

// Walk-in: cliente chegou sem hora marcada. Em vez de uma tela de
// "lançamento avulso" separada, isso cria um agendamento normal pro
// horário atual e entrega o controle pro mesmo fluxo de "atender
// agendamento" (LancamentoForm com modoAgenda) que a Agenda já usa — sem
// caminho de dado que não passe por agendamentos.
export function AtenderAgoraForm({
  barbeariaId, membroId, servicos, onCriado, onCancelar,
}: {
  barbeariaId: string
  membroId: string
  servicos: Servico[]
  onCriado: (modoAgenda: ModoAgenda) => void
  onCancelar?: () => void
}) {
  const [cliente, setCliente] = useState<{ nome: string; telefone: string } | null>(null)
  const [servicoId, setServicoId] = useState('')
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function criar() {
    if (!cliente || !cliente.nome || !cliente.telefone) { setMensagem('Preencha o cliente.'); return }
    if (!servicoId) { setMensagem('Escolha o serviço.'); return }

    setSalvando(true)
    setMensagem(null)
    const supabase = getBrowserSupabaseClient()

    const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
      p_barbearia_id: barbeariaId, p_nome: cliente.nome, p_telefone: cliente.telefone,
    })
    if (clienteId.error) { setMensagem(clienteId.error.message); setSalvando(false); return }

    const servico = servicos.find((s) => s.id === servicoId)!
    const agora = new Date()
    const data = agora.toISOString().slice(0, 10)
    const horaInicio = agora.toTimeString().slice(0, 8)
    const horaFim = new Date(agora)
    horaFim.setMinutes(horaFim.getMinutes() + servico.duracao_minutos)

    const { data: agendamento, error } = await supabase.from('agendamentos').insert({
      barbearia_id: barbeariaId, membro_id: membroId, cliente_id: clienteId.data,
      servico_id: servicoId, data, hora_inicio: horaInicio,
      hora_fim: horaFim.toTimeString().slice(0, 8), status: 'confirmado', origem: 'interno',
    }).select('id').single()

    setSalvando(false)
    if (error || !agendamento) { setMensagem(error?.message ?? 'Não foi possível iniciar o atendimento.'); return }

    onCriado({
      agendamentoId: agendamento.id,
      clienteNome: cliente.nome,
      clienteTelefone: cliente.telefone,
      servicoId,
      horaInicio,
    })
  }

  return (
    <div className="flex flex-col gap-3 max-w-md border rounded p-4">
      <h3 className="font-medium">Atender agora</h3>
      <ClienteAutocomplete barbeariaId={barbeariaId} onResolved={setCliente} />
      <select value={servicoId} onChange={(e) => setServicoId(e.target.value)} className="border rounded px-2 py-1">
        <option value="">Serviço</option>
        {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
      </select>
      <div className="flex gap-2">
        <Button type="button" onClick={criar} disabled={salvando}>Iniciar atendimento</Button>
        <Button type="button" variant="outline" onClick={onCancelar}>Cancelar</Button>
      </div>
      {mensagem && <p className="text-sm">{mensagem}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Wire it into `AgendaDia`**

In `src/components/agenda-dia.tsx`, add the import:
```tsx
import { AtenderAgoraForm } from './atender-agora-form'
```

Add a new piece of state next to the existing panel states (`modoAgenda`, `slotParaAgendar`, `remarcando`):
```tsx
  const [atendendoAgora, setAtendendoAgora] = useState(false)
```

Extend `fecharPaineis` to also close it:
```tsx
  function fecharPaineis() {
    setModoAgenda(null)
    setSlotParaAgendar(null)
    setRemarcando(null)
    setAtendendoAgora(false)
  }
```

Extend `painelAberto` to include it:
```tsx
  const painelAberto = modoAgenda || slotParaAgendar || remarcando || atendendoAgora
```

Add a button next to the date `Input`, changing:
```tsx
        <Input type="date" value={data} onChange={(e) => { setData(e.target.value); fecharPaineis() }} className="w-auto mb-3" />
```
to:
```tsx
        <div className="flex items-center gap-3 mb-3">
          <Input type="date" value={data} onChange={(e) => { setData(e.target.value); fecharPaineis() }} className="w-auto" />
          <button type="button" onClick={() => { fecharPaineis(); setAtendendoAgora(true) }} className="text-sm underline">Atender agora</button>
        </div>
```

And render the form in the panel area, alongside the other three:
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

- [ ] **Step 3: Manual verification**

With the dev server running, as `barbeiro@teste.com`: click "Atender agora", fill a new cliente + serviço, submit — confirm it jumps straight into the "Atender agendamento" form (same one used from an existing slot), and saving it creates both the `agendamentos` row (already `realizado` by the time you're done) and the `atendimentos` row, visible afterward in the Agenda for today at the current hour's slot.

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/atender-agora-form.tsx src/components/agenda-dia.tsx
git commit -m "feat: add walk-in Atender agora, reusing the existing agendamento-attend flow"
```

---

### Task 12: Cliente — captura de aniversário (fluxo interno)

**Files:**
- Modify: `src/components/cliente-autocomplete.tsx` (whole file)
- Modify: `src/components/lancamento-form.tsx` (cliente state + RPC call)
- Modify: `src/components/agendar-slot-form.tsx` (cliente state + RPC call)
- Modify: `src/components/atender-agora-form.tsx` (cliente state + RPC call)
- Modify: `src/components/ficha-cliente.tsx` (display)

Scope note: this only covers the three internal (staff-facing) flows that use `ClienteAutocomplete` — `LancamentoForm`, `AgendarSlotForm`, `AtenderAgoraForm`. The public booking page (`public-booking-flow.tsx`, self-service, no staff involved) is intentionally left out to avoid re-touching `criar_agendamento_publico`'s signature (Task 2); it has no cadastro/edit screen of its own yet where a birthday could be added later either, so this is a real gap, not an oversight — flag it to the user if a birthday needs to be captured from a client who only ever books publicly.

**Interfaces:**
- Produces: `ClienteAutocomplete`'s `onResolved` now reports `{ nome, telefone, totalCortes, dataNascimento? }` (added `dataNascimento?: string`, ISO `yyyy-mm-dd` or `undefined`). Callers that don't care about it (none remain after this task) can still ignore it structurally.

- [ ] **Step 1: Add the birthday input to `ClienteAutocomplete`**

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
  onResolved: (info: { nome: string; telefone: string; totalCortes: number; dataNascimento?: string }) => void
  valorInicial?: { nome: string; telefone: string }
}) {
  const [nome, setNome] = useState(valorInicial?.nome ?? '')
  const [telefone, setTelefone] = useState(valorInicial?.telefone ?? '')
  const [dataNascimento, setDataNascimento] = useState('')
  const [info, setInfo] = useState<string | null>(null)
  // Refs (not just state) so onResolved always reads the latest value
  // regardless of render timing.
  const nomeRef = useRef(valorInicial?.nome ?? '')
  const telefoneRef = useRef(valorInicial?.telefone ?? '')
  const dataNascimentoRef = useRef('')

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
    onResolved({ nome: value, telefone: telefoneRef.current, totalCortes: 0, dataNascimento: dataNascimentoRef.current || undefined })
  }

  function handleDataNascimentoChange(value: string) {
    dataNascimentoRef.current = value
    setDataNascimento(value)
    onResolved({ nome: nomeRef.current, telefone: telefoneRef.current, totalCortes: 0, dataNascimento: value || undefined })
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
    onResolved({ nome: nomeRef.current, telefone: tel, totalCortes: 0, dataNascimento: dataNascimentoRef.current || undefined })
    if (tel.length < 10) return
    const supabase = getBrowserSupabaseClient()
    const { data: rows } = await supabase.rpc('reconhecer_cliente', { p_barbearia_id: barbeariaId, p_telefone: tel })
    const encontrado = rows?.[0]
    if (encontrado) {
      nomeRef.current = encontrado.nome
      setNome(encontrado.nome)
      setInfo(`${encontrado.total_cortes}º corte deste cliente aqui`)
      onResolved({ nome: encontrado.nome, telefone: tel, totalCortes: encontrado.total_cortes, dataNascimento: dataNascimentoRef.current || undefined })
    } else {
      setInfo(null)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Input placeholder="Nome do cliente" value={nome} onChange={(e) => handleNomeChange(e.target.value)} />
      <Input placeholder="Telefone" value={telefone} onChange={(e) => verificar(e.target.value)} />
      <Input type="date" placeholder="Data de nascimento (opcional)" value={dataNascimento} onChange={(e) => handleDataNascimentoChange(e.target.value)} />
      {info && <span className="text-xs text-muted-foreground">{info}</span>}
    </div>
  )
}
```

- [ ] **Step 2: Forward `dataNascimento` from the three internal callers**

In `src/components/lancamento-form.tsx`, widen the cliente state type and forward the value:
```tsx
  const [cliente, setCliente] = useState<{ nome: string; telefone: string } | null>(
```
to:
```tsx
  const [cliente, setCliente] = useState<{ nome: string; telefone: string; dataNascimento?: string } | null>(
```
and in `salvar()`, change:
```tsx
    const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
      p_barbearia_id: barbeariaId, p_nome: cliente.nome, p_telefone: cliente.telefone,
    })
```
to:
```tsx
    const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
      p_barbearia_id: barbeariaId, p_nome: cliente.nome, p_telefone: cliente.telefone, p_data_nascimento: cliente.dataNascimento ?? null,
    })
```

In `src/components/agendar-slot-form.tsx`, same two edits: widen `useState<{ nome: string; telefone: string } | null>(null)` to include `dataNascimento?: string`, and add `p_data_nascimento: cliente!.dataNascimento ?? null` to the `criar_ou_obter_cliente` call inside `gravar()`.

In `src/components/atender-agora-form.tsx`, same two edits: widen the cliente state type, and add `p_data_nascimento: cliente.dataNascimento ?? null` to its `criar_ou_obter_cliente` call.

- [ ] **Step 3: Show the birthday on the ficha do cliente**

In `src/components/ficha-cliente.tsx`, change the `cliente` select:
```tsx
  const { data: cliente } = await supabase.from('clientes').select('nome, telefone, criado_em').eq('id', clienteId).single()
```
to:
```tsx
  const { data: cliente } = await supabase.from('clientes').select('nome, telefone, criado_em, data_nascimento').eq('id', clienteId).single()
```
and change the header line:
```tsx
      <p className="font-medium">{cliente?.nome} · {cliente?.telefone}</p>
```
to:
```tsx
      <p className="font-medium">{cliente?.nome} · {cliente?.telefone}{cliente?.data_nascimento ? ` · nasc. ${new Date(cliente.data_nascimento).toLocaleDateString()}` : ''}</p>
```

- [ ] **Step 4: Manual verification**

With the dev server running, as `barbeiro@teste.com`: open "Atender agora", fill a brand-new cliente including a birthday, save. Open that cliente's ficha (`/painel/clientes/[id]`) and confirm the birthday shows in the header line.

- [ ] **Step 5: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/cliente-autocomplete.tsx src/components/lancamento-form.tsx src/components/agendar-slot-form.tsx src/components/atender-agora-form.tsx src/components/ficha-cliente.tsx
git commit -m "feat: capture cliente aniversário in the internal booking/attend flows, show it on the ficha"
```

---

### Task 13: Ficha do cliente — histórico de agendamentos + histórico de prospecção

**Files:**
- Modify: `src/components/ficha-cliente.tsx`

**Interfaces:**
- No new exported interface — adds two read-only sections to the existing server component.

- [ ] **Step 1: Add the two new queries**

In `src/components/ficha-cliente.tsx`, after the existing `vendas` query, add:

```tsx
  const { data: agendamentosHistorico } = await supabase
    .from('agendamentos')
    .select('data, hora_inicio, status, servicos(nome)')
    .eq('cliente_id', clienteId)
    .order('data', { ascending: false }) as { data: { data: string; hora_inicio: string; status: string; servicos: { nome: string } | null }[] | null }

  const { data: prospeccaoHistorico } = await supabase
    .from('prospeccoes')
    .select('data, canal, status, convertido_em')
    .eq('cliente_id', clienteId)
    .order('criado_em', { ascending: false }) as { data: { data: string; canal: string | null; status: string; convertido_em: string | null }[] | null }
```

- [ ] **Step 2: Render the two new sections**

After the existing "Histórico completo" block (the `{historico.map(...)}` section), add:

```tsx
      <h3 className="font-medium mt-4 mb-2">Agendamentos</h3>
      {(agendamentosHistorico ?? []).map((a, i) => (
        <div key={i} className="flex justify-between text-sm border-b py-1">
          <span>{new Date(a.data).toLocaleDateString()} {a.hora_inicio.slice(0, 5)} — {a.servicos?.nome ?? '—'}</span>
          <span className="text-muted-foreground">{a.status}</span>
        </div>
      ))}

      {(prospeccaoHistorico ?? []).length > 0 && (
        <>
          <h3 className="font-medium mt-4 mb-2">Prospecção</h3>
          {prospeccaoHistorico!.map((p, i) => (
            <div key={i} className="flex justify-between text-sm border-b py-1">
              <span>{new Date(p.data).toLocaleDateString()} — {p.canal ?? 'sem canal'}</span>
              <span className="text-muted-foreground">{p.status}{p.convertido_em ? ` (${new Date(p.convertido_em).toLocaleDateString()})` : ''}</span>
            </div>
          ))}
        </>
      )}
```

- [ ] **Step 3: Manual verification**

With the dev server running: open a cliente's ficha who has both a cancelled and a realizado agendamento — confirm both show up in the "Agendamentos" section (unlike the Agenda grid, which hides cancelled ones). For a cliente created via prospecção, confirm the "Prospecção" section shows and the status matches what Task 5's triggers set.

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/ficha-cliente.tsx
git commit -m "feat: ficha do cliente shows full agendamento and prospecção history"
```

---

### Task 14: Prospecção — telefone/nome obrigatórios, status manual restrito

**Files:**
- Modify: `src/app/painel/prospeccao/page.tsx` (whole file)
- Delete: `src/components/prospeccao-converter-form.tsx`
- Create: `src/components/prospeccao-status-form.tsx`

**Interfaces:**
- Produces: `ProspeccaoStatusForm({ prospeccaoId, statusAtual }: { prospeccaoId: string; statusAtual: string })` — a small inline `<select>` limited to `novo_lead`/`em_contato`/`interessado` (matching the RLS UPDATE policy from Task 4) with a save button, replacing `ProspeccaoConverterForm`'s manual "Converteu" button.

- [ ] **Step 1: Delete the manual converter**

```bash
git rm src/components/prospeccao-converter-form.tsx
```

- [ ] **Step 2: Write `ProspeccaoStatusForm`**

Create `src/components/prospeccao-status-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

const OPCOES = [
  { value: 'novo_lead', label: 'Novo lead' },
  { value: 'em_contato', label: 'Em contato' },
  { value: 'interessado', label: 'Interessado' },
]

// agendou/compareceu/convertido/nao_convertido não aparecem aqui de
// propósito — esses só mudam sozinhos, via o agendamento vinculado (ver
// migration 0015_prospeccao_auto_conversao.sql), nunca por edição manual.
export function ProspeccaoStatusForm({ prospeccaoId, statusAtual }: { prospeccaoId: string; statusAtual: string }) {
  const [status, setStatus] = useState(statusAtual)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('prospeccoes').update({ status }).eq('id', prospeccaoId)
    setSalvando(false)
    window.location.reload()
  }

  return (
    <div className="flex gap-2 items-center">
      <select value={status} onChange={(e) => setStatus(e.target.value)} className="border rounded px-2 py-1">
        {OPCOES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Button type="button" onClick={salvar} disabled={salvando || status === statusAtual}>Salvar</Button>
    </div>
  )
}
```

- [ ] **Step 3: Rewrite the prospecção page**

Replace `src/app/painel/prospeccao/page.tsx` in full:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ProspeccaoStatusForm } from '@/components/prospeccao-status-form'

async function novoContato(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()

  const nome = formData.get('nome') as string
  const telefone = formData.get('telefone') as string

  const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
    p_barbearia_id: membro!.barbearia_id, p_nome: nome, p_telefone: telefone,
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

export default async function ProspeccaoPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id, meta_prospeccao_dia').eq('user_id', user!.id).single()

  const hoje = new Date().toISOString().slice(0, 10)
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

  const { data: contatosHoje } = await supabase.from('prospeccoes').select('id').eq('membro_id', membro!.id).eq('data', hoje)
  const { data: convertidosHoje } = await supabase.from('prospeccoes').select('id').eq('membro_id', membro!.id).gte('convertido_em', `${hoje}T00:00:00`)
  const { data: pendentes } = await supabase.from('prospeccoes').select('*').eq('membro_id', membro!.id).in('status', ['novo_lead', 'em_contato', 'interessado']).order('criado_em')
  const { data: contatosMes } = await supabase.from('prospeccoes').select('status').eq('membro_id', membro!.id).gte('data', inicioMes)

  const totalContatosHoje = contatosHoje?.length ?? 0
  const meta = membro!.meta_prospeccao_dia ?? 0
  const totalMes = contatosMes?.length ?? 0
  const convertidosMes = contatosMes?.filter((c) => c.status === 'convertido').length ?? 0
  const naoConvertidosMes = contatosMes?.filter((c) => c.status === 'nao_convertido').length ?? 0
  const finalizadosMes = convertidosMes + naoConvertidosMes
  const taxaMes = finalizadosMes > 0 ? Math.round((convertidosMes / finalizadosMes) * 100) : 0

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

      <form action={novoContato} className="flex gap-2 items-center mt-4 flex-wrap">
        <input name="nome" placeholder="Nome" required className="border rounded px-2 py-1" />
        <input name="telefone" placeholder="Telefone" required className="border rounded px-2 py-1" />
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
          <span>{p.nome} · {p.telefone} · {p.canal ?? 'sem canal'}{p.oferta_corte_gratis && ' · corte grátis'} · {new Date(p.criado_em).toLocaleDateString()}</span>
          <ProspeccaoStatusForm prospeccaoId={p.id} statusAtual={p.status} />
        </div>
      ))}

      <h2 className="font-medium mt-6 mb-2">Conversão</h2>
      <p>Convertidos hoje: {convertidosHoje?.length ?? 0}</p>
      <p>Taxa de conversão deste mês: {taxaMes}% ({finalizadosMes} finalizados de {totalMes} prospectados — os que ainda não agendaram/compareceram não entram nessa conta)</p>
    </div>
  )
}
```

- [ ] **Step 4: Manual verification**

With the dev server running, as `barbeiro@teste.com`: submit "+ Novo contato prospectado" with nome+telefone — confirm it appears under "Pendentes". Change its status to "Interessado" via the new inline select and confirm it persists after reload. Book that same telefone through the Agenda and confirm the row disappears from "Pendentes" (its status auto-moved to `agendou`, which the pendentes query no longer includes).

- [ ] **Step 5: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: prospecção contact form requires telefone/nome, status edits limited to pre-visit values"
```

---

### Task 15: Relatório de conversão de prospecção (admin)

**Files:**
- Create: `src/app/admin/prospeccao/page.tsx`
- Modify: `src/app/admin/layout.tsx:6-12`

**Interfaces:**
- No new exported interface — a new server-rendered admin-only page.

- [ ] **Step 1: Add the nav item**

In `src/app/admin/layout.tsx`, change:
```tsx
const NAV_ITEMS = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/servicos', label: 'Serviços' },
  { href: '/admin/produtos', label: 'Produtos' },
  { href: '/admin/planos-carreira', label: 'Planos de carreira' },
  { href: '/admin/barbeiros', label: 'Barbeiros' },
]
```
to:
```tsx
const NAV_ITEMS = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/servicos', label: 'Serviços' },
  { href: '/admin/produtos', label: 'Produtos' },
  { href: '/admin/planos-carreira', label: 'Planos de carreira' },
  { href: '/admin/barbeiros', label: 'Barbeiros' },
  { href: '/admin/prospeccao', label: 'Prospecção' },
]
```

- [ ] **Step 2: Write the report page**

Create `src/app/admin/prospeccao/page.tsx`:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'

type Linha = {
  nome: string
  telefone: string
  data: string
  convertido_em: string | null
  status: string
  agendamento_id: string | null
  membros: { nome: string } | null
}
type ItemAtendimento = { agendamento_id: string | null; preco: number; servicos: { nome: string } | null }
type ItemVenda = { agendamento_id: string | null; preco_unitario: number; quantidade: number; produtos: { nome: string } | null }

export default async function AdminProspeccaoPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const { data: convertidos } = await supabase
    .from('prospeccoes')
    .select('nome, telefone, data, convertido_em, status, agendamento_id, membros(nome)')
    .eq('barbearia_id', membro!.barbearia_id)
    .eq('status', 'convertido')
    .order('convertido_em', { ascending: false }) as { data: Linha[] | null }

  const agendamentoIds = (convertidos ?? []).map((c) => c.agendamento_id).filter((id): id is string => id !== null)

  const { data: atendimentosPorAgendamento } = await supabase
    .from('atendimentos')
    .select('agendamento_id, preco, servicos(nome)')
    .in('agendamento_id', agendamentoIds.length > 0 ? agendamentoIds : ['00000000-0000-0000-0000-000000000000']) as { data: ItemAtendimento[] | null }

  const { data: vendasPorAgendamento } = await supabase
    .from('vendas_produtos')
    .select('agendamento_id, preco_unitario, quantidade, produtos(nome)')
    .eq('barbearia_id', membro!.barbearia_id) as { data: ItemVenda[] | null }

  const linhas = (convertidos ?? []).map((c) => {
    const servicos = (atendimentosPorAgendamento ?? []).filter((a) => a.agendamento_id === c.agendamento_id)
    const produtos = (vendasPorAgendamento ?? []).filter((v) => v.agendamento_id === c.agendamento_id)
    const valorServicos = servicos.reduce((s, a) => s + Number(a.preco), 0)
    const valorProdutos = produtos.reduce((s, v) => s + Number(v.preco_unitario) * v.quantidade, 0)
    return {
      ...c,
      servicosTexto: servicos.map((s) => s.servicos?.nome ?? '—').join(', ') || '—',
      produtosTexto: produtos.map((p) => `${p.quantidade}x ${p.produtos?.nome ?? '—'}`).join(', ') || '—',
      valorTotal: valorServicos + valorProdutos,
    }
  })

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Conversão de prospecção</h1>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th>Nome</th><th>Telefone</th><th>Prospecção</th><th>Atendimento</th>
            <th>Serviços</th><th>Produtos</th><th>Total</th><th>Profissional</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-t">
              <td>{l.nome}</td>
              <td>{l.telefone}</td>
              <td>{new Date(l.data).toLocaleDateString()}</td>
              <td>{l.convertido_em ? new Date(l.convertido_em).toLocaleDateString() : '—'}</td>
              <td>{l.servicosTexto}</td>
              <td>{l.produtosTexto}</td>
              <td>R$ {l.valorTotal.toFixed(2)}</td>
              <td>{l.membros?.nome ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Manual verification**

With the dev server running, as `admin@teste.com`: after converting at least one prospecção end-to-end (register contact → book → attend with a serviço and a produto), open `/admin/prospeccao` and confirm the row shows the right serviços/produtos/total/profissional.

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/prospeccao/page.tsx src/app/admin/layout.tsx
git commit -m "feat: add admin prospecção conversion report"
```

---

### Task 16: Dashboard — indicadores de agendamento + bloco de prospecção

**Files:**
- Modify: `src/app/painel/page.tsx`
- Modify: `src/app/admin/page.tsx`

**Interfaces:**
- No new exported interface — extends the two existing dashboard pages with two additional query blocks and two additional rendered sections each, entirely additive (no existing markup/queries removed).

- [ ] **Step 1: Add the two new query blocks to the barbeiro dashboard**

In `src/app/painel/page.tsx`, after the existing `vendas` query, add:

```tsx
  const { data: agendamentosMes } = await supabase
    .from('agendamentos')
    .select('status, vezes_remarcado')
    .eq('membro_id', membro!.id)
    .gte('data', inicioMes)

  const totalAgendamentos = agendamentosMes?.length ?? 0
  const realizados = agendamentosMes?.filter((a) => a.status === 'realizado').length ?? 0
  const naoCompareceram = agendamentosMes?.filter((a) => a.status === 'nao_compareceu').length ?? 0
  const cancelados = agendamentosMes?.filter((a) => a.status === 'cancelado').length ?? 0
  const remarcados = (agendamentosMes ?? []).reduce((s, a) => s + a.vezes_remarcado, 0)

  const { data: prospeccoesMes } = await supabase
    .from('prospeccoes')
    .select('status, agendamento_id')
    .eq('membro_id', membro!.id)
    .gte('data', inicioMes)

  const prospectados = prospeccoesMes?.length ?? 0
  const convertidosProspeccao = prospeccoesMes?.filter((p) => p.status === 'convertido').length ?? 0
  const naoConvertidosProspeccao = prospeccoesMes?.filter((p) => p.status === 'nao_convertido').length ?? 0
  const agendamentoIdsConvertidos = (prospeccoesMes ?? [])
    .filter((p) => p.status === 'convertido' && p.agendamento_id)
    .map((p) => p.agendamento_id as string)

  const { data: atendimentosProspeccao } = await supabase
    .from('atendimentos')
    .select('preco')
    .in('agendamento_id', agendamentoIdsConvertidos.length > 0 ? agendamentoIdsConvertidos : ['00000000-0000-0000-0000-000000000000'])
  const { data: vendasProspeccao } = await supabase
    .from('vendas_produtos')
    .select('preco_unitario, quantidade')
    .in('agendamento_id', agendamentoIdsConvertidos.length > 0 ? agendamentoIdsConvertidos : ['00000000-0000-0000-0000-000000000000'])

  const faturamentoProspeccao =
    (atendimentosProspeccao ?? []).reduce((s, a) => s + Number(a.preco), 0) +
    (vendasProspeccao ?? []).reduce((s, v) => s + Number(v.preco_unitario) * v.quantidade, 0)
```

- [ ] **Step 2: Render the two new sections**

At the end of the returned JSX in `src/app/painel/page.tsx`, right before the closing `</div>`, add:

```tsx
      <h2 className="font-medium mt-6 mb-2">Indicadores de agendamento (mês) — não somado ao financeiro acima</h2>
      <div className="flex gap-4 flex-wrap">
        <p>Total: <strong>{totalAgendamentos}</strong></p>
        <p>Realizados: <strong>{realizados}</strong></p>
        <p>Não compareceram: <strong>{naoCompareceram}</strong></p>
        <p>Cancelados: <strong>{cancelados}</strong></p>
        <p>Remarcados: <strong>{remarcados}</strong></p>
      </div>

      <h2 className="font-medium mt-6 mb-2">Prospecção (mês)</h2>
      <div className="flex gap-4 flex-wrap">
        <p>Prospectados: <strong>{prospectados}</strong></p>
        <p>Convertidos: <strong>{convertidosProspeccao}</strong></p>
        <p>Não convertidos: <strong>{naoConvertidosProspeccao}</strong></p>
        <p>Faturamento gerado: <strong>R$ {faturamentoProspeccao.toFixed(2)}</strong></p>
      </div>
```

- [ ] **Step 3: Same two blocks on the admin overview, scoped to the whole barbearia**

In `src/app/admin/page.tsx`, after the existing `barbeiros` query, add:

```tsx
  const { data: agendamentosMes } = await supabase
    .from('agendamentos')
    .select('status, vezes_remarcado')
    .eq('barbearia_id', membro!.barbearia_id)
    .gte('data', inicioMes)

  const totalAgendamentos = agendamentosMes?.length ?? 0
  const realizadosCount = agendamentosMes?.filter((a) => a.status === 'realizado').length ?? 0
  const naoCompareceram = agendamentosMes?.filter((a) => a.status === 'nao_compareceu').length ?? 0
  const canceladosCount = agendamentosMes?.filter((a) => a.status === 'cancelado').length ?? 0
  const remarcados = (agendamentosMes ?? []).reduce((s, a) => s + a.vezes_remarcado, 0)

  const { data: prospeccoesMes } = await supabase
    .from('prospeccoes')
    .select('status, agendamento_id')
    .eq('barbearia_id', membro!.barbearia_id)
    .gte('data', inicioMes)

  const prospectados = prospeccoesMes?.length ?? 0
  const convertidosProspeccao = prospeccoesMes?.filter((p) => p.status === 'convertido').length ?? 0
  const naoConvertidosProspeccao = prospeccoesMes?.filter((p) => p.status === 'nao_convertido').length ?? 0
  const agendamentoIdsConvertidos = (prospeccoesMes ?? [])
    .filter((p) => p.status === 'convertido' && p.agendamento_id)
    .map((p) => p.agendamento_id as string)

  const { data: atendimentosProspeccao } = await supabase
    .from('atendimentos')
    .select('preco')
    .in('agendamento_id', agendamentoIdsConvertidos.length > 0 ? agendamentoIdsConvertidos : ['00000000-0000-0000-0000-000000000000'])
  const { data: vendasProspeccao } = await supabase
    .from('vendas_produtos')
    .select('preco_unitario, quantidade')
    .in('agendamento_id', agendamentoIdsConvertidos.length > 0 ? agendamentoIdsConvertidos : ['00000000-0000-0000-0000-000000000000'])

  const faturamentoProspeccao =
    (atendimentosProspeccao ?? []).reduce((s, a) => s + Number(a.preco), 0) +
    (vendasProspeccao ?? []).reduce((s, v) => s + Number(v.preco_unitario) * v.quantidade, 0)
```

Note the local names `realizadosCount`/`canceladosCount` avoid colliding with this page's existing `barbeiros`/`linhas` variables — check the file for any other naming collision before inserting and adjust if `realizados`/`cancelados` are already used elsewhere in it (they are not, per the current file content, but keep the suffixed names regardless for clarity against the `Barbeiros` table's per-row `faturamentoB` naming convention already in the file).

Then add, right before the closing `</div>` of the returned JSX:

```tsx
      <h2 className="font-medium mt-6 mb-2">Indicadores de agendamento (mês, toda a barbearia) — não somado ao financeiro acima</h2>
      <div className="flex gap-4 flex-wrap">
        <p>Total: <strong>{totalAgendamentos}</strong></p>
        <p>Realizados: <strong>{realizadosCount}</strong></p>
        <p>Não compareceram: <strong>{naoCompareceram}</strong></p>
        <p>Cancelados: <strong>{canceladosCount}</strong></p>
        <p>Remarcados: <strong>{remarcados}</strong></p>
      </div>

      <h2 className="font-medium mt-6 mb-2">Prospecção (mês, toda a barbearia)</h2>
      <div className="flex gap-4 flex-wrap">
        <p>Prospectados: <strong>{prospectados}</strong></p>
        <p>Convertidos: <strong>{convertidosProspeccao}</strong></p>
        <p>Não convertidos: <strong>{naoConvertidosProspeccao}</strong></p>
        <p>Faturamento gerado: <strong>R$ {faturamentoProspeccao.toFixed(2)}</strong></p>
      </div>
```

- [ ] **Step 4: Manual verification**

With the dev server running: as `barbeiro@teste.com`, open `/painel` and confirm the two new sections render with sane numbers (compare "Realizados" against the number of atendimentos you've actually completed this session). As `admin@teste.com`, open `/admin` and confirm the barbearia-wide versions match (should be equal or greater than the barbeiro-scoped ones, single-barbeiro test data notwithstanding).

- [ ] **Step 5: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/painel/page.tsx src/app/admin/page.tsx
git commit -m "feat: dashboard gains agendamento indicators and prospecção results, kept separate from faturamento"
```

---

### Task 17: Regressão final

**Files:** none (verification only).

- [ ] **Step 1: Full automated regression**

Run, in order:
```bash
npx supabase db reset
npx supabase test db
npm test
npm run build
```
Expected: all 15 migrations apply cleanly in order; every pgTAP file (`0001`, `0003`–`0009`) passes; both Vitest unit tests pass; the production build completes with no type errors and all routes present (note `/painel/lancamentos` and `internal-booking-form`/`prospeccao-converter-form` should no longer appear in the route list / bundle).

- [ ] **Step 2: Re-seed local test data**

The `db reset` in Step 1 wipes the manually-seeded `admin@teste.com`/`barbeiro@teste.com` fixtures from this session. Re-run the same seed script used earlier this session (`docker exec -i supabase_db_barbearia-mvp psql -U postgres -d postgres` piped the seed SQL) so manual verification has data to work with — the seed rows (barbearia "teste", both accounts, Corte/Barba serviços, Pomada produto, horários 09:00–18:00) don't reference any status/column this plan changed, so the same script works unmodified.

- [ ] **Step 3: Manual end-to-end walkthrough**

As `barbeiro@teste.com`:
1. Prospecção: register a contact with nome+telefone.
2. Agenda: book that same telefone for tomorrow — confirm the prospecção row disappears from "Pendentes" (auto-moved to `agendou`).
3. Public link `/teste`: book a *different* slot as a simulated público client — confirm it shows as `agendado` (not `confirmado`) in the Agenda, with Confirmar/Cancelar actions.
4. Confirm that público booking.
5. Book a second internal agendamento overlapping an existing one on purpose — confirm the warning appears and "Confirmar mesmo assim" still lets it through.
6. Attend the prospected client's agendamento (add a serviço + a produto) — confirm the prospecção auto-flips to `convertido`.
7. Dashboard (`/painel`): confirm "Indicadores de agendamento" and "Prospecção" sections show correct counts, and the existing "Resultados reais" numbers only reflect the one attended visit, not the still-pending agendamentos.
8. Admin (`/admin`): confirm `/admin/prospeccao` lists the converted lead with correct serviços/produtos/total.
9. "Atender agora": run a full walk-in, confirm it completes without ever visiting a route that no longer exists.

- [ ] **Step 4: No commit for this task** — it's verification-only; if any issue surfaces, fix it as a small follow-up commit referencing which task's step regressed.

---

## Self-Review Notes

- **Spec coverage:** item 1 (remove Lançamentos) → Task 6; item 2 (agenda 1h, click-to-create, no fixed form) → Tasks 7–8; item 3 (conflict = warning not block) → Task 9; item 4 (cliente db, reuse, aniversário) → Tasks 3, 12 (reuse already existed pre-plan via `criar_ou_obter_cliente`); item 5 (atendimento + extras) → already correct pre-plan, untouched; item 6 (status list) → Task 1; item 7/8/17 (agendamento ≠ faturamento) → already correct pre-plan (verified in the design doc's Contexto), Task 16 adds the missing indicator surface; item 9 (indicadores perdidos) → Task 16; items 10–12 (prospecção cadastro/telefone/conversão automática) → Tasks 4, 5, 14; item 13 (relatório) → Task 15; item 14 (faturamento por prospecção) → Task 16; item 15 (histórico completo do cliente) → Task 13; item 16 (fluxo completo) → emergent from Tasks 1–16 together, exercised end-to-end in Task 17.
- **Placeholder scan:** none found — every step has literal file contents or exact commands.
- **Type consistency:** `ModoAgenda` shape (`agendamentoId, clienteNome, clienteTelefone, servicoId, horaInicio`) is identical across its definition (Task 6) and every producer (`AgendaDia`'s existing call, `AtenderAgoraForm` in Task 11). `ClienteAutocomplete`'s `onResolved` signature (Task 12) is a strict superset of its pre-Task-12 shape, so no caller breaks. `criar_ou_obter_cliente`'s 4-arg signature (Task 3) is called with the 4th arg only from Task 12 onward; Tasks 4–11 keep calling it with 3 args, which still resolves via the default.
