-- Body-only change (signature unchanged) — CREATE OR REPLACE keeps the
-- existing grant to authenticated, no drop/re-grant needed.
create or replace function public.indicadores_recorrencia_conversao(p_membro_id uuid)
returns table(
  recorrencia_so_cabelo numeric,
  recorrencia_so_barba numeric,
  recorrencia_cabelo_barba numeric,
  recorrencia_total numeric,
  conversao_categoria_alvo numeric,
  clientes_fora_alvo int,
  clientes_so_cabelo int,
  clientes_so_barba int,
  potencial_conversao numeric
)
language sql stable as $$
  -- data_visita uses criado_em (timestamptz), not data (date) — atendimentos.data
  -- has only day resolution, so two classifiable visits by the same cliente on the
  -- same calendar day would tie under `order by data_visita asc/desc` and make
  -- "most recent visit" / "first visit" ambiguous. criado_em has real sub-second
  -- resolution, so same-agendamento_id rows (same visit) share it harmlessly while
  -- distinct visits always order correctly.
  with visitas as (
    select
      a.cliente_id,
      a.agendamento_id,
      min(a.criado_em) as data_visita,
      bool_or(s.categoria_servico = 'cabelo') as tem_cabelo,
      bool_or(s.categoria_servico = 'barba') as tem_barba
    from atendimentos a
    join servicos s on s.id = a.servico_id
    where a.membro_id = p_membro_id and a.agendamento_id is not null
    group by a.cliente_id, a.agendamento_id
  ),
  visitas_classificadas as (
    select
      cliente_id, data_visita,
      case
        when tem_cabelo and tem_barba then 'cabelo_barba'
        when tem_cabelo then 'so_cabelo'
        when tem_barba then 'so_barba'
        else null
      end as categoria
    from visitas
  ),
  visitas_validas as (
    select * from visitas_classificadas where categoria is not null
  ),
  por_cliente as (
    select
      cliente_id,
      count(*) filter (where categoria = 'so_cabelo') as n_so_cabelo,
      count(*) filter (where categoria = 'so_barba') as n_so_barba,
      count(*) filter (where categoria = 'cabelo_barba') as n_cabelo_barba,
      count(*) as n_total,
      (array_agg(categoria order by data_visita asc))[1] as primeira_categoria,
      bool_or(categoria = 'cabelo_barba') as teve_cabelo_barba,
      (array_agg(categoria order by data_visita desc))[1] as categoria_mais_recente
    from visitas_validas
    group by cliente_id
  )
  select
    round(100.0 * count(*) filter (where n_so_cabelo >= 2) / nullif(count(*) filter (where n_so_cabelo >= 1), 0), 0) as recorrencia_so_cabelo,
    round(100.0 * count(*) filter (where n_so_barba >= 2) / nullif(count(*) filter (where n_so_barba >= 1), 0), 0) as recorrencia_so_barba,
    round(100.0 * count(*) filter (where n_cabelo_barba >= 2) / nullif(count(*) filter (where n_cabelo_barba >= 1), 0), 0) as recorrencia_cabelo_barba,
    round(100.0 * count(*) filter (where n_total >= 2) / nullif(count(*), 0), 0) as recorrencia_total,
    round(100.0 * count(*) filter (where primeira_categoria in ('so_cabelo', 'so_barba') and teve_cabelo_barba)
      / nullif(count(*) filter (where primeira_categoria in ('so_cabelo', 'so_barba')), 0), 0) as conversao_categoria_alvo,
    count(*) filter (where categoria_mais_recente in ('so_cabelo', 'so_barba'))::int as clientes_fora_alvo,
    count(*) filter (where categoria_mais_recente = 'so_cabelo')::int as clientes_so_cabelo,
    count(*) filter (where categoria_mais_recente = 'so_barba')::int as clientes_so_barba,
    round(100.0 * count(*) filter (where categoria_mais_recente in ('so_cabelo', 'so_barba')) / nullif(count(*), 0), 0) as potencial_conversao
  from por_cliente;
$$;
