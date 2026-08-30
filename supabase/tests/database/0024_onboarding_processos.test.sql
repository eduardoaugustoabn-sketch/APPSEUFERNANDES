begin;
select plan(17);

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

set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);

-- Admin cria um processo.
insert into processos_onboarding (id, barbearia_id, nome, descricao) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Processo A1', 'dois passos');

select is(
  (select count(*)::int from processos_onboarding where barbearia_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'admin can create a processo_onboarding'
);

-- Admin cadastra 2 perguntas (Processo A1) com 2 alternativas cada.
insert into perguntas_onboarding (id, processo_id, enunciado, ordem) values
  ('d1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Pergunta 1', 0),
  ('d1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'Pergunta 2', 1);

insert into alternativas_onboarding (id, pergunta_id, texto, correta, ordem) values
  ('e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'Certa 1', true, 0),
  ('e1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'Errada 1', false, 1),
  ('e1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000002', 'Certa 2', true, 0),
  ('e1000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000002', 'Errada 2', false, 1);

-- Processo A2, 3 perguntas (pra testar nota não-redonda: 2/3 = 67%).
insert into processos_onboarding (id, barbearia_id, nome) values
  ('c1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Processo A2');

insert into perguntas_onboarding (id, processo_id, enunciado, ordem) values
  ('d1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000002', 'Pergunta 3', 0),
  ('d1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000002', 'Pergunta 4', 1),
  ('d1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000002', 'Pergunta 5', 2);

insert into alternativas_onboarding (id, pergunta_id, texto, correta, ordem) values
  ('e1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000003', 'Certa 3', true, 0),
  ('e1000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000003', 'Errada 3', false, 1),
  ('e1000000-0000-0000-0000-000000000007', 'd1000000-0000-0000-0000-000000000004', 'Certa 4', true, 0),
  ('e1000000-0000-0000-0000-000000000008', 'd1000000-0000-0000-0000-000000000004', 'Errada 4', false, 1),
  ('e1000000-0000-0000-0000-000000000009', 'd1000000-0000-0000-0000-000000000005', 'Certa 5', true, 0),
  ('e100000a-0000-0000-0000-000000000010', 'd1000000-0000-0000-0000-000000000005', 'Errada 5', false, 1);

-- Barbeiro não pode gerenciar perguntas/alternativas (só admin).
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', true);

select is(
  (select count(*)::int from perguntas_onboarding where processo_id = 'c1000000-0000-0000-0000-000000000001'),
  0,
  'a barbeiro cannot select perguntas_onboarding directly (RLS blocks all access, no policy grants it)'
);

select is(
  (select count(*)::int from alternativas_onboarding where pergunta_id = 'd1000000-0000-0000-0000-000000000001'),
  0,
  'a barbeiro cannot select alternativas_onboarding directly (RLS blocks all access, no policy grants it)'
);

select throws_ok(
  $$insert into perguntas_onboarding (processo_id, enunciado) values ('c1000000-0000-0000-0000-000000000001', 'Pergunta Hacker')$$,
  'new row violates row-level security policy for table "perguntas_onboarding"',
  'a barbeiro cannot insert into perguntas_onboarding'
);

select throws_ok(
  $$insert into alternativas_onboarding (pergunta_id, texto, correta) values ('d1000000-0000-0000-0000-000000000001', 'Hacker', true)$$,
  'new row violates row-level security policy for table "alternativas_onboarding"',
  'a barbeiro cannot insert into alternativas_onboarding'
);

-- processo_onboarding_perguntas bypassa a RLS de leitura só o suficiente
-- pra devolver id+texto das alternativas (sem `correta`) -- confirma que a
-- função funciona pro barbeiro mesmo sem select direto nas tabelas.
select is(
  (select count(*)::int from processo_onboarding_perguntas('c1000000-0000-0000-0000-000000000001')),
  4,
  'processo_onboarding_perguntas returns all 4 alternativa rows (2 perguntas x 2 alternativas) for a barbeiro with no direct table access'
);

-- Todas certas (Processo A1, 2/2) -> 100%, aprovado.
select is(
  (select nota_percentual from submeter_tentativa_onboarding(
    'c1000000-0000-0000-0000-000000000001',
    '[{"pergunta_id":"d1000000-0000-0000-0000-000000000001","alternativa_id":"e1000000-0000-0000-0000-000000000001"},{"pergunta_id":"d1000000-0000-0000-0000-000000000002","alternativa_id":"e1000000-0000-0000-0000-000000000003"}]'::jsonb
  )),
  100,
  'all correct answers yield nota_percentual 100'
);

select is(
  (select aprovado from submeter_tentativa_onboarding(
    'c1000000-0000-0000-0000-000000000001',
    '[{"pergunta_id":"d1000000-0000-0000-0000-000000000001","alternativa_id":"e1000000-0000-0000-0000-000000000001"},{"pergunta_id":"d1000000-0000-0000-0000-000000000002","alternativa_id":"e1000000-0000-0000-0000-000000000003"}]'::jsonb
  )),
  true,
  'a nota_percentual of 100 is aprovado'
);

-- Todas erradas (Processo A1, 0/2) -> 0%, reprovado.
select is(
  (select nota_percentual from submeter_tentativa_onboarding(
    'c1000000-0000-0000-0000-000000000001',
    '[{"pergunta_id":"d1000000-0000-0000-0000-000000000001","alternativa_id":"e1000000-0000-0000-0000-000000000002"},{"pergunta_id":"d1000000-0000-0000-0000-000000000002","alternativa_id":"e1000000-0000-0000-0000-000000000004"}]'::jsonb
  )),
  0,
  'all wrong answers yield nota_percentual 0'
);

select is(
  (select aprovado from submeter_tentativa_onboarding(
    'c1000000-0000-0000-0000-000000000001',
    '[{"pergunta_id":"d1000000-0000-0000-0000-000000000001","alternativa_id":"e1000000-0000-0000-0000-000000000002"},{"pergunta_id":"d1000000-0000-0000-0000-000000000002","alternativa_id":"e1000000-0000-0000-0000-000000000004"}]'::jsonb
  )),
  false,
  'a nota_percentual of 0 is not aprovado'
);

-- Parcial não-redondo (Processo A2, 2/3 = 67%) -> reprovado (abaixo de 70).
select is(
  (select nota_percentual from submeter_tentativa_onboarding(
    'c1000000-0000-0000-0000-000000000002',
    '[{"pergunta_id":"d1000000-0000-0000-0000-000000000003","alternativa_id":"e1000000-0000-0000-0000-000000000005"},{"pergunta_id":"d1000000-0000-0000-0000-000000000004","alternativa_id":"e1000000-0000-0000-0000-000000000007"},{"pergunta_id":"d1000000-0000-0000-0000-000000000005","alternativa_id":"e100000a-0000-0000-0000-000000000010"}]'::jsonb
  )),
  67,
  '2 of 3 correct rounds to nota_percentual 67'
);

-- Duplicar a mesma pergunta no array de respostas não infla a nota --
-- responde só a pergunta 1 (certa), duas vezes, pergunta 2 fica sem
-- resposta. Se fosse count(*) em vez de count(distinct pergunta_id), isso
-- contaria como 2 acertos e daria 100% mesmo com uma pergunta inteira sem
-- resposta.
select is(
  (select nota_percentual from submeter_tentativa_onboarding(
    'c1000000-0000-0000-0000-000000000001',
    '[{"pergunta_id":"d1000000-0000-0000-0000-000000000001","alternativa_id":"e1000000-0000-0000-0000-000000000001"},{"pergunta_id":"d1000000-0000-0000-0000-000000000001","alternativa_id":"e1000000-0000-0000-0000-000000000001"}]'::jsonb
  )),
  50,
  'submitting the same pergunta twice does not inflate the score past what answering it once would give'
);

-- Processo de outra barbearia (ou inexistente) é rejeitado.
select throws_ok(
  $$select submeter_tentativa_onboarding('00000000-0000-0000-0000-000000000000', '[]'::jsonb)$$,
  'Processo inválido para esta barbearia.',
  'submeter_tentativa_onboarding rejects a processo_id that does not belong to the caller''s barbearia'
);

-- Barbeiro só vê as próprias tentativas; total de tentativas geradas pelos
-- testes acima: 100(x2 chamadas) + 0(x2) + 67 + 50 = 6 tentativas.
select is(
  (select count(*)::int from tentativas_onboarding where membro_id = 'a1000000-0000-0000-0000-000000000003'),
  6,
  'a barbeiro reads exactly their own tentativas_onboarding rows'
);

-- Admin lê as tentativas da barbearia (mesmas 6, via policy separada).
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
select is(
  (select count(*)::int from tentativas_onboarding),
  6,
  'an admin reads all tentativas_onboarding for their barbearia'
);

-- Tenant isolation: admin de outra barbearia não vê os processos da Barbearia A.
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000004', true);
select is(
  (select count(*)::int from processos_onboarding where barbearia_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'an admin from a DIFFERENT barbearia cannot read this barbearia''s processos_onboarding'
);

reset role;

-- Storage: bucket existe e não é público.
select is(
  (select public from storage.buckets where id = 'fluxogramas'),
  false,
  'the fluxogramas storage bucket exists and is private'
);

select * from finish();
rollback;
