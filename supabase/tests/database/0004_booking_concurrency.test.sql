begin;
select plan(5);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a'),
  ('22222222-2222-2222-2222-222222222222', 'Barbearia B', 'barbearia-b');

-- Seed default categorias_origem for both test barbearias
insert into categorias_origem (barbearia_id, nome) values
  ('11111111-1111-1111-1111-111111111111', 'Indicação'),
  ('11111111-1111-1111-1111-111111111111', 'Redes sociais'),
  ('11111111-1111-1111-1111-111111111111', 'Google/Internet'),
  ('11111111-1111-1111-1111-111111111111', 'Passou na rua'),
  ('11111111-1111-1111-1111-111111111111', 'Outro'),
  ('22222222-2222-2222-2222-222222222222', 'Indicação'),
  ('22222222-2222-2222-2222-222222222222', 'Redes sociais'),
  ('22222222-2222-2222-2222-222222222222', 'Google/Internet'),
  ('22222222-2222-2222-2222-222222222222', 'Passou na rua'),
  ('22222222-2222-2222-2222-222222222222', 'Outro');

insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com');
insert into membros (id, barbearia_id, user_id, papel, nome) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João');
insert into servicos (id, barbearia_id, nome, duracao_minutos, preco) values
  ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Corte', 40, 60),
  ('b0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Corte + Barba', 60, 90);
insert into horarios_trabalho (membro_id, dia_semana, hora_inicio, hora_fim) values
  ('a0000000-0000-0000-0000-000000000001', extract(dow from current_date + 1)::int, '09:00', '18:00');

set local role anon;

-- First booking for tomorrow at 09:00 succeeds.
select lives_ok(
  $$ select criar_agendamento_publico('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', current_date + 1, '09:00', 'Cliente 1', '11900000001', null, null, 'Indicação') $$,
  'first booking for the slot succeeds'
);

-- Second booking for the exact same slot must fail (this is the no-overbooking guarantee).
select throws_ok(
  $$ select criar_agendamento_publico('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', current_date + 1, '09:00', 'Cliente 2', '11900000002', null, null, 'Indicação') $$,
  'Esse horário acabou de ser reservado por outra pessoa. Escolha outro horário.',
  'second booking for the same slot is rejected'
);

-- A booking that starts at a different time but overlaps the first (09:00-09:40)
-- must also be rejected — proves the guarantee is a real interval overlap check,
-- not just a same-start-time unique index.
select throws_ok(
  $$ select criar_agendamento_publico('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', current_date + 1, '09:20', 'Cliente 3', '11900000003', null, null, 'Indicação') $$,
  'Esse horário acabou de ser reservado por outra pessoa. Escolha outro horário.',
  'an overlapping booking with a different start time and duration is also rejected'
);

-- agendamentos has no anon SELECT policy by design (public reads go only
-- through horarios_disponiveis()), so the verification count must run under
-- a role that isn't RLS-restricted — same pattern as Task 7's fix.
reset role;

select is(
  (select count(*)::int from agendamentos where membro_id = 'a0000000-0000-0000-0000-000000000001' and status <> 'cancelado'),
  1,
  'only one confirmed appointment exists for that slot'
);

set local role anon;

-- Cross-tenant membro_id: passing Barbearia B's id with João's (Barbearia A) membro_id must be rejected.
select throws_ok(
  $$ select criar_agendamento_publico('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', current_date + 1, '11:00', 'Cliente 4', '11900000004', null, null, 'Indicação') $$,
  'Barbeiro inválido para esta barbearia',
  'a membro_id belonging to a different barbearia than p_barbearia_id is rejected'
);

select * from finish();
rollback;
