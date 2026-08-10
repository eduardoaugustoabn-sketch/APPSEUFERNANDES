begin;
select plan(2);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a'),
  ('22222222-2222-2222-2222-222222222222', 'Barbearia B', 'barbearia-b');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'pedro@example.com');

insert into membros (id, barbearia_id, user_id, papel, nome) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João'),
  ('a1000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000002', 'barbeiro', 'Pedro');

insert into clientes (id, barbearia_id, nome, telefone) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Lead João', '11900000001'),
  ('c1000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Lead Pedro', '11900000002');

insert into prospeccoes (barbearia_id, membro_id, canal, nome, telefone, cliente_id) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'whatsapp', 'Lead João', '11900000001', 'c1000000-0000-0000-0000-000000000001'),
  ('22222222-2222-2222-2222-222222222222', 'a1000000-0000-0000-0000-000000000002', 'rua', 'Lead Pedro', '11900000002', 'c1000000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

select is(
  (select count(*)::int from prospeccoes),
  1,
  'barbeiro João only sees his own prospeccoes, not Pedro''s from another barbearia'
);

select is(
  (select canal from prospeccoes limit 1),
  'whatsapp',
  'the visible row is Joao''s own'
);

select * from finish();
rollback;
