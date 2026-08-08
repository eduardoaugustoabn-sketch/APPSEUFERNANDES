-- Both RPCs take p_barbearia_id and validate p_membro_id belongs to it (and is
-- an active barbeiro) before doing anything else — otherwise an anonymous
-- caller could pass a membro_id from a different tenant (reachable since
-- membros.id is a bare uuid, guessable/enumerable) and either read another
-- barbearia's calendar or write a booking into it, e.g. to spam-block a
-- competitor's barbeiro's slots.

create or replace function public.horarios_disponiveis(
  p_barbearia_id uuid, p_membro_id uuid, p_servico_id uuid, p_data date
) returns table(hora_inicio time, hora_fim time)
language plpgsql security definer set search_path = public as $$
declare
  v_duracao int;
  v_dia_semana int;
  v_slot time;
  v_expediente record;
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
    v_slot := v_expediente.hora_inicio;
    while v_slot + (v_duracao || ' minutes')::interval <= v_expediente.hora_fim loop
      if not exists (
        select 1 from bloqueios_agenda b
        where b.membro_id = p_membro_id and b.data = p_data
          and v_slot < b.hora_fim and (v_slot + (v_duracao || ' minutes')::interval) > b.hora_inicio
      ) and not exists (
        select 1 from agendamentos a
        where a.membro_id = p_membro_id and a.data = p_data and a.status <> 'cancelado'
          and v_slot < a.hora_fim and (v_slot + (v_duracao || ' minutes')::interval) > a.hora_inicio
      ) then
        hora_inicio := v_slot;
        hora_fim := v_slot + (v_duracao || ' minutes')::interval;
        return next;
      end if;
      v_slot := v_slot + (v_duracao || ' minutes')::interval;
    end loop;
  end loop;
end;
$$;

grant execute on function public.horarios_disponiveis(uuid, uuid, uuid, date) to anon, authenticated;

create or replace function public.criar_agendamento_publico(
  p_barbearia_id uuid, p_membro_id uuid, p_servico_id uuid,
  p_data date, p_hora_inicio time, p_nome_cliente text, p_telefone_cliente text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_duracao int;
  v_cliente_id uuid;
  v_agendamento_id uuid;
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

  if p_data < current_date then
    raise exception 'Não é possível agendar em uma data passada';
  end if;

  v_cliente_id := criar_ou_obter_cliente(p_barbearia_id, p_nome_cliente, p_telefone_cliente);

  begin
    insert into agendamentos (barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem)
    values (
      p_barbearia_id, p_membro_id, v_cliente_id, p_servico_id, p_data, p_hora_inicio,
      p_hora_inicio + (v_duracao || ' minutes')::interval, 'confirmado', 'publico'
    )
    returning id into v_agendamento_id;
  exception when exclusion_violation then
    -- Raised by the agendamento_sem_sobreposicao GiST constraint (Task 8) —
    -- covers both an identical start time and a merely-overlapping range.
    raise exception 'Esse horário acabou de ser reservado por outra pessoa. Escolha outro horário.';
  end;

  return v_agendamento_id;
end;
$$;

grant execute on function public.criar_agendamento_publico(uuid, uuid, uuid, date, time, text, text) to anon, authenticated;
