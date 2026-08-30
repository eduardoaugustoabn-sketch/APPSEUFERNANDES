# Área de onboarding — fluxogramas e provas por processo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin cadastra "processos" (ex: Atendimento ao cliente) com um fluxograma (imagem) e uma prova de múltipla escolha; barbeiro estuda o fluxograma e faz/refaz a prova; admin acompanha status (não iniciado/aprovado/reprovado) e nota de cada barbeiro por processo.

**Architecture:** Schema novo (`processos_onboarding`, `perguntas_onboarding`, `alternativas_onboarding`, `tentativas_onboarding`, `respostas_tentativa_onboarding`) com RLS restringindo perguntas/alternativas só a admin — barbeiro nunca lê essas duas tabelas diretamente, só via duas funções `security definer`: uma que lista perguntas+alternativas sem a coluna `correta`, outra que recebe as respostas escolhidas, corrige no servidor e grava a tentativa. Fluxograma vai pro Supabase Storage (bucket privado `fluxogramas`, hoje desativado neste projeto), servido por signed URL gerada no Server Component.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), TypeScript, Tailwind, Supabase (Postgres + RLS + Storage), pgTAP.

**Spec:** `docs/superpowers/specs/2026-08-30-onboarding-barbeiros-design.md`

## Global Constraints

- Nota mínima de aprovação: **70%, fixa no código** (não é coluna configurável).
- Cada pergunta tem **sempre exatamente 4 alternativas** (1 correta) — decisão tomada durante o planejamento, não estava na spec original; formulário de autoria não precisa suportar quantidade variável.
- Barbeiro **nunca** tem select direto em `perguntas_onboarding` nem `alternativas_onboarding` — só via `processo_onboarding_perguntas()`. A correção da prova roda inteira em `submeter_tentativa_onboarding()`, no servidor — nunca confiar em nota calculada no cliente.
- Toda tentativa é gravada (histórico completo), mesmo a UI só exibindo a mais recente.
- Bucket de storage `fluxogramas` é **privado** — imagens servidas por signed URL, nunca por URL pública direta.
- Barbeiro pode refazer a prova quantas vezes quiser.

---

### Task 1: Migration (schema, RLS, storage, RPCs) + pgTAP

**Files:**
- Create: `supabase/migrations/0041_onboarding_processos.sql`
- Create: `supabase/tests/database/0024_onboarding_processos.test.sql`
- Modify: `supabase/config.toml`

**Interfaces:**
- Produces: tabelas `processos_onboarding`, `perguntas_onboarding`, `alternativas_onboarding`, `tentativas_onboarding`, `respostas_tentativa_onboarding`; funções `processo_onboarding_perguntas(p_processo_id uuid)` retornando `(pergunta_id uuid, enunciado text, pergunta_ordem int, alternativa_id uuid, alternativa_texto text, alternativa_ordem int)` e `submeter_tentativa_onboarding(p_processo_id uuid, p_respostas jsonb)` retornando `(nota_percentual int, aprovado boolean)`; bucket de storage `fluxogramas`. Tasks 2-6 consomem essas tabelas/funções/bucket exatamente com esses nomes e assinaturas.

- [ ] **Step 1: Habilitar Storage no config local**

Find (em `supabase/config.toml`):

```toml
[storage]
enabled = false
```

Replace:

```toml
[storage]
enabled = true
```

- [ ] **Step 2: Escrever a migration**

Create `supabase/migrations/0041_onboarding_processos.sql`:

```sql
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
```

- [ ] **Step 3: Escrever os testes pgTAP**

Create `supabase/tests/database/0024_onboarding_processos.test.sql`:

```sql
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
```

- [ ] **Step 4: Rodar o reset e a suíte pgTAP**

