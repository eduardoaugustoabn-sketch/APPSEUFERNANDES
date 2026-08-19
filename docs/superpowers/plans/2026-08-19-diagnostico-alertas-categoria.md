# Diagnóstico e Alertas por Categoria Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fase 3a de "Categorias de Atendimento e Indicadores de Performance" — interpretar (sem adicionar indicadores numéricos novos) os indicadores já existentes de ocupação, público-alvo e ticket médio, e mostrar um único diagnóstico em texto no topo do `/painel` do barbeiro, respondendo "o barbeiro está ocupado, mas atendendo o cliente certo?".

**Architecture:** Uma função SQL nova, `media_ticket_barbearia()`, `language sql stable security definer` (precisa bypassar RLS pra agregar faturamento/visitas de TODOS os barbeiros da barbearia, não só do chamador), sem parâmetros — resolve a barbearia do chamador internamente via `auth_barbearia_id()`, mesmo padrão dos outros helpers de auth. Uma função pura nova, `calcularDiagnostico`, em `src/lib/diagnostico.ts`, que recebe os indicadores já computados no painel (ocupação, público-alvo, ticket do barbeiro, ticket médio da barbearia, percentuais só-cabelo/só-barba) e decide qual das 5 mensagens mostrar, checando 4 condições em ordem fixa (a primeira que bater vence) com fallback neutro. `/painel` chama a nova RPC, computa o ticket médio do barbeiro a partir de valores que já existem na página, chama `calcularDiagnostico`, e renderiza um novo Card no topo.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres/RLS, pgTAP via `npx supabase test db`), Tailwind CSS v4, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-diagnostico-alertas-categoria-design.md`

## Global Constraints

- **Um diagnóstico único por prioridade**, não uma lista de alertas empilhados — as 4 condições de alerta/positivo são checadas em ordem fixa, a primeira que bater é a única mostrada; nenhuma bateu → `neutro`.
- **Limites fixos no código** (`80`, `40`, `60`, `50`), sem tela de configuração — não existe (nem foi pedido) um jeito de ajustar por barbearia.
- **"Ticket baixo" é relativo à própria barbearia** (compara com `media_ticket_barbearia()`, ticket médio de todos os barbeiros no mês corrente) — não é um valor absoluto nem uma meta cadastrada.
- Nenhuma tabela, coluna ou policy de RLS nova — só a função `media_ticket_barbearia()` e a função pura `calcularDiagnostico`.
- Não usar `supabase db reset` para aplicar a migração — usar `npx supabase migration up`.

---

### Task 1: Migração — função `media_ticket_barbearia`

**Files:**
- Create: `supabase/migrations/0031_media_ticket_barbearia.sql`
- Create: `supabase/tests/database/0017_media_ticket_barbearia.test.sql`

**Interfaces:**
- Produces: `media_ticket_barbearia() returns numeric` (sem parâmetros, resolve a barbearia do chamador via `auth_barbearia_id()`). Task 3's `painel/page.tsx` chama essa função exatamente assim, sem argumentos.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0031_media_ticket_barbearia.sql`:

```sql
-- security definer é necessário aqui: um barbeiro comum não pode ler
-- atendimentos/vendas_produtos de outros barbeiros por RLS ("barbeiro le
-- proprios atendimentos" é escopada a membro_id = auth_membro_id()), então
-- agregar faturamento/visitas de TODA a barbearia exige bypassar essa RLS.
-- A função só devolve um número agregado — não expõe nenhum dado individual
-- de outro barbeiro ou cliente.
create or replace function public.media_ticket_barbearia()
returns numeric
language sql stable security definer set search_path = public as $$
  with faturamento as (
    select
      coalesce((select sum(a.preco) from atendimentos a
        where a.barbearia_id = auth_barbearia_id() and a.data >= date_trunc('month', current_date)::date), 0)
      + coalesce((select sum(vp.preco_unitario * vp.quantidade) from vendas_produtos vp
        where vp.barbearia_id = auth_barbearia_id() and vp.data >= date_trunc('month', current_date)::date), 0)
      as total
  ),
  realizados as (
    select count(*) as total
    from agendamentos ag
    where ag.barbearia_id = auth_barbearia_id()
      and ag.status = 'realizado'
      and ag.data >= date_trunc('month', current_date)::date
  )
  select round(f.total / nullif(r.total, 0), 2)
  from faturamento f, realizados r;
$$;

grant execute on function public.media_ticket_barbearia() to authenticated;
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase migration up`
Expected: succeeds, no errors. Do **not** run `supabase db reset` — this local database has real data from manual testing throughout this project; `db reset` would wipe all of it. `migration up` applies only the new pending migration without touching existing rows. If it fails, report BLOCKED rather than falling back to `db reset`.

