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

-- Public (anon) read: the public booking page (/[barbeariaSlug], Task 10)
-- resolves a barbearia by slug with no login, so it needs its own policy —
-- the "membros leem a propria barbearia" policy above only matches an
-- authenticated member's own tenant. barbearias holds no sensitive data
-- (just nome/slug/criado_em), so exposing every row is safe, mirroring the
-- "publico le servicos ativos" pattern used on servicos (Task 4).
create policy "publico le barbearias"
  on barbearias for select
  to anon using (true);

-- Public (anon) read: the public booking page (/[barbeariaSlug], Task 10)
-- needs to list active barbeiros by name with no login, but must not expose
-- telefone/foto_url. RLS is row-level only, so it can't hide a column by
-- itself — with auto_expose_new_tables=true, anon already holds a
-- full-column SELECT grant by default, so that grant is narrowed explicitly
-- to just the columns the public flow needs.
revoke select on membros from anon;
grant select (id, barbearia_id, papel, nome, ativo) on membros to anon;

create policy "publico le barbeiros ativos"
  on membros for select
  to anon using (papel = 'barbeiro' and ativo = true);

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
