begin;
select plan(8);

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

-- Task 21: extend cross-tenant isolation coverage to the remaining sensitive
-- tables not already covered by Tasks 2/4's dedicated isolation tests.
-- Reset out of the "as Admin A" role set above (lines 18-19) so these setup
-- inserts, which seed rows for BOTH barbearias, aren't blocked by Admin A's
-- own-barbearia-only insert policies.
reset role;

insert into planos_carreira (id, barbearia_id, nome, percentual_produto, percentual_servico) values
  ('ac000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Sênior', 10, 30),
  ('ac000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Sênior', 10, 30);

insert into clientes (id, barbearia_id, nome, telefone) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Cliente A', '11900000001'),
  ('c1000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Cliente B', '11900000002');

insert into servicos (id, barbearia_id, nome, duracao_minutos, preco) values
  ('b1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Corte A', 40, 60),
  ('b1000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Corte B', 40, 60);

-- Reuses the Admin A membro row already inserted earlier in this same file.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

select is(
  (select count(*)::int from planos_carreira),
  1,
  'admin A only sees planos_carreira from their own barbearia'
);

select is(
  (select count(*)::int from clientes),
  1,
  'admin A only sees clientes from their own barbearia'
);

select is(
  (select count(*)::int from servicos where barbearia_id <> '11111111-1111-1111-1111-111111111111'),
  0,
  'admin A cannot read another barbearia''s servicos row by id filter (RLS still applies even with an explicit filter)'
);

select is(
  (select count(*)::int from horarios_trabalho),
  0,
  'no horarios_trabalho exist yet, but the query itself must not error under RLS'
);

select is(
  (select count(*)::int from prospeccoes),
  0,
  'no prospeccoes exist yet, but the query itself must not error under RLS'
);

select * from finish();
rollback;
