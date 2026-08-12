# Identidade Visual "Seu Fernandes" v2 (SaaS Clean) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the just-shipped dark/gold/serif "Clássica" theme with a light, single-emerald-accent, sans-serif "SaaS Clean" theme, and turn every dashboard section that's currently plain stacked text into a properly structured `Card`.

**Architecture:** Same retheme mechanism as the previous plan: swapping the CSS custom properties in `globals.css` re-skins almost the entire app for free, since every existing page already uses Tailwind's semantic tokens (`bg-background`, `text-primary`, `border`, `bg-muted`, `text-destructive`, `text-muted-foreground`) rather than hardcoded colors — confirmed via a full `grep` sweep before writing this plan (zero hardcoded literal colors outside `src/components/ui/*`, and those are inert `dark:` variants that never activate since the app has no theme toggle). The heading font is reverted the same way: instead of touching the ~18 files that use the `font-heading` class, the token itself is pointed back at the sans font, exactly undoing what the previous plan's Task 1 did. The only real new work is the barbeiro dashboard's two structured sections (proportional bars, a comissão pill, a 3-stat occupancy row) and a small pure-function addition in `src/lib/ociosidade.ts`.

**Tech Stack:** Next.js 16.3 (TypeScript, App Router, Turbopack), Tailwind CSS v4, shadcn/ui (`Card`), Vitest.

## Global Constraints

- Design source of truth: `docs/superpowers/specs/2026-08-11-visual-saas-clean-design.md`. This spec **supersedes** `2026-08-11-identidade-visual-design.md` — follow the new palette/typography exactly, not the old one.
- This is almost entirely a restyle. The one piece of real logic (`atendimentosPerdidosEstimado` in `src/lib/ociosidade.ts`) is a pure function change covered by unit tests — no schema/RLS/migration work anywhere in this plan.
- `font-heading` class usages are intentionally left in place across the app (18 files) — do not go rename or strip them from JSX. The token `--font-heading` is repointed at the sans font in Task 1, which makes every existing `font-heading` usage render in Geist Sans automatically. Removing the class name from 18 files would be pure churn with zero visual effect.
- Every new color must be one of the tokens defined in Task 1 (`--primary`, `--destructive`, `--muted-foreground`, `--card`, `--border`, their Tailwind opacity variants like `bg-primary/10`) — except the one explicitly named exception in the spec: `bg-indigo-500` (Tailwind's built-in indigo-500, `#6366f1`) for the "Produtos" segment of the Ganhos por categoria bar, so it's visually distinct from the "Cortes e serviços" segment (both would otherwise be the same emerald primary color).
- Verification is `npm run build` + `npm test` (type-check + the new/updated unit tests) plus manual visual verification per task, in the browser if available — a class that reads fine as a diff can still be unreadable once actually rendered, so every task's manual step means actually looking at the page, not just trusting the code.

---

### Task 1: Fundação — paleta clara, remove fonte de marca, favicon

**Files:**
- Modify: `src/app/globals.css` (whole file)
- Modify: `src/app/layout.tsx` (whole file)
- Modify: `src/app/icon.svg` (whole file)

**Interfaces:**
- Produces: the CSS custom properties `--background`, `--foreground`, `--card`, `--primary`, `--primary-foreground`, `--secondary`, `--muted`, `--muted-foreground`, `--accent`, `--destructive`, `--border`, `--input`, `--ring` — all consumed automatically by every existing Tailwind utility class already in use across the app. `--font-heading` now resolves to the same value as `--font-sans`, so every `className="font-heading ..."` in the codebase renders in Geist Sans, not a serif font.

- [ ] **Step 1: Replace the color tokens with the SaaS Clean palette, and repoint `--font-heading` at the sans font**

Replace `src/app/globals.css` in full:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-sans);
  --font-mono: var(--font-geist-mono);
  --font-heading: var(--font-sans);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

