alter table clientes add column categoria_origem text
  check (categoria_origem in ('indicacao', 'redes_sociais', 'google_internet', 'passou_na_rua', 'outro'));

-- Dropped and recreated (not just CREATE OR REPLACE) because adding a new
-- parameter changes the function's full type signature — same reasoning
-- documented in 0013_cliente_aniversario.sql and 0019_cliente_bairro_cidade.sql.
drop function if exists public.criar_ou_obter_cliente(uuid, text, text, date, text, text);

create or replace function public.criar_ou_obter_cliente(
  p_barbearia_id uuid, p_nome text, p_telefone text, p_data_nascimento date default null,
  p_bairro text default null, p_cidade text default null, p_categoria_origem text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cliente_id uuid;
  v_telefone text;
  v_foi_criado boolean;
begin
  if not exists (select 1 from barbearias where id = p_barbearia_id) then
    raise exception 'Barbearia inválida';
  end if;

  v_telefone := regexp_replace(p_telefone, '\D', '', 'g');

  -- (xmax = 0) is true only for a row that was genuinely just inserted by
  -- THIS statement, never for a row that took the on-conflict update path —
  -- that's how we know whether this call actually created a new client,
  -- as opposed to just resolving to an existing one.
  insert into clientes (barbearia_id, nome, telefone, data_nascimento, bairro, cidade, categoria_origem)
  values (p_barbearia_id, p_nome, v_telefone, p_data_nascimento, p_bairro, p_cidade, p_categoria_origem)
  on conflict (barbearia_id, telefone)
  do update set
    nome = excluded.nome,
    data_nascimento = coalesce(clientes.data_nascimento, excluded.data_nascimento),
    bairro = coalesce(clientes.bairro, excluded.bairro),
    cidade = coalesce(clientes.cidade, excluded.cidade),
    categoria_origem = coalesce(clientes.categoria_origem, excluded.categoria_origem)
  returning id, (xmax = 0) into v_cliente_id, v_foi_criado;

  if v_foi_criado and p_categoria_origem is null then
    raise exception 'Categoria de origem é obrigatória para clientes novos.';
  end if;

  return v_cliente_id;
end;
$$;

grant execute on function public.criar_ou_obter_cliente(uuid, text, text, date, text, text, text) to anon, authenticated;

-- Same reasoning: a new trailing param changes the signature, so drop first.
drop function if exists public.criar_agendamento_publico(uuid, uuid, uuid, date, time, text, text, text, text);

create or replace function public.criar_agendamento_publico(
  p_barbearia_id uuid, p_membro_id uuid, p_servico_id uuid,
  p_data date, p_hora_inicio time, p_nome_cliente text, p_telefone_cliente text,
  p_bairro text default null, p_cidade text default null, p_categoria_origem text default null
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

  if exists (
    select 1 from agendamentos a
    where a.membro_id = p_membro_id and a.data = p_data and a.status <> 'cancelado'
      and p_hora_inicio < a.hora_fim and v_hora_fim > a.hora_inicio
  ) then
    raise exception 'Esse horário acabou de ser reservado por outra pessoa. Escolha outro horário.';
  end if;

  v_cliente_id := criar_ou_obter_cliente(p_barbearia_id, p_nome_cliente, p_telefone_cliente, null, p_bairro, p_cidade, p_categoria_origem);

  insert into agendamentos (barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem)
  values (
    p_barbearia_id, p_membro_id, v_cliente_id, p_servico_id, p_data, p_hora_inicio, v_hora_fim, 'agendado', 'publico'
  )
  returning id into v_agendamento_id;

  return v_agendamento_id;
end;
$$;

grant execute on function public.criar_agendamento_publico(uuid, uuid, uuid, date, time, text, text, text, text, text) to anon, authenticated;
