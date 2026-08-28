begin;
select plan(9);

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

-- A migration já semeou 5 categorias pra essa barbearia (seed roda pra
-- toda barbearia existente no momento da migration — como o teste insere
-- a barbearia DEPOIS da migration já ter rodado, precisa semear manualmente
-- aqui pra simular o estado real de uma barbearia existente).
insert into categorias_origem (barbearia_id, nome) values
  ('11111111-1111-1111-1111-111111111111', 'Indicação'),
  ('11111111-1111-1111-1111-111111111111', 'Redes sociais');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);

-- Admin cadastra uma categoria própria.
insert into categorias_origem (barbearia_id, nome) values
  ('11111111-1111-1111-1111-111111111111', 'Instagram Ads');

select is(
  (select count(*)::int from categorias_origem where barbearia_id = '11111111-1111-1111-1111-111111111111' and nome = 'Instagram Ads'),
  1,
  'admin can create a custom categoria_origem'
);

-- criar_ou_obter_cliente aceita a categoria customizada.
select is(
  (select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente Um', '11900000001', null, null, null, 'Instagram Ads') is not null),
  true,
  'criar_ou_obter_cliente accepts a custom categoria registered by the admin'
);

-- criar_ou_obter_cliente rejeita categoria inexistente.
select throws_ok(
  $$select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente Dois', '11900000002', null, null, null, 'Categoria Inexistente')$$,
  'Categoria de origem inválida.',
  'criar_ou_obter_cliente rejects a categoria_origem that does not exist'
);

-- Desativa "Redes sociais" e confirma que passa a ser rejeitada.
update categorias_origem set ativo = false where barbearia_id = '11111111-1111-1111-1111-111111111111' and nome = 'Redes sociais';

select throws_ok(
  $$select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente Tres', '11900000003', null, null, null, 'Redes sociais')$$,
  'Categoria de origem inválida.',
  'criar_ou_obter_cliente rejects a deactivated categoria_origem'
);

-- Barbeiro não pode gerenciar categorias_origem (só admin pode).
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', true);

select throws_ok(
  $$insert into categorias_origem (barbearia_id, nome) values ('11111111-1111-1111-1111-111111111111', 'Categoria Do Barbeiro')$$,
  'new row violates row-level security policy for table "categorias_origem"',
  'a non-admin barbeiro cannot create a categoria_origem'
);

update categorias_origem set nome = 'Hackeado' where barbearia_id = '11111111-1111-1111-1111-111111111111' and nome = 'Indicação';

select is(
  (select count(*)::int from categorias_origem where barbearia_id = '11111111-1111-1111-1111-111111111111' and nome = 'Indicação'),
  1,
  'a barbeiro update on categorias_origem is silently blocked by RLS -- the row is unchanged'
);

-- Admin de outra barbearia não consegue alterar categorias da Barbearia A.
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000004', true);

update categorias_origem set nome = 'Hackeado' where barbearia_id = '11111111-1111-1111-1111-111111111111' and nome = 'Indicação';

-- Verifica de volta como membro da Barbearia A -- a policy de select
-- também restringe por barbearia_id, então checar como admin B (que não
-- enxerga as linhas da Barbearia A) daria 0 de qualquer jeito, mascarando
-- se o update foi de fato bloqueado ou só ficou invisível pra esse leitor.
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);

select is(
  (select count(*)::int from categorias_origem where barbearia_id = '11111111-1111-1111-1111-111111111111' and nome = 'Indicação'),
  1,
  'an admin from a DIFFERENT barbearia cannot alter this barbearia''s categorias_origem'
);

-- Leitura pública (anon) só vê categorias ativas. Precisa limpar o JWT
-- claim explicitamente — "reset role" só troca o role do Postgres, não
-- o request.jwt.claim.sub que ficou setado pro admin acima (isso nunca
-- acontece numa requisição real, onde anon e authenticated são sempre
-- sessões separadas — é só um artefato de testar os dois papéis na
-- mesma transação).
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;

select is(
  (select count(*)::int from categorias_origem where barbearia_id = '11111111-1111-1111-1111-111111111111'),
  2,
  'anon can only read active categorias_origem (Indicação + Instagram Ads, not the deactivated Redes sociais)'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);

select is(
  (select count(*)::int from categorias_origem where barbearia_id = '11111111-1111-1111-1111-111111111111'),
  3,
  'an authenticated membro reads all categorias_origem for their barbearia, active or not'
);

select * from finish();
rollback;
