# Filtro de período nos relatórios (Visão geral + Ranking) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin switch `/admin` (Visão geral) and `/admin/ranking` between "este mês", "mês passado", and a custom date range, instead of always showing a hardcoded current-month figure.

**Architecture:** A pure helper (`resolverPeriodo`) turns URL search params into a concrete `{ inicio, fim, label }` date range; both report pages read `searchParams`, call the helper, and use `inicio`/`fim` in their existing Supabase queries (adding the `.lte('data', fim)` upper bound they currently lack). A small Client Component (`PeriodoFiltro`) renders the preset dropdown + custom date inputs and navigates the page's own URL on change — no client-side data fetching, no new Server/Client boundary beyond what already exists elsewhere in the app.

**Tech Stack:** Next.js App Router (Server Components + `searchParams`), TypeScript, Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-08-29-filtro-periodo-relatorios-design.md`

## Global Constraints

- No database migration, no new RPC — `atendimentos`, `vendas_produtos`, `agendamentos`, `prospeccoes` are already filterable by their `data` column.
- Date values crossing the Server/Client boundary are always `YYYY-MM-DD` strings, never `Date` objects.
- Follow the codebase's existing `new Date(...).toISOString().slice(0, 10)` idiom for date math (used identically in `src/app/admin/page.tsx`, `src/app/painel/page.tsx`) — do not introduce a different date-formatting approach.
- The ranking de clientes ativos (verde/amarelo/vermelho) in `/admin/ranking` does NOT get filtered by period — it reflects current client status regardless of the selected range. This is deliberate (see spec), not an oversight.
- `/painel` (barbeiro's own dashboard) is out of scope for this plan.

---

### Task 1: `resolverPeriodo` helper + tests

**Files:**
- Create: `src/lib/periodo.ts`
- Test: `tests/unit/periodo.test.ts`

**Interfaces:**
- Produces: `export type PeriodoPreset = 'este_mes' | 'mes_passado' | 'personalizado'`, `export type Periodo = { preset: PeriodoPreset; inicio: string; fim: string; label: string }`, `export function resolverPeriodo(searchParams: { [key: string]: string | string[] | undefined }): Periodo`. Task 2 and Task 3 both import these three names from `@/lib/periodo`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/periodo.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolverPeriodo } from '@/lib/periodo'

describe('resolverPeriodo', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('defaults to este_mes when periodo is absent', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 15)) // 15 de agosto de 2026
    const resultado = resolverPeriodo({})
    expect(resultado).toEqual({
      preset: 'este_mes',
      inicio: '2026-08-01',
      fim: '2026-08-15',
      label: 'Agosto de 2026',
    })
  })

  it('resolves mes_passado crossing a year boundary (janeiro -> dezembro do ano anterior)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 10)) // 10 de janeiro de 2026
    const resultado = resolverPeriodo({ periodo: 'mes_passado' })
    expect(resultado).toEqual({
      preset: 'mes_passado',
      inicio: '2025-12-01',
      fim: '2025-12-31',
      label: 'Dezembro de 2025',
    })
  })

  it('resolves mes_passado across months with different day counts (março -> fevereiro)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 5)) // 5 de março de 2026 (2026 não é bissexto)
    const resultado = resolverPeriodo({ periodo: 'mes_passado' })
    expect(resultado).toEqual({
      preset: 'mes_passado',
      inicio: '2026-02-01',
      fim: '2026-02-28',
      label: 'Fevereiro de 2026',
    })
  })

  it('accepts a valid personalizado range', () => {
    const resultado = resolverPeriodo({ periodo: 'personalizado', inicio: '2026-05-10', fim: '2026-05-20' })
    expect(resultado).toEqual({
      preset: 'personalizado',
      inicio: '2026-05-10',
      fim: '2026-05-20',
      label: '10/05/2026 a 20/05/2026',
    })
  })

  it('falls back to este_mes when personalizado has inicio after fim', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 15))
    const resultado = resolverPeriodo({ periodo: 'personalizado', inicio: '2026-05-20', fim: '2026-05-10' })
    expect(resultado.preset).toBe('este_mes')
  })

  it('falls back to este_mes when personalizado is missing inicio/fim', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 15))
    const resultado = resolverPeriodo({ periodo: 'personalizado' })
    expect(resultado.preset).toBe('este_mes')
  })

  it('falls back to este_mes for an unknown periodo value', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 15))
    const resultado = resolverPeriodo({ periodo: 'bagunca' })
    expect(resultado.preset).toBe('este_mes')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- periodo`
