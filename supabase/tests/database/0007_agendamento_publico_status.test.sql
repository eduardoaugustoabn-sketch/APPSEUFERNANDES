begin;
select plan(3);

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
insert into horarios_trabalho (membro_id, dia_semana, hora_inicio, hora_fim) values
  ('a1000000-0000-0000-0000-000000000001', extract(dow from current_date + 1)::int, '09:00', '18:00');

set local role anon;

select lives_ok(
  $$ select criar_agendamento_publico('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', current_date + 1, '09:00', 'Cliente 1', '11900000001', null, null, 'Indicação') $$,
  'public booking into a free slot still succeeds'
);

reset role;

select is(
  (select status from agendamentos where hora_inicio = '09:00' order by criado_em desc limit 1),
  'agendado',
  'a publicly-created agendamento starts as agendado, not confirmado'
);

set local role anon;

-- Overlapping booking for the same slot must still be rejected — the
-- guarantee moved from the dropped exclusion constraint into this function's
-- own explicit overlap check.
select throws_ok(
  $$ select criar_agendamento_publico('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', current_date + 1, '09:00', 'Cliente 2', '11900000002', null, null, 'Indicação') $$,
  'Esse horário acabou de ser reservado por outra pessoa. Escolha outro horário.',
  'a second public booking for the same slot is still rejected'
);

select * from finish();
rollback;
