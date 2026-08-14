# Sonho pessoal do barbeiro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a barbeiro set a personal savings goal (car, motorcycle, etc.) on their own `/painel`, reserving a % of their own comissão, and track progress since the goal was created — separate from the admin-set business metas.

**Architecture:** A new table, `sonhos_pessoais`, RLS-scoped so a barbeiro fully manages their own rows (mirrors `bloqueios_agenda`'s policy shape) and the admin can only read. `/painel` fetches the barbeiro's current active sonho (if any), sums their comissão since that sonho's `criado_em`, and passes the computed progress to a new client component that renders either the create-form or the progress readout + Conquistei!/Cancelar actions, plus a history list.

**Tech Stack:** Next.js 16.3 App Router, TypeScript, Supabase (Postgres/RLS), Tailwind CSS v4, shadcn/ui.

## Global Constraints

- `sonhos_pessoais.status` is always one of the literal strings `'ativo'`, `'conquistado'`, `'cancelado'` — never free text.
- Exactly the same progress phrasing already established elsewhere: `"R$ {guardado} de R$ {valor_alvo} — faltam R$ {restante}"`, or a "conquered" message once `guardado >= valor_alvo`.
- A progress bar's fill width is always `Math.min((guardado / valor_alvo) * 100, 100)` — never allowed to overflow past 100%.
- `guardado` is computed from `atendimentos`/`vendas_produtos` rows with `data >= sonho.criado_em` (date-level granularity, sliced from the timestamp) — never month-scoped like the other metas.
- Migration file goes in `supabase/migrations/`, numbered the next integer after whatever is the highest-numbered file present when Task 1 starts (check `ls supabase/migrations` first — do not hardcode a number here).

---

### Task 1: Migration — `sonhos_pessoais`

**Files:**
- Create: `supabase/migrations/00NN_sonhos_pessoais.sql` (NN = next available number)

**Interfaces:**
- Produces: table `sonhos_pessoais(id, membro_id, barbearia_id, nome, valor_alvo, percentual, status, criado_em, concluido_em)`, consumed by Task 2 (component) and Task 3 (page wiring).

- [ ] **Step 1: Check the next migration number and write the migration**

Run: `ls supabase/migrations | sort | tail -3` and use the next integer (zero-padded to 4 digits).

```sql
create table sonhos_pessoais (
  id uuid primary key default gen_random_uuid(),
  membro_id uuid not null references membros(id) on delete cascade,
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  nome text not null,
  valor_alvo numeric(10,2) not null check (valor_alvo > 0),
  percentual numeric(5,2) not null check (percentual > 0 and percentual <= 100),
  status text not null default 'ativo' check (status in ('ativo', 'conquistado', 'cancelado')),
  criado_em timestamptz not null default now(),
  concluido_em timestamptz
);

alter table sonhos_pessoais enable row level security;

create policy "barbeiro gerencia proprios sonhos" on sonhos_pessoais for all
  using (membro_id = auth_membro_id())
  with check (membro_id = auth_membro_id());

create policy "admin le sonhos da barbearia" on sonhos_pessoais for select
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase migration up`
Expected: succeeds, no errors. Do **not** run `supabase db reset` — this local database has real data from manual testing throughout this project. `migration up` applies only the new pending migration without touching existing rows. If it fails, report BLOCKED rather than falling back to `db reset`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/*_sonhos_pessoais.sql
git commit -m "feat: add sonhos_pessoais table"
```

---

### Task 2: `SonhoPessoalCard` component

**Files:**
- Create: `src/components/sonho-pessoal-card.tsx`

**Interfaces:**
- Consumes: `getBrowserSupabaseClient` from `@/lib/supabase/client`, `Card`/`CardContent` from `@/components/ui/card`, `Input`/`Button` from `@/components/ui/*` — all existing, unchanged.
- Produces: `SonhoPessoalCard({ membroId, barbeariaId, sonhoAtivo, guardado, historico })` — Task 3's `painel/page.tsx` fetches `sonhoAtivo`/`guardado`/`historico` server-side and renders one of these.

- [ ] **Step 1: Write the component**

Create `src/components/sonho-pessoal-card.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type Sonho = {
  id: string
  nome: string
  valor_alvo: number
  percentual: number
  status: string
  criado_em: string
  concluido_em: string | null
}

export function SonhoPessoalCard({
  membroId,
  barbeariaId,
  sonhoAtivo,
  guardado,
  historico,
}: {
  membroId: string
  barbeariaId: string
  sonhoAtivo: Sonho | null
  guardado: number
  historico: Sonho[]
}) {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [valorAlvo, setValorAlvo] = useState('')
  const [percentual, setPercentual] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function criarSonho() {
    if (!nome || !valorAlvo || !percentual) return
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('sonhos_pessoais').insert({
      membro_id: membroId,
      barbearia_id: barbeariaId,
      nome,
      valor_alvo: Number(valorAlvo),
      percentual: Number(percentual),
    })
    setSalvando(false)
    setNome('')
    setValorAlvo('')
    setPercentual('')
    router.refresh()
  }

  async function concluir(status: 'conquistado' | 'cancelado') {
    const supabase = getBrowserSupabaseClient()
    await supabase
      .from('sonhos_pessoais')
      .update({ status, concluido_em: new Date().toISOString() })
      .eq('id', sonhoAtivo!.id)
    router.refresh()
  }

  const percentualProgresso = sonhoAtivo ? Math.min((guardado / sonhoAtivo.valor_alvo) * 100, 100) : 0
  const conquistado = sonhoAtivo ? guardado >= sonhoAtivo.valor_alvo : false

  return (
    <Card className="mb-5">
      <CardContent className="p-6">
        <p className="font-heading text-base font-bold mb-5">Sonho pessoal</p>

        {!sonhoAtivo && (
          <div className="flex gap-2 items-end flex-wrap">
            <Input placeholder="Nome (ex: Moto)" value={nome} onChange={(e) => setNome(e.target.value)} className="w-40" />
            <Input type="number" step="0.01" placeholder="Valor alvo (R$)" value={valorAlvo} onChange={(e) => setValorAlvo(e.target.value)} className="w-36" />
            <Input type="number" step="0.01" placeholder="% da comissão" value={percentual} onChange={(e) => setPercentual(e.target.value)} className="w-32" />
            <Button type="button" onClick={criarSonho} disabled={salvando}>Começar a guardar</Button>
          </div>
        )}

        {sonhoAtivo && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-foreground/80">{sonhoAtivo.nome}</span>
              <span className="text-xs text-muted-foreground">{sonhoAtivo.percentual}% da comissão</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden mb-2">
              <div className="h-full rounded-full bg-primary" style={{ width: `${percentualProgresso}%` }} />
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {conquistado
                ? 'Sonho conquistado! 🎉'
                : `R$ ${guardado.toFixed(2)} de R$ ${sonhoAtivo.valor_alvo.toFixed(2)} — faltam R$ ${(sonhoAtivo.valor_alvo - guardado).toFixed(2)}`}
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => concluir('conquistado')} className="text-xs text-primary underline">Conquistei!</button>
              <button type="button" onClick={() => concluir('cancelado')} className="text-xs text-destructive underline">Cancelar</button>
            </div>
          </div>
        )}

        {historico.length > 0 && (
          <div className="mt-6 pt-4 border-t">
            <p className="text-xs uppercase text-muted-foreground mb-2">Histórico</p>
            <div className="flex flex-col gap-1 text-sm">
              {historico.map((s) => (
                <div key={s.id} className="flex justify-between text-muted-foreground">
                  <span>{s.nome} — R$ {s.valor_alvo.toFixed(2)}</span>
                  <span>{s.status === 'conquistado' ? 'Conquistado' : 'Cancelado'} em {s.concluido_em ? new Date(s.concluido_em).toLocaleDateString() : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds. `SonhoPessoalCard` is exported but not yet imported anywhere — fine, an unused export never fails a Next.js build.

- [ ] **Step 3: Commit**

```bash
git add src/components/sonho-pessoal-card.tsx
git commit -m "feat: add SonhoPessoalCard component"
```

---

### Task 3: Wire `SonhoPessoalCard` into `/painel`

**Files:**
- Modify: `src/app/painel/page.tsx`

**Interfaces:**
- Consumes: `SonhoPessoalCard` from `@/components/sonho-pessoal-card` (Task 2), table `sonhos_pessoais` (Task 1).

- [ ] **Step 1: Add the import**

In `src/app/painel/page.tsx`, add this import alongside the existing ones:

```ts
import { SonhoPessoalCard } from '@/components/sonho-pessoal-card'
```

- [ ] **Step 2: Fetch `barbearia_id` on the `membro` query**

Change:

```ts
  const { data: membro } = await supabase.from('membros').select('id, nome, meta_faturamento_mes').eq('user_id', user!.id).single()
```

to:

```ts
  const { data: membro } = await supabase.from('membros').select('id, nome, barbearia_id, meta_faturamento_mes').eq('user_id', user!.id).single()
```

- [ ] **Step 3: Fetch sonho ativo, its guardado, and histórico**

Add this block right after the `agendamentosMes`/prospecção fetches (anywhere before the `return` statement — e.g. right before the `totalGanhos`/`percentualCortes` calculations is a natural spot):

```ts
  const { data: sonhoAtivo } = await supabase
    .from('sonhos_pessoais')
    .select('*')
    .eq('membro_id', membro!.id)
    .eq('status', 'ativo')
    .maybeSingle()

  const { data: historicoSonhos } = await supabase
    .from('sonhos_pessoais')
    .select('*')
    .eq('membro_id', membro!.id)
    .neq('status', 'ativo')
    .order('concluido_em', { ascending: false })

  let guardado = 0
  if (sonhoAtivo) {
    const desde = sonhoAtivo.criado_em.slice(0, 10)
    const { data: atendimentosSonho } = await supabase
      .from('atendimentos').select('comissao_valor')
      .eq('membro_id', membro!.id).gte('data', desde)
    const { data: vendasSonho } = await supabase
      .from('vendas_produtos').select('comissao_valor')
      .eq('membro_id', membro!.id).gte('data', desde)
    const comissaoDesdeSonho =
      (atendimentosSonho ?? []).reduce((s, a) => s + Number(a.comissao_valor ?? 0), 0) +
      (vendasSonho ?? []).reduce((s, v) => s + Number(v.comissao_valor ?? 0), 0)
    guardado = (sonhoAtivo.percentual / 100) * comissaoDesdeSonho
  }
```

- [ ] **Step 4: Render the card**

Add `<SonhoPessoalCard ... />` as the last card in the returned JSX, right after the closing `</Card>` of the "Prospecção (mês)" section and before the final `</div>`:

```tsx
      <SonhoPessoalCard
        membroId={membro!.id}
        barbeariaId={membro!.barbearia_id}
        sonhoAtivo={sonhoAtivo}
        guardado={guardado}
        historico={historicoSonhos ?? []}
      />
```

- [ ] **Step 5: Type-check**

Run: `npm run build`
Expected: succeeds. Requires Task 1's migration already applied (`sonhos_pessoais` must exist) — if the build fails on that table not being recognized, confirm Task 1 finished first.

- [ ] **Step 6: Manual verification**

No browser tools available in this environment (Playwright/Chrome MCP tools may be flaky or disconnected — do not spend time retrying them). Verify via code trace against this task's steps. If a browser is available: as a barbeiro with no sonho, open `/painel`, confirm the create-form appears at the bottom; create one, confirm it switches to the progress view; complete an atendimento and confirm `guardado` increases by `percentual%` of that atendimento's `comissao_valor`; click "Conquistei!" or "Cancelar", confirm it moves to Histórico and the create-form reappears.

- [ ] **Step 7: Commit**

```bash
git add src/app/painel/page.tsx
git commit -m "feat: wire SonhoPessoalCard into painel"
```

---

### Task 4: Regressão final

**Files:** none (verification only).

- [ ] **Step 1: Full automated regression**

Run:
```bash
npm test
npm run build
```
Expected: `npm test` shows all existing unit tests still passing (this plan adds no new ones — it's a straightforward sum-and-percentage, no new pure function comparable to `calcularOciosidade`); `npm run build` succeeds with no type errors.

- [ ] **Step 2: Manual end-to-end walkthrough (if a browser is available)**

As a barbeiro: create a sonho (e.g. "Moto", R$ 5000, 10%). Complete an atendimento worth R$ 100 with comissão R$ 20 — confirm `/painel`'s Sonho pessoal card shows `guardado` increase by R$ 2.00 (10% of R$ 20). Complete enough atendimentos to reach the valor_alvo and confirm the "Sonho conquistado!" message appears. Click "Conquistei!" and confirm it appears in Histórico with today's date, and the create-form is available again for a new sonho.

If no browser is available, document that limitation in the ledger instead of skipping the check silently — same pattern used in every prior plan this session.

- [ ] **Step 3: No commit for this task** — it's verification-only; if any issue surfaces, fix it as a small follow-up commit referencing which task's step regressed.
