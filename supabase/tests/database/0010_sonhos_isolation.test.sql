begin;
select plan(8);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a'),
  ('22222222-2222-2222-2222-222222222222', 'Barbearia B', 'barbearia-b');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'pedro@example.com'),
  ('cccccccc-0000-0000-0000-000000000003', 'admin@example.com'),
  ('dddddddd-0000-0000-0000-000000000004', 'carlos@example.com');

insert into membros (id, barbearia_id, user_id, papel, nome) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João'),
  ('a1000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000002', 'barbeiro', 'Pedro'),
  ('a1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000003', 'admin', 'Admin A'),
  ('a1000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000004', 'barbeiro', 'Carlos');

insert into sonhos (id, barbearia_id, membro_id, nome, valor_alvo, percentual_comissao) values
  ('d1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'Moto nova', 15000, 40),
  ('d1000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'a1000000-0000-0000-0000-000000000002', 'Viagem', 5000, 30);

-- barbeiro João only sees his own sonho
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

select is(
  (select count(*)::int from sonhos),
  1,
  'barbeiro João only sees his own sonho, not Pedro''s from another barbearia'
);

select is(
  (select nome from sonhos limit 1),
  'Moto nova',
  'the visible row is Joao''s own'
);

-- adding a second active sonho whose percentual would push the total over
-- 100 (40 already + 65 = 105) is rejected by the trigger
select throws_ok(
  $$ insert into sonhos (barbearia_id, membro_id, nome, valor_alvo, percentual_comissao)
     values ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'Carro', 30000, 65) $$,
  'A soma dos percentuais dos sonhos ativos nao pode ultrapassar 100',
  'a second active sonho that would push the total over 100% is rejected'
);

-- a second active sonho within the remaining budget (40 + 60 = 100) is fine
select lives_ok(
  $$ insert into sonhos (barbearia_id, membro_id, nome, valor_alvo, percentual_comissao)
     values ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'Carro', 30000, 60) $$,
  'a second active sonho that exactly fills the remaining budget to 100% is accepted'
);

-- marking the first sonho concluído frees its 40% back up
update sonhos set concluido = true where id = 'd1000000-0000-0000-0000-000000000001';

select lives_ok(
  $$ insert into sonhos (barbearia_id, membro_id, nome, valor_alvo, percentual_comissao)
     values ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'Reforma', 8000, 40) $$,
  'once the first sonho is concluido, its percentual no longer counts toward the 100% cap'
);

-- barbeiro João cannot insert a sonho for another membro_id
select throws_ok(
  $$ insert into sonhos (barbearia_id, membro_id, nome, valor_alvo, percentual_comissao)
     values ('22222222-2222-2222-2222-222222222222', 'a1000000-0000-0000-0000-000000000002', 'Fake', 100, 10) $$,
  'new row violates row-level security policy for table "sonhos"',
  'a barbeiro cannot insert a sonho for a different membro_id'
);

-- admin of barbearia A reads all sonhos of barbearia A (2 remain visible:
-- Carro at 60% and Reforma at 40%; Moto nova is concluido but still a row)
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', true);

select is(
  (select count(*)::int from sonhos),
  3,
  'admin of barbearia A sees all 3 sonhos belonging to barbearia A (including the concluido one), never Pedro''s from barbearia B'
);

-- admin cannot write — no insert policy exists for admin
select throws_ok(
  $$ insert into sonhos (barbearia_id, membro_id, nome, valor_alvo, percentual_comissao)
     values ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000004', 'Admin tentando', 100, 10) $$,
  'new row violates row-level security policy for table "sonhos"',
  'admin has no insert policy on sonhos — read-only access'
);

select * from finish();
rollback;
