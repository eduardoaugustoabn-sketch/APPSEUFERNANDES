begin;
select plan(3);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a'),
  ('22222222-2222-2222-2222-222222222222', 'Barbearia B', 'barbearia-b');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'pedro@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'rui@example.com');

insert into membros (id, barbearia_id, user_id, papel, nome) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João'),
  ('a1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'barbeiro', 'Pedro'),
  -- Rui is alone in Barbearia B, with zero visitas realizado this month — proves the null-when-no-visits case.
  ('a1000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000003', 'barbeiro', 'Rui');

insert into servicos (id, barbearia_id, nome, duracao_minutos, preco, categoria_servico) values
  ('b1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Corte', 30, 30, 'cabelo'),
  ('b1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Barba', 20, 20, 'barba');

insert into produtos (id, barbearia_id, nome, preco_custo, preco_venda, quantidade_estoque) values
  ('f1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Pomada', 5, 15, 100);

insert into clientes (id, barbearia_id, nome, telefone) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Ana', '11900000001'),
  ('c1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Bruno', '11900000002');

-- e1 (João/Ana/Corte, realizado, this month) and e2 (Pedro/Bruno/Barba,
-- realizado, this month) both count toward "realizados". e3 (confirmado, not
-- realizado, this month) must NOT count, proving the status filter works.
insert into agendamentos (id, barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem) values
  ('e1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', date_trunc('month', current_date)::date, '09:00', '09:30', 'realizado', 'interno'),
  ('e1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', date_trunc('month', current_date)::date + 1, '10:00', '10:20', 'realizado', 'interno'),
  ('e1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', date_trunc('month', current_date)::date + 2, '11:00', '11:30', 'confirmado', 'interno');

-- at1 (linked to e1, this month, preço vira 30 via trigger de comissão) and
-- vp1 (this month, preço unitário vira 15 via trigger de venda) count toward
-- faturamento. at2 and vp2 are dated last month — must NOT count, proving
-- the date filter works independently of the agendamentos.status filter.
insert into atendimentos (barbearia_id, membro_id, cliente_id, servico_id, preco, agendamento_id, data) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 0, 'e1000000-0000-0000-0000-000000000001', date_trunc('month', current_date)::date),
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 0, 'e1000000-0000-0000-0000-000000000002', date_trunc('month', current_date)::date + 1),
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 0, null, date_trunc('month', current_date)::date - 1);

insert into vendas_produtos (barbearia_id, membro_id, cliente_id, produto_id, quantidade, preco_unitario, data) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 2, 0, date_trunc('month', current_date)::date),
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001', 1, 0, date_trunc('month', current_date)::date - 1);

-- Faturamento deste mês, contando só o que deveria contar: at1 (30, Corte) +
-- e2's atendimento (20, Barba) + vp1 (2 * 15 = 30) = 80. Realizados = 2
-- (e1 + e2; e3 é 'confirmado', não conta). Ticket médio = 80 / 2 = 40.

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

select is(
  (select media_ticket_barbearia()),
  40.00,
  'João: ticket médio da barbearia é 40 (agrega faturamento e visitas de TODOS os barbeiros, não só do chamador)'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);

select is(
  (select media_ticket_barbearia()),
  40.00,
  'Pedro: mesmo valor 40 que João viu — o número é da barbearia inteira, não escopado por quem chama'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);

select is(
  (select media_ticket_barbearia()),
  null,
  'Rui (Barbearia B, zero visitas realizado neste mês): retorna null em vez de erro de divisão por zero'
);

reset role;

select * from finish();
rollback;
