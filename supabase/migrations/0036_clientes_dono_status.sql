alter table clientes add column cadastrado_por_membro_id uuid references membros(id);
alter table clientes add column prazo_retorno_dias int check (prazo_retorno_dias is null or prazo_retorno_dias in (7, 10, 15, 30));

-- p_membro_id é opcional (default null) — cadastrado_por_membro_id só é
-- gravado no INSERT; o "encontra ou cria" nunca reatribui dono numa
-- atualização de conflito (dono é sempre quem cadastrou primeiro).
drop function if exists public.criar_ou_obter_cliente(uuid, text, text, date, text, text, text);

create or replace function public.criar_ou_obter_cliente(
  p_barbearia_id uuid, p_nome text, p_telefone text, p_data_nascimento date default null,
  p_bairro text default null, p_cidade text default null, p_categoria_origem text default null,
  p_membro_id uuid default null
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

  if p_categoria_origem is not null and p_categoria_origem not in ('indicacao', 'redes_sociais', 'google_internet', 'passou_na_rua', 'outro') then
    raise exception 'Categoria de origem inválida.';
  end if;

  if p_membro_id is not null and not exists (
    select 1 from membros where id = p_membro_id and barbearia_id = p_barbearia_id
  ) then
    raise exception 'Membro inválido para esta barbearia';
  end if;

  v_telefone := regexp_replace(p_telefone, '\D', '', 'g');

  insert into clientes (barbearia_id, nome, telefone, data_nascimento, bairro, cidade, categoria_origem, cadastrado_por_membro_id)
  values (p_barbearia_id, p_nome, v_telefone, p_data_nascimento, p_bairro, p_cidade, p_categoria_origem, p_membro_id)
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

grant execute on function public.criar_ou_obter_cliente(uuid, text, text, date, text, text, text, uuid) to anon, authenticated;

-- Encaminha o barbeiro escolhido no agendamento público como dono do
-- cadastro, se o cliente for novo.
drop function if exists public.criar_agendamento_publico(uuid, uuid, uuid, date, time, text, text, text, text, text);

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

  v_cliente_id := criar_ou_obter_cliente(p_barbearia_id, p_nome_cliente, p_telefone_cliente, null, p_bairro, p_cidade, p_categoria_origem, p_membro_id);

  insert into agendamentos (barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem)
  values (
    p_barbearia_id, p_membro_id, v_cliente_id, p_servico_id, p_data, p_hora_inicio, v_hora_fim, 'agendado', 'publico'
  )
  returning id into v_agendamento_id;

  return v_agendamento_id;
end;
$$;

grant execute on function public.criar_agendamento_publico(uuid, uuid, uuid, date, time, text, text, text, text, text) to anon, authenticated;

-- Busca por telefone (ClienteAutocomplete/TelefoneClienteBusca) passa a
-- informar quem já é o dono do cliente encontrado.
drop function if exists public.buscar_clientes_por_telefone(text);

create or replace function public.buscar_clientes_por_telefone(p_busca text)
returns table(
  id uuid, nome text, telefone text, total_cortes int,
  data_nascimento date, bairro text, cidade text,
  cadastrado_por_membro_id uuid, cadastrado_por_nome text
)
language sql security definer set search_path = public as $$
  select
    c.id, c.nome, c.telefone,
    (select count(*)::int from atendimentos a where a.cliente_id = c.id) as total_cortes,
    c.data_nascimento, c.bairro, c.cidade,
    c.cadastrado_por_membro_id, m.nome as cadastrado_por_nome
  from clientes c
  left join membros m on m.id = c.cadastrado_por_membro_id and m.barbearia_id = c.barbearia_id
  where c.barbearia_id = auth_barbearia_id()
    and length(regexp_replace(p_busca, '\D', '', 'g')) >= 4
    and c.telefone like '%' || regexp_replace(p_busca, '\D', '', 'g') || '%'
  order by c.nome
  limit 10;
$$;

revoke all on function public.buscar_clientes_por_telefone(text) from public, anon;
grant execute on function public.buscar_clientes_por_telefone(text) to authenticated;

-- Cliente + status de retorno, reaproveitada pela listagem (filtrada por
-- dono quando p_membro_id é passado) e pelo ranking do admin (sem filtro,
-- agrupando por cadastrado_por_membro_id no lado do app).
--
-- PRECISA ser security definer: a policy de leitura de atendimentos
-- restringe um barbeiro a "membro_id = auth_membro_id()" (só os próprios
-- atendimentos, ver 0007_lancamentos.sql) — mas "dias sem vir" tem que
-- refletir a última vez que o cliente veio com QUALQUER barbeiro (ex.: o
-- dono está de férias e outro barbeiro cobriu o atendimento), não só com
-- o dono. Sem security definer, o cálculo de dias_sem_vir feito pelo
-- dono ignoraria silenciosamente atendimentos de outros barbeiros nesse
-- mesmo cliente. Por isso valida o tenant manualmente (auth_barbearia_id())
-- em vez de depender da RLS de atendimentos pra isso.
create or replace function public.clientes_com_status(p_barbearia_id uuid, p_membro_id uuid default null)
returns table(
  id uuid, nome text, telefone text, cidade text, observacao text,
  cadastrado_por_membro_id uuid, cadastrado_por_nome text,
  prazo_retorno_dias int, dias_sem_vir int, status text,
  tem_agendamento_futuro boolean
)
language sql security definer set search_path = public as $$
  select
    c.id, c.nome, c.telefone, c.cidade, c.observacao,
    c.cadastrado_por_membro_id, m.nome as cadastrado_por_nome,
    coalesce(c.prazo_retorno_dias, 12) as prazo_retorno_dias,
    (current_date - u.ultima_vinda) as dias_sem_vir,
    case
      when u.ultima_vinda is null then null
      when (current_date - u.ultima_vinda) <= coalesce(c.prazo_retorno_dias, 12) then 'verde'
      when (current_date - u.ultima_vinda) <= coalesce(c.prazo_retorno_dias, 12) + 3 then 'amarelo'
      else 'vermelho'
    end as status,
    exists (
      select 1 from agendamentos a
      where a.cliente_id = c.id and a.data >= current_date and a.status <> 'cancelado'
    ) as tem_agendamento_futuro
  from clientes c
  left join membros m on m.id = c.cadastrado_por_membro_id and m.barbearia_id = c.barbearia_id
  left join lateral (
    select max(a.data) as ultima_vinda from atendimentos a where a.cliente_id = c.id
  ) u on true
  where c.barbearia_id = p_barbearia_id
    and p_barbearia_id = auth_barbearia_id()
    and (p_membro_id is null or c.cadastrado_por_membro_id = p_membro_id)
  order by c.nome;
$$;

revoke all on function public.clientes_com_status(uuid, uuid) from public, anon;
grant execute on function public.clientes_com_status(uuid, uuid) to authenticated;
