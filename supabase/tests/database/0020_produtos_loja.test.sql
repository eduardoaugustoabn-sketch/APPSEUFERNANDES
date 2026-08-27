begin;
select plan(6);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'admin@example.com'),
  ('cccccccc-0000-0000-0000-000000000003', 'marcos@example.com');

insert into planos_carreira (id, barbearia_id, nome, percentual_produto, percentual_servico, percentual_loja) values
  ('ac000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Sênior', 10, 30, 15);

insert into membros (id, barbearia_id, user_id, papel, nome, plano_carreira_id) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João', 'ac000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000002', 'admin', 'Admin', null),
  ('a1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000003', 'barbeiro', 'Marcos', 'ac000000-0000-0000-0000-000000000001');

insert into produtos_loja (id, barbearia_id, nome, preco_custo, preco_venda, quantidade_estoque, estoque_minimo) values
  ('e1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Camisa polo', 40, 100, 10, 1);

insert into clientes (id, barbearia_id, nome, telefone) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Cliente Um', '11900000001');

-- João vende 2 camisas pra si mesmo.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

insert into vendas_loja (barbearia_id, membro_id, cliente_id, produto_id, quantidade, preco_unitario) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 2, 999999);

select is(
  (select comissao_valor from vendas_loja where membro_id = 'a1000000-0000-0000-0000-000000000001'),
  30.00,
  'commission uses percentual_loja (15% of R$100 x 2 = R$30), ignoring the bogus client-supplied preco_unitario'
);

select is(
  (select quantidade_estoque from produtos_loja where id = 'e1000000-0000-0000-0000-000000000001'),
  8,
  'stock is decremented by the quantity sold'
);

-- João tenta vender em nome do Marcos (outro barbeiro) — RLS deve bloquear.
select throws_ok(
  $$insert into vendas_loja (barbearia_id, membro_id, cliente_id, produto_id, quantidade, preco_unitario) values
    ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 1, 100)$$,
  '42501',
  'new row violates row-level security policy for table "vendas_loja"',
  'barbeiro cannot insert a venda_loja on behalf of a DIFFERENT barbeiro'
);

-- Admin vende em nome do Marcos (outro barbeiro).
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);

insert into vendas_loja (barbearia_id, membro_id, cliente_id, produto_id, quantidade, preco_unitario) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 1, 100);

select is(
  (select count(*)::int from vendas_loja where membro_id = 'a1000000-0000-0000-0000-000000000003'),
  1,
  'admin can insert a venda_loja on behalf of another barbeiro'
);

select is(
  (select comissao_valor from vendas_loja where membro_id = 'a1000000-0000-0000-0000-000000000003'),
  15.00,
  'commission on the admin-recorded sale is credited using the TARGET barbeiro (Marcos) plano, not the admin'
);

select is(
  (select quantidade_estoque from produtos_loja where id = 'e1000000-0000-0000-0000-000000000001'),
  7,
  'stock is decremented again by the admin-recorded sale (8 -> 7)'
);

select * from finish();
rollback;
