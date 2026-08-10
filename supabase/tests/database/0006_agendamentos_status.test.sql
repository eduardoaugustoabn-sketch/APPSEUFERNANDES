begin;
select plan(6);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a');
insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com');
insert into membros (id, barbearia_id, user_id, papel, nome) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João');
insert into clientes (id, barbearia_id, nome, telefone) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Marcos', '11900000001');
insert into servicos (id, barbearia_id, nome, duracao_minutos, preco) values
  ('b1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Corte', 40, 60);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

select throws_ok(
  $$ insert into agendamentos (barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem)
     values ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', current_date + 1, '09:00', '09:40', 'concluido', 'interno') $$,
  'new row for relation "agendamentos" violates check constraint "agendamentos_status_check"',
  'the old status value concluido is rejected by the new check constraint'
);

select lives_ok(
  $$ insert into agendamentos (id, barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem)
     values ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', current_date + 1, '09:00', '09:40', 'nao_compareceu', 'interno') $$,
  'the new status value nao_compareceu is accepted'
);

-- Overlaps the row above (same membro_id, same date/time range) — must now
-- succeed since agendamento_sem_sobreposicao is gone.
select lives_ok(
  $$ insert into agendamentos (id, barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem)
     values ('d0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', current_date + 1, '09:00', '09:40', 'confirmado', 'interno') $$,
  'an internally-created agendamento overlapping an existing one is now allowed (no more DB-level block)'
);

select is(
  (select vezes_remarcado from agendamentos where id = 'd0000000-0000-0000-0000-000000000002'),
  0,
  'vezes_remarcado defaults to 0 on a new agendamento'
);

update agendamentos set hora_inicio = '11:00', hora_fim = '11:40' where id = 'd0000000-0000-0000-0000-000000000002';

select is(
  (select vezes_remarcado from agendamentos where id = 'd0000000-0000-0000-0000-000000000002'),
  1,
  'changing hora_inicio/hora_fim auto-increments vezes_remarcado'
);

update agendamentos set status = 'realizado' where id = 'd0000000-0000-0000-0000-000000000002';

select is(
  (select vezes_remarcado from agendamentos where id = 'd0000000-0000-0000-0000-000000000002'),
  1,
  'changing only status (not date/time) does not increment vezes_remarcado'
);

select * from finish();
rollback;
