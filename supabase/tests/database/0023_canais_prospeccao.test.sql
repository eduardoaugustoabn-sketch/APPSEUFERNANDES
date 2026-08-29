begin;
select plan(6);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a');

insert into barbearias (id, nome, slug) values
  ('22222222-2222-2222-2222-222222222222', 'Barbearia B', 'barbearia-b');

insert into auth.users (id, email) values
  ('bbbbbbbb-0000-0000-0000-000000000002', 'admin@example.com'),
  ('cccccccc-0000-0000-0000-000000000003', 'barbeiro@example.com'),
  ('dddddddd-0000-0000-0000-000000000004', 'adminb@example.com');

insert into membros (id, barbearia_id, user_id, papel, nome) values
  ('a1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000002', 'admin', 'Admin'),
  ('a1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000003', 'barbeiro', 'Barbeiro'),
  ('a1000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'dddddddd-0000-0000-0000-000000000004', 'admin', 'AdminB');

-- A migration já semeou 5 canais pra essa barbearia (seed roda pra toda
-- barbearia existente no momento da migration — como o teste insere a
-- barbearia DEPOIS da migration já ter rodado, precisa semear manualmente
-- aqui pra simular o estado real de uma barbearia existente).
insert into canais_prospeccao (barbearia_id, nome) values
  ('11111111-1111-1111-1111-111111111111', 'WhatsApp'),
  ('11111111-1111-1111-1111-111111111111', 'Indicação');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);

-- Admin cadastra um canal próprio.
insert into canais_prospeccao (barbearia_id, nome) values
  ('11111111-1111-1111-1111-111111111111', 'Instagram');

select is(
  (select count(*)::int from canais_prospeccao where barbearia_id = '11111111-1111-1111-1111-111111111111' and nome = 'Instagram'),
  1,
  'admin can create a custom canal_prospeccao'
);

-- "nome" é a chave de negócio de fato (gravado direto em
-- prospeccoes.canal) -- não pode haver dois canais com o mesmo nome na
-- mesma barbearia.
select throws_ok(
  $$insert into canais_prospeccao (barbearia_id, nome) values ('11111111-1111-1111-1111-111111111111', 'Instagram')$$,
  'duplicate key value violates unique constraint "canais_prospeccao_barbearia_id_nome_key"',
  'cannot create two canais_prospeccao with the same name in the same barbearia'
);

-- Barbeiro não pode gerenciar canais_prospeccao (só admin pode).
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', true);

select throws_ok(
  $$insert into canais_prospeccao (barbearia_id, nome) values ('11111111-1111-1111-1111-111111111111', 'Canal Do Barbeiro')$$,
  'new row violates row-level security policy for table "canais_prospeccao"',
  'a non-admin barbeiro cannot create a canal_prospeccao'
);

update canais_prospeccao set nome = 'Hackeado' where barbearia_id = '11111111-1111-1111-1111-111111111111' and nome = 'WhatsApp';

select is(
  (select count(*)::int from canais_prospeccao where barbearia_id = '11111111-1111-1111-1111-111111111111' and nome = 'WhatsApp'),
  1,
  'a barbeiro update on canais_prospeccao is silently blocked by RLS -- the row is unchanged'
);

-- Admin de outra barbearia não consegue alterar canais da Barbearia A.
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000004', true);

update canais_prospeccao set nome = 'Hackeado' where barbearia_id = '11111111-1111-1111-1111-111111111111' and nome = 'WhatsApp';

-- Verifica de volta como membro da Barbearia A -- a policy de select
-- também restringe por barbearia_id, então checar como admin B (que não
-- enxerga as linhas da Barbearia A) daria 0 de qualquer jeito, mascarando
-- se o update foi de fato bloqueado ou só ficou invisível pra esse leitor.
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);

select is(
  (select count(*)::int from canais_prospeccao where barbearia_id = '11111111-1111-1111-1111-111111111111' and nome = 'WhatsApp'),
  1,
  'an admin from a DIFFERENT barbearia cannot alter this barbearia''s canais_prospeccao'
);

select is(
  (select count(*)::int from canais_prospeccao where barbearia_id = '11111111-1111-1111-1111-111111111111'),
  3,
  'an authenticated membro reads all canais_prospeccao for their barbearia (WhatsApp, Indicação, Instagram)'
);

select * from finish();
rollback;
