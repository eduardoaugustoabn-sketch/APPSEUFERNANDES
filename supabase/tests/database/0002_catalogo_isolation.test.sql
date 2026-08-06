begin;
select plan(2);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a'),
  ('22222222-2222-2222-2222-222222222222', 'Barbearia B', 'barbearia-b');

insert into servicos (id, barbearia_id, nome, duracao_minutos, preco) values
  ('a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Corte A', 40, 60),
  ('a2222222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Corte B', 40, 60);

insert into produtos (id, barbearia_id, nome, preco_venda) values
  ('b1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Pomada A', 40),
  ('b2222222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Pomada B', 40);

set local role anon;

select is(
  (select count(*)::int from servicos),
  2,
  'anon sees active services from all barbearias (public catalog, by design)'
);

select is(
  (select count(*)::int from produtos),
  0,
  'anon cannot read produtos at all (no anon policy)'
);

select * from finish();
rollback;
