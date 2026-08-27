-- Fase: admin agenda (todos os barbeiros). Admin usa a AgendaDia (view por
-- barbeiro específico) para registrar atendimento/venda em nome de qualquer
-- barbeiro da barbearia — só existiam políticas de admin para
-- select/update/delete nestas duas tabelas (0007), nunca insert, então essa
-- ação falhava silenciosamente por RLS para o admin. A comissão continua
-- sendo creditada ao barbeiro-alvo (membro_id), nunca ao admin: os triggers
-- de 0007 já calculam a comissão a partir de new.membro_id, sem alteração.
create policy "admin insere atendimentos" on atendimentos for insert
  with check (
    barbearia_id = auth_barbearia_id()
    and auth_papel() = 'admin'
    and exists (select 1 from membros m where m.id = membro_id and m.barbearia_id = auth_barbearia_id())
    and exists (select 1 from clientes c where c.id = cliente_id and c.barbearia_id = auth_barbearia_id())
    and exists (select 1 from servicos s where s.id = servico_id and s.barbearia_id = auth_barbearia_id())
    and (agendamento_id is null or exists (select 1 from agendamentos a where a.id = agendamento_id and a.barbearia_id = auth_barbearia_id()))
  );

create policy "admin insere vendas_produtos" on vendas_produtos for insert
  with check (
    barbearia_id = auth_barbearia_id()
    and auth_papel() = 'admin'
    and exists (select 1 from membros m where m.id = membro_id and m.barbearia_id = auth_barbearia_id())
    and exists (select 1 from clientes c where c.id = cliente_id and c.barbearia_id = auth_barbearia_id())
    and exists (select 1 from produtos p where p.id = produto_id and p.barbearia_id = auth_barbearia_id())
  );
