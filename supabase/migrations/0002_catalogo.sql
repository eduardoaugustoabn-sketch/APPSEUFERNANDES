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
