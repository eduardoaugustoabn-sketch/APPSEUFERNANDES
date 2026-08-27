-- Produtos de varejo (roupas, perfumes) independentes de uma visita/
-- atendimento — espelha produtos/vendas_produtos (0002_catalogo.sql,
-- 0007_lancamentos.sql, 0028_vendas_produtos_custo_unitario.sql), sem
-- agendamento_id, com comissão própria (percentual_loja) em vez de
-- reaproveitar percentual_produto.
create table produtos_loja (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  nome text not null,
  categoria text,
  preco_custo numeric(10,2) not null default 0,
  preco_venda numeric(10,2) not null check (preco_venda >= 0),
  quantidade_estoque int not null default 0 check (quantidade_estoque >= 0),
  estoque_minimo int not null default 0,
  unidade_medida text not null default 'un',
  ativo boolean not null default true
);

create table vendas_loja (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  membro_id uuid not null references membros(id),
  cliente_id uuid not null references clientes(id),
  produto_id uuid not null references produtos_loja(id),
  quantidade int not null check (quantidade > 0),
  preco_unitario numeric(10,2) not null,
  custo_unitario numeric(10,2),
  comissao_percentual_aplicado numeric(5,2),
  comissao_valor numeric(10,2),
  data date not null default current_date,
  criado_em timestamptz not null default now()
);

alter table planos_carreira add column percentual_loja numeric(5,2) check (percentual_loja between 0 and 100);

create or replace function public.processar_venda_loja()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_percentual numeric;
  v_estoque int;
  v_preco numeric;
  v_custo numeric;
begin
  select quantidade_estoque, preco_venda, preco_custo into v_estoque, v_preco, v_custo
  from produtos_loja where id = new.produto_id and barbearia_id = new.barbearia_id for update;
  if v_estoque is null then
    raise exception 'Produto de loja inválido para esta barbearia';
  end if;
  if v_estoque < new.quantidade then
    raise exception 'Estoque insuficiente para este produto';
  end if;

  update produtos_loja set quantidade_estoque = quantidade_estoque - new.quantidade where id = new.produto_id;

  new.preco_unitario := v_preco;
  new.custo_unitario := v_custo;

  select pc.percentual_loja into v_percentual
  from membros m join planos_carreira pc on pc.id = m.plano_carreira_id
  where m.id = new.membro_id;

  new.comissao_percentual_aplicado := coalesce(v_percentual, 0);
  new.comissao_valor := round(new.preco_unitario * new.quantidade * coalesce(v_percentual, 0) / 100, 2);
  return new;
end;
$$;

create trigger trg_venda_loja
  before insert on vendas_loja
  for each row execute function public.processar_venda_loja();

alter table produtos_loja enable row level security;
alter table vendas_loja enable row level security;

create policy "membros leem produtos_loja" on produtos_loja for select
  using (barbearia_id = auth_barbearia_id());
create policy "admin gerencia produtos_loja" on produtos_loja for all
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin')
  with check (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');

create policy "admin le vendas_loja da barbearia" on vendas_loja for select
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
create policy "barbeiro le proprias vendas_loja" on vendas_loja for select
  using (membro_id = auth_membro_id());
create policy "barbeiro insere proprias vendas_loja" on vendas_loja for insert
  with check (
    membro_id = auth_membro_id()
    and barbearia_id = auth_barbearia_id()
    and exists (select 1 from clientes c where c.id = cliente_id and c.barbearia_id = auth_barbearia_id())
    and exists (select 1 from produtos_loja p where p.id = produto_id and p.barbearia_id = auth_barbearia_id())
  );
create policy "admin insere vendas_loja" on vendas_loja for insert
  with check (
    barbearia_id = auth_barbearia_id()
    and auth_papel() = 'admin'
    and exists (select 1 from membros m where m.id = membro_id and m.barbearia_id = auth_barbearia_id())
    and exists (select 1 from clientes c where c.id = cliente_id and c.barbearia_id = auth_barbearia_id())
    and exists (select 1 from produtos_loja p where p.id = produto_id and p.barbearia_id = auth_barbearia_id())
  );
create policy "admin edita vendas_loja" on vendas_loja for update
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
create policy "admin remove vendas_loja" on vendas_loja for delete
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