:root {
  --background: #f8f9fb;
  --foreground: #111827;
  --card: #ffffff;
  --card-foreground: #111827;
  --popover: #ffffff;
  --popover-foreground: #111827;
  --primary: #0ea472;
  --primary-foreground: #ffffff;
  --secondary: #f1f2f4;
  --secondary-foreground: #111827;
  --muted: #f1f2f4;
  --muted-foreground: #6b7280;
  --accent: #f1f2f4;
  --accent-foreground: #111827;
  --destructive: #dc2626;
  --border: #e5e7eb;
  --input: #e5e7eb;
  --ring: #0ea472;
  --radius: 0.625rem;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
}
```

- [ ] **Step 2: Remove the Playfair Display font from the root layout**

Replace `src/app/layout.tsx` in full:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Seu Fernandes",
  description: "Sistema de gestão da barbearia Seu Fernandes",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Recolor the favicon**

Replace `src/app/icon.svg` in full:

```svg
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <rect width="64" height="64" rx="14" fill="#0ea472"/>
  <text x="32" y="43" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">SF</text>
</svg>
```

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Manual verification**

Start the dev server, open `/login`. Confirm: light background (near-white, not pure white), dark readable text, the "Entrar" button and any "SEU FERNANDES" heading text render in a plain bold sans-serif (no serif letterforms), and the browser tab shows a small emerald-green square with a white "SF". This one task re-themes the whole app — after this task, every other page should already show the light background and emerald accents, just without the two dashboards' new Card-based sections (later tasks).

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx src/app/icon.svg
git commit -m "feat: replace dark/gold theme with SaaS Clean (light, emerald accent, sans-serif)"
```

---

### Task 2: Lógica de ociosidade — atendimentos perdidos estimados

**Files:**
- Modify: `src/lib/ociosidade.ts` (whole file)
- Modify: `tests/unit/ociosidade.test.ts` (whole file)

**Interfaces:**
- Produces: `calcularOciosidade(input: { minutosDisponiveis: number; minutosOcupados: number; faturamentoServicos: number; quantidadeAtendimentos: number }): { percentualOcupacao: number; ganhoPorHoraOcupada: number; valorPerdidoEstimado: number; atendimentosPerdidosEstimado: number }` — the input gains one required field (`quantidadeAtendimentos`) and the return type gains one field (`atendimentosPerdidosEstimado`). Both call sites (Task 3's `painel/page.tsx`, Task 4's `admin/page.tsx`) must pass the new input field or the build fails to type-check — that's the correctness signal for this task's Step 3.

This task is pure TDD on an existing pure function — write the failing test first, then the implementation.

- [ ] **Step 1: Write the failing test**

Replace `tests/unit/ociosidade.test.ts` in full:

