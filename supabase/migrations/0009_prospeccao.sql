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
-- A fresh contact is always 'contactado' with no cliente_id — conversion
-- happens later via UPDATE (below). Without pinning that shape here, the
-- insert policy would let a barbeiro submit a row already marked
-- 'convertido' with an arbitrary cliente_id (any UUID that exists in
-- clientes, tenant unchecked), bypassing criar_ou_obter_cliente() entirely
-- and forging a conversion metric or cross-tenant client reference — same
-- FK/state gap already closed on agendamentos/atendimentos/vendas_produtos.
create policy "barbeiro insere proprias prospeccoes" on prospeccoes for insert
  with check (
    membro_id = auth_membro_id()
    and barbearia_id = auth_barbearia_id()
    and status = 'contactado'
    and cliente_id is null
  );
-- cliente_id is nullable and only ever set on conversion (via UPDATE, not
-- INSERT — see ProspeccaoConverterForm, Task 17), so the tenant-FK check
-- for it belongs here, following the same pattern as Tasks 8/11/12.
create policy "barbeiro atualiza proprias prospeccoes" on prospeccoes for update
  using (membro_id = auth_membro_id())
  with check (
    membro_id = auth_membro_id()
    and (cliente_id is null or exists (select 1 from clientes c where c.id = cliente_id and c.barbearia_id = auth_barbearia_id()))
  );
create policy "admin gerencia todas prospeccoes" on prospeccoes for all
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin')
  with check (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