- [ ] **Step 3: Write the pgTAP test**

Create `supabase/tests/database/0017_media_ticket_barbearia.test.sql`. Uses `date_trunc('month', current_date)::date` (aliased below as dates relative to "this month") instead of literal dates, because — unlike every prior pgTAP test in this project — `media_ticket_barbearia()` takes no date-range parameter and hard-codes "current month" internally, so fixture dates must always fall in the real current month regardless of when the suite runs:

```sql
begin;
select plan(3);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a'),
  ('22222222-2222-2222-2222-222222222222', 'Barbearia B', 'barbearia-b');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'pedro@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'rui@example.com');

insert into membros (id, barbearia_id, user_id, papel, nome) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João'),
  ('a1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'barbeiro', 'Pedro'),
  -- Rui is alone in Barbearia B, with zero visitas realizado this month — proves the null-when-no-visits case.
  ('a1000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000003', 'barbeiro', 'Rui');

insert into servicos (id, barbearia_id, nome, duracao_minutos, preco, categoria_servico) values
  ('b1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Corte', 30, 30, 'cabelo'),
  ('b1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Barba', 20, 20, 'barba');

insert into produtos (id, barbearia_id, nome, preco_custo, preco_venda, quantidade_estoque) values
  ('f1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Pomada', 5, 15, 100);

insert into clientes (id, barbearia_id, nome, telefone) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Ana', '11900000001'),
  ('c1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Bruno', '11900000002');

-- e1 (João/Ana/Corte, realizado, this month) and e2 (Pedro/Bruno/Barba,
-- realizado, this month) both count toward "realizados". e3 (confirmado, not
-- realizado, this month) must NOT count, proving the status filter works.
insert into agendamentos (id, barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem) values
  ('e1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', date_trunc('month', current_date)::date, '09:00', '09:30', 'realizado', 'interno'),
  ('e1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', date_trunc('month', current_date)::date + 1, '10:00', '10:20', 'realizado', 'interno'),
  ('e1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', date_trunc('month', current_date)::date + 2, '11:00', '11:30', 'confirmado', 'interno');

-- at1 (linked to e1, this month, preço vira 30 via trigger de comissão) and
-- vp1 (this month, preço unitário vira 15 via trigger de venda) count toward
-- faturamento. at2 and vp2 are dated last month — must NOT count, proving
-- the date filter works independently of the agendamentos.status filter.
insert into atendimentos (barbearia_id, membro_id, cliente_id, servico_id, preco, agendamento_id, data) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 0, 'e1000000-0000-0000-0000-000000000001', date_trunc('month', current_date)::date),
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 0, 'e1000000-0000-0000-0000-000000000002', date_trunc('month', current_date)::date + 1),
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 0, null, date_trunc('month', current_date)::date - 1);

insert into vendas_produtos (barbearia_id, membro_id, cliente_id, produto_id, quantidade, preco_unitario, data) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 2, 0, date_trunc('month', current_date)::date),
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001', 1, 0, date_trunc('month', current_date)::date - 1);

-- Faturamento deste mês, contando só o que deveria contar: at1 (30, Corte) +
-- e2's atendimento (20, Barba) + vp1 (2 * 15 = 30) = 80. Realizados = 2
-- (e1 + e2; e3 é 'confirmado', não conta). Ticket médio = 80 / 2 = 40.

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

select is(
  (select media_ticket_barbearia()),
  40.00,
  'João: ticket médio da barbearia é 40 (agrega faturamento e visitas de TODOS os barbeiros, não só do chamador)'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);

select is(
  (select media_ticket_barbearia()),
  40.00,
  'Pedro: mesmo valor 40 que João viu — o número é da barbearia inteira, não escopado por quem chama'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);

select is(
  (select media_ticket_barbearia()),
  null,
  'Rui (Barbearia B, zero visitas realizado neste mês): retorna null em vez de erro de divisão por zero'
);

reset role;

select * from finish();
rollback;
```