```ts
import { describe, it, expect } from 'vitest'
import { calcularOciosidade } from '@/lib/ociosidade'

describe('calcularOciosidade', () => {
  it('calculates occupancy, hourly earnings, and estimated lost revenue', () => {
    const result = calcularOciosidade({
      minutosDisponiveis: 480, // 8h
      minutosOcupados: 336,    // 5h36 = 70%
      faturamentoServicos: 420,
      quantidadeAtendimentos: 8, // média de 42min por atendimento
    })
    expect(result.percentualOcupacao).toBe(70)
    expect(result.ganhoPorHoraOcupada).toBe(75)
    expect(result.valorPerdidoEstimado).toBe(180) // 2.4h ociosas * R$75/h
    expect(result.atendimentosPerdidosEstimado).toBe(3) // 144min ociosos / 42min ≈ 3.43 → 3
  })

  it('returns zeros when there is no available time', () => {
    const result = calcularOciosidade({ minutosDisponiveis: 0, minutosOcupados: 0, faturamentoServicos: 0, quantidadeAtendimentos: 0 })
    expect(result).toEqual({ percentualOcupacao: 0, ganhoPorHoraOcupada: 0, valorPerdidoEstimado: 0, atendimentosPerdidosEstimado: 0 })
  })

  it('returns zero atendimentos perdidos when there were no atendimentos to average duration from', () => {
    const result = calcularOciosidade({ minutosDisponiveis: 480, minutosOcupados: 0, faturamentoServicos: 0, quantidadeAtendimentos: 0 })
    expect(result.atendimentosPerdidosEstimado).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `calcularOciosidade` doesn't accept `quantidadeAtendimentos` yet and doesn't return `atendimentosPerdidosEstimado` (TypeScript error and/or assertion failure).

- [ ] **Step 3: Implement**

Replace `src/lib/ociosidade.ts` in full:

```ts
export function calcularOciosidade(input: {
  minutosDisponiveis: number
  minutosOcupados: number
  faturamentoServicos: number
  quantidadeAtendimentos: number
}): { percentualOcupacao: number; ganhoPorHoraOcupada: number; valorPerdidoEstimado: number; atendimentosPerdidosEstimado: number } {
  const { minutosDisponiveis, minutosOcupados, faturamentoServicos, quantidadeAtendimentos } = input

  if (minutosDisponiveis <= 0) {
    return { percentualOcupacao: 0, ganhoPorHoraOcupada: 0, valorPerdidoEstimado: 0, atendimentosPerdidosEstimado: 0 }
  }

  const percentualOcupacao = Math.min(minutosOcupados / minutosDisponiveis, 1) * 100
  const horasOcupadas = minutosOcupados / 60
  const ganhoPorHoraOcupada = horasOcupadas > 0 ? faturamentoServicos / horasOcupadas : 0
  const minutosOciosos = Math.max(minutosDisponiveis - minutosOcupados, 0)
  const valorPerdidoEstimado = (minutosOciosos / 60) * ganhoPorHoraOcupada
  const duracaoMediaMinutos = quantidadeAtendimentos > 0 ? minutosOcupados / quantidadeAtendimentos : 0
  const atendimentosPerdidosEstimado = duracaoMediaMinutos > 0 ? Math.round(minutosOciosos / duracaoMediaMinutos) : 0

  return {
    percentualOcupacao: Math.round(percentualOcupacao * 10) / 10,
    ganhoPorHoraOcupada: Math.round(ganhoPorHoraOcupada * 100) / 100,
    valorPerdidoEstimado: Math.round(valorPerdidoEstimado * 100) / 100,
    atendimentosPerdidosEstimado,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 3/3 tests green.

Note: `npm run build` will now fail until Tasks 3 and 4 update their `calcularOciosidade(...)` call sites to pass `quantidadeAtendimentos` — that's expected at this point in the plan, not a regression to fix here.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ociosidade.ts tests/unit/ociosidade.test.ts
git commit -m "feat: estimate atendimentos perdidos from real average atendimento duration"
```

---

### Task 3: Dashboard do barbeiro — cartões estruturados

**Files:**
- Modify: `src/app/painel/page.tsx` (whole file)

**Interfaces:**
- Consumes: `calcularOciosidade` with its new `quantidadeAtendimentos` field and `atendimentosPerdidosEstimado` return value (Task 2).

- [ ] **Step 1: Pass `quantidadeAtendimentos` into `calcularOciosidade`, and rewrite the sections below the KPI cards**

Replace `src/app/painel/page.tsx` in full:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { calcularOciosidade } from '@/lib/ociosidade'
import { Card, CardContent } from '@/components/ui/card'

export default async function BarbeiroDashboardPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, nome').eq('user_id', user!.id).single()

  const hoje = new Date()
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10)
  const fimMes = hoje.toISOString().slice(0, 10)

  const { data: atendimentos } = await supabase
    .from('atendimentos')
    .select('preco, comissao_valor')
    .eq('membro_id', membro!.id)
    .gte('data', inicioMes)

  const { data: vendas } = await supabase
    .from('vendas_produtos')
    .select('quantidade, preco_unitario, comissao_valor')
    .eq('membro_id', membro!.id)
    .gte('data', inicioMes)

  const { data: agendamentosMes } = await supabase
    .from('agendamentos')
    .select('status, vezes_remarcado')
    .eq('membro_id', membro!.id)
    .gte('data', inicioMes)

  const totalAgendamentos = agendamentosMes?.length ?? 0
  const realizados = agendamentosMes?.filter((a) => a.status === 'realizado').length ?? 0
  const naoCompareceram = agendamentosMes?.filter((a) => a.status === 'nao_compareceu').length ?? 0
  const cancelados = agendamentosMes?.filter((a) => a.status === 'cancelado').length ?? 0
  const remarcados = (agendamentosMes ?? []).reduce((s, a) => s + a.vezes_remarcado, 0)

  const { data: prospeccoesMes } = await supabase
    .from('prospeccoes')
    .select('status, agendamento_id')
    .eq('membro_id', membro!.id)
    .gte('data', inicioMes)

  const prospectados = prospeccoesMes?.length ?? 0
  const convertidosProspeccao = prospeccoesMes?.filter((p) => p.status === 'convertido').length ?? 0
  const naoConvertidosProspeccao = prospeccoesMes?.filter((p) => p.status === 'nao_convertido').length ?? 0
  const agendamentoIdsConvertidos = (prospeccoesMes ?? [])
    .filter((p) => p.status === 'convertido' && p.agendamento_id)
    .map((p) => p.agendamento_id as string)

  const { data: atendimentosProspeccao } = await supabase
    .from('atendimentos')
    .select('preco')
    .in('agendamento_id', agendamentoIdsConvertidos.length > 0 ? agendamentoIdsConvertidos : ['00000000-0000-0000-0000-000000000000'])
  const { data: vendasProspeccao } = await supabase
    .from('vendas_produtos')
    .select('preco_unitario, quantidade')
    .in('agendamento_id', agendamentoIdsConvertidos.length > 0 ? agendamentoIdsConvertidos : ['00000000-0000-0000-0000-000000000000'])

  const faturamentoProspeccao =
    (atendimentosProspeccao ?? []).reduce((s, a) => s + Number(a.preco), 0) +
    (vendasProspeccao ?? []).reduce((s, v) => s + Number(v.preco_unitario) * v.quantidade, 0)

  const faturamentoServicos = (atendimentos ?? []).reduce((sum, a) => sum + Number(a.preco), 0)
  const comissaoServicos = (atendimentos ?? []).reduce((sum, a) => sum + Number(a.comissao_valor ?? 0), 0)
  const faturamentoProdutos = (vendas ?? []).reduce((sum, v) => sum + Number(v.preco_unitario) * v.quantidade, 0)
  const comissaoProdutos = (vendas ?? []).reduce((sum, v) => sum + Number(v.comissao_valor ?? 0), 0)

  // No generated Supabase types in this project (no `supabase gen types` step
  // in the plan), so .rpc() infers an untyped result — cast to the RPC's
  // known return shape (matches ociosidade()'s `returns table(...)`, Task 14).
  const { data: ociosidadeRaw } = await supabase
    .rpc('ociosidade', { p_membro_id: membro!.id, p_data_inicio: inicioMes, p_data_fim: fimMes })
    .single() as { data: { minutos_disponiveis: number; minutos_ocupados: number; faturamento_servicos: number } | null }

  const ociosidade = calcularOciosidade({
    minutosDisponiveis: ociosidadeRaw?.minutos_disponiveis ?? 0,
    minutosOcupados: ociosidadeRaw?.minutos_ocupados ?? 0,
    faturamentoServicos: Number(ociosidadeRaw?.faturamento_servicos ?? 0),
    quantidadeAtendimentos: atendimentos?.length ?? 0,
  })

  const totalGanhos = faturamentoServicos + faturamentoProdutos
  const percentualServicos = totalGanhos > 0 ? Math.round((faturamentoServicos / totalGanhos) * 100) : 0
  const percentualProdutos = totalGanhos > 0 ? Math.round((faturamentoProdutos / totalGanhos) * 100) : 0

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Olá, {membro!.nome}</h1>

      <div className="flex gap-4 flex-wrap mb-6">
        <Card className="flex-1 min-w-[160px]">
          <CardContent>
            <p className="text-xs uppercase text-muted-foreground">Faturamento do mês</p>
            <p className="text-2xl font-bold text-primary">R$ {totalGanhos.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[160px]">
          <CardContent>
            <p className="text-xs uppercase text-muted-foreground">Comissão do mês</p>
            <p className="text-2xl font-bold text-primary">R$ {(comissaoServicos + comissaoProdutos).toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[160px]">
          <CardContent>
            <p className="text-xs uppercase text-muted-foreground">Ocupação da agenda</p>
            <p className="text-2xl font-bold text-primary">{ociosidade.percentualOcupacao}%</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-5">
        <CardContent className="p-6">
          <p className="font-heading text-base font-bold mb-5">Ganhos por categoria</p>
          <div className="mb-5">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-foreground/80">Cortes e serviços</span>
              <span className="flex items-center gap-2">
                <span className="text-base font-bold">R$ {faturamentoServicos.toFixed(2)}</span>
                <span className="inline-flex items-baseline gap-1 rounded-full bg-primary/10 text-primary border border-primary/30 px-3 py-1 text-xs font-bold">
                  <span className="text-[10px] font-semibold uppercase tracking-wide opacity-75">comissão</span> R$ {comissaoServicos.toFixed(2)}
                </span>
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${percentualServicos}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-foreground/80">Produtos</span>
              <span className="flex items-center gap-2">
                <span className="text-base font-bold">R$ {faturamentoProdutos.toFixed(2)}</span>
                <span className="inline-flex items-baseline gap-1 rounded-full bg-primary/10 text-primary border border-primary/30 px-3 py-1 text-xs font-bold">
                  <span className="text-[10px] font-semibold uppercase tracking-wide opacity-75">comissão</span> R$ {comissaoProdutos.toFixed(2)}
                </span>
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div className="h-full rounded-full bg-indigo-500" style={{ width: `${percentualProdutos}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-6">
          <p className="font-heading text-base font-bold mb-5">Tempo de cadeira (mês)</p>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-3xl font-bold text-primary">{ociosidade.percentualOcupacao}%</span>
            <span className="text-sm text-muted-foreground">ocupado no mês</span>
          </div>
          <div className="w-full bg-muted rounded-full h-7 overflow-hidden mb-5">
            <div className="bg-primary h-full rounded-full flex items-center justify-end pr-3" style={{ width: `${ociosidade.percentualOcupacao}%` }}>
              <span className="text-primary-foreground text-xs font-bold">{ociosidade.percentualOcupacao}%</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Clientes atendidos</p>
              <p className="text-lg font-bold">{realizados}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Ganho médio / hora ocupada</p>
              <p className="text-lg font-bold">R$ {ociosidade.ganhoPorHoraOcupada.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Estimativa perdida no mês</p>
              <p className="text-lg font-bold">
                R$ {ociosidade.valorPerdidoEstimado.toFixed(2)}
                <span className="block text-xs font-semibold text-destructive mt-0.5">≈ {ociosidade.atendimentosPerdidosEstimado} atendimentos</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-6">
          <p className="font-heading text-base font-bold mb-5">Indicadores de agendamento (mês) <span className="font-normal text-muted-foreground text-sm">— não somado ao financeiro acima</span></p>
          <div className="grid grid-cols-5 gap-5 text-center">
            <div><p className="text-2xl font-bold">{totalAgendamentos}</p><p className="text-xs text-muted-foreground mt-1">Total</p></div>
            <div><p className="text-2xl font-bold text-primary">{realizados}</p><p className="text-xs text-muted-foreground mt-1">Realizados</p></div>
            <div><p className="text-2xl font-bold">{naoCompareceram}</p><p className="text-xs text-muted-foreground mt-1">Não compareceram</p></div>
            <div><p className="text-2xl font-bold">{cancelados}</p><p className="text-xs text-muted-foreground mt-1">Cancelados</p></div>
            <div><p className="text-2xl font-bold">{remarcados}</p><p className="text-xs text-muted-foreground mt-1">Remarcados</p></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <p className="font-heading text-base font-bold mb-5">Prospecção (mês)</p>
          <div className="grid grid-cols-4 gap-5 text-center">
            <div><p className="text-2xl font-bold">{prospectados}</p><p className="text-xs text-muted-foreground mt-1">Prospectados</p></div>
            <div><p className="text-2xl font-bold text-primary">{convertidosProspeccao}</p><p className="text-xs text-muted-foreground mt-1">Convertidos</p></div>
            <div><p className="text-2xl font-bold">{naoConvertidosProspeccao}</p><p className="text-xs text-muted-foreground mt-1">Não convertidos</p></div>
            <div><p className="text-2xl font-bold">R$ {faturamentoProspeccao.toFixed(2)}</p><p className="text-xs text-muted-foreground mt-1">Faturamento gerado</p></div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

Note: `totalGanhos` is a new derived variable (`faturamentoServicos + faturamentoProdutos`) that replaces the old inline `(faturamentoServicos + faturamentoProdutos)` in the first KPI card — used again for the two bar-proportion percentages, so it's factored out once instead of recomputed three times.

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds (this is also what confirms Task 2's `calcularOciosidade` signature change compiles correctly against this call site).

- [ ] **Step 3: Manual verification**

As `barbeiro@teste.com`, open `/painel`. Confirm: light background, emerald KPI values; "Ganhos por categoria" shows two proportional bars (Serviços in emerald, Produtos in indigo) with a green comissão pill next to each total; "Tempo de cadeira" shows a big percentage at the top, a tall bar with the percentage readable inside it, and three stats below (Clientes atendidos, Ganho médio/hora, Estimativa perdida with the "≈ N atendimentos" sub-line in red); "Indicadores de agendamento" and "Prospecção" render as titled cards with a centered stat grid, generously spaced, not cramped.

- [ ] **Step 4: Commit**

```bash
git add src/app/painel/page.tsx
git commit -m "feat: restructure barbeiro dashboard into titled cards with proportional bars and comissão pills"
```

---

### Task 4: Dashboard do admin — cartões estruturados

**Files:**
- Modify: `src/app/admin/page.tsx` (whole file)

**Interfaces:**
- Consumes: `calcularOciosidade` with its new `quantidadeAtendimentos` field (Task 2) — the admin page calls this once per barbeiro inside a `Promise.all` map and only reads `.percentualOcupacao` from the result, but the new field is required on the input regardless.

- [ ] **Step 1: Pass `quantidadeAtendimentos` into the per-barbeiro `calcularOciosidade` call, and rewrite Indicadores/Prospecção into titled cards**

Replace `src/app/admin/page.tsx` in full:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { calcularOciosidade } from '@/lib/ociosidade'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'

export default async function AdminOverviewPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const hoje = new Date().toISOString().slice(0, 10)

  const { data: atendimentos } = await supabase.from('atendimentos').select('membro_id, preco, comissao_valor').eq('barbearia_id', membro!.barbearia_id).gte('data', inicioMes)
  const { data: vendas } = await supabase.from('vendas_produtos').select('membro_id, quantidade, preco_unitario, comissao_valor').eq('barbearia_id', membro!.barbearia_id).gte('data', inicioMes)
  // supabase-js's .filter(column, op, value) compares against a literal
  // value, not another column — .filter('quantidade_estoque', 'lte',
  // 'estoque_minimo') was silently comparing against the string
  // "estoque_minimo" (always false), not the estoque_minimo column. Fetch
  // both columns and compare them in JS instead.
  const { data: produtos } = await supabase.from('produtos').select('id, quantidade_estoque, estoque_minimo').eq('barbearia_id', membro!.barbearia_id)
  const produtosBaixos = (produtos ?? []).filter((p) => p.quantidade_estoque <= p.estoque_minimo)
  const { data: barbeiros } = await supabase.from('membros').select('id, nome, plano_carreira_id').eq('barbearia_id', membro!.barbearia_id).eq('papel', 'barbeiro')

  const { data: agendamentosMes } = await supabase
    .from('agendamentos')
    .select('status, vezes_remarcado')
    .eq('barbearia_id', membro!.barbearia_id)
    .gte('data', inicioMes)

  const totalAgendamentos = agendamentosMes?.length ?? 0
  const realizadosCount = agendamentosMes?.filter((a) => a.status === 'realizado').length ?? 0
  const naoCompareceram = agendamentosMes?.filter((a) => a.status === 'nao_compareceu').length ?? 0
  const canceladosCount = agendamentosMes?.filter((a) => a.status === 'cancelado').length ?? 0
  const remarcados = (agendamentosMes ?? []).reduce((s, a) => s + a.vezes_remarcado, 0)

  const { data: prospeccoesMes } = await supabase
    .from('prospeccoes')
    .select('status, agendamento_id')
    .eq('barbearia_id', membro!.barbearia_id)
    .gte('data', inicioMes)

  const prospectados = prospeccoesMes?.length ?? 0
  const convertidosProspeccao = prospeccoesMes?.filter((p) => p.status === 'convertido').length ?? 0
  const naoConvertidosProspeccao = prospeccoesMes?.filter((p) => p.status === 'nao_convertido').length ?? 0
  const agendamentoIdsConvertidos = (prospeccoesMes ?? [])
    .filter((p) => p.status === 'convertido' && p.agendamento_id)
    .map((p) => p.agendamento_id as string)

  const { data: atendimentosProspeccao } = await supabase
    .from('atendimentos')
    .select('preco')
    .in('agendamento_id', agendamentoIdsConvertidos.length > 0 ? agendamentoIdsConvertidos : ['00000000-0000-0000-0000-000000000000'])
  const { data: vendasProspeccao } = await supabase
    .from('vendas_produtos')
    .select('preco_unitario, quantidade')
    .in('agendamento_id', agendamentoIdsConvertidos.length > 0 ? agendamentoIdsConvertidos : ['00000000-0000-0000-0000-000000000000'])

  const faturamentoProspeccao =
    (atendimentosProspeccao ?? []).reduce((s, a) => s + Number(a.preco), 0) +
    (vendasProspeccao ?? []).reduce((s, v) => s + Number(v.preco_unitario) * v.quantidade, 0)

  const faturamentoTotal =
    (atendimentos ?? []).reduce((sum, a) => sum + Number(a.preco), 0) +
    (vendas ?? []).reduce((sum, v) => sum + Number(v.preco_unitario) * v.quantidade, 0)
  const comissaoTotal =
    (atendimentos ?? []).reduce((sum, a) => sum + Number(a.comissao_valor ?? 0), 0) +
    (vendas ?? []).reduce((sum, v) => sum + Number(v.comissao_valor ?? 0), 0)

  const linhas = await Promise.all(
    (barbeiros ?? []).map(async (b) => {
      const atendimentosB = (atendimentos ?? []).filter((a) => a.membro_id === b.id)
      const vendasB = (vendas ?? []).filter((v) => v.membro_id === b.id)
      const faturamentoB = atendimentosB.reduce((s, a) => s + Number(a.preco), 0) + vendasB.reduce((s, v) => s + Number(v.preco_unitario) * v.quantidade, 0)
      const comissaoB = atendimentosB.reduce((s, a) => s + Number(a.comissao_valor ?? 0), 0) + vendasB.reduce((s, v) => s + Number(v.comissao_valor ?? 0), 0)

      // Same cast reasoning as the barbeiro dashboard (Task 15): no
      // generated Supabase types, so .rpc().single() is otherwise untyped.
      const { data: ociosidadeRaw } = await supabase
        .rpc('ociosidade', { p_membro_id: b.id, p_data_inicio: inicioMes, p_data_fim: hoje })
        .single() as { data: { minutos_disponiveis: number; minutos_ocupados: number; faturamento_servicos: number } | null }
      const ocupacao = calcularOciosidade({
        minutosDisponiveis: ociosidadeRaw?.minutos_disponiveis ?? 0,
        minutosOcupados: ociosidadeRaw?.minutos_ocupados ?? 0,
        faturamentoServicos: Number(ociosidadeRaw?.faturamento_servicos ?? 0),
        quantidadeAtendimentos: atendimentosB.length,
      }).percentualOcupacao

      return { nome: b.nome, faturamentoB, comissaoB, ocupacao }
    })
  )

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Visão geral</h1>
      <div className="flex gap-4 flex-wrap mb-6">
        <Card className="flex-1 min-w-[160px]">
          <CardContent>
            <p className="text-xs uppercase text-muted-foreground">Faturamento do mês (todos)</p>
            <p className="text-2xl font-bold text-primary">R$ {faturamentoTotal.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[160px]">
          <CardContent>
            <p className="text-xs uppercase text-muted-foreground">Comissões acumuladas no mês</p>
            <p className="text-2xl font-bold text-primary">R$ {comissaoTotal.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[160px]">
          <CardContent>
            <p className="text-xs uppercase text-muted-foreground">Produtos com estoque baixo</p>
            <p className="text-2xl font-bold text-destructive">{produtosBaixos?.length ?? 0} itens</p>
          </CardContent>
        </Card>
      </div>

      <h2 className="font-heading text-lg font-semibold mb-2">Barbeiros</h2>
      <Table>
        <TableHeader>
          <TableRow><TableHead>Nome</TableHead><TableHead>Faturamento mês</TableHead><TableHead>Comissão mês</TableHead><TableHead>Ocupação</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((l) => (
            <TableRow key={l.nome}><TableCell>{l.nome}</TableCell><TableCell>R$ {l.faturamentoB.toFixed(2)}</TableCell><TableCell>R$ {l.comissaoB.toFixed(2)}</TableCell><TableCell>{l.ocupacao}%</TableCell></TableRow>
          ))}
        </TableBody>
      </Table>

      <Card className="mt-6 mb-5">
        <CardContent className="p-6">
          <p className="font-heading text-base font-bold mb-5">Indicadores de agendamento (mês, toda a barbearia) <span className="font-normal text-muted-foreground text-sm">— não somado ao financeiro acima</span></p>
          <div className="grid grid-cols-5 gap-5 text-center">
            <div><p className="text-2xl font-bold">{totalAgendamentos}</p><p className="text-xs text-muted-foreground mt-1">Total</p></div>
            <div><p className="text-2xl font-bold text-primary">{realizadosCount}</p><p className="text-xs text-muted-foreground mt-1">Realizados</p></div>
            <div><p className="text-2xl font-bold">{naoCompareceram}</p><p className="text-xs text-muted-foreground mt-1">Não compareceram</p></div>
            <div><p className="text-2xl font-bold">{canceladosCount}</p><p className="text-xs text-muted-foreground mt-1">Cancelados</p></div>
            <div><p className="text-2xl font-bold">{remarcados}</p><p className="text-xs text-muted-foreground mt-1">Remarcados</p></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <p className="font-heading text-base font-bold mb-5">Prospecção (mês, toda a barbearia)</p>
          <div className="grid grid-cols-4 gap-5 text-center">
            <div><p className="text-2xl font-bold">{prospectados}</p><p className="text-xs text-muted-foreground mt-1">Prospectados</p></div>
            <div><p className="text-2xl font-bold text-primary">{convertidosProspeccao}</p><p className="text-xs text-muted-foreground mt-1">Convertidos</p></div>
            <div><p className="text-2xl font-bold">{naoConvertidosProspeccao}</p><p className="text-xs text-muted-foreground mt-1">Não convertidos</p></div>
            <div><p className="text-2xl font-bold">R$ {faturamentoProspeccao.toFixed(2)}</p><p className="text-xs text-muted-foreground mt-1">Faturamento gerado</p></div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual verification**

As `admin@teste.com`, open `/admin`. Confirm: light background, emerald KPI values, the barbeiros table has proper spacing (inherited from the `Table` component, unchanged from the previous plan), and "Indicadores de agendamento"/"Prospecção" render as titled cards with a centered, generously-spaced stat grid — same visual language as the barbeiro dashboard's equivalent sections from Task 3.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat: restructure admin dashboard's indicadores/prospecção into titled cards"
```

---

### Task 5: Regressão final

**Files:** none (verification only).

- [ ] **Step 1: Full automated regression**

Run:
```bash
npm test
npm run build
```
Expected: `npm test` shows all unit tests passing (including Task 2's 3 `calcularOciosidade` tests); `npm run build` succeeds with no type errors and all routes present.

- [ ] **Step 2: Manual end-to-end visual walkthrough**

Using the dev server, as `admin@teste.com`: `/login`, `/admin`, `/admin/servicos`, `/admin/produtos`, `/admin/planos-carreira`, `/admin/barbeiros`, `/admin/prospeccao`. As `barbeiro@teste.com`: `/painel` (the two new structured cards from Task 3), `/painel/agenda`, `/painel/prospeccao`, a cliente's ficha. As a público visitor: `/teste`. On every screen, confirm: light background, dark readable text, emerald accent on primary actions/highlights/values, red only on destructive actions, no leftover dark backgrounds or serif letterforms anywhere, and (specific to this plan) no plain stacked `<p>` stats sections remaining outside a `Card` on either dashboard.

- [ ] **Step 3: No commit for this task** — it's verification-only; if any issue surfaces, fix it as a small follow-up commit referencing which task's step regressed.
