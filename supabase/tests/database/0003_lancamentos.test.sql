begin;
select plan(3);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a');

set local role anon;

select is(
  (select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Marcos Silva', '11988887777') is not null),
  true,
  'anon can create a client via criar_ou_obter_cliente'
);

reset role;

select is(
  (select count(*)::int from clientes where telefone = '11988887777'),
  1,
  'creating a client with the same phone twice does not duplicate the row'
);

set local role anon;

select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Marcos Silva Jr', '11988887777');

-- A differently-formatted phone for the same number must normalize to the
-- same digits and recognize the existing client instead of creating a duplicate.
select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Marcos Silva Jr', '(11) 98888-7777');

reset role;

select is(
  (select count(*)::int from clientes where telefone = '11988887777'),
  1,
  'a formatted phone "(11) 98888-7777" normalizes to the same digits and does not create a duplicate'
);

select * from finish();
rollback;
