create or replace function public.criar_agendamento_publico(
  p_barbearia_id uuid, p_membro_id uuid, p_servico_id uuid,
  p_data date, p_hora_inicio time, p_nome_cliente text, p_telefone_cliente text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_duracao int;
  v_cliente_id uuid;
  v_agendamento_id uuid;
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

  if p_data < current_date then
    raise exception 'Não é possível agendar em uma data passada';
  end if;

  v_hora_fim := p_hora_inicio + (v_duracao || ' minutes')::interval;

  -- The no-overbooking guarantee used to be a table-wide GiST exclusion
  -- constraint (agendamento_sem_sobreposicao, dropped in Task 1) so that
  -- internal bookings can overbook on purpose. The public flow still must
  -- never overbook, so the same overlap check moves here as an explicit
  -- query, same interval-overlap shape horarios_disponiveis() already uses.
  if exists (
    select 1 from agendamentos a
    where a.membro_id = p_membro_id and a.data = p_data and a.status <> 'cancelado'
      and p_hora_inicio < a.hora_fim and v_hora_fim > a.hora_inicio
  ) then
    raise exception 'Esse horário acabou de ser reservado por outra pessoa. Escolha outro horário.';
  end if;

  v_cliente_id := criar_ou_obter_cliente(p_barbearia_id, p_nome_cliente, p_telefone_cliente);

  insert into agendamentos (barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem)
  values (
    p_barbearia_id, p_membro_id, v_cliente_id, p_servico_id, p_data, p_hora_inicio, v_hora_fim, 'agendado', 'publico'
  )
  returning id into v_agendamento_id;

  return v_agendamento_id;
end;
$$;

grant execute on function public.criar_agendamento_publico(uuid, uuid, uuid, date, time, text, text) to anon, authenticated;
