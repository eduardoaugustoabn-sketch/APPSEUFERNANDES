begin;
select plan(3);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a');

set local role anon;

select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Marcos Silva', '11988887777', '1990-05-20');

reset role;

select is(
  (select data_nascimento from clientes where telefone = '11988887777'),
  '1990-05-20'::date,
  'data_nascimento is stored when provided on creation'
);

set local role anon;

-- Calling again without a birthday must not erase the one already saved.
select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Marcos Silva', '11988887777');

reset role;

select is(
  (select data_nascimento from clientes where telefone = '11988887777'),
  '1990-05-20'::date,
  'an update without data_nascimento does not overwrite the existing one'
);

set local role anon;

select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Outro Cliente', '11977776666');

reset role;

select is(
  (select data_nascimento from clientes where telefone = '11977776666'),
  null,
  'data_nascimento stays null when never provided'
);

select * from finish();
rollback;
