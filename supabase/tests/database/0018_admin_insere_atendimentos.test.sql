begin;
select plan(3);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a');

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

insert into produtos (id, barbearia_id, nome, preco_custo, preco_venda, quantidade_estoque, estoque_minimo) values
  ('d1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Pomada', 10, 25, 5, 1);

insert into clientes (id, barbearia_id, nome, telefone) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Marcos', '11900000009');

-- Admin registra um atendimento em nome de João (o barbeiro), não do próprio admin.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);

insert into atendimentos (barbearia_id, membro_id, cliente_id, servico_id, preco) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 60);

select is(
  (select count(*)::int from atendimentos where membro_id = 'a1000000-0000-0000-0000-000000000001'),
  1,
  'admin can insert an atendimento on behalf of another barbeiro'
);

select is(
  (select comissao_valor from atendimentos where membro_id = 'a1000000-0000-0000-0000-000000000001'),
  18.00,
  'commission is calculated from the target barbeiro (membro_id) plano, not the admin who inserted it'
);

-- Admin registra uma venda de produto em nome de João também.
insert into vendas_produtos (barbearia_id, membro_id, cliente_id, produto_id, quantidade, preco_unitario) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 1, 25);

select is(
  (select count(*)::int from vendas_produtos where membro_id = 'a1000000-0000-0000-0000-000000000001'),
  1,
  'admin can insert a venda_produto on behalf of another barbeiro'
);

select * from finish();
rollback;