Run: `npx supabase db reset`
Run: `npx supabase test db`
Expected: PASS, incluindo o novo arquivo `0024_onboarding_processos.test.sql` com 17 asserções (`plan(17)`, exatamente como escrito no Step 3), sem quebrar nenhum dos arquivos existentes.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0041_onboarding_processos.sql supabase/tests/database/0024_onboarding_processos.test.sql supabase/config.toml
git commit -m "feat: add onboarding schema, RLS, storage bucket and grading RPCs"
```

---

### Task 2: Admin — lista de processos

**Files:**
- Create: `src/app/admin/onboarding/page.tsx`
- Create: `src/components/processo-onboarding-row.tsx`
- Modify: `src/app/admin/layout.tsx`
- Modify: `src/components/admin/sidebar.tsx`

**Interfaces:**
- Consumes: tabela `processos_onboarding` (Task 1).
- Produces: rota `/admin/onboarding`, componente `ProcessoOnboardingRow`. Task 3 é acessado a partir do link de cada linha (`/admin/onboarding/[id]`).

- [ ] **Step 1: Criar o componente de linha**

Create `src/components/processo-onboarding-row.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { TableRow, TableCell } from '@/components/ui/table'

type Processo = { id: string; nome: string; descricao: string | null; ativo: boolean }

export function ProcessoOnboardingRow({ processo }: { processo: Processo }) {
  const router = useRouter()

  async function alternarAtivo() {
    const supabase = getBrowserSupabaseClient()
    await supabase.from('processos_onboarding').update({ ativo: !processo.ativo }).eq('id', processo.id)
    router.refresh()
  }

  return (
    <TableRow className={processo.ativo ? '' : 'opacity-50'}>
      <TableCell><Link href={`/admin/onboarding/${processo.id}`} className="text-primary underline">{processo.nome}</Link></TableCell>
      <TableCell>{processo.descricao ?? '—'}</TableCell>
      <TableCell>
        <button type="button" onClick={alternarAtivo} className="text-xs text-destructive underline">{processo.ativo ? 'Desativar' : 'Reativar'}</button>
      </TableCell>
    </TableRow>
  )
}
```

- [ ] **Step 2: Criar a página de listagem**

Create `src/app/admin/onboarding/page.tsx`:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ProcessoOnboardingRow } from '@/components/processo-onboarding-row'
import { Table, TableHeader, TableBody, TableRow, TableHead } from '@/components/ui/table'

async function criarProcesso(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('processos_onboarding').insert({
    barbearia_id: membro!.barbearia_id,
    nome: formData.get('nome') as string,
    descricao: (formData.get('descricao') as string) || null,
  })
  revalidatePath('/admin/onboarding')
}

export default async function OnboardingPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const { data: processos } = await supabase.from('processos_onboarding').select('*').eq('barbearia_id', membro!.barbearia_id).order('nome')

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Onboarding</h1>

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Adicionar processo</h2>
          <form action={criarProcesso} className="flex gap-2 flex-wrap">
            <Input name="nome" placeholder="Nome (ex: Atendimento ao cliente)" required className="w-56" />
            <Input name="descricao" placeholder="Descrição (opcional)" className="w-72" />
            <Button type="submit">Adicionar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Processos cadastrados</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Descrição</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {processos?.map((p) => <ProcessoOnboardingRow key={p.id} processo={p} />)}
            </TableBody>
          </Table>
          {(processos ?? []).length === 0 && <p className="text-sm text-muted-foreground mt-4">Nenhum processo cadastrado ainda.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Adicionar ao menu admin**

Find (em `src/app/admin/layout.tsx`):

```ts
  { href: '/admin/barbeiros', label: 'Barbeiros' },
  { href: '/admin/ranking', label: 'Ranking' },
```

Replace:

```ts
  { href: '/admin/barbeiros', label: 'Barbeiros' },
  { href: '/admin/onboarding', label: 'Onboarding' },
  { href: '/admin/ranking', label: 'Ranking' },
```

Find (em `src/components/admin/sidebar.tsx`):

```tsx
  '/admin/ranking': (
    <path d="M4 20V13M12 20V6M20 20v-9" />
  ),
