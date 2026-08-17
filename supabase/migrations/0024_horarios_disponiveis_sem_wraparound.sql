-- Body-only fix (signature unchanged) — CREATE OR REPLACE keeps the
-- existing grants to anon/authenticated, no drop needed.
--
-- Bug: the slot-stepping loop advanced `v_slot` (a `time`) by adding an
-- interval directly. `time + interval` wraps modulo 24h in Postgres, so
-- once a step landed at or after midnight it wrapped to an early time that
-- could still satisfy `v_slot + duracao <= hora_fim` — looping forever
-- whenever hora_fim wasn't reached by an exact multiple of the service
-- duration from hora_inicio (e.g. hora_fim = '23:59'). Fix: step through
-- plain integer minutes-from-midnight, which can't wrap, and only convert
-- to `time` for the conflict checks and the returned row.
create or replace function public.horarios_disponiveis(
  p_barbearia_id uuid, p_membro_id uuid, p_servico_id uuid, p_data date
) returns table(hora_inicio time, hora_fim time)
language plpgsql security definer set search_path = public as $$
declare
  v_duracao int;
  v_dia_semana int;
  v_slot_min int;
  v_fim_min int;
  v_expediente record;
  v_hora_inicio time;
  v_hora_fim time;
begin
  if not exists (
    select 1 from membros m
    where m.id = p_membro_id and m.barbearia_id = p_barbearia_id and m.papel = 'barbeiro' and m.ativo
  ) then
    raise exception 'Barbeiro inválido para esta barbearia';
  end if;

  select duracao_minutos into v_duracao from servicos where id = p_servico_id and barbearia_id = p_barbearia_id;
  if v_duracao is null then
    raise exception 'Serviço inválido para esta barbearia';
  end if;

  v_dia_semana := extract(dow from p_data);

  for v_expediente in
    select ht.hora_inicio, ht.hora_fim
    from horarios_trabalho ht
    where ht.membro_id = p_membro_id and ht.dia_semana = v_dia_semana
  loop
    v_slot_min := extract(hour from v_expediente.hora_inicio) * 60 + extract(minute from v_expediente.hora_inicio);
    v_fim_min := extract(hour from v_expediente.hora_fim) * 60 + extract(minute from v_expediente.hora_fim);

    while v_slot_min + v_duracao <= v_fim_min loop
      v_hora_inicio := time '00:00' + (v_slot_min || ' minutes')::interval;
      v_hora_fim := time '00:00' + ((v_slot_min + v_duracao) || ' minutes')::interval;

      if not exists (
        select 1 from bloqueios_agenda b
        where b.membro_id = p_membro_id and b.data = p_data
          and v_hora_inicio < b.hora_fim and v_hora_fim > b.hora_inicio
      ) and not exists (
        select 1 from agendamentos a
        where a.membro_id = p_membro_id and a.data = p_data and a.status <> 'cancelado'
          and v_hora_inicio < a.hora_fim and v_hora_fim > a.hora_inicio
      ) then
        hora_inicio := v_hora_inicio;
        hora_fim := v_hora_fim;
        return next;
      end if;
      v_slot_min := v_slot_min + v_duracao;
    end loop;
  end loop;
end;
$$;
