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

-- security definer is required here: barbeiro has no UPDATE policy on
-- produtos (only admin does, via "admin gerencia produtos" for all) — stock
-- deduction is a system-level side effect of the sale, not something a
-- barbeiro is meant to directly edit. Without security definer this
-- function runs as the caller, and Postgres RLS requires SELECT ... FOR
-- UPDATE (and the subsequent UPDATE) to satisfy an UPDATE policy's USING
-- clause, not just a SELECT policy's — so the trigger would silently see
-- zero rows and always raise "Produto inválido para esta barbearia" for a
-- barbeiro, even though the plain "membros leem produtos" SELECT policy
-- lets them read the same row fine.
create or replace function public.processar_venda_produto()
returns trigger language plpgsql security definer set search_path = public as $$
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
-- Validates cliente_id/servico_id/agendamento_id belong to the caller's own
-- barbearia too, not just membro_id/barbearia_id — same cross-tenant FK gap
-- already fixed on agendamentos (Task 8) and servico_barbeiros (Task 4).
create policy "barbeiro insere proprios atendimentos" on atendimentos for insert
  with check (
    membro_id = auth_membro_id()
    and barbearia_id = auth_barbearia_id()
    and exists (select 1 from clientes c where c.id = cliente_id and c.barbearia_id = auth_barbearia_id())
    and exists (select 1 from servicos s where s.id = servico_id and s.barbearia_id = auth_barbearia_id())
    and (agendamento_id is null or exists (select 1 from agendamentos a where a.id = agendamento_id and a.barbearia_id = auth_barbearia_id()))
  );
create policy "admin edita atendimentos" on atendimentos for update
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
create policy "admin remove atendimentos" on atendimentos for delete
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');

create policy "admin le vendas_produtos da barbearia" on vendas_produtos for select
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
create policy "barbeiro le proprias vendas_produtos" on vendas_produtos for select
  using (membro_id = auth_membro_id());
create policy "barbeiro insere proprias vendas_produtos" on vendas_produtos for insert
  with check (
    membro_id = auth_membro_id()
    and barbearia_id = auth_barbearia_id()
    and exists (select 1 from clientes c where c.id = cliente_id and c.barbearia_id = auth_barbearia_id())
    and exists (select 1 from produtos p where p.id = produto_id and p.barbearia_id = auth_barbearia_id())
  );
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
