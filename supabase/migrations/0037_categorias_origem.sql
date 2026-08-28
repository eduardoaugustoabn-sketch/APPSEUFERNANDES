create table categorias_origem (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true
);

alter table categorias_origem enable row level security;

create policy "membros leem categorias_origem" on categorias_origem for select
  using (barbearia_id = auth_barbearia_id());
create policy "admin gerencia categorias_origem" on categorias_origem for all
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin')
  with check (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
create policy "publico le categorias_origem ativas" on categorias_origem for select
  to anon using (ativo = true);

-- Semeia as 5 categorias atuais pra cada barbearia já existente, como
-- texto por extenso (o que passa a ser gravado em clientes.categoria_origem
-- dali pra frente, não mais o slug).
insert into categorias_origem (barbearia_id, nome)
select id, categoria from barbearias, unnest(array['Indicação', 'Redes sociais', 'Google/Internet', 'Passou na rua', 'Outro']) as categoria;

-- A constraint precisa sair ANTES de reescrever os valores abaixo — ela só
-- aceita os 5 slugs antigos, e "Indicação"/"Redes sociais"/etc. violariam
-- ela se a ordem fosse invertida.
alter table clientes drop constraint clientes_categoria_origem_check;

-- Converte os valores antigos (gravados como slug) pro texto por extenso,
-- pra ficar consistente com o que as categorias novas usam.
update clientes set categoria_origem = 'Indicação' where categoria_origem = 'indicacao';
update clientes set categoria_origem = 'Redes sociais' where categoria_origem = 'redes_sociais';
update clientes set categoria_origem = 'Google/Internet' where categoria_origem = 'google_internet';
update clientes set categoria_origem = 'Passou na rua' where categoria_origem = 'passou_na_rua';
update clientes set categoria_origem = 'Outro' where categoria_origem = 'outro';

-- Validação passa a ser dinâmica (contra a tabela categorias_origem) em
-- vez de uma lista fixa no corpo da função. Assinatura idêntica à versão
-- atual (0036_clientes_dono_status.sql, já com a validação de p_membro_id
-- contra p_barbearia_id) — só a checagem de categoria muda, sem precisar
-- de drop nem de reemitir grants.
create or replace function public.criar_ou_obter_cliente(
  p_barbearia_id uuid, p_nome text, p_telefone text, p_data_nascimento date default null,
  p_bairro text default null, p_cidade text default null, p_categoria_origem text default null,
  p_membro_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cliente_id uuid;
  v_telefone text;
  v_foi_criado boolean;
begin
  if not exists (select 1 from barbearias where id = p_barbearia_id) then
    raise exception 'Barbearia inválida';
  end if;

  if p_categoria_origem is not null and not exists (
    select 1 from categorias_origem where barbearia_id = p_barbearia_id and nome = p_categoria_origem and ativo
  ) then
    raise exception 'Categoria de origem inválida.';
  end if;

  if p_membro_id is not null and not exists (
    select 1 from membros where id = p_membro_id and barbearia_id = p_barbearia_id
  ) then
    raise exception 'Membro inválido para esta barbearia';
  end if;

  v_telefone := regexp_replace(p_telefone, '\D', '', 'g');

  insert into clientes (barbearia_id, nome, telefone, data_nascimento, bairro, cidade, categoria_origem, cadastrado_por_membro_id)
  values (p_barbearia_id, p_nome, v_telefone, p_data_nascimento, p_bairro, p_cidade, p_categoria_origem, p_membro_id)
  on conflict (barbearia_id, telefone)
  do update set
    nome = excluded.nome,
    data_nascimento = coalesce(clientes.data_nascimento, excluded.data_nascimento),
    bairro = coalesce(clientes.bairro, excluded.bairro),
    cidade = coalesce(clientes.cidade, excluded.cidade),
    categoria_origem = coalesce(clientes.categoria_origem, excluded.categoria_origem)
  returning id, (xmax = 0) into v_cliente_id, v_foi_criado;

  if v_foi_criado and p_categoria_origem is null then
    raise exception 'Categoria de origem é obrigatória para clientes novos.';
  end if;

  return v_cliente_id;
end;
$$;
