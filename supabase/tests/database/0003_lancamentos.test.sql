begin;
select plan(7);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a');

set local role anon;

select is(
  (select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Marcos Silva', '11988887777', null, null, null, 'indicacao') is not null),
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

-- Task 12: commission/stock triggers and edit-permission RLS on atendimentos.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'admin@example.com');

insert into planos_carreira (id, barbearia_id, nome, percentual_produto, percentual_servico) values
  ('ac000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Sênior', 10, 30);

insert into membros (id, barbearia_id, user_id, papel, nome, plano_carreira_id) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João', 'ac000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000002', 'admin', 'Admin', null);

insert into servicos (id, barbearia_id, nome, duracao_minutos, preco) values
  ('b1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Corte', 40, 60);

insert into clientes (id, barbearia_id, nome, telefone) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Marcos', '11900000009');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

-- Deliberately send a bogus preco (999999) — the trigger must ignore it and
-- overwrite with the real servico price, proving commission can't be
-- inflated/deflated by a client sending a fabricated preco on insert.
insert into atendimentos (barbearia_id, membro_id, cliente_id, servico_id, preco) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 999999);

select is(
  (select preco from atendimentos order by criado_em desc limit 1),
  60.00,
  'client-supplied preco (999999) is ignored — trigger overwrites it with the real servico price'
);

select is(
  (select comissao_valor from atendimentos order by criado_em desc limit 1),
  18.00,
  'commission is frozen at 30% of the real R$60 price (not the bogus 999999) for a Sênior plano'
);

-- Admin can edit an existing atendimento.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);

update atendimentos set preco = 65 where membro_id = 'a1000000-0000-0000-0000-000000000001';

select is(
  (select preco from atendimentos where membro_id = 'a1000000-0000-0000-0000-000000000001'),
  65.00,
  'admin can edit an existing atendimento'
);

-- Barbeiro cannot edit their own atendimento (no UPDATE policy grants this to barbeiro,
-- so the RLS-filtered UPDATE matches zero rows and silently no-ops rather than erroring).
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

update atendimentos set preco = 1 where membro_id = 'a1000000-0000-0000-0000-000000000001';

select is(
  (select preco from atendimentos where membro_id = 'a1000000-0000-0000-0000-000000000001'),
  65.00,
  'barbeiro update is silently blocked by RLS — preco is unchanged'
);

select * from finish();
rollback;
