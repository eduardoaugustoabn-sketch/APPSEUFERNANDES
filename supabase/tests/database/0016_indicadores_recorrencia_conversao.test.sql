begin;
select plan(12);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'pedro@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'rui@example.com');

insert into membros (id, barbearia_id, user_id, papel, nome) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João'),
  ('a1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'barbeiro', 'Pedro'),
  ('a1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000003', 'barbeiro', 'Rui');

insert into servicos (id, barbearia_id, nome, duracao_minutos, preco, categoria_servico) values
  ('b1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Corte', 30, 30, 'cabelo'),
  ('b1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Barba', 20, 20, 'barba');

-- Ana, Bruno, Carla are João's clients. Diego is Pedro's. Rui has no clients at all.
insert into clientes (id, barbearia_id, nome, telefone) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Ana', '11900000001'),
  ('c1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Bruno', '11900000002'),
  ('c1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Carla', '11900000003'),
  ('c1000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Diego', '11900000004');

-- Ana: 3 visits with João — so_cabelo, so_cabelo, cabelo_barba (recorrência so_cabelo + conversão).
insert into agendamentos (id, barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem) values
  ('e1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', '2026-01-01', '09:00', '09:30', 'realizado', 'interno'),
  ('e1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', '2026-02-01', '09:00', '09:30', 'realizado', 'interno'),
  ('e1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', '2026-03-01', '09:00', '09:50', 'realizado', 'interno'),
  -- Bruno: 1 visit with João — so_barba only (denominator only, no recorrência; still "fora do alvo").
  ('e1000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', '2026-01-15', '10:00', '10:20', 'realizado', 'interno'),
  -- Carla: 1 visit with João, already cabelo_barba on the first visit (never "outside the target", not a conversion).
  ('e1000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', '2026-01-10', '11:00', '11:50', 'realizado', 'interno'),
  -- Diego: 1 visit with Pedro (a different barbeiro) — must never affect João's numbers.
  ('e1000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001', '2026-01-01', '09:00', '09:30', 'realizado', 'interno');

insert into atendimentos (barbearia_id, membro_id, cliente_id, servico_id, preco, agendamento_id, data) values
  -- Ana visit 1 (só cabelo)
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 0, 'e1000000-0000-0000-0000-000000000001', '2026-01-01'),
  -- Ana visit 2 (só cabelo)
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 0, 'e1000000-0000-0000-0000-000000000002', '2026-02-01'),
  -- Ana visit 3 (cabelo + barba, two atendimentos sharing the same agendamento_id)
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 0, 'e1000000-0000-0000-0000-000000000003', '2026-03-01'),
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 0, 'e1000000-0000-0000-0000-000000000003', '2026-03-01'),
  -- Bruno visit 1 (só barba)
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 0, 'e1000000-0000-0000-0000-000000000004', '2026-01-15'),
  -- Carla visit 1 (cabelo + barba, two atendimentos sharing the same agendamento_id)
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', 0, 'e1000000-0000-0000-0000-000000000005', '2026-01-10'),
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000002', 0, 'e1000000-0000-0000-0000-000000000005', '2026-01-10'),
  -- Diego visit 1 (só cabelo) — belongs to Pedro, não João
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001', 0, 'e1000000-0000-0000-0000-000000000006', '2026-01-01');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

select is(
  (select recorrencia_so_cabelo from indicadores_recorrencia_conversao('a1000000-0000-0000-0000-000000000001')),
  100::numeric,
  'João: recorrência Só Cabelo é 100% (só Ana teve visitas só-cabelo, e ela teve 2)'
);
select is(
  (select recorrencia_so_barba from indicadores_recorrencia_conversao('a1000000-0000-0000-0000-000000000001')),
  0::numeric,
  'João: recorrência Só Barba é 0% (só Bruno teve 1 visita só-barba, sem repetir)'
);
select is(
  (select recorrencia_cabelo_barba from indicadores_recorrencia_conversao('a1000000-0000-0000-0000-000000000001')),
  0::numeric,
  'João: recorrência Cabelo+Barba é 0% (Ana e Carla tiveram 1 cada, nenhuma repetiu)'
);
select is(
  (select recorrencia_total from indicadores_recorrencia_conversao('a1000000-0000-0000-0000-000000000001')),
  33::numeric,
  'João: recorrência total é 33% (1 de 3 clientes — Ana — teve 2+ visitas classificáveis)'
);
select is(
  (select conversao_categoria_alvo from indicadores_recorrencia_conversao('a1000000-0000-0000-0000-000000000001')),
  50::numeric,
  'João: conversão para categoria-alvo é 50% (Ana converteu, Bruno não, de 2 que começaram fora do alvo)'
);
select is(
  (select clientes_fora_alvo from indicadores_recorrencia_conversao('a1000000-0000-0000-0000-000000000001')),
  1,
  'João: 1 cliente fora do público-alvo hoje (Bruno — última visita foi só-barba)'
);
select is(
  (select clientes_so_cabelo from indicadores_recorrencia_conversao('a1000000-0000-0000-0000-000000000001')),
  0,
  'João: 0 clientes com última visita só-cabelo'
);
select is(
  (select clientes_so_barba from indicadores_recorrencia_conversao('a1000000-0000-0000-0000-000000000001')),
  1,
  'João: 1 cliente com última visita só-barba (Bruno)'
);
select is(
  (select potencial_conversao from indicadores_recorrencia_conversao('a1000000-0000-0000-0000-000000000001')),
  33::numeric,
  'João: potencial de conversão é 33% (1 de 3 clientes está fora do alvo)'
);

-- Cross-barbeiro isolation: João asking about Pedro's membro_id must see nothing —
-- RLS filters atendimentos to auth_membro_id() regardless of what p_membro_id says.
select is(
  (select recorrencia_total from indicadores_recorrencia_conversao('a1000000-0000-0000-0000-000000000002')),
  null,
  'João não consegue ver os números de Pedro passando o membro_id dele — RLS bloqueia, resultado vem nulo'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);

select is(
  (select recorrencia_so_cabelo from indicadores_recorrencia_conversao('a1000000-0000-0000-0000-000000000002')),
  0::numeric,
  'Pedro: recorrência Só Cabelo é 0% (Diego teve só 1 visita só-cabelo — prova que Ana/Bruno/Carla de João não vazaram pra cá)'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);

select is(
  (select recorrencia_total from indicadores_recorrencia_conversao('a1000000-0000-0000-0000-000000000003')),
  null,
  'Rui (sem nenhum cliente/atendimento): campos percentuais vêm nulos, sem erro'
);

reset role;

select * from finish();
rollback;
