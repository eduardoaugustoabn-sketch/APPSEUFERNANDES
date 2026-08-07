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
  using (
    barbearia_id = auth_barbearia_id()
    and auth_papel() = 'admin'
    and exists (select 1 from membros m where m.id = membro_id and m.barbearia_id = auth_barbearia_id())
    and exists (select 1 from clientes c where c.id = cliente_id and c.barbearia_id = auth_barbearia_id())
    and exists (select 1 from servicos s where s.id = servico_id and s.barbearia_id = auth_barbearia_id())
  );
create policy "barbeiro le proprios agendamentos" on agendamentos for select
  using (
    barbearia_id = auth_barbearia_id()
    and membro_id = auth_membro_id()
  );
create policy "admin gerencia agendamentos" on agendamentos for all
  using (
    barbearia_id = auth_barbearia_id()
    and auth_papel() = 'admin'
    and exists (select 1 from membros m where m.id = membro_id and m.barbearia_id = auth_barbearia_id())
    and exists (select 1 from clientes c where c.id = cliente_id and c.barbearia_id = auth_barbearia_id())
    and exists (select 1 from servicos s where s.id = servico_id and s.barbearia_id = auth_barbearia_id())
  )
  with check (
    barbearia_id = auth_barbearia_id()
    and auth_papel() = 'admin'
    and exists (select 1 from membros m where m.id = membro_id and m.barbearia_id = auth_barbearia_id())
    and exists (select 1 from clientes c where c.id = cliente_id and c.barbearia_id = auth_barbearia_id())
    and exists (select 1 from servicos s where s.id = servico_id and s.barbearia_id = auth_barbearia_id())
  );
create policy "barbeiro atualiza proprio agendamento" on agendamentos for update
  using (
    barbearia_id = auth_barbearia_id()
    and membro_id = auth_membro_id()
    and exists (select 1 from clientes c where c.id = cliente_id and c.barbearia_id = auth_barbearia_id())
    and exists (select 1 from servicos s where s.id = servico_id and s.barbearia_id = auth_barbearia_id())
  )
  with check (
    barbearia_id = auth_barbearia_id()
    and membro_id = auth_membro_id()
    and exists (select 1 from clientes c where c.id = cliente_id and c.barbearia_id = auth_barbearia_id())
    and exists (select 1 from servicos s where s.id = servico_id and s.barbearia_id = auth_barbearia_id())
  );
-- Task 8 originally omitted a barbeiro INSERT policy, which would block the
-- internal booking flow (Task 11) entirely for a logged-in barbeiro — the
-- public flow inserts via the security-definer criar_agendamento_publico()
-- RPC instead, so this gap only surfaces once an authenticated caller
-- inserts directly. Same tenant-FK-validation shape as the update policy
-- above (Task 8's fix pattern).
create policy "barbeiro insere proprio agendamento" on agendamentos for insert
  with check (
    barbearia_id = auth_barbearia_id()
    and membro_id = auth_membro_id()
    and exists (select 1 from clientes c where c.id = cliente_id and c.barbearia_id = auth_barbearia_id())
    and exists (select 1 from servicos s where s.id = servico_id and s.barbearia_id = auth_barbearia_id())
  );
-- No anon policy on agendamentos: public writes go exclusively through the
-- criar_agendamento_publico() RPC (Task 9), and availability is read
-- exclusively through the horarios_disponiveis() RPC (Task 9) — anon never
-- gets a raw SELECT/INSERT grant on this table, so client PII in it is
-- never directly queryable by the public.
