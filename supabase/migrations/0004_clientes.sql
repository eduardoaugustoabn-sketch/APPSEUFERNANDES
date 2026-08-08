create table clientes (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  nome text not null,
  telefone text not null,
  criado_em timestamptz not null default now(),
  unique (barbearia_id, telefone)
);

alter table clientes enable row level security;

create policy "membros leem clientes da barbearia" on clientes for select
  using (barbearia_id = auth_barbearia_id());
-- No direct anon/authenticated INSERT policy: all client creation goes
-- through criar_ou_obter_cliente() below, which validates and normalizes.

create or replace function public.criar_ou_obter_cliente(
  p_barbearia_id uuid, p_nome text, p_telefone text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cliente_id uuid;
  v_telefone text;
begin
  if not exists (select 1 from barbearias where id = p_barbearia_id) then
    raise exception 'Barbearia inválida';
  end if;

  -- Normalize to digits-only so differently-formatted input for the same
  -- number (e.g. "(11) 98888-7777" vs "11988887777") still matches.
  v_telefone := regexp_replace(p_telefone, '\D', '', 'g');

  insert into clientes (barbearia_id, nome, telefone)
  values (p_barbearia_id, p_nome, v_telefone)
  on conflict (barbearia_id, telefone)
  do update set nome = excluded.nome
  returning id into v_cliente_id;

  return v_cliente_id;
end;
$$;

grant execute on function public.criar_ou_obter_cliente(uuid, text, text) to anon, authenticated;