Expected: FAIL with "Cannot find module '@/lib/periodo'" (or similar resolution error) — the file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/lib/periodo.ts`:

```ts
export type PeriodoPreset = 'este_mes' | 'mes_passado' | 'personalizado'

export type Periodo = {
  preset: PeriodoPreset
  inicio: string
  fim: string
  label: string
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function periodoEsteMes(): Periodo {
  const hoje = new Date()
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10)
  const fim = hoje.toISOString().slice(0, 10)
  const label = capitalizar(hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))
  return { preset: 'este_mes', inicio, fim, label }
}

function periodoMesPassado(): Periodo {
  const hoje = new Date()
  const inicioDate = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
  const fimDate = new Date(hoje.getFullYear(), hoje.getMonth(), 0)
  const inicio = inicioDate.toISOString().slice(0, 10)
  const fim = fimDate.toISOString().slice(0, 10)
  const label = capitalizar(inicioDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))
  return { preset: 'mes_passado', inicio, fim, label }
}

function paraBr(dataIso: string): string {
  return dataIso.split('-').reverse().join('/')
}

export function resolverPeriodo(searchParams: { [key: string]: string | string[] | undefined }): Periodo {
  const presetRaw = searchParams.periodo
  const preset = typeof presetRaw === 'string' ? presetRaw : undefined

  if (preset === 'mes_passado') return periodoMesPassado()

  if (preset === 'personalizado') {
    const inicioRaw = searchParams.inicio
    const fimRaw = searchParams.fim
    const inicio = typeof inicioRaw === 'string' ? inicioRaw : undefined
    const fim = typeof fimRaw === 'string' ? fimRaw : undefined
    if (inicio && fim && inicio <= fim) {
      return { preset: 'personalizado', inicio, fim, label: `${paraBr(inicio)} a ${paraBr(fim)}` }
    }
  }

  return periodoEsteMes()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- periodo`
Expected: PASS, all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/periodo.ts tests/unit/periodo.test.ts
git commit -m "feat: add resolverPeriodo helper for report date-range filtering"
```

---

### Task 2: `PeriodoFiltro` component

**Files:**
- Create: `src/components/periodo-filtro.tsx`

**Interfaces:**
- Consumes: `PeriodoPreset` type from `@/lib/periodo` (Task 1).
- Produces: `export function PeriodoFiltro({ preset, inicio, fim }: { preset: PeriodoPreset; inicio: string; fim: string }): JSX.Element`. Task 3 imports this and renders `<PeriodoFiltro preset={preset} inicio={inicio} fim={fim} />` on both report pages.

- [ ] **Step 1: Write the component**

Create `src/components/periodo-filtro.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { PeriodoPreset } from '@/lib/periodo'

export function PeriodoFiltro({ preset, inicio, fim }: { preset: PeriodoPreset; inicio: string; fim: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [presetSelecionado, setPresetSelecionado] = useState<PeriodoPreset>(preset)
  const [inicioCustom, setInicioCustom] = useState(inicio)
  const [fimCustom, setFimCustom] = useState(fim)

  // Mantém o filtro em sincronia se a URL mudar por fora (voltar/avançar
  // no navegador, link direto com query params diferentes).
  useEffect(() => {
    setPresetSelecionado(preset)
    setInicioCustom(inicio)
    setFimCustom(fim)
  }, [preset, inicio, fim])

  function navegar(novoPreset: PeriodoPreset, novoInicio?: string, novoFim?: string) {
    const params = new URLSearchParams({ periodo: novoPreset })
    if (novoPreset === 'personalizado' && novoInicio && novoFim) {
      params.set('inicio', novoInicio)
      params.set('fim', novoFim)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  function aoMudarPreset(e: React.ChangeEvent<HTMLSelectElement>) {
    const novoPreset = e.target.value as PeriodoPreset
    setPresetSelecionado(novoPreset)
    if (novoPreset !== 'personalizado') navegar(novoPreset)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={presetSelecionado} onChange={aoMudarPreset} aria-label="Período" className="w-40">
        <option value="este_mes">Este mês</option>
        <option value="mes_passado">Mês passado</option>
        <option value="personalizado">Personalizado</option>
      </Select>
      {presetSelecionado === 'personalizado' && (
        <>
          <Input type="date" value={inicioCustom} onChange={(e) => setInicioCustom(e.target.value)} className="w-40" aria-label="Data de início" />
          <span className="text-sm text-muted-foreground">até</span>
          <Input type="date" value={fimCustom} onChange={(e) => setFimCustom(e.target.value)} className="w-40" aria-label="Data de fim" />
          <Button type="button" onClick={() => navegar('personalizado', inicioCustom, fimCustom)} disabled={!inicioCustom || !fimCustom}>
            Aplicar
          </Button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (the two pages that will consume this component aren't wired up yet, so this component alone must compile clean in isolation).

- [ ] **Step 3: Commit**

```bash
git add src/components/periodo-filtro.tsx
git commit -m "feat: add PeriodoFiltro component"
```

---

### Task 3: Wire the filter into Visão geral and Ranking

**Files:**
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/admin/ranking/page.tsx`

**Interfaces:**
- Consumes: `resolverPeriodo`, `Periodo`/`PeriodoPreset` from `@/lib/periodo` (Task 1); `PeriodoFiltro` from `@/components/periodo-filtro` (Task 2).

- [ ] **Step 1: Update `src/app/admin/page.tsx`**

Find:

```ts
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { calcularOciosidade } from '@/lib/ociosidade'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { KpiCard } from '@/components/painel/kpi-card'
```

Replace:

```ts
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { calcularOciosidade } from '@/lib/ociosidade'
import { resolverPeriodo } from '@/lib/periodo'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { KpiCard } from '@/components/painel/kpi-card'
import { PeriodoFiltro } from '@/components/periodo-filtro'
```

Find:

```ts
export default async function AdminOverviewPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const hoje = new Date().toISOString().slice(0, 10)

  const { data: atendimentos } = await supabase.from('atendimentos').select('membro_id, preco, comissao_valor').eq('barbearia_id', membro!.barbearia_id).gte('data', inicioMes)
  const { data: vendas } = await supabase.from('vendas_produtos').select('membro_id, quantidade, preco_unitario, comissao_valor').eq('barbearia_id', membro!.barbearia_id).gte('data', inicioMes)
```

Replace:

```ts
export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const { preset, inicio, fim, label } = resolverPeriodo(await searchParams)

  const { data: atendimentos } = await supabase.from('atendimentos').select('membro_id, preco, comissao_valor').eq('barbearia_id', membro!.barbearia_id).gte('data', inicio).lte('data', fim)
  const { data: vendas } = await supabase.from('vendas_produtos').select('membro_id, quantidade, preco_unitario, comissao_valor').eq('barbearia_id', membro!.barbearia_id).gte('data', inicio).lte('data', fim)
```

Find:

```ts
  const { data: agendamentosMes } = await supabase
    .from('agendamentos')
    .select('status, vezes_remarcado')
    .eq('barbearia_id', membro!.barbearia_id)
    .gte('data', inicioMes)
```

Replace:

```ts
  const { data: agendamentosMes } = await supabase
    .from('agendamentos')
    .select('status, vezes_remarcado')
    .eq('barbearia_id', membro!.barbearia_id)
    .gte('data', inicio)
    .lte('data', fim)
```

Find:

```ts
  const { data: prospeccoesMes } = await supabase
    .from('prospeccoes')
    .select('status, agendamento_id')
    .eq('barbearia_id', membro!.barbearia_id)
    .gte('data', inicioMes)
```

Replace:

```ts
  const { data: prospeccoesMes } = await supabase
    .from('prospeccoes')
    .select('status, agendamento_id')
    .eq('barbearia_id', membro!.barbearia_id)
    .gte('data', inicio)
    .lte('data', fim)
```

Find:

```ts
      const { data: ociosidadeRaw } = await supabase
        .rpc('ociosidade', { p_membro_id: b.id, p_data_inicio: inicioMes, p_data_fim: hoje })
```

Replace:

```ts
      const { data: ociosidadeRaw } = await supabase
        .rpc('ociosidade', { p_membro_id: b.id, p_data_inicio: inicio, p_data_fim: fim })
```

Find:

```tsx
  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Visão geral</h1>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-4 mb-6">
```

Replace:

```tsx
  return (
    <div>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <h1 className="font-heading text-2xl font-bold">Visão geral — {label}</h1>
        <PeriodoFiltro preset={preset} inicio={inicio} fim={fim} />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-4 mb-6">
```

- [ ] **Step 2: Update `src/app/admin/ranking/page.tsx`**

Find:

```ts
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
```

Replace:

```ts
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { resolverPeriodo } from '@/lib/periodo'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { PeriodoFiltro } from '@/components/periodo-filtro'
```

Find:

```ts
export default async function RankingPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
```

Replace:

```ts
export default async function RankingPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const { preset, inicio, fim, label } = resolverPeriodo(await searchParams)
```

Find:

```ts
  const { data: atendimentos } = await supabase
    .from('atendimentos').select('membro_id, servico_id, preco')
    .eq('barbearia_id', membro!.barbearia_id).gte('data', inicioMes)
  const { data: vendas } = await supabase
    .from('vendas_produtos').select('membro_id, produto_id, quantidade, preco_unitario')
    .eq('barbearia_id', membro!.barbearia_id).gte('data', inicioMes)
```

Replace:

```ts
  const { data: atendimentos } = await supabase
    .from('atendimentos').select('membro_id, servico_id, preco')
    .eq('barbearia_id', membro!.barbearia_id).gte('data', inicio).lte('data', fim)
  const { data: vendas } = await supabase
    .from('vendas_produtos').select('membro_id, produto_id, quantidade, preco_unitario')
    .eq('barbearia_id', membro!.barbearia_id).gte('data', inicio).lte('data', fim)
```

Find:

```tsx
  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Ranking (mês)</h1>

      <h2 className="font-heading text-lg font-semibold mb-3">Clientes ativos</h2>
```

Replace:

```tsx
  return (
    <div>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <h1 className="font-heading text-2xl font-bold">Ranking — {label}</h1>
        <PeriodoFiltro preset={preset} inicio={inicio} fim={fim} />
      </div>

      <h2 className="font-heading text-lg font-semibold mb-3">Clientes ativos</h2>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Manual verification in browser**

This step has no automated test — there's no existing component/integration test pattern in this codebase for full pages (only pure-function `tests/unit/*.test.ts`), and adding one would be new scope beyond this plan. Verify manually with the dev server running and Playwright (or any browser):

1. Seed test data with atendimentos in both the current month and the previous month for the same barbearia (if the local dev database doesn't already have both, insert a couple of rows directly via `docker exec ... psql` or the UI).
2. Log in as admin, open `/admin`. Confirm the title shows "Visão geral — <mês atual por extenso>" and the numbers match "este mês" totals.
3. Change the dropdown to "Mês passado". Confirm the URL updates to `?periodo=mes_passado`, the title changes to the previous month's name, and the figures change to reflect only that month's data (not cumulative).
4. Change the dropdown to "Personalizado", pick a date range spanning part of both months, click "Aplicar". Confirm the URL updates with `inicio`/`fim` params and the title shows the `dd/mm/aaaa a dd/mm/aaaa` label.
5. Reload the page directly at a URL with `?periodo=mes_passado` (simulating a bookmark/shared link). Confirm it loads directly into that period without needing to reselect it.
6. Repeat steps 2-5 on `/admin/ranking`, additionally confirming the "Clientes ativos" table does NOT change between "este mês" and "mês passado" (per the deliberate exclusion in the spec).

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/page.tsx src/app/admin/ranking/page.tsx
git commit -m "feat: wire PeriodoFiltro into Visão geral and Ranking"
```