```

Replace:

```tsx
  '/admin/onboarding': (
    <>
      <path d="M12 3l9 4.5-9 4.5-9-4.5 9-4.5z" />
      <path d="M3 7.5v6l9 4.5 9-4.5v-6" />
    </>
  ),
  '/admin/ranking': (
    <path d="M4 20V13M12 20V6M20 20v-9" />
  ),
```

- [ ] **Step 4: Typecheck e verificação manual**

Run: `npx tsc --noEmit`
Expected: 0 erros.

Verificação manual: logar como admin, abrir `/admin/onboarding`, criar um processo, confirmar que aparece na tabela e que "Desativar"/"Reativar" funciona.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/onboarding/page.tsx src/components/processo-onboarding-row.tsx src/app/admin/layout.tsx src/components/admin/sidebar.tsx
git commit -m "feat: add admin processos de onboarding list page"
```

---

### Task 3: Admin — detalhe do processo (fluxograma + resultados)

**Files:**
- Create: `src/app/admin/onboarding/[id]/page.tsx`
- Create: `src/components/fluxograma-upload-form.tsx`

**Interfaces:**
- Consumes: `processos_onboarding`, `tentativas_onboarding`, bucket `fluxogramas` (Task 1). Renderiza um placeholder `<PerguntasOnboardingAdmin>` cujo import real é adicionado na Task 4 (ver Step 3 abaixo) — até lá, a página só não mostra a seção de perguntas.

- [ ] **Step 1: Criar o formulário de upload do fluxograma**

Create `src/components/fluxograma-upload-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export function FluxogramaUploadForm({ processoId, barbeariaId, fluxogramaUrlAtual }: { processoId: string; barbeariaId: string; fluxogramaUrlAtual: string | null }) {
  const router = useRouter()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar() {
    if (!arquivo) return
    setEnviando(true)
    setErro(null)
    const supabase = getBrowserSupabaseClient()
    const extensao = arquivo.name.split('.').pop()
    const path = `${barbeariaId}/${processoId}.${extensao}`

    const { error: erroUpload } = await supabase.storage.from('fluxogramas').upload(path, arquivo, { upsert: true })
    if (erroUpload) {
      setErro(erroUpload.message)
      setEnviando(false)
      return
    }

    await supabase.from('processos_onboarding').update({ fluxograma_path: path }).eq('id', processoId)
    setEnviando(false)
    setArquivo(null)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3">
      {fluxogramaUrlAtual && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fluxogramaUrlAtual} alt="Fluxograma atual" className="max-w-full rounded-lg border border-border" />
      )}
      <div className="flex gap-2 items-center flex-wrap">
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} className="text-sm" />
        <Button type="button" onClick={enviar} disabled={!arquivo || enviando}>
          {fluxogramaUrlAtual ? 'Trocar fluxograma' : 'Enviar fluxograma'}
        </Button>
      </div>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Criar a página de detalhe do admin**

Create `src/app/admin/onboarding/[id]/page.tsx`:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { FluxogramaUploadForm } from '@/components/fluxograma-upload-form'

type Tentativa = { membro_id: string; nota_percentual: number; aprovado: boolean; respondido_em: string }

export default async function ProcessoOnboardingAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const { data: processo } = await supabase.from('processos_onboarding').select('*').eq('id', id).eq('barbearia_id', membro!.barbearia_id).single()
  if (!processo) notFound()

  const { data: barbeiros } = await supabase.from('membros').select('id, nome').eq('barbearia_id', membro!.barbearia_id).eq('papel', 'barbeiro').eq('ativo', true).order('nome')
  const { data: tentativas } = await supabase.from('tentativas_onboarding').select('membro_id, nota_percentual, aprovado, respondido_em').eq('processo_id', id).order('respondido_em', { ascending: false }) as { data: Tentativa[] | null }

  let fluxogramaUrl: string | null = null
  if (processo.fluxograma_path) {
    const { data: signed } = await supabase.storage.from('fluxogramas').createSignedUrl(processo.fluxograma_path, 3600)
    fluxogramaUrl = signed?.signedUrl ?? null
  }

  const resultados = (barbeiros ?? []).map((b) => {
    const ultima = (tentativas ?? []).find((t) => t.membro_id === b.id)
    return { nome: b.nome, status: ultima ? (ultima.aprovado ? 'Aprovado' : 'Reprovado') : 'Não iniciado', nota: ultima?.nota_percentual ?? null }
  })

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">{processo.nome}</h1>

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Fluxograma</h2>
          <FluxogramaUploadForm processoId={processo.id} barbeariaId={membro!.barbearia_id} fluxogramaUrlAtual={fluxogramaUrl} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Resultados</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Barbeiro</TableHead><TableHead>Status</TableHead><TableHead>Nota</TableHead></TableRow></TableHeader>
            <TableBody>
              {resultados.map((r) => (
                <TableRow key={r.nome}>
                  <TableCell>{r.nome}</TableCell>
                  <TableCell>{r.status}</TableCell>
                  <TableCell>{r.nota != null ? `${r.nota}%` : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {resultados.length === 0 && <p className="text-sm text-muted-foreground mt-4">Nenhum barbeiro ativo cadastrado.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck e verificação manual**

Run: `npx tsc --noEmit`
Expected: 0 erros.

A stack local do Supabase precisa estar rodando com Storage habilitado pra testar upload de verdade (ver `supabase start` sem `-x storage` — Storage não está na lista de exclusão desta sessão, então já sobe junto quando o restante da stack sobe). Verificação manual: acessar `/admin/onboarding/[id]` de um processo criado na Task 2, subir uma imagem, confirmar que ela aparece na página após o upload e que "Resultados" lista os barbeiros ativos com status "Não iniciado".

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/onboarding/[id]/page.tsx src/components/fluxograma-upload-form.tsx
git commit -m "feat: add admin processo detail page with fluxograma upload and resultados"
```

