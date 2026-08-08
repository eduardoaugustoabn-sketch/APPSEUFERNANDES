create or replace function public.ociosidade(
  p_membro_id uuid, p_data_inicio date, p_data_fim date
) returns table(minutos_disponiveis int, minutos_ocupados int, faturamento_servicos numeric)
language sql stable as $$
  with dias as (
    select generate_series(p_data_inicio, p_data_fim, interval '1 day')::date as dia
  ),
  disponivel as (
    select coalesce(sum(extract(epoch from (ht.hora_fim - ht.hora_inicio)) / 60), 0)::int as minutos
    from dias d
    join horarios_trabalho ht on ht.membro_id = p_membro_id and ht.dia_semana = extract(dow from d.dia)
  ),
  bloqueado as (
    select coalesce(sum(extract(epoch from (b.hora_fim - b.hora_inicio)) / 60), 0)::int as minutos
    from bloqueios_agenda b
    where b.membro_id = p_membro_id and b.data between p_data_inicio and p_data_fim
  ),
  ocupado as (
    select
      coalesce(sum(s.duracao_minutos), 0)::int as minutos,
      coalesce(sum(a.preco), 0)::numeric as faturamento
    from atendimentos a
    join servicos s on s.id = a.servico_id
    where a.membro_id = p_membro_id and a.data between p_data_inicio and p_data_fim
  )
  select
    greatest((select minutos from disponivel) - (select minutos from bloqueado), 0),
    (select minutos from ocupado),
    (select faturamento from ocupado);
$$;

grant execute on function public.ociosidade(uuid, date, date) to authenticated;
