alter table vendas_produtos add column custo_unitario numeric(10,2);

-- Same freeze-at-insert pattern already used for preco_unitario and
-- comissao_valor: reads produtos.preco_custo at the moment of the sale so a
-- later edit to the product's cost never retroactively changes the profit
-- already recorded on a past sale.
create or replace function public.processar_venda_produto()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_percentual numeric;
  v_estoque int;
  v_preco numeric;
  v_custo numeric;
begin
  select quantidade_estoque, preco_venda, preco_custo into v_estoque, v_preco, v_custo
  from produtos where id = new.produto_id and barbearia_id = new.barbearia_id for update;
  if v_estoque is null then
    raise exception 'Produto inválido para esta barbearia';
  end if;
  if v_estoque < new.quantidade then
    raise exception 'Estoque insuficiente para este produto';
  end if;

  update produtos set quantidade_estoque = quantidade_estoque - new.quantidade where id = new.produto_id;

  -- Same reasoning as aplicar_comissao_atendimento(): preco_unitario and
  -- custo_unitario are looked up server-side, never trusted from the client insert.
  new.preco_unitario := v_preco;
  new.custo_unitario := v_custo;

  select pc.percentual_produto into v_percentual
  from membros m join planos_carreira pc on pc.id = m.plano_carreira_id
  where m.id = new.membro_id;

  new.comissao_percentual_aplicado := coalesce(v_percentual, 0);
  new.comissao_valor := round(new.preco_unitario * new.quantidade * coalesce(v_percentual, 0) / 100, 2);
  return new;
end;
$$;
