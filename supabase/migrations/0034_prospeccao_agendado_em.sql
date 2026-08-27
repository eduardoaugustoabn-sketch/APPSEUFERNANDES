-- A meta diária/semanal de prospecção passa a contar "agendados" (quando o
-- contato virou um agendamento real) em vez de "contatos" (quando o contato
-- foi registrado) — precisa da data em que agendou, que não existia até
-- agora (só existia convertido_em, para a etapa seguinte do funil).
alter table prospeccoes add column agendado_em timestamptz;

create or replace function public.trg_prospeccao_agendou()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prospeccao_id uuid;
begin
  select id into v_prospeccao_id
  from prospeccoes
  where cliente_id = new.cliente_id
    and status in ('novo_lead', 'em_contato', 'interessado')
    and agendamento_id is null
  order by criado_em desc
  limit 1;

  if v_prospeccao_id is not null then
    update prospeccoes set status = 'agendou', agendamento_id = new.id, agendado_em = now() where id = v_prospeccao_id;
  end if;

  return new;
end;
$$;
