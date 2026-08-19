# Recorrência e Conversão por Categoria Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fase 2 de "Categorias de Atendimento e Indicadores de Performance" — calcular, a partir do histórico completo de cada cliente na carteira do barbeiro (sem limite de mês), três indicadores: recorrência por categoria (Só Cabelo/Só Barba/Cabelo+Barba/Total), conversão para categoria-alvo, e oportunidade de conversão — e mostrá-los num novo Card no `/painel` do barbeiro.

**Architecture:** Uma função SQL nova, `indicadores_recorrencia_conversao(p_membro_id uuid)`, `language sql stable` (sem `security definer`, contando com a RLS já existente em `atendimentos` pra escopar por barbeiro), que agrupa `atendimentos` por `cliente_id` + `agendamento_id` pra formar "visitas", classifica cada visita (mesma lógica da Fase 1: cabelo/barba/ambos, ignorando `outro`), e agrega por cliente pra calcular os três indicadores num único `select` sem `group by`. `/painel` chama essa função uma vez (`.rpc(...).single()`) e renderiza um Card novo.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres/RLS, pgTAP via `npx supabase test db`), Tailwind CSS v4, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-08-19-recorrencia-conversao-categoria-design.md`

## Global Constraints

- Escopo **por barbeiro** (carteira dele), não pela barbearia inteira — a função filtra `atendimentos.membro_id = p_membro_id`, e a RLS existente garante que ninguém vê atendimentos de outro membro através desse parâmetro.
- **Sem janela de tempo** — recorrência e conversão olham o histórico completo do cliente com aquele barbeiro, desde sempre.
- **Visita** = mesma unidade da Fase 1: um `agendamento_id`, categoria decidida pelos serviços presentes nele, ignorando `outro`. Todo `atendimentos.agendamento_id` já é sempre preenchido hoje (mesmo padrão/garantia da Fase 1).
- A função retorna exatamente uma linha sempre (agregação sem `group by` nunca retorna zero linhas), mesmo quando o barbeiro não tem nenhuma visita classificável — nesse caso os campos `numeric` (percentuais) voltam `null` (via `nullif`/divisão por zero), mas os campos `int` (contagens, `count(*) filter (...)`) voltam `0`, nunca `null` — `count()` sobre zero linhas é `0`, não `null`. O front-end trata ambos os casos como `0` na exibição.
- Nenhuma coluna ou tabela nova — só a função SQL.
- Não usar `supabase db reset` para aplicar a migração — usar `npx supabase migration up`.

---

### Task 1: Migração — função `indicadores_recorrencia_conversao`

**Files:**
- Create: `supabase/migrations/0029_indicadores_recorrencia_conversao.sql`
- Create: `supabase/tests/database/0016_indicadores_recorrencia_conversao.test.sql`

**Interfaces:**
- Produces: `indicadores_recorrencia_conversao(p_membro_id uuid) returns table(recorrencia_so_cabelo numeric, recorrencia_so_barba numeric, recorrencia_cabelo_barba numeric, recorrencia_total numeric, conversao_categoria_alvo numeric, clientes_fora_alvo int, clientes_so_cabelo int, clientes_so_barba int, potencial_conversao numeric)`. Task 2's `painel/page.tsx` calls this exact function with this exact return shape.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0029_indicadores_recorrencia_conversao.sql`:

