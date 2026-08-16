begin;
select plan(4);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a'),
  ('22222222-2222-2222-2222-222222222222', 'Barbearia B', 'barbearia-b');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com');

insert into membros (id, barbearia_id, user_id, papel, nome) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João');

-- Telefones deliberadamente compartilham os dígitos "9999" — se a
-- isolação por tenant falhar, a busca de João por "9999" retornaria
-- os dois clientes em vez de só o da própria barbearia.
insert into clientes (id, barbearia_id, nome, telefone) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Cliente A', '11999998888'),
  ('c1000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Cliente B', '11999997777');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

select is(
  (select count(*)::int from buscar_clientes_por_telefone('9999')),
  1,
  'barbeiro João buscando digitos compartilhados pelas duas barbearias só vê o cliente da própria'
);

select is(
  (select nome from buscar_clientes_por_telefone('9999') limit 1),
  'Cliente A',
  'o resultado visível é o Cliente A, nunca o Cliente B de outra barbearia'
);

select is(
  (select count(*)::int from buscar_clientes_por_telefone('999')),
  0,
  'menos de 4 dígitos não retorna nada, mesmo que tecnicamente bateria'
);

set local role anon;
select throws_ok(
  $$ select * from buscar_clientes_por_telefone('9999') $$,
  'permission denied for function buscar_clientes_por_telefone',
  'anon não tem grant de execução em buscar_clientes_por_telefone'
);

select * from finish();
rollback;
