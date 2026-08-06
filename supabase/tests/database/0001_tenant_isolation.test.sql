begin;
select plan(3);

-- Seed two barbearias with one admin membro each.
insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a'),
  ('22222222-2222-2222-2222-222222222222', 'Barbearia B', 'barbearia-b');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin-a@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'admin-b@example.com');

insert into membros (barbearia_id, user_id, papel, nome) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin', 'Admin A'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000002', 'admin', 'Admin B');

-- Simulate being authenticated as Admin A.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

select is(
  (select count(*)::int from barbearias),
  1,
  'Admin A only sees their own barbearia'
);

select is(
  (select slug from barbearias limit 1),
  'barbearia-a',
  'Admin A sees barbearia-a, not barbearia-b'
);

select is(
  (select count(*)::int from membros),
  1,
  'Admin A only sees membros from their own barbearia'
);

select * from finish();
rollback;