```sql
create or replace function public.indicadores_recorrencia_conversao(p_membro_id uuid)
returns table(
  recorrencia_so_cabelo numeric,
  recorrencia_so_barba numeric,
  recorrencia_cabelo_barba numeric,
  recorrencia_total numeric,
  conversao_categoria_alvo numeric,
  clientes_fora_alvo int,
  clientes_so_cabelo int,
  clientes_so_barba int,
  potencial_conversao numeric
)
language sql stable as $$
  with visitas as (
    select
      a.cliente_id,
      a.agendamento_id,
      min(a.data) as data_visita,
      bool_or(s.categoria_servico = 'cabelo') as tem_cabelo,
      bool_or(s.categoria_servico = 'barba') as tem_barba
    from atendimentos a
    join servicos s on s.id = a.servico_id
    where a.membro_id = p_membro_id and a.agendamento_id is not null
    group by a.cliente_id, a.agendamento_id
  ),
  visitas_classificadas as (
    select
      cliente_id, data_visita,
      case
        when tem_cabelo and tem_barba then 'cabelo_barba'
        when tem_cabelo then 'so_cabelo'
        when tem_barba then 'so_barba'
        else null
      end as categoria
    from visitas
  ),
  visitas_validas as (
    select * from visitas_classificadas where categoria is not null
  ),
  por_cliente as (
    select
      cliente_id,
      count(*) filter (where categoria = 'so_cabelo') as n_so_cabelo,
      count(*) filter (where categoria = 'so_barba') as n_so_barba,
      count(*) filter (where categoria = 'cabelo_barba') as n_cabelo_barba,
      count(*) as n_total,
      (array_agg(categoria order by data_visita asc))[1] as primeira_categoria,
      bool_or(categoria = 'cabelo_barba') as teve_cabelo_barba,
      (array_agg(categoria order by data_visita desc))[1] as categoria_mais_recente
    from visitas_validas
    group by cliente_id
  )
  select
    round(100.0 * count(*) filter (where n_so_cabelo >= 2) / nullif(count(*) filter (where n_so_cabelo >= 1), 0), 0) as recorrencia_so_cabelo,
    round(100.0 * count(*) filter (where n_so_barba >= 2) / nullif(count(*) filter (where n_so_barba >= 1), 0), 0) as recorrencia_so_barba,
    round(100.0 * count(*) filter (where n_cabelo_barba >= 2) / nullif(count(*) filter (where n_cabelo_barba >= 1), 0), 0) as recorrencia_cabelo_barba,
    round(100.0 * count(*) filter (where n_total >= 2) / nullif(count(*), 0), 0) as recorrencia_total,
    round(100.0 * count(*) filter (where primeira_categoria in ('so_cabelo', 'so_barba') and teve_cabelo_barba)
      / nullif(count(*) filter (where primeira_categoria in ('so_cabelo', 'so_barba')), 0), 0) as conversao_categoria_alvo,
    count(*) filter (where categoria_mais_recente in ('so_cabelo', 'so_barba'))::int as clientes_fora_alvo,
    count(*) filter (where categoria_mais_recente = 'so_cabelo')::int as clientes_so_cabelo,
    count(*) filter (where categoria_mais_recente = 'so_barba')::int as clientes_so_barba,
    round(100.0 * count(*) filter (where categoria_mais_recente in ('so_cabelo', 'so_barba')) / nullif(count(*), 0), 0) as potencial_conversao
  from por_cliente;
$$;

grant execute on function public.indicadores_recorrencia_conversao(uuid) to authenticated;
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase migration up`
Expected: succeeds, no errors. Do **not** run `supabase db reset` — this local database has real data from manual testing throughout this project; `db reset` would wipe all of it. `migration up` applies only the new pending migration without touching existing rows. If it fails, report BLOCKED rather than falling back to `db reset`.

- [ ] **Step 3: Write the pgTAP test**

Create `supabase/tests/database/0016_indicadores_recorrencia_conversao.test.sql`:

