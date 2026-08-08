create or replace function public.ranking_cliente(p_cliente_id uuid)
returns table(item text, tipo text, quantidade int, valor_total numeric)
language sql stable as $$
  select s.nome as item, 'servico' as tipo, count(*)::int as quantidade, sum(a.preco) as valor_total
  from atendimentos a
  join servicos s on s.id = a.servico_id
  where a.cliente_id = p_cliente_id
  group by s.nome

  union all

  select p.nome as item, 'produto' as tipo, sum(vp.quantidade)::int as quantidade, sum(vp.preco_unitario * vp.quantidade) as valor_total
  from vendas_produtos vp
  join produtos p on p.id = vp.produto_id
  where vp.cliente_id = p_cliente_id
  group by p.nome

  order by quantidade desc;
$$;

grant execute on function public.ranking_cliente(uuid) to authenticated;
