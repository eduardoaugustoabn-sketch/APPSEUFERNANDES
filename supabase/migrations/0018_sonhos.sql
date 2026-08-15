create table sonhos (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  membro_id uuid not null references membros(id),
  nome text not null,
  valor_alvo numeric(10,2) not null check (valor_alvo > 0),
  percentual_comissao numeric(5,2) not null check (percentual_comissao > 0 and percentual_comissao <= 100),
  concluido boolean not null default false,
  criado_em timestamptz not null default now()
);

alter table sonhos enable row level security;

create policy "admin le sonhos da barbearia" on sonhos for select
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
create policy "barbeiro le proprios sonhos" on sonhos for select
  using (membro_id = auth_membro_id());
create policy "barbeiro insere proprios sonhos" on sonhos for insert
  with check (membro_id = auth_membro_id() and barbearia_id = auth_barbearia_id());
create policy "barbeiro atualiza proprios sonhos" on sonhos for update
  using (membro_id = auth_membro_id());
create policy "barbeiro remove proprios sonhos" on sonhos for delete
  using (membro_id = auth_membro_id());

-- A sonho concluído (concluido = true) is excluded from both sides of this
-- sum — it no longer counts against the 100% cap, freeing its percentual
-- for a new sonho. Excluding the row being written itself (by id) is what
-- lets an UPDATE that only changes percentual_comissao on an existing row
-- re-validate correctly instead of double-counting its own old value.
create or replace function public.checar_limite_percentual_sonhos()
returns trigger language plpgsql as $$
declare
  soma_outros numeric;
begin
  if new.concluido then
    return new;
  end if;

  select coalesce(sum(percentual_comissao), 0) into soma_outros
  from sonhos
  where membro_id = new.membro_id
    and concluido = false
    and id != coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if soma_outros + new.percentual_comissao > 100 then
    raise exception 'A soma dos percentuais dos sonhos ativos nao pode ultrapassar 100';
  end if;

  return new;
end;
$$;

create trigger checar_limite_percentual_sonhos
  before insert or update on sonhos
  for each row execute function public.checar_limite_percentual_sonhos();

-- Mirrors ociosidade()'s pattern: language sql stable, no security definer
-- — RLS on atendimentos/vendas_produtos already scopes the result to what
-- the caller (barbeiro or admin) is allowed to see, so a barbeiro passing
-- another membro_id here just gets 0, never another barbeiro's data.
create or replace function public.comissao_acumulada(
  p_membro_id uuid, p_data_inicio timestamptz
) returns numeric
language sql stable as $$
  select
    coalesce((select sum(comissao_valor) from atendimentos where membro_id = p_membro_id and data >= p_data_inicio::date), 0)
    + coalesce((select sum(comissao_valor) from vendas_produtos where membro_id = p_membro_id and data >= p_data_inicio::date), 0);
$$;

grant execute on function public.comissao_acumulada(uuid, timestamptz) to authenticated;
