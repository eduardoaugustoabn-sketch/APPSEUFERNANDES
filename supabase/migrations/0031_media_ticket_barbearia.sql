-- security definer é necessário aqui: um barbeiro comum não pode ler
-- atendimentos/vendas_produtos de outros barbeiros por RLS ("barbeiro le
-- proprios atendimentos" é escopada a membro_id = auth_membro_id()), então
-- agregar faturamento/visitas de TODA a barbearia exige bypassar essa RLS.
-- A função só devolve um número agregado — não expõe nenhum dado individual
-- de outro barbeiro ou cliente.
create or replace function public.media_ticket_barbearia()
returns numeric
language sql stable security definer set search_path = public as $$
  with faturamento as (
    select
      coalesce((select sum(a.preco) from atendimentos a
        where a.barbearia_id = auth_barbearia_id() and a.data >= date_trunc('month', current_date)::date), 0)
      + coalesce((select sum(vp.preco_unitario * vp.quantidade) from vendas_produtos vp
        where vp.barbearia_id = auth_barbearia_id() and vp.data >= date_trunc('month', current_date)::date), 0)
      as total
  ),
  realizados as (
    select count(*) as total
    from agendamentos ag
    where ag.barbearia_id = auth_barbearia_id()
      and ag.status = 'realizado'
      and ag.data >= date_trunc('month', current_date)::date
  )
  select round(f.total / nullif(r.total, 0), 2)
  from faturamento f, realizados r;
$$;

grant execute on function public.media_ticket_barbearia() to authenticated;