```sql
begin;
select plan(12);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'pedro@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'rui@example.com');

insert into membros (id, barbearia_id, user_id, papel, nome) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João'),
  ('a1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'barbeiro', 'Pedro'),
  ('a1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000003', 'barbeiro', 'Rui');

insert into servicos (id, barbearia_id, nome, duracao_minutos, preco, categoria_servico) values
  ('b1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Corte', 30, 30, 'cabelo'),
  ('b1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Barba', 20, 20, 'barba');

-- Ana, Bruno, Carla are João's clients. Diego is Pedro's. Rui has no clients at all.
insert into clientes (id, barbearia_id, nome, telefone) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Ana', '11900000001'),
  ('c1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Bruno', '11900000002'),
  ('c1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Carla', '11900000003'),
  ('c1000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Diego', '11900000004');

-- Ana: 3 visits with João — so_cabelo, so_cabelo, cabelo_barba (recorrência so_cabelo + conversão).
insert into agendamentos (id, barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem) values
  ('e1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', '2026-01-01', '09:00', '09:30', 'realizado', 'interno'),
  ('e1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', '2026-02-01', '09:00', '09:30', 'realizado', 'interno'),
  ('e1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', '2026-03-01', '09:00', '09:50', 'realizado', 'interno'),
  -- Bruno: 1 visit with João — so_barba only (denominator only, no recorrência; still "fora do alvo").
  ('e1000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', '2026-01-15', '10:00', '10:20', 'realizado', 'interno'),
  -- Carla: 1 visit with João, already cabelo_barba on the first visit (never "outside the target", not a conversion).
  ('e1000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', '2026-01-10', '11:00', '11:50', 'realizado', 'interno'),
  -- Diego: 1 visit with Pedro (a different barbeiro) — must never affect João's numbers.
  ('e1000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001', '2026-01-01', '09:00', '09:30', 'realizado', 'interno');

insert into atendimentos (barbearia_id, membro_id, cliente_id, servico_id, preco, agendamento_id, data) values
  -- Ana visit 1 (só cabelo)
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 0, 'e1000000-0000-0000-0000-000000000001', '2026-01-01'),
  -- Ana visit 2 (só cabelo)
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 0, 'e1000000-0000-0000-0000-000000000002', '2026-02-01'),
  -- Ana visit 3 (cabelo + barba, two atendimentos sharing the same agendamento_id)
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 0, 'e1000000-0000-0000-0000-000000000003', '2026-03-01'),
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 0, 'e1000000-0000-0000-0000-000000000003', '2026-03-01'),
  -- Bruno visit 1 (só barba)
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 0, 'e1000000-0000-0000-0000-000000000004', '2026-01-15'),
  -- Carla visit 1 (cabelo + barba, two atendimentos sharing the same agendamento_id)
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', 0, 'e1000000-0000-0000-0000-000000000005', '2026-01-10'),
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000002', 0, 'e1000000-0000-0000-0000-000000000005', '2026-01-10'),
  -- Diego visit 1 (só cabelo) — belongs to Pedro, not João
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001', 0, 'e1000000-0000-0000-0000-000000000006', '2026-01-01');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

select is(
  (select recorrencia_so_cabelo from indicadores_recorrencia_conversao('a1000000-0000-0000-0000-000000000001')),
  100,
  'João: recorrência Só Cabelo é 100% (só Ana teve visitas só-cabelo, e ela teve 2)'
);
select is(
  (select recorrencia_so_barba from indicadores_recorrencia_conversao('a1000000-0000-0000-0000-000000000001')),
  0,
  'João: recorrência Só Barba é 0% (só Bruno teve 1 visita só-barba, sem repetir)'
);
select is(
  (select recorrencia_cabelo_barba from indicadores_recorrencia_conversao('a1000000-0000-0000-0000-000000000001')),
  0,
  'João: recorrência Cabelo+Barba é 0% (Ana e Carla tiveram 1 cada, nenhuma repetiu)'
);
select is(
  (select recorrencia_total from indicadores_recorrencia_conversao('a1000000-0000-0000-0000-000000000001')),
  33,
  'João: recorrência total é 33% (1 de 3 clientes — Ana — teve 2+ visitas classificáveis)'
);
select is(
  (select conversao_categoria_alvo from indicadores_recorrencia_conversao('a1000000-0000-0000-0000-000000000001')),
  50,
  'João: conversão para categoria-alvo é 50% (Ana converteu, Bruno não, de 2 que começaram fora do alvo)'
);
select is(
  (select clientes_fora_alvo from indicadores_recorrencia_conversao('a1000000-0000-0000-0000-000000000001')),
  1,
  'João: 1 cliente fora do público-alvo hoje (Bruno — última visita foi só-barba)'
);
select is(
  (select clientes_so_cabelo from indicadores_recorrencia_conversao('a1000000-0000-0000-0000-000000000001')),
  0,
  'João: 0 clientes com última visita só-cabelo'
);
select is(
  (select clientes_so_barba from indicadores_recorrencia_conversao('a1000000-0000-0000-0000-000000000001')),
  1,
  'João: 1 cliente com última visita só-barba (Bruno)'
);
select is(
  (select potencial_conversao from indicadores_recorrencia_conversao('a1000000-0000-0000-0000-000000000001')),
  33,
  'João: potencial de conversão é 33% (1 de 3 clientes está fora do alvo)'
);

-- Cross-barbeiro isolation: João asking about Pedro's membro_id must see nothing —
-- RLS filters atendimentos to auth_membro_id() regardless of what p_membro_id says.
select is(
  (select recorrencia_total from indicadores_recorrencia_conversao('a1000000-0000-0000-0000-000000000002')),
  null,
  'João não consegue ver os números de Pedro passando o membro_id dele — RLS bloqueia, resultado vem nulo'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);

select is(
  (select recorrencia_so_cabelo from indicadores_recorrencia_conversao('a1000000-0000-0000-0000-000000000002')),
  0,
  'Pedro: recorrência Só Cabelo é 0% (Diego teve só 1 visita só-cabelo — prova que Ana/Bruno/Carla de João não vazaram pra cá)'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);

select is(
  (select recorrencia_total from indicadores_recorrencia_conversao('a1000000-0000-0000-0000-000000000003')),
  null,
  'Rui (sem nenhum cliente/atendimento): campos percentuais vêm nulos, sem erro'
);

reset role;

select * from finish();
rollback;
```

