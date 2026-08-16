begin;
select plan(2);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a'),
  ('22222222-2222-2222-2222-222222222222', 'Barbearia B', 'barbearia-b');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com');

insert into membros (id, barbearia_id, user_id, papel, nome) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João');

insert into clientes (id, barbearia_id, nome, telefone) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Cliente A', '11999998888'),
  ('c1000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Cliente B', '11999997777');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

update clientes set observacao = 'Gosta de corte baixo' where id = 'c1000000-0000-0000-0000-000000000001';

select is(
  (select observacao from clientes where id = 'c1000000-0000-0000-0000-000000000001'),
  'Gosta de corte baixo',
  'barbeiro João consegue atualizar um cliente da própria barbearia'
);

-- RLS em UPDATE não levanta erro para uma linha fora do escopo da
-- policy — ela simplesmente não entra no conjunto afetado (0 linhas),
-- diferente de INSERT/WITH CHECK, que rejeitaria com exceção.
update clientes set observacao = 'Tentativa indevida' where id = 'c1000000-0000-0000-0000-000000000002';

select is(
  (select observacao from clientes where id = 'c1000000-0000-0000-0000-000000000002'),
  null,
  'a tentativa de atualizar um cliente de outra barbearia não teve efeito nenhum'
);

select * from finish();
rollback;
