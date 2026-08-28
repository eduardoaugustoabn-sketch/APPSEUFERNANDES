begin;
select plan(12);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a'),
  ('22222222-2222-2222-2222-222222222222', 'Barbearia B', 'barbearia-b');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com'),
  ('cccccccc-0000-0000-0000-000000000003', 'marcos@example.com'),
  ('dddddddd-0000-0000-0000-000000000004', 'outra@example.com');

insert into membros (id, barbearia_id, user_id, papel, nome) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João'),
  ('a1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000003', 'barbeiro', 'Marcos'),
  ('a1000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'dddddddd-0000-0000-0000-000000000004', 'barbeiro', 'DeOutraBarbearia');

insert into servicos (id, barbearia_id, nome, duracao_minutos, preco) values
  ('b1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Corte', 40, 60);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

-- João cadastra o cliente Um.
select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente Um', '11900000001', null, null, null, 'indicacao', 'a1000000-0000-0000-0000-000000000001');

select is(
  (select cadastrado_por_membro_id from clientes where telefone = '11900000001'),
  'a1000000-0000-0000-0000-000000000001'::uuid,
  'cadastrado_por_membro_id is stamped with the creating membro'
);

-- Marcos "encontra" o mesmo telefone depois — dono não muda.
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', true);
select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente Um', '11900000001', null, null, null, 'indicacao', 'a1000000-0000-0000-0000-000000000003');

select is(
  (select cadastrado_por_membro_id from clientes where telefone = '11900000001'),
  'a1000000-0000-0000-0000-000000000001'::uuid,
  'cadastrado_por_membro_id is never reassigned on a repeat find-or-create for the same phone'
);

-- Cliente Verde: atendimento há 10 dias (prazo padrão 12).
select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente Verde', '11900000002', null, null, null, 'indicacao', 'a1000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
insert into atendimentos (barbearia_id, membro_id, cliente_id, servico_id, preco, data) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', (select id from clientes where telefone = '11900000002'), 'b1000000-0000-0000-0000-000000000001', 60, current_date - 10);

-- Cliente Amarelo: atendimento há 14 dias (prazo padrão 12 -> janela 13-15).
select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente Amarelo', '11900000003', null, null, null, 'indicacao', 'a1000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
insert into atendimentos (barbearia_id, membro_id, cliente_id, servico_id, preco, data) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', (select id from clientes where telefone = '11900000003'), 'b1000000-0000-0000-0000-000000000001', 60, current_date - 14);

-- Cliente Vermelho: atendimento há 20 dias.
select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente Vermelho', '11900000004', null, null, null, 'indicacao', 'a1000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
insert into atendimentos (barbearia_id, membro_id, cliente_id, servico_id, preco, data) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', (select id from clientes where telefone = '11900000004'), 'b1000000-0000-0000-0000-000000000001', 60, current_date - 20);

-- Cliente com prazo customizado de 7 dias: atendimento há 8 dias -> amarelo (prazo 7, janela 8-10), não verde.
select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente PrazoCurto', '11900000005', null, null, null, 'indicacao', 'a1000000-0000-0000-0000-000000000001');
update clientes set prazo_retorno_dias = 7 where telefone = '11900000005';
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
insert into atendimentos (barbearia_id, membro_id, cliente_id, servico_id, preco, data) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', (select id from clientes where telefone = '11900000005'), 'b1000000-0000-0000-0000-000000000001', 60, current_date - 8);

-- Cliente sem nenhum atendimento -> sem status.
select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente SemVisita', '11900000006', null, null, null, 'indicacao', 'a1000000-0000-0000-0000-000000000001');

select is(
  (select status from clientes_com_status('11111111-1111-1111-1111-111111111111') where telefone = '11900000002'),
  'verde',
  'client seen 10 days ago is verde under the default 12-day prazo'
);

select is(
  (select status from clientes_com_status('11111111-1111-1111-1111-111111111111') where telefone = '11900000003'),
  'amarelo',
  'client seen 14 days ago is amarelo under the default 12-day prazo (13-15 window)'
);

select is(
  (select status from clientes_com_status('11111111-1111-1111-1111-111111111111') where telefone = '11900000004'),
  'vermelho',
  'client seen 20 days ago is vermelho under the default 12-day prazo'
);

select is(
  (select status from clientes_com_status('11111111-1111-1111-1111-111111111111') where telefone = '11900000005'),
  'amarelo',
  'client with a custom 7-day prazo seen 8 days ago is amarelo (7-day window: verde<=7, amarelo 8-10)'
);

select is(
  (select status from clientes_com_status('11111111-1111-1111-1111-111111111111') where telefone = '11900000006'),
  null,
  'client with zero atendimentos has no status'
);

-- Agendamento futuro confirmado -> tem_agendamento_futuro true.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
insert into agendamentos (barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', (select id from clientes where telefone = '11900000004'), 'b1000000-0000-0000-0000-000000000001', current_date + 3, '10:00', '10:40', 'confirmado', 'interno');

select is(
  (select tem_agendamento_futuro from clientes_com_status('11111111-1111-1111-1111-111111111111') where telefone = '11900000004'),
  true,
  'tem_agendamento_futuro is true when the client has a future non-cancelled agendamento'
);

-- p_membro_id filter: um cliente cadastrado pelo Marcos não deve aparecer
-- quando João filtra por si mesmo, e deve aparecer quando Marcos filtra por si mesmo.
select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente Do Marcos', '11900000007', null, null, null, 'indicacao', 'a1000000-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from clientes_com_status('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001') where telefone = '11900000007'),
  0,
  'p_membro_id filter excludes a client owned by a different barbeiro'
);

select is(
  (select count(*)::int from clientes_com_status('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000003') where telefone = '11900000007'),
  1,
  'p_membro_id filter includes the client owned by that barbeiro'
);

-- Cobertura: cliente do João é atendido pelo Marcos (ex.: férias do João) —
-- prova que clientes_com_status precisa ser security definer. Sem isso, a
-- leitura de atendimentos feita como João (RLS restringe a
-- "membro_id = auth_membro_id()") ignoraria silenciosamente este
-- atendimento do Marcos e o status ficaria errado (ou null).
select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente Cobertura', '11900000008', null, null, null, 'indicacao', 'a1000000-0000-0000-0000-000000000001');

select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', true);
insert into atendimentos (barbearia_id, membro_id, cliente_id, servico_id, preco, data) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000003', (select id from clientes where telefone = '11900000008'), 'b1000000-0000-0000-0000-000000000001', 60, current_date - 5);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
select is(
  (select status from clientes_com_status('11111111-1111-1111-1111-111111111111') where telefone = '11900000008'),
  'verde',
  'clientes_com_status sees an atendimento performed by a DIFFERENT barbeiro (coverage) even when called as the client owner (proves security definer is load-bearing)'
);

-- Tenant isolation: membro de outra barbearia não consegue ler os clientes da Barbearia A passando o barbearia_id dela.
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000004', true);

select is(
  (select count(*)::int from clientes_com_status('11111111-1111-1111-1111-111111111111')),
  0,
  'clientes_com_status returns nothing when called with a barbearia_id that is not the caller''s own tenant'
);

select * from finish();
rollback;
