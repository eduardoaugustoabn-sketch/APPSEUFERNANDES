-- Body-only change (signature unchanged) — CREATE OR REPLACE keeps the
-- existing grants to anon/authenticated, no drop needed.
create or replace function public.criar_ou_obter_cliente(
  p_barbearia_id uuid, p_nome text, p_telefone text, p_data_nascimento date default null,
  p_bairro text default null, p_cidade text default null, p_categoria_origem text default null
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

  if p_categoria_origem is not null and p_categoria_origem not in ('indicacao', 'redes_sociais', 'google_internet', 'passou_na_rua', 'outro') then
    raise exception 'Categoria de origem inválida.';
  end if;

  v_telefone := regexp_replace(p_telefone, '\D', '', 'g');

  -- (xmax = 0) is true only for a row that was genuinely just inserted by
  -- THIS statement, never for a row that took the on-conflict update path —
  -- that's how we know whether this call actually created a new client,
  -- as opposed to just resolving to an existing one.
  insert into clientes (barbearia_id, nome, telefone, data_nascimento, bairro, cidade, categoria_origem)
  values (p_barbearia_id, p_nome, v_telefone, p_data_nascimento, p_bairro, p_cidade, p_categoria_origem)
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