---

### Task 4: Admin — CRUD de perguntas e alternativas

**Files:**
- Create: `src/components/perguntas-onboarding-admin.tsx`
- Modify: `src/app/admin/onboarding/[id]/page.tsx`

**Interfaces:**
- Consumes: `perguntas_onboarding`, `alternativas_onboarding` (Task 1).
- Produces: componente `PerguntasOnboardingAdmin`, integrado na página de detalhe entre o fluxograma e os resultados.

- [ ] **Step 1: Criar o componente de CRUD de perguntas**

Create `src/components/perguntas-onboarding-admin.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type Alternativa = { id: string; texto: string; correta: boolean; ordem: number }
type Pergunta = { id: string; enunciado: string; ordem: number; alternativas_onboarding: Alternativa[] }

export function PerguntasOnboardingAdmin({ processoId, perguntas }: { processoId: string; perguntas: Pergunta[] }) {
  const router = useRouter()
  const [enunciado, setEnunciado] = useState('')
  const [textos, setTextos] = useState(['', '', '', ''])
  const [correta, setCorreta] = useState(0)
  const [salvando, setSalvando] = useState(false)

  async function adicionarPergunta() {
    if (!enunciado.trim() || textos.some((t) => !t.trim())) return
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    const { data: pergunta, error } = await supabase
      .from('perguntas_onboarding')
      .insert({ processo_id: processoId, enunciado, ordem: perguntas.length })
      .select('id')
      .single()
    if (error || !pergunta) {
      setSalvando(false)
      return
    }
    await supabase.from('alternativas_onboarding').insert(
      textos.map((texto, i) => ({ pergunta_id: pergunta.id, texto, correta: i === correta, ordem: i }))
    )
    setEnunciado('')
    setTextos(['', '', '', ''])
    setCorreta(0)
    setSalvando(false)
    router.refresh()
  }

  async function removerPergunta(perguntaId: string) {
    const supabase = getBrowserSupabaseClient()
    await supabase.from('perguntas_onboarding').delete().eq('id', perguntaId)
    router.refresh()
  }

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="font-heading text-base font-bold mb-5">Perguntas da prova ({perguntas.length})</h2>

        {perguntas.map((p, i) => (
          <div key={p.id} className="border-b py-3 last:border-b-0">
            <div className="flex justify-between items-start gap-2 mb-2">
              <p className="font-semibold text-sm">{i + 1}. {p.enunciado}</p>
              <button type="button" onClick={() => removerPergunta(p.id)} className="text-xs text-destructive underline shrink-0">Remover</button>
            </div>
            <ul className="text-sm text-muted-foreground flex flex-col gap-0.5">
              {[...p.alternativas_onboarding].sort((a, b) => a.ordem - b.ordem).map((a) => (
                <li key={a.id} className={a.correta ? 'text-primary font-semibold' : ''}>{a.correta ? '✓ ' : '— '}{a.texto}</li>
              ))}
            </ul>
          </div>
        ))}

        <div className="mt-5 pt-5 border-t flex flex-col gap-3">
          <p className="font-semibold text-sm">Nova pergunta</p>
          <Input placeholder="Enunciado da pergunta" value={enunciado} onChange={(e) => setEnunciado(e.target.value)} />
          {textos.map((texto, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name="correta" checked={correta === i} onChange={() => setCorreta(i)} aria-label={`Alternativa ${i + 1} é a correta`} />
              <Input
                placeholder={`Alternativa ${i + 1}`}
                value={texto}
                onChange={(e) => setTextos((prev) => prev.map((t, idx) => (idx === i ? e.target.value : t)))}
              />
            </div>
          ))}
          <Button type="button" onClick={adicionarPergunta} disabled={salvando} className="self-start">Adicionar pergunta</Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Integrar na página de detalhe**

Find (em `src/app/admin/onboarding/[id]/page.tsx`):

```tsx
import { FluxogramaUploadForm } from '@/components/fluxograma-upload-form'