- [ ] **Step 4: Run the pgTAP suite**

Run: `npx supabase test db`
Expected: all files pass, including the new `0016_indicadores_recorrencia_conversao.test.sql` (12/12 assertions), with no regressions in the other 15 files.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0029_indicadores_recorrencia_conversao.sql supabase/tests/database/0016_indicadores_recorrencia_conversao.test.sql
git commit -m "feat: add indicadores_recorrencia_conversao RPC scoped by membro"
```

---

### Task 2: `/painel` — Card de Recorrência e Conversão

**Files:**
- Modify: `src/app/painel/page.tsx`

**Interfaces:**
- Consumes: `indicadores_recorrencia_conversao(uuid)` from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Fetch the indicators and compute display values**

Right after the existing `percentualCabeloEBarba` line (the block computing `percentualSoCabelo`/`percentualSoBarba`/`percentualCabeloEBarba`, which stays unchanged), add:

```tsx
  const { data: indicadoresRaw } = await supabase
    .rpc('indicadores_recorrencia_conversao', { p_membro_id: membro!.id })
    .single() as {
      data: {
        recorrencia_so_cabelo: string | null
        recorrencia_so_barba: string | null
        recorrencia_cabelo_barba: string | null
        recorrencia_total: string | null
        conversao_categoria_alvo: string | null
        clientes_fora_alvo: number | null
        clientes_so_cabelo: number | null
        clientes_so_barba: number | null
        potencial_conversao: string | null
      } | null
    }

  const recorrenciaSoCabelo = Number(indicadoresRaw?.recorrencia_so_cabelo ?? 0)
  const recorrenciaSoBarba = Number(indicadoresRaw?.recorrencia_so_barba ?? 0)
  const recorrenciaCabeloBarba = Number(indicadoresRaw?.recorrencia_cabelo_barba ?? 0)
  const recorrenciaTotal = Number(indicadoresRaw?.recorrencia_total ?? 0)
  const conversaoCategoriaAlvo = Number(indicadoresRaw?.conversao_categoria_alvo ?? 0)
  const clientesSoCabeloForaAlvo = indicadoresRaw?.clientes_so_cabelo ?? 0
  const clientesSoBarbaForaAlvo = indicadoresRaw?.clientes_so_barba ?? 0
  const potencialConversao = Number(indicadoresRaw?.potencial_conversao ?? 0)
