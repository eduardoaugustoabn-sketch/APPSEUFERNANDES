-- Diferente de reconhecer_cliente() (que fica intocada, servindo só a
-- página pública anônima): esta função nunca recebe barbearia_id como
-- parâmetro — usa auth_barbearia_id() do chamador autenticado, fechando
-- a possibilidade de um barbeiro forjar o parâmetro pra ver clientes de
-- outra barbearia. E é concedida só pra authenticated, nunca anon —
-- retornar múltiplos clientes por 4 dígitos parciais seria um
-- vazamento de dados se alcançável por um visitante anônimo.
create or replace function public.buscar_clientes_por_telefone(p_busca text)
returns table(
  id uuid, nome text, telefone text, total_cortes int,
  data_nascimento date, bairro text, cidade text
)
language sql security definer set search_path = public as $$
  select
    c.id, c.nome, c.telefone,
    (select count(*)::int from atendimentos a where a.cliente_id = c.id) as total_cortes,
    c.data_nascimento, c.bairro, c.cidade
  from clientes c
  where c.barbearia_id = auth_barbearia_id()
    and length(regexp_replace(p_busca, '\D', '', 'g')) >= 4
    and c.telefone like '%' || regexp_replace(p_busca, '\D', '', 'g') || '%'
  order by c.nome
  limit 10;
$$;

revoke all on function public.buscar_clientes_por_telefone(text) from public, anon;
grant execute on function public.buscar_clientes_por_telefone(text) to authenticated;