type Tentativa = { membro_id: string; nota_percentual: number; aprovado: boolean; respondido_em: string }
```

Replace:

```tsx
import { FluxogramaUploadForm } from '@/components/fluxograma-upload-form'
import { PerguntasOnboardingAdmin } from '@/components/perguntas-onboarding-admin'

type Alternativa = { id: string; texto: string; correta: boolean; ordem: number }
type Pergunta = { id: string; enunciado: string; ordem: number; alternativas_onboarding: Alternativa[] }
type Tentativa = { membro_id: string; nota_percentual: number; aprovado: boolean; respondido_em: string }
```

Find:

```tsx
  const { data: barbeiros } = await supabase.from('membros').select('id, nome').eq('barbearia_id', membro!.barbearia_id).eq('papel', 'barbeiro').eq('ativo', true).order('nome')
  const { data: tentativas } = await supabase.from('tentativas_onboarding').select('membro_id, nota_percentual, aprovado, respondido_em').eq('processo_id', id).order('respondido_em', { ascending: false }) as { data: Tentativa[] | null }
```

Replace:

```tsx
  const { data: perguntas } = await supabase.from('perguntas_onboarding').select('*, alternativas_onboarding(*)').eq('processo_id', id).order('ordem') as { data: Pergunta[] | null }
  const { data: barbeiros } = await supabase.from('membros').select('id, nome').eq('barbearia_id', membro!.barbearia_id).eq('papel', 'barbeiro').eq('ativo', true).order('nome')
  const { data: tentativas } = await supabase.from('tentativas_onboarding').select('membro_id, nota_percentual, aprovado, respondido_em').eq('processo_id', id).order('respondido_em', { ascending: false }) as { data: Tentativa[] | null }
```

Find:

```tsx
      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Resultados</h2>
```

Replace:

```tsx
      <div className="mb-6">
        <PerguntasOnboardingAdmin processoId={processo.id} perguntas={perguntas ?? []} />
      </div>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Resultados</h2>
