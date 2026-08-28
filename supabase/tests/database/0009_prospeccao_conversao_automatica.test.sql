begin;
select plan(5);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a');

-- Seed default categorias_origem for this test barbearia
insert into categorias_origem (barbearia_id, nome) values
  ('11111111-1111-1111-1111-111111111111', 'Indicação'),
  ('11111111-1111-1111-1111-111111111111', 'Redes sociais'),
  ('11111111-1111-1111-1111-111111111111', 'Google/Internet'),
  ('11111111-1111-1111-1111-111111111111', 'Passou na rua'),
  ('11111111-1111-1111-1111-111111111111', 'Outro');

insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com');
insert into membros (id, barbearia_id, user_id, papel, nome) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João');
insert into servicos (id, barbearia_id, nome, duracao_minutos, preco) values
  ('b1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Corte', 40, 60);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

-- Scenario 1: prospecção → agenda → realizado → convertido.
select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente Um', '11900000001', null, null, null, 'Indicação');

insert into prospeccoes (barbearia_id, membro_id, canal, nome, telefone, cliente_id)
values (
  '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'whatsapp',
  'Cliente Um', '11900000001', (select id from clientes where telefone = '11900000001')
);

insert into agendamentos (id, barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem)
values (
  'd1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001',
  (select id from clientes where telefone = '11900000001'), 'b1000000-0000-0000-0000-000000000001',
  current_date + 1, '09:00', '09:40', 'confirmado', 'interno'
);

select is(
  (select status from prospeccoes where telefone = '11900000001'),
  'agendou',
  'creating an agendamento for a prospected cliente auto-links it and moves status to agendou'
);

update agendamentos set status = 'realizado' where id = 'd1000000-0000-0000-0000-000000000001';

select is(
  (select status from prospeccoes where telefone = '11900000001'),
  'convertido',
  'marking the linked agendamento realizado auto-converts the prospeccao'
);

select isnt(
  (select convertido_em from prospeccoes where telefone = '11900000001'),
  null,
  'convertido_em is stamped on auto-conversion'
);

-- Scenario 2: prospecção → agenda → não compareceu → não convertido.
select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente Dois', '11900000002', null, null, null, 'Indicação');

insert into prospeccoes (barbearia_id, membro_id, canal, nome, telefone, cliente_id)
values (
  '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'rua',
  'Cliente Dois', '11900000002', (select id from clientes where telefone = '11900000002')
);

insert into agendamentos (id, barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem)
values (
  'd1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001',
  (select id from clientes where telefone = '11900000002'), 'b1000000-0000-0000-0000-000000000001',
  current_date + 2, '10:00', '10:40', 'confirmado', 'interno'
);

update agendamentos set status = 'nao_compareceu' where id = 'd1000000-0000-0000-0000-000000000002';

select is(
  (select status from prospeccoes where telefone = '11900000002'),
  'nao_convertido',
  'marking the linked agendamento as nao_compareceu auto-marks the prospeccao nao_convertido'
);

select is(
  (select agendamento_id from prospeccoes where telefone = '11900000002'),
  'd1000000-0000-0000-0000-000000000002',
  'the prospeccao stores which agendamento it was linked to'
);

select * from finish();
rollback;
