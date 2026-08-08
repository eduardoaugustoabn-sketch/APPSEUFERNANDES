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

-- Harden membros update policy to validate plano_carreira_id belongs to same tenant
drop policy "admin atualiza membros" on membros;
create policy "admin atualiza membros"
  on membros for update
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin')
  with check (
    barbearia_id = auth_barbearia_id()
    and auth_papel() = 'admin'
    and (plano_carreira_id is null or exists (
      select 1 from planos_carreira pc where pc.id = plano_carreira_id and pc.barbearia_id = auth_barbearia_id()
    ))
  );