- [ ] **Step 4: Run the pgTAP suite**

Run: `npx supabase test db`
Expected: all files pass, including the new `0017_media_ticket_barbearia.test.sql` (3/3 assertions), with no regressions in the other 17 files.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0031_media_ticket_barbearia.sql supabase/tests/database/0017_media_ticket_barbearia.test.sql
git commit -m "feat: add media_ticket_barbearia RPC scoped by barbearia"
```

---

### Task 2: Lógica do diagnóstico — `calcularDiagnostico`

**Files:**
- Create: `src/lib/diagnostico.ts`
- Test: `tests/unit/diagnostico.test.ts`

**Interfaces:**
- Produces: `calcularDiagnostico(input: { percentualOcupacao: number; indicePublicoAlvo: number; ticketMedio: number; mediaTicketBarbearia: number | null; percentualSoCabelo: number; percentualSoBarba: number }): { tipo: TipoDiagnostico; mensagem: string }`, and the exported type `TipoDiagnostico = 'ocupacao_alta_alvo_baixo' | 'ticket_baixo_so_cabelo' | 'ticket_baixo_so_barba' | 'positivo' | 'neutro'`. Task 3's `painel/page.tsx` imports and calls this exact function with this exact input shape.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/diagnostico.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { calcularDiagnostico } from '@/lib/diagnostico'

describe('calcularDiagnostico', () => {
  it('flags ocupacao_alta_alvo_baixo when occupancy is high but público-alvo is low', () => {
    const result = calcularDiagnostico({
      percentualOcupacao: 85,
      indicePublicoAlvo: 30,
      ticketMedio: 100,
      mediaTicketBarbearia: 150,
      percentualSoCabelo: 10,
      percentualSoBarba: 10,
    })
    expect(result).toEqual({
      tipo: 'ocupacao_alta_alvo_baixo',
      mensagem: 'Sua agenda apresenta alta ocupação, porém a participação de clientes Cabelo + Barba está abaixo do esperado. Avalie estratégias para converter clientes de Só Cabelo e Só Barba para o serviço completo.',
    })
  })

  it('flags ticket_baixo_so_cabelo when ticket is below the barbearia average and só-cabelo dominates', () => {
    const result = calcularDiagnostico({
      percentualOcupacao: 50,
      indicePublicoAlvo: 50,
      ticketMedio: 80,
      mediaTicketBarbearia: 100,
      percentualSoCabelo: 60,
      percentualSoBarba: 10,
    })
    expect(result).toEqual({
      tipo: 'ticket_baixo_so_cabelo',
      mensagem: 'Seu ticket médio está abaixo da média da barbearia. Uma das oportunidades identificadas é aumentar a conversão de clientes Só Cabelo para Cabelo + Barba.',
    })
  })

  it('flags ticket_baixo_so_barba when ticket is below the barbearia average and só-barba dominates', () => {
    const result = calcularDiagnostico({
      percentualOcupacao: 50,
      indicePublicoAlvo: 50,
      ticketMedio: 80,
      mediaTicketBarbearia: 100,
      percentualSoCabelo: 10,
      percentualSoBarba: 60,
    })
    expect(result).toEqual({
      tipo: 'ticket_baixo_so_barba',
      mensagem: 'Seu ticket médio está abaixo da média da barbearia e existe alta concentração de clientes que realizam apenas barba. Trabalhe oportunidades de conversão para Cabelo + Barba.',
    })
  })

  it('flags positivo when occupancy is high and público-alvo is high', () => {
    const result = calcularDiagnostico({
      percentualOcupacao: 90,
      indicePublicoAlvo: 70,
      ticketMedio: 200,
      mediaTicketBarbearia: 100,
      percentualSoCabelo: 0,
      percentualSoBarba: 0,
    })
    expect(result).toEqual({
      tipo: 'positivo',
      mensagem: 'Excelente desempenho. Sua ocupação está acompanhada de uma boa concentração no público-alvo e isso está contribuindo para seu ticket e faturamento.',
    })
  })

  it('falls back to neutro when no condition matches', () => {
    const result = calcularDiagnostico({
      percentualOcupacao: 50,
      indicePublicoAlvo: 50,
      ticketMedio: 100,
      mediaTicketBarbearia: 100,
      percentualSoCabelo: 0,
      percentualSoBarba: 0,
    })
    expect(result).toEqual({
      tipo: 'neutro',
      mensagem: 'Nenhum ponto de atenção identificado no momento. Continue acompanhando seus indicadores ao longo do mês.',
    })
  })

  it('prioritizes ocupacao_alta_alvo_baixo over ticket_baixo_so_cabelo when both would match', () => {
    const result = calcularDiagnostico({
      percentualOcupacao: 85,
      indicePublicoAlvo: 30,
      ticketMedio: 50,
      mediaTicketBarbearia: 100,
      percentualSoCabelo: 80,
      percentualSoBarba: 0,
    })
    expect(result.tipo).toBe('ocupacao_alta_alvo_baixo')
  })

  it('never triggers ticket-baixo conditions when mediaTicketBarbearia is null, even with high percentuais', () => {
    const result = calcularDiagnostico({
      percentualOcupacao: 50,
      indicePublicoAlvo: 50,
      ticketMedio: 10,
      mediaTicketBarbearia: null,
      percentualSoCabelo: 90,
      percentualSoBarba: 90,
    })
    expect(result.tipo).toBe('neutro')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- diagnostico`
