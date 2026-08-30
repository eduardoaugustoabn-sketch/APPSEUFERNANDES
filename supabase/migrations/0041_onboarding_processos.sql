-- Onboarding: processos (fluxograma + prova) por barbearia, tentativas dos
-- barbeiros. O barbeiro nunca tem select direto em perguntas/alternativas
-- (RLS bloqueia) -- só acessa via processo_onboarding_perguntas(), que
-- nunca retorna a coluna `correta`. A correção roda inteira no servidor
-- via submeter_tentativa_onboarding(), nunca confiando numa nota calculada
-- no cliente.

create table processos_onboarding (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  nome text not null,
  descricao text,
  fluxograma_path text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table perguntas_onboarding (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references processos_onboarding(id) on delete cascade,
  enunciado text not null,
  ordem int not null default 0
);

create table alternativas_onboarding (
  id uuid primary key default gen_random_uuid(),
  pergunta_id uuid not null references perguntas_onboarding(id) on delete cascade,
  texto text not null,
  correta boolean not null default false,
  ordem int not null default 0
);

create table tentativas_onboarding (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references processos_onboarding(id) on delete cascade,
  membro_id uuid not null references membros(id) on delete cascade,
  nota_percentual int not null,
  aprovado boolean not null,
  respondido_em timestamptz not null default now()
);

create table respostas_tentativa_onboarding (
  id uuid primary key default gen_random_uuid(),
  tentativa_id uuid not null references tentativas_onboarding(id) on delete cascade,
  pergunta_id uuid not null references perguntas_onboarding(id),
  alternativa_id uuid not null references alternativas_onboarding(id)
);

alter table processos_onboarding enable row level security;
alter table perguntas_onboarding enable row level security;
alter table alternativas_onboarding enable row level security;
alter table tentativas_onboarding enable row level security;
alter table respostas_tentativa_onboarding enable row level security;

create policy "membros leem processos_onboarding" on processos_onboarding for select
  using (barbearia_id = auth_barbearia_id());
create policy "admin gerencia processos_onboarding" on processos_onboarding for all
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin')
  with check (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');

-- Só admin le/gerencia perguntas e alternativas -- barbeiro nunca tem
-- acesso direto a essas duas tabelas, só via processo_onboarding_perguntas().
create policy "admin gerencia perguntas_onboarding" on perguntas_onboarding for all
  using (
    auth_papel() = 'admin'
    and exists (select 1 from processos_onboarding p where p.id = perguntas_onboarding.processo_id and p.barbearia_id = auth_barbearia_id())
  )
  with check (
    auth_papel() = 'admin'
    and exists (select 1 from processos_onboarding p where p.id = perguntas_onboarding.processo_id and p.barbearia_id = auth_barbearia_id())
  );

create policy "admin gerencia alternativas_onboarding" on alternativas_onboarding for all
  using (
    auth_papel() = 'admin'
    and exists (
      select 1 from perguntas_onboarding pg
      join processos_onboarding p on p.id = pg.processo_id
      where pg.id = alternativas_onboarding.pergunta_id and p.barbearia_id = auth_barbearia_id()
    )
  )
  with check (
    auth_papel() = 'admin'
    and exists (
      select 1 from perguntas_onboarding pg
      join processos_onboarding p on p.id = pg.processo_id
      where pg.id = alternativas_onboarding.pergunta_id and p.barbearia_id = auth_barbearia_id()
    )
  );

create policy "barbeiro le proprias tentativas_onboarding" on tentativas_onboarding for select
  using (membro_id = auth_membro_id());
create policy "admin le tentativas_onboarding da barbearia" on tentativas_onboarding for select
  using (
    auth_papel() = 'admin'
    and exists (select 1 from processos_onboarding p where p.id = tentativas_onboarding.processo_id and p.barbearia_id = auth_barbearia_id())
  );
-- Sem policy de insert/update/delete em tentativas_onboarding -- só a
-- função submeter_tentativa_onboarding (security definer) grava aqui.

-- Sem nenhuma policy em respostas_tentativa_onboarding -- só a função de
-- submissão (security definer) grava; nenhuma tela lê essa tabela ainda.

create or replace function public.processo_onboarding_perguntas(p_processo_id uuid)
returns table(
  pergunta_id uuid, enunciado text, pergunta_ordem int,
  alternativa_id uuid, alternativa_texto text, alternativa_ordem int
)
language sql security definer set search_path = public as $$
  select p.id, p.enunciado, p.ordem, a.id, a.texto, a.ordem
  from perguntas_onboarding p
  join alternativas_onboarding a on a.pergunta_id = p.id
  join processos_onboarding proc on proc.id = p.processo_id
  where p.processo_id = p_processo_id
    and proc.barbearia_id = auth_barbearia_id()
  order by p.ordem, a.ordem;
$$;

revoke all on function public.processo_onboarding_perguntas(uuid) from public, anon;
grant execute on function public.processo_onboarding_perguntas(uuid) to authenticated;

create or replace function public.submeter_tentativa_onboarding(p_processo_id uuid, p_respostas jsonb)
returns table(nota_percentual int, aprovado boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_membro_id uuid := auth_membro_id();
  v_total int;
  v_acertos int;
  v_nota int;
  v_aprovado boolean;
  v_tentativa_id uuid;
begin
  if v_membro_id is null then
    raise exception 'Membro não encontrado.';
  end if;

  if not exists (select 1 from processos_onboarding where id = p_processo_id and barbearia_id = auth_barbearia_id()) then
    raise exception 'Processo inválido para esta barbearia.';
  end if;

  select count(*) into v_total from perguntas_onboarding where processo_id = p_processo_id;
  if v_total = 0 then
    raise exception 'Este processo não tem perguntas cadastradas.';
  end if;

  -- count(distinct pergunta_id), não count(*): sem isso, enviar a mesma
  -- pergunta duas vezes no array de respostas contaria dobrado e infla a
  -- nota além do número real de perguntas.
  select count(distinct p.id) into v_acertos
  from jsonb_to_recordset(p_respostas) as r(pergunta_id uuid, alternativa_id uuid)
  join perguntas_onboarding p on p.id = r.pergunta_id and p.processo_id = p_processo_id
  join alternativas_onboarding a on a.id = r.alternativa_id and a.pergunta_id = r.pergunta_id and a.correta = true;

  v_nota := round((v_acertos::numeric / v_total) * 100);
  v_aprovado := v_nota >= 70;

  insert into tentativas_onboarding (processo_id, membro_id, nota_percentual, aprovado)
  values (p_processo_id, v_membro_id, v_nota, v_aprovado)
  returning id into v_tentativa_id;

  insert into respostas_tentativa_onboarding (tentativa_id, pergunta_id, alternativa_id)
  select v_tentativa_id, (r->>'pergunta_id')::uuid, (r->>'alternativa_id')::uuid
  from jsonb_array_elements(p_respostas) as r;

  return query select v_nota, v_aprovado;
end;
$$;

revoke all on function public.submeter_tentativa_onboarding(uuid, jsonb) from public, anon;
grant execute on function public.submeter_tentativa_onboarding(uuid, jsonb) to authenticated;

-- Storage: bucket privado pro fluxograma de cada processo. Inserido via
-- migration (não via config.toml) pra não depender do CLI sincronizar
-- buckets declarados em config -- funciona em qualquer ambiente que rode
-- as migrations, local ou produção.
insert into storage.buckets (id, name, public)
values ('fluxogramas', 'fluxogramas', false)
on conflict (id) do nothing;

create policy "admin sobe fluxograma da propria barbearia" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'fluxogramas'
    and public.auth_papel() = 'admin'
    and (storage.foldername(name))[1] = public.auth_barbearia_id()::text
  );

create policy "admin atualiza fluxograma da propria barbearia" on storage.objects for update
  to authenticated
  using (
    bucket_id = 'fluxogramas'
    and public.auth_papel() = 'admin'
    and (storage.foldername(name))[1] = public.auth_barbearia_id()::text
  );

create policy "membros leem fluxograma da propria barbearia" on storage.objects for select
  to authenticated
  using (
    bucket_id = 'fluxogramas'
    and (storage.foldername(name))[1] = public.auth_barbearia_id()::text
  );