```

Note on types: `recorrencia_so_cabelo` and the other percentage fields are Postgres `numeric` — PostgREST serializes those as JSON strings (same reasoning as `preco`/`preco_unitario`/`comissao_valor` elsewhere in this file), so they're typed `string | null` here and unwrapped with `Number(...)`. The three count fields (`clientes_fora_alvo`, `clientes_so_cabelo`, `clientes_so_barba`) are cast `::int` in the SQL, which PostgREST serializes as a real JSON number — typed `number | null` directly, no `Number()` needed (just `?? 0`).

- [ ] **Step 2: Add the Card**

Right after the closing `</Card>` of the "Perfil dos clientes atendidos (mês)" Card (the one ending just before the "Tempo de cadeira (mês)" Card), add a new Card:

```tsx
      <Card className="mb-5">
        <CardContent className="p-6">
          <p className="font-heading text-base font-bold">Recorrência e Conversão (histórico completo)</p>
          <p className="text-xs text-muted-foreground mb-5">Considera todo o histórico do cliente com você, não só o mês</p>

          <p className="text-sm font-semibold text-foreground/80 mb-3">Recorrência</p>
          <div className="grid grid-cols-4 gap-5 text-center mb-6">
            <div><p className="text-2xl font-bold">{recorrenciaSoCabelo}%</p><p className="text-xs text-muted-foreground mt-1">Só Cabelo</p></div>
            <div><p className="text-2xl font-bold">{recorrenciaSoBarba}%</p><p className="text-xs text-muted-foreground mt-1">Só Barba</p></div>
            <div><p className="text-2xl font-bold">{recorrenciaCabeloBarba}%</p><p className="text-xs text-muted-foreground mt-1">Cabelo + Barba</p></div>
            <div><p className="text-2xl font-bold text-primary">{recorrenciaTotal}%</p><p className="text-xs text-muted-foreground mt-1">Total</p></div>
          </div>

          <p className="text-sm font-semibold text-foreground/80 mb-3">Conversão e oportunidade</p>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-3xl font-bold text-primary">{conversaoCategoriaAlvo}%</span>
            <span className="text-sm text-muted-foreground">converteram para Cabelo + Barba</span>
          </div>
          <div className="grid grid-cols-3 gap-5 text-center">
            <div><p className="text-2xl font-bold">{clientesSoCabeloForaAlvo}</p><p className="text-xs text-muted-foreground mt-1">Fora do alvo — Só Cabelo</p></div>
            <div><p className="text-2xl font-bold">{clientesSoBarbaForaAlvo}</p><p className="text-xs text-muted-foreground mt-1">Fora do alvo — Só Barba</p></div>
            <div><p className="text-2xl font-bold">{potencialConversao}%</p><p className="text-xs text-muted-foreground mt-1">Potencial de conversão</p></div>
          </div>
        </CardContent>
      </Card>
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/painel/page.tsx
git commit -m "feat: show recorrência e conversão por categoria on painel"
```

---

### Task 3: Regressão final

**Files:** none (verification only).

- [ ] **Step 1: Full automated regression**

Run:
```bash
npm test
npm run build
npx supabase test db
```
Expected: `npm test` shows all existing unit tests still passing (this plan adds no new pure-function logic — the calculation lives entirely in SQL, covered by pgTAP instead); `npm run build` succeeds with no type errors; `npx supabase test db` shows all 16 pgTAP suites passing, including the new `0016_indicadores_recorrencia_conversao.test.sql`.

- [ ] **Step 2: Manual end-to-end walkthrough (if a browser is available)**

As a barbeiro, register 3 lançamentos avulsos for the same cliente (same telefone each time so it resolves to the same cliente): 1st with only a serviço tagged `cabelo`, 2nd with only a serviço tagged `cabelo` again, 3rd with both a `cabelo` and a `barba` serviço in the same atendimento. Open `/painel` and confirm the new "Recorrência e Conversão (histórico completo)" card shows: Recorrência Só Cabelo reflecting this client's repeat (100% if they're the only só-cabelo client so far), Conversão para categoria-alvo reflecting the 3rd visit's conversion, and that this client no longer appears under "Fora do alvo" (their most recent visit is already Cabelo+Barba).

If no browser is available, document that limitation in the ledger instead of skipping the check silently — same pattern used in every prior plan this session.

- [ ] **Step 3: No commit for this task** — it's verification-only; if any issue surfaces, fix it as a small follow-up commit referencing which task's step regressed.