```

- [ ] **Step 3: Typecheck e verificação manual**

Run: `npx tsc --noEmit`
Expected: 0 erros.

Verificação manual: na página de detalhe do processo, adicionar uma pergunta com 4 alternativas marcando uma como correta, confirmar que aparece na lista com a alternativa correta destacada (✓), e que "Remover" apaga a pergunta (e suas alternativas, via `on delete cascade`).

- [ ] **Step 4: Commit**

```bash
git add src/components/perguntas-onboarding-admin.tsx src/app/admin/onboarding/[id]/page.tsx
git commit -m "feat: add perguntas/alternativas CRUD to admin processo detail page"
```

---

### Task 5: Barbeiro — lista de processos com status pessoal

**Files:**
- Create: `src/app/painel/onboarding/page.tsx`
- Modify: `src/app/painel/layout.tsx`
- Modify: `src/components/painel/sidebar.tsx`

**Interfaces:**
- Consumes: `processos_onboarding`, `tentativas_onboarding` (Task 1).
- Produces: rota `/painel/onboarding`, cada item linkando pra `/painel/onboarding/[id]` (Task 6).

- [ ] **Step 1: Criar a página de listagem do barbeiro**

Create `src/app/painel/onboarding/page.tsx`:

```tsx
import Link from 'next/link'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'

