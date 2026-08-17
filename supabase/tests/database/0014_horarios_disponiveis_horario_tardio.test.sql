begin;
select plan(3);

insert into barbearias (id, nome, slug) values
  ('22222222-2222-2222-2222-222222222222', 'Barbearia Noturna', 'barbearia-noturna');
insert into auth.users (id, email) values ('bbbbbbbb-0000-0000-0000-000000000001', 'noturno@example.com');
insert into membros (id, barbearia_id, user_id, papel, nome, ativo) values
  ('d0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000001', 'barbeiro', 'Noturno', true);
insert into servicos (id, barbearia_id, nome, duracao_minutos, preco) values
  ('e0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Corte', 40, 60);

-- Working hours ending at 23:59 with a 40-minute service: hora_fim is not
-- reachable by hora_inicio plus a whole number of 40-minute steps, so the
-- last in-range step (23:40 + 40min) wraps to 00:20 under Postgres's
-- `time + interval` arithmetic (`time` addition wraps modulo 24h) — that
-- wrapped value is still <= hora_fim, so the old loop never terminated.
-- statement_timeout bounds this test so a regression fails fast instead of
-- hanging the whole suite.
insert into horarios_trabalho (membro_id, dia_semana, hora_inicio, hora_fim)
select 'd0000000-0000-0000-0000-000000000001', dia, '23:00', '23:59' from generate_series(0,6) as dia;

set local statement_timeout = '3s';

select lives_ok(
  $$ select * from horarios_disponiveis('22222222-2222-2222-2222-222222222222', 'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', current_date) $$,
  'horarios_disponiveis terminates for working hours ending close to midnight (23:59) with a non-evenly-dividing service duration'
);

select is(
  (select count(*) from horarios_disponiveis('22222222-2222-2222-2222-222222222222', 'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', current_date))::int,
  1,
  'only the one slot that fully fits before hora_fim is returned (23:00-23:40) — the partial 23:40-00:20 slot that would cross midnight is excluded'
);

select is(
  (select hora_inicio::text from horarios_disponiveis('22222222-2222-2222-2222-222222222222', 'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', current_date) limit 1),
  '23:00:00',
  'the returned slot starts at the expected time'
);

select * from finish();
rollback;
