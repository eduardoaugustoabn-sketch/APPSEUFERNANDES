create table sonhos_pessoais (
  id uuid primary key default gen_random_uuid(),
  membro_id uuid not null references membros(id) on delete cascade,
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  nome text not null,
  valor_alvo numeric(10,2) not null check (valor_alvo > 0),
  percentual numeric(5,2) not null check (percentual > 0 and percentual <= 100),
  status text not null default 'ativo' check (status in ('ativo', 'conquistado', 'cancelado')),
  criado_em timestamptz not null default now(),
  concluido_em timestamptz
);

alter table sonhos_pessoais enable row level security;

create policy "barbeiro gerencia proprios sonhos" on sonhos_pessoais for all
  using (membro_id = auth_membro_id())
  with check (membro_id = auth_membro_id());

create policy "admin le sonhos da barbearia" on sonhos_pessoais for select
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
