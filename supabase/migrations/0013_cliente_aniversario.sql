alter table clientes add column data_nascimento date;

-- Dropped and recreated (not just CREATE OR REPLACE) because adding a new
-- parameter changes the function's full type signature (uuid,text,text) ->
-- (uuid,text,text,date) — REPLACE would otherwise leave two overloaded
-- functions in the catalog instead of one.
drop function if exists public.criar_ou_obter_cliente(uuid, text, text);

create or replace function public.criar_ou_obter_cliente(
  p_barbearia_id uuid, p_nome text, p_telefone text, p_data_nascimento date default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cliente_id uuid;
  v_telefone text;
begin
  if not exists (select 1 from barbearias where id = p_barbearia_id) then
    raise exception 'Barbearia inválida';
  end if;

  v_telefone := regexp_replace(p_telefone, '\D', '', 'g');

  insert into clientes (barbearia_id, nome, telefone, data_nascimento)
  values (p_barbearia_id, p_nome, v_telefone, p_data_nascimento)
  on conflict (barbearia_id, telefone)
  do update set nome = excluded.nome, data_nascimento = coalesce(clientes.data_nascimento, excluded.data_nascimento)
  returning id into v_cliente_id;

  return v_cliente_id;
end;
$$;

grant execute on function public.criar_ou_obter_cliente(uuid, text, text, date) to anon, authenticated;
