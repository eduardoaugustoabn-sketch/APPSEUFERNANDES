begin;
select plan(11);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a');
insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com');
insert into membros (id, barbearia_id, user_id, papel, nome, ativo) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João', true);
insert into servicos (id, barbearia_id, nome, duracao_minutos, preco) values
  ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Corte', 40, 60);

set local role anon;

select lives_ok(
  $$ select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Marcos Silva', '11988887777', null, null, null, 'indicacao') $$,
  'creating a new client with categoria_origem provided succeeds'
);

reset role;

select is(
  (select categoria_origem from clientes where telefone = '11988887777'),
  'indicacao',
  'categoria_origem is stored when provided on creation'
);

set local role anon;

select throws_ok(
  $$ select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Sem Categoria', '11977776666') $$,
  'Categoria de origem é obrigatória para clientes novos.',
  'creating a new client without categoria_origem is rejected'
);

select lives_ok(
  $$ select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Marcos Silva', '11988887777', null, null, null, 'outro') $$,
  'calling again for an existing client with a different categoria_origem does not throw'
);

select lives_ok(
  $$ select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Marcos Silva', '11988887777') $$,
  'calling again for an existing client with no categoria_origem argument at all does not throw'
);

reset role;

select is(
  (select categoria_origem from clientes where telefone = '11988887777'),
  'indicacao',
  'an existing categoria_origem is never overwritten by a later call'
);

-- Simulate a client that predates this feature: created directly, no RPC, no categoria.
insert into clientes (barbearia_id, nome, telefone) values
  ('11111111-1111-1111-1111-111111111111', 'Cliente Legado', '11955554444');

set local role anon;

select lives_ok(
  $$ select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente Legado', '11955554444', null, null, null, 'passou_na_rua') $$,
  'backfilling a pre-existing null categoria_origem on an existing client does not throw'
);

reset role;

select is(
  (select categoria_origem from clientes where telefone = '11955554444'),
  'passou_na_rua',
  'a null categoria_origem is backfilled when provided on a later call'
);

set local role anon;

select lives_ok(
  $$ select criar_agendamento_publico('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', current_date + 1, '09:00', 'Cliente Público', '11933332222', null, null, 'redes_sociais') $$,
  'a public booking for a new client with categoria_origem succeeds'
);

reset role;

select is(
  (select categoria_origem from clientes where telefone = '11933332222'),
  'redes_sociais',
  'categoria_origem passed through criar_agendamento_publico is persisted on the new client'
);

set local role anon;

select throws_ok(
  $$ select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Categoria Invalida', '11911112222', null, null, null, 'nao_existe') $$,
  'Categoria de origem inválida.',
  'creating a new client with an invalid categoria_origem value is rejected with a friendly message'
);

reset role;

select * from finish();
rollback;