Expected: FAIL with "Cannot find module '@/lib/diagnostico'" (or similar — the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/diagnostico.ts`:

```ts
export type TipoDiagnostico = 'ocupacao_alta_alvo_baixo' | 'ticket_baixo_so_cabelo' | 'ticket_baixo_so_barba' | 'positivo' | 'neutro'

export type Diagnostico = {
  tipo: TipoDiagnostico
  mensagem: string
}

const MENSAGENS: Record<TipoDiagnostico, string> = {
  ocupacao_alta_alvo_baixo: 'Sua agenda apresenta alta ocupação, porém a participação de clientes Cabelo + Barba está abaixo do esperado. Avalie estratégias para converter clientes de Só Cabelo e Só Barba para o serviço completo.',
  ticket_baixo_so_cabelo: 'Seu ticket médio está abaixo da média da barbearia. Uma das oportunidades identificadas é aumentar a conversão de clientes Só Cabelo para Cabelo + Barba.',
  ticket_baixo_so_barba: 'Seu ticket médio está abaixo da média da barbearia e existe alta concentração de clientes que realizam apenas barba. Trabalhe oportunidades de conversão para Cabelo + Barba.',
  positivo: 'Excelente desempenho. Sua ocupação está acompanhada de uma boa concentração no público-alvo e isso está contribuindo para seu ticket e faturamento.',
  neutro: 'Nenhum ponto de atenção identificado no momento. Continue acompanhando seus indicadores ao longo do mês.',
}

export function calcularDiagnostico(input: {
  percentualOcupacao: number
  indicePublicoAlvo: number
  ticketMedio: number
  mediaTicketBarbearia: number | null
  percentualSoCabelo: number
  percentualSoBarba: number
}): Diagnostico {
  const { percentualOcupacao, indicePublicoAlvo, ticketMedio, mediaTicketBarbearia, percentualSoCabelo, percentualSoBarba } = input
  const ticketAbaixoDaMedia = mediaTicketBarbearia !== null && ticketMedio < mediaTicketBarbearia

  let tipo: TipoDiagnostico
  if (percentualOcupacao >= 80 && indicePublicoAlvo < 40) {
    tipo = 'ocupacao_alta_alvo_baixo'
  } else if (ticketAbaixoDaMedia && percentualSoCabelo >= 50) {
    tipo = 'ticket_baixo_so_cabelo'
  } else if (ticketAbaixoDaMedia && percentualSoBarba >= 50) {
    tipo = 'ticket_baixo_so_barba'
  } else if (percentualOcupacao >= 80 && indicePublicoAlvo >= 60) {
    tipo = 'positivo'
  } else {
    tipo = 'neutro'
  }

  return { tipo, mensagem: MENSAGENS[tipo] }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- diagnostico`
Expected: PASS, all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/diagnostico.ts tests/unit/diagnostico.test.ts
git commit -m "feat: add calcularDiagnostico pure function"
```

---

### Task 3: `/painel` — Card de Diagnóstico

**Files:**
- Modify: `src/app/painel/page.tsx`

**Interfaces:**
- Consumes: `media_ticket_barbearia()` from Task 1; `calcularDiagnostico` from Task 2.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Import `calcularDiagnostico`**

Add to the imports at the top of `src/app/painel/page.tsx`, right after the existing `calcularDistribuicaoCategorias` import (line 4) and before the `Card`/`CardContent` import:

```ts
import { calcularDiagnostico } from '@/lib/diagnostico'
```

- [ ] **Step 2: Compute ticket médio, fetch média da barbearia, and compute the diagnóstico**

Right after the existing `percentualCabeloEBarba` line (the block computing `percentualSoCabelo`/`percentualSoBarba`/`percentualCabeloEBarba`, which stays unchanged), add:

```tsx
  const ticketMedio = realizados > 0 ? totalGanhos / realizados : 0

  // Sem returns table(...), então data já vem como o escalar direto (string
  // | null — numeric chega como string via PostgREST), sem precisar de .single().
  const { data: mediaTicketBarbeariaRaw } = await supabase.rpc('media_ticket_barbearia') as { data: string | null }
  const mediaTicketBarbearia = mediaTicketBarbeariaRaw !== null ? Number(mediaTicketBarbeariaRaw) : null

  const diagnostico = calcularDiagnostico({
    percentualOcupacao: ociosidade.percentualOcupacao,
    indicePublicoAlvo: distribuicaoCategorias.indicePublicoAlvo,
    ticketMedio,
    mediaTicketBarbearia,
    percentualSoCabelo,
    percentualSoBarba,
  })
```

- [ ] **Step 3: Render the Card**

In the JSX, insert a new Card right after the `<h1>` (currently ending the line `<h1 className="font-heading text-2xl font-bold mb-4">Olá, {membro!.nome}</h1>`) and before the `<div className="flex gap-4 flex-wrap mb-6">` row that starts with the "Faturamento do mês" card:

```tsx
      <Card className={`mb-5 border-2 ${
        diagnostico.tipo === 'positivo' ? 'border-emerald-500/40 bg-emerald-500/5' :
        diagnostico.tipo === 'neutro' ? '' :
        'border-amber-500/40 bg-amber-500/5'
      }`}>
        <CardContent className="p-6">
          <p className="font-heading text-base font-bold mb-2">Diagnóstico</p>
          <p className="text-sm text-foreground/90">{diagnostico.mensagem}</p>
        </CardContent>
      </Card>
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/painel/page.tsx
git commit -m "feat: show diagnóstico e alertas por categoria on painel"
```

---

### Task 4: Regressão final

**Files:** none (verification only).

- [ ] **Step 1: Full automated regression**

Run:
```bash
npm test
npm run build
npx supabase test db
```
Expected: `npm test` shows all existing unit tests passing plus the 7 new `calcularDiagnostico` tests; `npm run build` succeeds with no type errors; `npx supabase test db` shows all 18 pgTAP suites passing, including the new `0017_media_ticket_barbearia.test.sql`.

- [ ] **Step 2: Manual end-to-end walkthrough (if a browser is available)**

As a barbeiro with high occupancy this month and few cabelo+barba atendimentos (público-alvo below 40%), open `/painel` and confirm the new "Diagnóstico" card shows the `ocupacao_alta_alvo_baixo` message with an amber border. Register enough cabelo+barba atendimentos to push the Índice de Público-Alvo above 60% while keeping occupancy high, reload `/painel`, and confirm the card switches to the `positivo` message with an emerald border.

If no browser is available, document that limitation instead of skipping the check silently.

- [ ] **Step 3: No commit for this task** — it's verification-only; if any issue surfaces, fix it as a small follow-up commit referencing which task's step regressed.