export default async function OnboardingPainelPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()

  const { data: processos } = await supabase.from('processos_onboarding').select('id, nome, descricao').eq('barbearia_id', membro!.barbearia_id).eq('ativo', true).order('nome')
  const { data: tentativas } = await supabase.from('tentativas_onboarding').select('processo_id, nota_percentual, aprovado, respondido_em').eq('membro_id', membro!.id).order('respondido_em', { ascending: false })

  const itens = (processos ?? []).map((p) => {
    const ultima = (tentativas ?? []).find((t) => t.processo_id === p.id)
    return {
      ...p,
      status: ultima ? (ultima.aprovado ? 'Aprovado' : 'Reprovado') : 'Não iniciado',
      nota: ultima?.nota_percentual ?? null,
    }
  })

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Onboarding</h1>
      <Card>
        <CardContent className="p-6">
          {itens.map((item) => (
            <Link key={item.id} href={`/painel/onboarding/${item.id}`} className="flex justify-between items-center border-b py-3 last:border-b-0 hover:bg-muted/50">
              <div>
                <p className="font-semibold text-sm">{item.nome}</p>
                {item.descricao && <p className="text-xs text-muted-foreground mt-0.5">{item.descricao}</p>}
              </div>
              <span className="text-sm text-right">
                {item.status}{item.nota != null && ` · ${item.nota}%`}
              </span>
            </Link>
          ))}
          {itens.length === 0 && <p className="text-sm text-muted-foreground">Nenhum processo de onboarding cadastrado ainda.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Adicionar ao menu do barbeiro**

Find (em `src/app/painel/layout.tsx`):

```ts
  { href: '/painel/clientes', label: 'Clientes' },
  { href: '/painel/loja', label: 'Loja' },
```

Replace:

```ts
  { href: '/painel/clientes', label: 'Clientes' },
  { href: '/painel/onboarding', label: 'Onboarding' },
  { href: '/painel/loja', label: 'Loja' },
```

Find (em `src/components/painel/sidebar.tsx`):

```tsx
  '/painel/loja': (
    <>
      <path d="M6 8h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
```

Replace:

```tsx
  '/painel/onboarding': (
    <>
      <path d="M12 3l9 4.5-9 4.5-9-4.5 9-4.5z" />
      <path d="M3 7.5v6l9 4.5 9-4.5v-6" />
    </>
  ),
  '/painel/loja': (
    <>
      <path d="M6 8h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
```

- [ ] **Step 3: Typecheck e verificação manual**

Run: `npx tsc --noEmit`
Expected: 0 erros.

Verificação manual: logar como barbeiro, abrir `/painel/onboarding`, confirmar que o processo criado nas tasks anteriores aparece com status "Não iniciado".

- [ ] **Step 4: Commit**

```bash
git add src/app/painel/onboarding/page.tsx src/app/painel/layout.tsx src/components/painel/sidebar.tsx
git commit -m "feat: add barbeiro onboarding list page with personal status"
```

---

### Task 6: Barbeiro — detalhe do processo (fluxograma + prova)

**Files:**
- Create: `src/app/painel/onboarding/[id]/page.tsx`
- Create: `src/components/prova-onboarding-form.tsx`

**Interfaces:**
- Consumes: `processos_onboarding`, `tentativas_onboarding`, `processo_onboarding_perguntas()`, `submeter_tentativa_onboarding()` (Task 1); bucket `fluxogramas`.

- [ ] **Step 1: Criar o formulário de prova**

Create `src/components/prova-onboarding-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type PerguntaRpc = {
  pergunta_id: string
  enunciado: string
  pergunta_ordem: number
  alternativa_id: string
  alternativa_texto: string
  alternativa_ordem: number
}
type Pergunta = { id: string; enunciado: string; alternativas: { id: string; texto: string }[] }
type UltimaTentativa = { nota_percentual: number; aprovado: boolean; respondido_em: string } | null

export function ProvaOnboardingForm({ processoId, ultimaTentativa }: { processoId: string; ultimaTentativa: UltimaTentativa }) {
  const router = useRouter()
  const [fazendo, setFazendo] = useState(false)
  const [perguntas, setPerguntas] = useState<Pergunta[]>([])
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const [carregando, setCarregando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{ nota_percentual: number; aprovado: boolean } | null>(null)

  async function iniciarProva() {
    setCarregando(true)
    setResultado(null)
    setRespostas({})
    const supabase = getBrowserSupabaseClient()
    const { data } = await supabase.rpc('processo_onboarding_perguntas', { p_processo_id: processoId }) as { data: PerguntaRpc[] | null }

    const agrupadas = new Map<string, Pergunta>()
    for (const linha of data ?? []) {
      const atual = agrupadas.get(linha.pergunta_id) ?? { id: linha.pergunta_id, enunciado: linha.enunciado, alternativas: [] }
      atual.alternativas.push({ id: linha.alternativa_id, texto: linha.alternativa_texto })
      agrupadas.set(linha.pergunta_id, atual)
    }
    setPerguntas(Array.from(agrupadas.values()))
    setCarregando(false)
    setFazendo(true)
  }

  async function enviarRespostas() {
    setEnviando(true)
    const supabase = getBrowserSupabaseClient()
    const payload = perguntas.map((p) => ({ pergunta_id: p.id, alternativa_id: respostas[p.id] })).filter((r) => r.alternativa_id)
    const { data, error } = await supabase.rpc('submeter_tentativa_onboarding', { p_processo_id: processoId, p_respostas: payload }) as { data: { nota_percentual: number; aprovado: boolean }[] | null; error: { message: string } | null }
    setEnviando(false)
    if (error || !data?.[0]) return
    setResultado(data[0])
    setFazendo(false)
    router.refresh()
  }

  if (resultado) {
    return (
      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-3">Resultado</h2>
          <p className={`text-2xl font-extrabold ${resultado.aprovado ? 'text-primary' : 'text-destructive'}`}>{resultado.nota_percentual}%</p>
          <p className="text-sm text-muted-foreground mt-1">{resultado.aprovado ? 'Aprovado' : 'Reprovado'} — nota mínima 70%</p>
          <Button type="button" className="mt-4" onClick={iniciarProva}>Refazer prova</Button>
        </CardContent>
      </Card>
    )
  }

  if (fazendo) {
    const respondidas = Object.keys(respostas).length
    return (
      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Prova</h2>
          {carregando && <p className="text-sm text-muted-foreground">Carregando perguntas...</p>}
          {perguntas.map((p, i) => (
            <div key={p.id} className="mb-5">
              <p className="font-semibold text-sm mb-2">{i + 1}. {p.enunciado}</p>
              <div className="flex flex-col gap-1.5">
                {p.alternativas.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-sm">
                    <input type="radio" name={p.id} checked={respostas[p.id] === a.id} onChange={() => setRespostas((prev) => ({ ...prev, [p.id]: a.id }))} />
                    {a.texto}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <Button type="button" onClick={enviarRespostas} disabled={enviando || respondidas < perguntas.length || perguntas.length === 0}>
            Enviar respostas
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="font-heading text-base font-bold mb-3">Prova</h2>
        {ultimaTentativa && (
          <p className="text-sm text-muted-foreground mb-4">
            Última tentativa: {ultimaTentativa.nota_percentual}% — {ultimaTentativa.aprovado ? 'Aprovado' : 'Reprovado'} em {new Date(ultimaTentativa.respondido_em).toLocaleDateString()}
          </p>
        )}
        <Button type="button" onClick={iniciarProva} disabled={carregando}>
          {ultimaTentativa ? 'Refazer prova' : 'Fazer prova'}
        </Button>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Criar a página de detalhe do barbeiro**

Create `src/app/painel/onboarding/[id]/page.tsx`:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { ProvaOnboardingForm } from '@/components/prova-onboarding-form'

export default async function ProcessoOnboardingPainelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()

  const { data: processo } = await supabase.from('processos_onboarding').select('*').eq('id', id).eq('barbearia_id', membro!.barbearia_id).single()
  if (!processo) notFound()

  const { data: ultimaTentativa } = await supabase
    .from('tentativas_onboarding')
    .select('nota_percentual, aprovado, respondido_em')
    .eq('processo_id', id)
    .eq('membro_id', membro!.id)
    .order('respondido_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  let fluxogramaUrl: string | null = null
  if (processo.fluxograma_path) {
    const { data: signed } = await supabase.storage.from('fluxogramas').createSignedUrl(processo.fluxograma_path, 3600)
    fluxogramaUrl = signed?.signedUrl ?? null
  }

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">{processo.nome}</h1>
      {processo.descricao && <p className="text-sm text-muted-foreground mb-4">{processo.descricao}</p>}

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Fluxograma</h2>
          {fluxogramaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fluxogramaUrl} alt={`Fluxograma de ${processo.nome}`} className="max-w-full rounded-lg border border-border" />
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum fluxograma cadastrado ainda para este processo.</p>
          )}
        </CardContent>
      </Card>

      <ProvaOnboardingForm processoId={processo.id} ultimaTentativa={ultimaTentativa} />
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 4: Verificação manual completa (fluxo ponta a ponta)**

Sem teste automatizado pra este passo — mesma justificativa das demais entregas desta sessão (não há padrão de teste de componente/integração neste projeto, só `tests/unit/*.test.ts` de funções puras). Com o dev server rodando e a stack local do Supabase de pé (Storage incluso):

1. Como admin, criar um processo, subir um fluxograma, cadastrar pelo menos 2 perguntas com 4 alternativas cada.
2. Como barbeiro, abrir `/painel/onboarding`, confirmar status "Não iniciado", abrir o processo, ver o fluxograma, clicar "Fazer prova".
3. Responder todas as perguntas corretamente, enviar, confirmar nota 100% e "Aprovado".
4. Clicar "Refazer prova", responder tudo errado, confirmar nota 0% e "Reprovado".
5. Voltar pra `/painel/onboarding`, confirmar que o status pessoal mudou pra refletir a tentativa mais recente (a de 0%/Reprovado, já que foi a última).
6. Como admin, voltar no processo e confirmar que a tabela de Resultados mostra a nota/status mais recente do barbeiro.

- [ ] **Step 5: Commit**

```bash
git add src/app/painel/onboarding/[id]/page.tsx src/components/prova-onboarding-form.tsx
git commit -m "feat: add barbeiro processo detail page with quiz-taking flow"
```
