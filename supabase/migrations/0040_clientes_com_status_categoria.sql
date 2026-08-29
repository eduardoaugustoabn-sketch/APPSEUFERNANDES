-- Expõe categoria_origem no retorno de clientes_com_status, pra permitir
-- filtrar a listagem de clientes por categoria sem precisar de uma
-- consulta separada. Mesmo corpo de 0036_clientes_dono_status.sql, só
-- com a coluna nova adicionada ao select e ao returns table.
drop function if exists public.clientes_com_status(uuid, uuid);

create or replace function public.clientes_com_status(p_barbearia_id uuid, p_membro_id uuid default null)
returns table(
  id uuid, nome text, telefone text, cidade text, observacao text,
  cadastrado_por_membro_id uuid, cadastrado_por_nome text,
  prazo_retorno_dias int, dias_sem_vir int, status text,
  tem_agendamento_futuro boolean, categoria_origem text
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
    ) as tem_agendamento_futuro,
    c.categoria_origem
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
