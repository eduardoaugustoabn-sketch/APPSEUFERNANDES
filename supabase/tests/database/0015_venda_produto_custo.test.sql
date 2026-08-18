begin;
select plan(4);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com');

insert into planos_carreira (id, barbearia_id, nome, percentual_produto, percentual_servico) values
  ('ac000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Sênior', 10, 30);

insert into membros (id, barbearia_id, user_id, papel, nome, plano_carreira_id) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João', 'ac000000-0000-0000-0000-000000000001');

insert into clientes (id, barbearia_id, nome, telefone) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Marcos', '11900000009');

insert into produtos (id, barbearia_id, nome, preco_custo, preco_venda, quantidade_estoque) values
  ('d1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Pomada', 20, 25, 50);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

-- Deliberately send bogus preco_unitario (999999) and custo_unitario (0.01)
-- too, mirroring the existing atendimentos test's proof that client-supplied
-- values are ignored.
insert into vendas_produtos (barbearia_id, membro_id, cliente_id, produto_id, quantidade, preco_unitario, custo_unitario) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 3, 999999, 0.01);

select is(
  (select custo_unitario from vendas_produtos where quantidade = 3),
  20.00,
  'custo_unitario is frozen at the produto''s preco_custo (R$20) at the time of sale'
);

select is(
  (select preco_unitario from vendas_produtos where quantidade = 3),
  25.00,
  'client-supplied preco_unitario (999999) is ignored — trigger overwrites it with the real produto price (R$25)'
);

reset role;

update produtos set preco_custo = 35 where id = 'd1000000-0000-0000-0000-000000000001';

select is(
  (select custo_unitario from vendas_produtos where quantidade = 3),
  20.00,
  'editing the produto''s preco_custo afterward does not retroactively change custo_unitario on the already-recorded sale'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

insert into vendas_produtos (barbearia_id, membro_id, cliente_id, produto_id, quantidade, preco_unitario, custo_unitario) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 1, 999999, 0.01);

reset role;

select is(
  (select custo_unitario from vendas_produtos where quantidade = 1),
  35.00,
  'a new sale made after the price change freezes the new preco_custo (R$35)'
);

select * from finish();
rollback;
