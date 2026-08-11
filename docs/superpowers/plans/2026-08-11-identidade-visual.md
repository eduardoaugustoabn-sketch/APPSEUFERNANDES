# Identidade Visual "Seu Fernandes" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's default grayscale shadcn theme with the "Seu Fernandes" dark/gold identity across every screen, and put the already-installed `Card`/`Table`/`Badge` components to use where the app currently renders raw `<div>`/`<table>`.

**Architecture:** Next.js App Router + Tailwind v4 + shadcn/ui, same stack as the rest of the project. Almost the entire app already uses Tailwind's semantic tokens (`border`, `bg-muted`, `text-muted-foreground`, `rounded`) instead of hardcoded colors, so retheming `globals.css` (Task 1) re-skins most pages automatically with zero further changes. The remaining tasks are: (a) the ~15 spots that bypass the token system with raw Tailwind colors (`text-red-600`, `bg-green-600`, `bg-amber-50`...) — these clash against a dark background and must be remapped to the new semantic tokens; (b) swapping unstyled `<table>`/stat `<div>`s for the `Table`/`Card` components already installed but unused.

**Tech Stack:** Next.js 16.3 (TypeScript, App Router, Turbopack), Tailwind CSS v4, shadcn/ui (`Button`, `Input`, `Card`, `Table`, `Badge`), `next/font/google`.

## Global Constraints

- Design source of truth: `docs/superpowers/specs/2026-08-11-identidade-visual-design.md`. Follow the exact color values, font choices, and file list there.
- This is a pure restyle — no data, query, or business-logic change anywhere in this plan. If a step's snippet touches a line that isn't purely visual (a `className`, a JSX wrapper, a color utility), treat that as a signal to stop and re-check the snippet against the file's current content before proceeding.
- No pgTAP tests needed (no schema/RLS change). Verification is `npm run build` (type-check) plus manual visual verification per task, in the browser, on the dark background — a class that reads fine as a diff can still be unreadable once actually rendered (e.g. light-on-light), so every task's manual step means actually looking at the page, not just trusting the code.
- Every new/changed color must be one of the tokens defined in Task 1 (`--primary`, `--destructive`, `--muted-foreground`, `--card`, `--border`, or their Tailwind opacity variants like `bg-primary/10`) — never introduce a new ad-hoc hex color in a later task.
- The app has no light/dark toggle and never did (confirmed: no `ThemeProvider`, no `next-themes`, no `.dark` class usage anywhere in `src/`) — Task 1 removes the now-dead `.dark` block and the unused `--chart-*`/`--sidebar-*` tokens (confirmed via `grep -rln "chart-\|sidebar-" src/` — only `globals.css` itself references them) instead of maintaining two themes nobody switches between.

---

### Task 1: Fundação — tokens, fonte da marca, metadata, favicon

**Files:**
- Modify: `src/app/globals.css` (whole file)
- Modify: `src/app/layout.tsx` (whole file)
- Create: `src/app/icon.svg`

**Interfaces:**
- Produces: the CSS custom properties `--background`, `--foreground`, `--card`, `--primary`, `--primary-foreground`, `--secondary`, `--muted`, `--muted-foreground`, `--accent`, `--destructive`, `--border`, `--input`, `--ring` (all consumed automatically by every existing Tailwind utility class already in use — `bg-background`, `text-muted-foreground`, `border`, etc.) and the `font-heading` Tailwind utility (backed by Playfair Display), which later tasks apply to `<h1>`/`<h2>`/brand text.

- [ ] **Step 1: Replace the color tokens and remove the unused dark/chart/sidebar tokens**

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
  --font-heading: var(--font-heading);
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
  --background: #171310;
  --foreground: #ede4d8;
  --card: #221c17;
  --card-foreground: #ede4d8;
  --popover: #221c17;
  --popover-foreground: #ede4d8;
  --primary: #d4a574;
  --primary-foreground: #1a1613;
  --secondary: #2a231c;
  --secondary-foreground: #ede4d8;
  --muted: #241e18;
  --muted-foreground: #a3927e;
  --accent: #2a231c;
  --accent-foreground: #ede4d8;
  --destructive: #b0524a;
  --border: rgba(212, 165, 116, 0.16);
  --input: rgba(212, 165, 116, 0.22);
  --ring: #d4a574;
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

Note what's removed versus the current file: the entire `@custom-variant dark (&:is(.dark *));` line, the `.dark { ... }` block, and the `--color-sidebar-*`/`--color-chart-*`/`--sidebar-*`/`--chart-*` tokens — none are referenced anywhere in `src/` outside this file.

- [ ] **Step 2: Add the Playfair Display heading font, set metadata and favicon**

Replace `src/app/layout.tsx` in full:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-heading",
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
      className={`${geistSans.variable} ${geistMono.variable} ${playfairDisplay.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

Create `src/app/icon.svg` (Next.js picks up `app/icon.svg` automatically as the site favicon/tab icon — no other wiring needed):

```svg
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <rect width="64" height="64" rx="14" fill="#171310"/>
  <text x="32" y="43" font-family="Georgia, 'Times New Roman', serif" font-size="26" font-weight="700" fill="#d4a574" text-anchor="middle">SF</text>
</svg>
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual verification**

Start the dev server, open `/login` (no auth needed). Confirm: dark warm-black background, cream text, the browser tab shows a small dark square with a gold "SF" and the tab title reads "Seu Fernandes" (not "Create Next App"). This single step re-themes the whole app — after this task, every other page (even ones not yet touched by this plan) should already show the dark background and cream text, just without the Card/Table polish and with a few still-wrong hardcoded colors (later tasks).

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx src/app/icon.svg
git commit -m "feat: apply Seu Fernandes dark/gold theme tokens and brand font"
```

---

### Task 2: Navegação e login

**Files:**
- Create: `src/components/nav-links.tsx`
- Modify: `src/app/admin/layout.tsx` (whole file)
- Modify: `src/app/painel/layout.tsx` (whole file)
- Modify: `src/components/sign-out-button.tsx:17`
- Modify: `src/app/login/page.tsx` (whole file)

**Interfaces:**
- Consumes: `--font-heading`, `--primary`, `--muted-foreground` (Task 1).
- Produces: `NavLinks({ items }: { items: { href: string; label: string }[] })` — a client component rendering the nav links with the current-route one highlighted; both layouts render it with their own `NAV_ITEMS` array (unchanged from today).

- [ ] **Step 1: Write `NavLinks`**

Create `src/components/nav-links.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname()
  // The active item is the longest href that matches — otherwise a
  // section root like /admin would light up alongside /admin/servicos
  // on every one of its own subpages.
  const ativoHref = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  return (
    <div className="flex gap-4">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`text-sm hover:underline ${item.href === ativoHref ? 'text-primary font-medium' : 'text-muted-foreground'}`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Use it in the admin nav, add the brand wordmark**

Replace `src/app/admin/layout.tsx` in full:

```tsx
import { redirect } from 'next/navigation'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/sign-out-button'
import { NavLinks } from '@/components/nav-links'

const NAV_ITEMS = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/servicos', label: 'Serviços' },
  { href: '/admin/produtos', label: 'Produtos' },
  { href: '/admin/planos-carreira', label: 'Planos de carreira' },
  { href: '/admin/barbeiros', label: 'Barbeiros' },
  { href: '/admin/prospeccao', label: 'Prospecção' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membro } = await supabase
    .from('membros')
    .select('papel')
    .eq('user_id', user.id)
    .single()

  if (membro?.papel !== 'admin') redirect('/')

  return (
    <div>
      <nav className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-8">
          <span className="font-heading text-lg font-bold tracking-wide">SEU FERNANDES</span>
          <NavLinks items={NAV_ITEMS} />
        </div>
        <SignOutButton />
      </nav>
      <div className="p-6">{children}</div>
    </div>
  )
}
```

- [ ] **Step 3: Same for the barbeiro nav**

Replace `src/app/painel/layout.tsx` in full:

```tsx
import { redirect } from 'next/navigation'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/sign-out-button'
import { NavLinks } from '@/components/nav-links'

const NAV_ITEMS = [
  { href: '/painel', label: 'Dashboard' },
  { href: '/painel/agenda', label: 'Agenda' },
  { href: '/painel/prospeccao', label: 'Prospecção' },
]

export default async function BarbeiroLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membro } = await supabase
    .from('membros')
    .select('papel')
    .eq('user_id', user.id)
    .single()

  if (membro?.papel !== 'barbeiro') redirect('/')

  return (
    <div>
      <nav className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-8">
          <span className="font-heading text-lg font-bold tracking-wide">SEU FERNANDES</span>
          <NavLinks items={NAV_ITEMS} />
        </div>
        <SignOutButton />
      </nav>
      <div className="p-6">{children}</div>
    </div>
  )
}
```

- [ ] **Step 4: Recolor the sign-out link for consistency**

In `src/components/sign-out-button.tsx`, change:

```tsx
    <button onClick={handleSignOut} className="text-sm text-muted-foreground hover:text-foreground underline">
```

to:

```tsx
    <button onClick={handleSignOut} className="text-sm text-muted-foreground hover:text-primary underline">
```

- [ ] **Step 5: Redesign the login page**

Replace `src/app/login/page.tsx` in full:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('E-mail ou senha inválidos.')
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col gap-4 border rounded-xl bg-card p-8">
        <h1 className="font-heading text-2xl font-bold text-center mb-2">SEU FERNANDES</h1>
        <Input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit">Entrar</Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 6: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Manual verification**

Open `/login` — confirm the form is centered in a card with the "SEU FERNANDES" wordmark in the serif heading font above it. Log in as `admin@teste.com`; confirm the top nav shows "SEU FERNANDES" in serif, and the current section's link (e.g. "Visão geral" on `/admin`) is gold while the others are muted. Click into "Serviços" and confirm the highlight moves to it and only it. Repeat as `barbeiro@teste.com` on `/painel`.

- [ ] **Step 8: Commit**

```bash
git add src/components/nav-links.tsx src/app/admin/layout.tsx src/app/painel/layout.tsx src/components/sign-out-button.tsx src/app/login/page.tsx
git commit -m "feat: brand the nav and login page, highlight the active section"
```

---

### Task 3: Dashboards

**Files:**
- Modify: `src/app/painel/page.tsx` (whole file)
- Modify: `src/app/admin/page.tsx` (whole file)

**Interfaces:**
- Consumes: `Card`/`CardContent` from `@/components/ui/card` (existing component, untouched), `Table` family from `@/components/ui/table` (existing component, untouched).

- [ ] **Step 1: Rewrite the barbeiro dashboard**

Replace the `return (...)` block of `src/app/painel/page.tsx` (everything from `return (` to the final `)` before the function's closing `}`, i.e. lines 81-132 of the current file) with:

```tsx
  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Olá, {membro!.nome}</h1>

      <div className="flex gap-4 flex-wrap mb-6">
        <Card className="flex-1 min-w-[160px]">
          <CardContent>
            <p className="text-xs uppercase text-muted-foreground">Faturamento do mês</p>
            <p className="text-2xl font-bold text-primary">R$ {(faturamentoServicos + faturamentoProdutos).toFixed(2)}</p>
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

      <h2 className="font-heading text-lg font-semibold mb-2">Ganhos por categoria</h2>
      <p>Cortes e serviços: R$ {faturamentoServicos.toFixed(2)} → comissão R$ {comissaoServicos.toFixed(2)}</p>
      <p>Produtos: R$ {faturamentoProdutos.toFixed(2)} → comissão R$ {comissaoProdutos.toFixed(2)}</p>

      <h2 className="font-heading text-lg font-semibold mt-6 mb-2">Tempo de cadeira (mês)</h2>
      <div className="w-full bg-muted rounded h-6 overflow-hidden flex">
        <div className="bg-primary flex items-center justify-center text-primary-foreground text-xs" style={{ width: `${ociosidade.percentualOcupacao}%` }}>
          Ocupado {ociosidade.percentualOcupacao}%
        </div>
      </div>
      <div className="flex gap-4 mt-2">
        <p>Ganho médio por hora ocupada: <strong>R$ {ociosidade.ganhoPorHoraOcupada.toFixed(2)}</strong></p>
        <p className="text-destructive">Estimativa perdida no mês: <strong>R$ {ociosidade.valorPerdidoEstimado.toFixed(2)}</strong></p>
      </div>

      <h2 className="font-heading text-lg font-semibold mt-6 mb-2">Indicadores de agendamento (mês) — não somado ao financeiro acima</h2>
      <div className="flex gap-4 flex-wrap">
        <p>Total: <strong>{totalAgendamentos}</strong></p>
        <p>Realizados: <strong>{realizados}</strong></p>
        <p>Não compareceram: <strong>{naoCompareceram}</strong></p>
        <p>Cancelados: <strong>{cancelados}</strong></p>
        <p>Remarcados: <strong>{remarcados}</strong></p>
      </div>

      <h2 className="font-heading text-lg font-semibold mt-6 mb-2">Prospecção (mês)</h2>
      <div className="flex gap-4 flex-wrap">
        <p>Prospectados: <strong>{prospectados}</strong></p>
        <p>Convertidos: <strong>{convertidosProspeccao}</strong></p>
        <p>Não convertidos: <strong>{naoConvertidosProspeccao}</strong></p>
        <p>Faturamento gerado: <strong>R$ {faturamentoProspeccao.toFixed(2)}</strong></p>
      </div>
    </div>
  )
}
```

And add the import at the top of the file, alongside the existing imports:

```tsx
import { Card, CardContent } from '@/components/ui/card'
```

- [ ] **Step 2: Rewrite the admin overview dashboard**

Replace the `return (...)` block of `src/app/admin/page.tsx` (lines 90-136 of the current file) with:

```tsx
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

      <h2 className="font-heading text-lg font-semibold mt-6 mb-2">Indicadores de agendamento (mês, toda a barbearia) — não somado ao financeiro acima</h2>
      <div className="flex gap-4 flex-wrap">
        <p>Total: <strong>{totalAgendamentos}</strong></p>
        <p>Realizados: <strong>{realizadosCount}</strong></p>
        <p>Não compareceram: <strong>{naoCompareceram}</strong></p>
        <p>Cancelados: <strong>{canceladosCount}</strong></p>
        <p>Remarcados: <strong>{remarcados}</strong></p>
      </div>

      <h2 className="font-heading text-lg font-semibold mt-6 mb-2">Prospecção (mês, toda a barbearia)</h2>
      <div className="flex gap-4 flex-wrap">
        <p>Prospectados: <strong>{prospectados}</strong></p>
        <p>Convertidos: <strong>{convertidosProspeccao}</strong></p>
        <p>Não convertidos: <strong>{naoConvertidosProspeccao}</strong></p>
        <p>Faturamento gerado: <strong>R$ {faturamentoProspeccao.toFixed(2)}</strong></p>
      </div>
    </div>
  )
}
```

And add the imports at the top of the file, alongside the existing imports:

```tsx
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual verification**

As `barbeiro@teste.com`, open `/painel` — confirm the three top stats render as bordered cards with the value in gold, and the occupancy bar fill is gold (not green). As `admin@teste.com`, open `/admin` — confirm the same for its three cards, and that the "Barbeiros" list renders as a proper table with visible row separators (not a cramped, padding-less table).

- [ ] **Step 5: Commit**

```bash
git add src/app/painel/page.tsx src/app/admin/page.tsx
git commit -m "feat: restyle dashboards with Card/Table components and theme colors"
```

---

### Task 4: Catálogo — Serviços, Produtos, Planos de carreira

**Files:**
- Modify: `src/components/servico-row.tsx` (whole file)
- Modify: `src/components/produto-row.tsx` (whole file)
- Modify: `src/components/plano-carreira-row.tsx` (whole file)
- Modify: `src/app/admin/servicos/page.tsx:27,34-39`
- Modify: `src/app/admin/produtos/page.tsx:29,38-43`
- Modify: `src/app/admin/planos-carreira/page.tsx:27,34-39`

**Interfaces:**
- Consumes: `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell` from `@/components/ui/table`.
- Produces: no signature change — `ServicoRow`/`ProdutoRow`/`PlanoCarreiraRow` keep the exact same props (`{ servico }`, `{ produto }`, `{ plano }`) other tasks/files already depend on; only their internal JSX changes from `<tr>`/`<td>` to `<TableRow>`/`<TableCell>`.

- [ ] **Step 1: Restyle `ServicoRow`**

Replace `src/components/servico-row.tsx` in full:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TableRow, TableCell } from '@/components/ui/table'

type Servico = { id: string; nome: string; duracao_minutos: number; preco: number; ativo: boolean }

export function ServicoRow({ servico }: { servico: Servico }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(servico.nome)
  const [duracaoMinutos, setDuracaoMinutos] = useState(servico.duracao_minutos)
  const [preco, setPreco] = useState(servico.preco)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('servicos').update({ nome, duracao_minutos: duracaoMinutos, preco }).eq('id', servico.id)
    setSalvando(false)
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setNome(servico.nome)
    setDuracaoMinutos(servico.duracao_minutos)
    setPreco(servico.preco)
    setEditando(false)
  }

  async function alternarAtivo() {
    const supabase = getBrowserSupabaseClient()
    await supabase.from('servicos').update({ ativo: !servico.ativo }).eq('id', servico.id)
    router.refresh()
  }

  if (editando) {
    return (
      <TableRow>
        <TableCell><Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-32" /></TableCell>
        <TableCell><Input type="number" value={duracaoMinutos} onChange={(e) => setDuracaoMinutos(Number(e.target.value))} className="w-20" /></TableCell>
        <TableCell><Input type="number" step="0.01" value={preco} onChange={(e) => setPreco(Number(e.target.value))} className="w-24" /></TableCell>
        <TableCell className="flex gap-2">
          <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
          <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow className={servico.ativo ? '' : 'opacity-50'}>
      <TableCell>{servico.nome}</TableCell>
      <TableCell>{servico.duracao_minutos}min</TableCell>
      <TableCell>R$ {servico.preco}</TableCell>
      <TableCell className="flex gap-2">
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">Editar</button>
        <button type="button" onClick={alternarAtivo} className="text-xs text-destructive underline">{servico.ativo ? 'Desativar' : 'Reativar'}</button>
      </TableCell>
    </TableRow>
  )
}
```

- [ ] **Step 2: Restyle `ProdutoRow`**

Replace `src/components/produto-row.tsx` in full:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TableRow, TableCell } from '@/components/ui/table'

type Produto = {
  id: string
  nome: string
  categoria: string | null
  preco_venda: number
  quantidade_estoque: number
  estoque_minimo: number
  ativo: boolean
}

export function ProdutoRow({ produto }: { produto: Produto }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(produto.nome)
  const [categoria, setCategoria] = useState(produto.categoria ?? '')
  const [precoVenda, setPrecoVenda] = useState(produto.preco_venda)
  const [quantidadeEstoque, setQuantidadeEstoque] = useState(produto.quantidade_estoque)
  const [estoqueMinimo, setEstoqueMinimo] = useState(produto.estoque_minimo)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('produtos').update({
      nome, categoria: categoria || null, preco_venda: precoVenda,
      quantidade_estoque: quantidadeEstoque, estoque_minimo: estoqueMinimo,
    }).eq('id', produto.id)
    setSalvando(false)
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setNome(produto.nome)
    setCategoria(produto.categoria ?? '')
    setPrecoVenda(produto.preco_venda)
    setQuantidadeEstoque(produto.quantidade_estoque)
    setEstoqueMinimo(produto.estoque_minimo)
    setEditando(false)
  }

  async function alternarAtivo() {
    const supabase = getBrowserSupabaseClient()
    await supabase.from('produtos').update({ ativo: !produto.ativo }).eq('id', produto.id)
    router.refresh()
  }

  if (editando) {
    return (
      <TableRow>
        <TableCell><Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-32" /></TableCell>
        <TableCell><Input value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-28" /></TableCell>
        <TableCell><Input type="number" step="0.01" value={precoVenda} onChange={(e) => setPrecoVenda(Number(e.target.value))} className="w-24" /></TableCell>
        <TableCell>
          <Input type="number" value={quantidadeEstoque} onChange={(e) => setQuantidadeEstoque(Number(e.target.value))} className="w-20" />
        </TableCell>
        <TableCell className="flex gap-2">
          <Input type="number" value={estoqueMinimo} onChange={(e) => setEstoqueMinimo(Number(e.target.value))} className="w-20" />
          <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
          <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow className={`${produto.ativo ? '' : 'opacity-50'} ${produto.quantidade_estoque <= produto.estoque_minimo ? 'text-destructive' : ''}`}>
      <TableCell>{produto.nome}</TableCell>
      <TableCell>{produto.categoria}</TableCell>
      <TableCell>R$ {produto.preco_venda}</TableCell>
      <TableCell>{produto.quantidade_estoque}</TableCell>
      <TableCell className="flex gap-2">
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">Editar</button>
        <button type="button" onClick={alternarAtivo} className="text-xs text-destructive underline">{produto.ativo ? 'Desativar' : 'Reativar'}</button>
      </TableCell>
    </TableRow>
  )
}
```

- [ ] **Step 3: Restyle `PlanoCarreiraRow`**

Replace `src/components/plano-carreira-row.tsx` in full:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TableRow, TableCell } from '@/components/ui/table'

type Plano = { id: string; nome: string; percentual_produto: number; percentual_servico: number; ativo: boolean }

export function PlanoCarreiraRow({ plano }: { plano: Plano }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(plano.nome)
  const [percentualProduto, setPercentualProduto] = useState(plano.percentual_produto)
  const [percentualServico, setPercentualServico] = useState(plano.percentual_servico)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('planos_carreira').update({
      nome, percentual_produto: percentualProduto, percentual_servico: percentualServico,
    }).eq('id', plano.id)
    setSalvando(false)
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setNome(plano.nome)
    setPercentualProduto(plano.percentual_produto)
    setPercentualServico(plano.percentual_servico)
    setEditando(false)
  }

  async function alternarAtivo() {
    const supabase = getBrowserSupabaseClient()
    await supabase.from('planos_carreira').update({ ativo: !plano.ativo }).eq('id', plano.id)
    router.refresh()
  }

  if (editando) {
    return (
      <TableRow>
        <TableCell><Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-32" /></TableCell>
        <TableCell><Input type="number" step="0.01" value={percentualProduto} onChange={(e) => setPercentualProduto(Number(e.target.value))} className="w-24" /></TableCell>
        <TableCell><Input type="number" step="0.01" value={percentualServico} onChange={(e) => setPercentualServico(Number(e.target.value))} className="w-24" /></TableCell>
        <TableCell className="flex gap-2">
          <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
          <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow className={plano.ativo ? '' : 'opacity-50'}>
      <TableCell>{plano.nome}</TableCell>
      <TableCell>{plano.percentual_produto}%</TableCell>
      <TableCell>{plano.percentual_servico}%</TableCell>
      <TableCell className="flex gap-2">
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">Editar</button>
        <button type="button" onClick={alternarAtivo} className="text-xs text-destructive underline">{plano.ativo ? 'Desativar' : 'Reativar'}</button>
      </TableCell>
    </TableRow>
  )
}
```

- [ ] **Step 4: Brand the heading and wrap the servicos table in `Table`**

In `src/app/admin/servicos/page.tsx`, change:

```tsx
      <h1 className="text-xl font-semibold mb-4">Serviços</h1>
```

to:

```tsx
      <h1 className="font-heading text-2xl font-bold mb-4">Serviços</h1>
```

And change:

```tsx
      <table className="w-full text-left">
        <thead><tr><th>Nome</th><th>Duração</th><th>Preço</th><th>Ações</th></tr></thead>
        <tbody>
          {servicos?.map((s) => <ServicoRow key={s.id} servico={s} />)}
        </tbody>
      </table>
```

to:

```tsx
      <Table>
        <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Duração</TableHead><TableHead>Preço</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
        <TableBody>
          {servicos?.map((s) => <ServicoRow key={s.id} servico={s} />)}
        </TableBody>
      </Table>
```

and add `import { Table, TableHeader, TableBody, TableRow, TableHead } from '@/components/ui/table'` alongside the file's existing imports.

- [ ] **Step 5: Same for produtos**

In `src/app/admin/produtos/page.tsx`, change:

```tsx
      <h1 className="text-xl font-semibold mb-4">Produtos</h1>
```

to:

```tsx
      <h1 className="font-heading text-2xl font-bold mb-4">Produtos</h1>
```

And change:

```tsx
      <table className="w-full text-left">
        <thead><tr><th>Nome</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th>Ações</th></tr></thead>
        <tbody>
          {produtos?.map((p) => <ProdutoRow key={p.id} produto={p} />)}
        </tbody>
      </table>
```

to:

```tsx
      <Table>
        <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Categoria</TableHead><TableHead>Preço</TableHead><TableHead>Estoque</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
        <TableBody>
          {produtos?.map((p) => <ProdutoRow key={p.id} produto={p} />)}
        </TableBody>
      </Table>
```

and add `import { Table, TableHeader, TableBody, TableRow, TableHead } from '@/components/ui/table'` alongside the file's existing imports.

- [ ] **Step 6: Same for planos de carreira**

In `src/app/admin/planos-carreira/page.tsx`, change:

```tsx
      <h1 className="text-xl font-semibold mb-4">Planos de carreira</h1>
```

to:

```tsx
      <h1 className="font-heading text-2xl font-bold mb-4">Planos de carreira</h1>
```

And change:

```tsx
      <table className="w-full text-left">
        <thead><tr><th>Nome</th><th>% produto</th><th>% serviço</th><th>Ações</th></tr></thead>
        <tbody>
          {planos?.map((p) => <PlanoCarreiraRow key={p.id} plano={p} />)}
        </tbody>
      </table>
```

to:

```tsx
      <Table>
        <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>% produto</TableHead><TableHead>% serviço</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
        <TableBody>
          {planos?.map((p) => <PlanoCarreiraRow key={p.id} plano={p} />)}
        </TableBody>
      </Table>
```

and add `import { Table, TableHeader, TableBody, TableRow, TableHead } from '@/components/ui/table'` alongside the file's existing imports.

- [ ] **Step 7: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 8: Manual verification**

As `admin@teste.com`, open `/admin/servicos`, `/admin/produtos`, `/admin/planos-carreira`. Confirm each table has proper row padding/separators (not cramped text touching cell edges), "Editar"/"Reativar" read in gold and "Desativar" in the rust-red destructive color, and an inactive row is visibly dimmed (not just technically `opacity-50` but actually legible-but-muted against the dark background — check by desativando one item on each page). Confirm editing still works (type into a field, Salvar, value persists).

- [ ] **Step 9: Commit**

```bash
git add src/components/servico-row.tsx src/components/produto-row.tsx src/components/plano-carreira-row.tsx src/app/admin/servicos/page.tsx src/app/admin/produtos/page.tsx src/app/admin/planos-carreira/page.tsx
git commit -m "feat: restyle catalog tables (serviços, produtos, planos) with Table component and theme colors"
```

---

### Task 5: Barbeiros e Prospecção

**Files:**
- Modify: `src/app/admin/barbeiros/page.tsx` (whole file)
- Modify: `src/app/admin/prospeccao/page.tsx:90-104` (the `<table>` block)
- Modify: `src/app/painel/prospeccao/page.tsx` (whole file)

**Interfaces:**
- Consumes: `Table` family, same as Task 4.

- [ ] **Step 1: Restyle the barbeiros page**

Replace `src/app/admin/barbeiros/page.tsx` in full:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Button } from '@/components/ui/button'

async function vincularPlano(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const metaRaw = formData.get('meta_prospeccao_dia') as string
  const meta = metaRaw === '' ? null : Number(metaRaw)

  await supabase
    .from('membros')
    .update({
      plano_carreira_id: (formData.get('plano_carreira_id') as string) || null,
      meta_prospeccao_dia: meta,
    })
    .eq('id', formData.get('membro_id') as string)
  revalidatePath('/admin/barbeiros')
}

export default async function BarbeirosPage() {
  const supabase = await getServerSupabaseClient()
  const { data: barbeiros } = await supabase.from('membros').select('*').eq('papel', 'barbeiro').order('nome')
  const { data: planos } = await supabase.from('planos_carreira').select('*')

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Barbeiros</h1>
      {barbeiros?.map((b) => (
        <form
          key={`${b.id}-${b.plano_carreira_id ?? 'none'}-${b.meta_prospeccao_dia ?? 'none'}`}
          action={vincularPlano}
          className="flex gap-2 items-center mb-2 border-b pb-2"
        >
          <input type="hidden" name="membro_id" value={b.id} />
          <span className="w-32">{b.nome}</span>
          <select name="plano_carreira_id" defaultValue={b.plano_carreira_id ?? ''} className="border rounded px-2 py-1 bg-input">
            <option value="">Sem plano</option>
            {planos?.filter((p) => p.ativo || p.id === b.plano_carreira_id).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <input
            name="meta_prospeccao_dia"
            type="number"
            defaultValue={b.meta_prospeccao_dia ?? ''}
            placeholder="Meta diária de contatos"
            className="border rounded px-2 py-1 w-48 bg-input"
          />
          <Button type="submit" variant="outline">Salvar</Button>
        </form>
      ))}
    </div>
  )
}
```

(The only functional change from today: `<button className="border rounded px-3 py-1">` becomes the themed `Button` component; `bg-input` on the two form controls gives them the same subtle surface as everywhere else instead of a bare unstyled `<select>`/`<input>`.)

- [ ] **Step 2: Wrap the admin prospecção report table in `Table`**

In `src/app/admin/prospeccao/page.tsx`, change:

```tsx
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th>Nome</th><th>Telefone</th><th>Prospecção</th><th>Atendimento</th>
            <th>Serviços</th><th>Produtos</th><th>Total</th><th>Profissional</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-t">
              <td>{l.nome}</td>
              <td>{l.telefone}</td>
              <td>{new Date(l.data).toLocaleDateString()}</td>
              <td>{l.convertido_em ? new Date(l.convertido_em).toLocaleDateString() : '—'}</td>
              <td>{l.servicosTexto}</td>
              <td>{l.produtosTexto}</td>
              <td>R$ {l.valorTotal.toFixed(2)}</td>
              <td>{l.membros?.nome ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
```

to:

```tsx
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead><TableHead>Telefone</TableHead><TableHead>Prospecção</TableHead><TableHead>Atendimento</TableHead>
            <TableHead>Serviços</TableHead><TableHead>Produtos</TableHead><TableHead>Total</TableHead><TableHead>Profissional</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((l, i) => (
            <TableRow key={i}>
              <TableCell>{l.nome}</TableCell>
              <TableCell>{l.telefone}</TableCell>
              <TableCell>{new Date(l.data).toLocaleDateString()}</TableCell>
              <TableCell>{l.convertido_em ? new Date(l.convertido_em).toLocaleDateString() : '—'}</TableCell>
              <TableCell>{l.servicosTexto}</TableCell>
              <TableCell>{l.produtosTexto}</TableCell>
              <TableCell>R$ {l.valorTotal.toFixed(2)}</TableCell>
              <TableCell>{l.membros?.nome ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
```

and add `import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'` alongside the file's existing imports. Also change the page's `<h1 className="text-xl font-semibold mb-4">Conversão de prospecção</h1>` to `<h1 className="font-heading text-2xl font-bold mb-4">Conversão de prospecção</h1>`.

- [ ] **Step 3: Restyle the barbeiro's prospecção page**

Replace `src/app/painel/prospeccao/page.tsx` in full:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ProspeccaoStatusForm } from '@/components/prospeccao-status-form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

async function novoContato(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()

  const nome = formData.get('nome') as string
  const telefone = formData.get('telefone') as string

  const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
    p_barbearia_id: membro!.barbearia_id, p_nome: nome, p_telefone: telefone,
  })
  if (clienteId.error) return

  await supabase.from('prospeccoes').insert({
    barbearia_id: membro!.barbearia_id,
    membro_id: membro!.id,
    nome,
    telefone,
    cliente_id: clienteId.data,
    canal: (formData.get('canal') as string) || null,
    oferta_corte_gratis: formData.get('oferta_corte_gratis') === 'on',
  })
  revalidatePath('/painel/prospeccao')
}

export default async function ProspeccaoPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id, meta_prospeccao_dia').eq('user_id', user!.id).single()

  const hoje = new Date().toISOString().slice(0, 10)
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

  const { data: contatosHoje } = await supabase.from('prospeccoes').select('id').eq('membro_id', membro!.id).eq('data', hoje)
  const { data: convertidosHoje } = await supabase.from('prospeccoes').select('id').eq('membro_id', membro!.id).gte('convertido_em', `${hoje}T00:00:00`)
  const { data: pendentes } = await supabase.from('prospeccoes').select('*').eq('membro_id', membro!.id).in('status', ['novo_lead', 'em_contato', 'interessado']).order('criado_em')
  const { data: contatosMes } = await supabase.from('prospeccoes').select('status').eq('membro_id', membro!.id).gte('data', inicioMes)

  const totalContatosHoje = contatosHoje?.length ?? 0
  const meta = membro!.meta_prospeccao_dia ?? 0
  const totalMes = contatosMes?.length ?? 0
  const convertidosMes = contatosMes?.filter((c) => c.status === 'convertido').length ?? 0
  const naoConvertidosMes = contatosMes?.filter((c) => c.status === 'nao_convertido').length ?? 0
  const finalizadosMes = convertidosMes + naoConvertidosMes
  const taxaMes = finalizadosMes > 0 ? Math.round((convertidosMes / finalizadosMes) * 100) : 0

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Prospecção</h1>

      {meta > 0 && (
        <>
          <p className="text-sm mb-1">Meta diária de contatos</p>
          <div className="w-full bg-muted rounded h-6 overflow-hidden">
            <div className="bg-primary h-full text-primary-foreground text-xs flex items-center justify-center" style={{ width: `${Math.min((totalContatosHoje / meta) * 100, 100)}%` }}>
              {totalContatosHoje} / {meta}
            </div>
          </div>
        </>
      )}

      <form action={novoContato} className="flex gap-2 items-center mt-4 flex-wrap">
        <Input name="nome" placeholder="Nome" required />
        <Input name="telefone" placeholder="Telefone" required />
        <select name="canal" className="border rounded px-2 py-1 bg-input">
          <option value="">Canal (opcional)</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="indicacao">Indicação</option>
          <option value="rua">Na rua</option>
          <option value="redes_sociais">Redes sociais</option>
          <option value="outro">Outro</option>
        </select>
        <label className="text-sm flex items-center gap-1">
          <input type="checkbox" name="oferta_corte_gratis" /> Ofereci corte grátis + consultoria
        </label>
        <Button type="submit">+ Novo contato prospectado</Button>
      </form>

      <h2 className="font-heading text-lg font-semibold mt-6 mb-2">Pendentes de conversão ({pendentes?.length ?? 0})</h2>
      {pendentes?.map((p) => (
        <div key={p.id} className="flex justify-between items-center border-b py-2">
          <span>{p.nome} · {p.telefone} · {p.canal ?? 'sem canal'}{p.oferta_corte_gratis && ' · corte grátis'} · {new Date(p.criado_em).toLocaleDateString()}</span>
          <ProspeccaoStatusForm prospeccaoId={p.id} statusAtual={p.status} />
        </div>
      ))}

      <h2 className="font-heading text-lg font-semibold mt-6 mb-2">Conversão</h2>
      <p>Convertidos hoje: {convertidosHoje?.length ?? 0}</p>
      <p>Taxa de conversão deste mês: {taxaMes}% ({finalizadosMes} finalizados de {totalMes} prospectados — os que ainda não agendaram/compareceram não entram nessa conta)</p>
    </div>
  )
}
```

(Changes from today: `<button className="border rounded px-3 py-1">+ Novo contato prospectado</button>` and the two plain `<input>`s become the themed `Button`/`Input` components; `bg-green-600` on the meta progress bar becomes `bg-primary`; headings get `font-heading`.)

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Manual verification**

As `admin@teste.com`: `/admin/barbeiros` — confirm the "Salvar" button is themed and the selects have a visible dark surface (not transparent/invisible against the page background); `/admin/prospeccao` — confirm the report table has proper spacing. As `barbeiro@teste.com`: `/painel/prospeccao` — register a contact, confirm the "+ Novo contato prospectado" button and inputs are themed, and the daily-goal progress bar fills in gold.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/barbeiros/page.tsx src/app/admin/prospeccao/page.tsx src/app/painel/prospeccao/page.tsx
git commit -m "feat: restyle barbeiros and prospecção pages with theme colors and Table component"
```

---

### Task 6: Agenda

**Files:**
- Modify: `src/app/painel/agenda/page.tsx:14,23`
- Modify: `src/components/agenda-dia.tsx:183,195,197`
- Modify: `src/components/agendar-slot-form.tsx:94-101`
- Verify only (no change expected): `src/components/atender-agora-form.tsx`, `src/components/bloqueio-form.tsx` — see Steps 4 and 7
- Modify: `src/components/lancamento-form.tsx:194,208,225`
- Modify: `src/components/remarcar-form.tsx:59`

**Interfaces:**
- No new interfaces — every change in this task is a `className` swap, none of the forms' props or exported types change.

This is the densest interactive screen in the app — the slot grid is a custom layout, not tabular data, so it keeps its current `<div>`-based structure (no `Table` conversion here). The only work is: (a) the page heading gets the brand font, (b) every hardcoded raw color gets remapped to a theme token, since colors like `bg-amber-50` (near-white) or `text-red-600` (bright red) that read fine on a white background become illegible or jarring on the new dark background.

- [ ] **Step 1: Brand the Agenda page heading**

In `src/app/painel/agenda/page.tsx`, change:

```tsx
      <h1 className="text-xl font-semibold mb-4">Agenda</h1>
```

to:

```tsx
      <h1 className="font-heading text-2xl font-bold mb-4">Agenda</h1>
```

- [ ] **Step 2: Brand the "Bloquear horário" heading and remap the two raw colors in `AgendaDia`**

In `src/app/painel/agenda/page.tsx` (same file as Step 1), also change:

```tsx
      <h2 className="text-lg font-medium mt-8 mb-2">Bloquear horário</h2>
```

to:

```tsx
      <h2 className="font-heading text-lg font-semibold mt-8 mb-2">Bloquear horário</h2>
```

In `src/components/agenda-dia.tsx`, change the cancelar button's color:

```tsx
                      <button type="button" onClick={() => cancelar(agendamento.id)} className="text-red-600 text-xs">cancelar</button>
```

(this exact line appears **twice** in the file — once inside the `agendado`-status action block, once inside the `confirmado`-status action block — change **both** occurrences) to:

```tsx
                      <button type="button" onClick={() => cancelar(agendamento.id)} className="text-destructive text-xs">cancelar</button>
```

And change the "não compareceu" button:

```tsx
                          {jaPassou && (
                            <button type="button" onClick={() => marcarNaoCompareceu(agendamento.id)} className="text-amber-700 text-xs">não compareceu</button>
                          )}
```

to:

```tsx
                          {jaPassou && (
                            <button type="button" onClick={() => marcarNaoCompareceu(agendamento.id)} className="text-primary text-xs">não compareceu</button>
                          )}
```

- [ ] **Step 3: Restyle the conflict-warning box in `AgendarSlotForm`**

In `src/components/agendar-slot-form.tsx`, change:

```tsx
      {pedindoConfirmacao && (
        <div className="border border-amber-400 bg-amber-50 rounded p-3 flex flex-col gap-2">
```

to:

```tsx
      {pedindoConfirmacao && (
        <div className="border border-primary/40 bg-primary/10 rounded p-3 flex flex-col gap-2">
```

(the rest of that block — the warning text and its two buttons — is unchanged).

- [ ] **Step 4: Confirm `AtenderAgoraForm` needs no color fix**

`src/components/atender-agora-form.tsx` uses only `Button`/`Input`/`ClienteAutocomplete` and a plain `<select>` with `border rounded px-2 py-1` — all already theme-token-driven, no raw colors. No edit needed; just note in your task report that you checked and confirmed this.

- [ ] **Step 5: Remap the raw colors in `LancamentoForm`**

In `src/components/lancamento-form.tsx`, change the page heading:

```tsx
      <h3 className="font-medium">Atender agendamento — {modoAgenda.horaInicio.slice(0, 5)}</h3>
```

to:

```tsx
      <h3 className="font-heading text-base font-semibold">Atender agendamento — {modoAgenda.horaInicio.slice(0, 5)}</h3>
```

Change the "remover" button for a serviço:

```tsx
            <button type="button" onClick={() => removerServico(index)} className="text-red-600 text-xs">remover</button>
```

to:

```tsx
            <button type="button" onClick={() => removerServico(index)} className="text-destructive text-xs">remover</button>
```

Change the "remover" button for a produto:

```tsx
            <button type="button" onClick={() => removerProduto(p.id)} className="text-red-600 text-xs">remover</button>
```

to:

```tsx
            <button type="button" onClick={() => removerProduto(p.id)} className="text-destructive text-xs">remover</button>
```

The error message paragraph (`{mensagem && <p className="text-sm">{mensagem}</p>}`) has no color today — leave it as-is (it already inherits `text-foreground`, which is correct for a mix of success and error messages in this shared field).

- [ ] **Step 6: Brand the RemarcarForm heading**

In `src/components/remarcar-form.tsx`, change:

```tsx
      <h3 className="font-medium">Remarcar — {clienteNome}</h3>
```

to:

```tsx
      <h3 className="font-heading text-base font-semibold">Remarcar — {clienteNome}</h3>
```

- [ ] **Step 7: Theme the bloqueio inputs' surface**

In `src/components/bloqueio-form.tsx`, this component already uses only `Input`/`Button` (no raw colors) — no edit needed; note in your report that you checked and confirmed this, same as Step 4.

- [ ] **Step 8: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 9: Manual verification**

As `barbeiro@teste.com`, open `/painel/agenda`. Click a free slot, select a serviço whose duration would collide with an existing agendamento (or use "+ agendar outro aqui" on an occupied slot) to trigger the "Este horário já possui um serviço agendado" warning — confirm it now renders as a legible gold-tinted box, not a washed-out near-white box. Confirm "cancelar" reads in rust-red and "não compareceu" (on a past-due agendamento) reads in gold. Open an atendimento (click an existing agendamento) and add then remove a serviço/produto — confirm "remover" reads in rust-red.

- [ ] **Step 10: Commit**

```bash
git add src/app/painel/agenda/page.tsx src/components/agenda-dia.tsx src/components/agendar-slot-form.tsx src/components/lancamento-form.tsx src/components/remarcar-form.tsx
git commit -m "feat: restyle Agenda and its forms — brand headings, remap raw colors to theme tokens"
```

---

### Task 7: Ficha do cliente e página pública de agendamento

**Files:**
- Modify: `src/components/ficha-cliente.tsx:36-47,60,70`
- Modify: `src/components/public-booking-flow.tsx:78,124,125`

**Interfaces:**
- No interface change — `FichaCliente({ clienteId })` and `PublicBookingFlow({ barbearia, servicos, barbeiros })` keep their exact current signatures.

- [ ] **Step 1: Brand the ficha do cliente and fix its progress bar color**

In `src/components/ficha-cliente.tsx`, change:

```tsx
      <p className="font-medium">{cliente?.nome} · {cliente?.telefone}{cliente?.data_nascimento ? ` · nasc. ${new Date(cliente.data_nascimento).toLocaleDateString()}` : ''}</p>
      <p className="text-xs text-muted-foreground mb-4">Cliente desde {cliente?.criado_em ? new Date(cliente.criado_em).toLocaleDateString() : ''}</p>

      <h3 className="font-medium mt-4 mb-2">Mais usados por ele</h3>
      {ranking?.map((r) => (
        <div key={`${r.tipo}-${r.item}`} className="mb-2">
          <div className="flex justify-between text-sm">
            <span>{r.item}</span>
            <span>{r.quantidade}x · <strong>R$ {Number(r.valor_total).toFixed(2)}</strong></span>
          </div>
          <div className="w-full bg-muted rounded h-2 overflow-hidden">
            <div className="bg-green-600 h-full" style={{ width: `${(r.quantidade / maiorQuantidade) * 100}%` }} />
          </div>
        </div>
      ))}

      <h3 className="font-medium mt-4 mb-2">Histórico completo</h3>
```

to:

```tsx
      <p className="font-heading text-lg font-semibold">{cliente?.nome} · {cliente?.telefone}{cliente?.data_nascimento ? ` · nasc. ${new Date(cliente.data_nascimento).toLocaleDateString()}` : ''}</p>
      <p className="text-xs text-muted-foreground mb-4">Cliente desde {cliente?.criado_em ? new Date(cliente.criado_em).toLocaleDateString() : ''}</p>

      <h3 className="font-heading text-base font-semibold mt-4 mb-2">Mais usados por ele</h3>
      {ranking?.map((r) => (
        <div key={`${r.tipo}-${r.item}`} className="mb-2">
          <div className="flex justify-between text-sm">
            <span>{r.item}</span>
            <span>{r.quantidade}x · <strong>R$ {Number(r.valor_total).toFixed(2)}</strong></span>
          </div>
          <div className="w-full bg-muted rounded h-2 overflow-hidden">
            <div className="bg-primary h-full" style={{ width: `${(r.quantidade / maiorQuantidade) * 100}%` }} />
          </div>
        </div>
      ))}

      <h3 className="font-heading text-base font-semibold mt-4 mb-2">Histórico completo</h3>
```

Also change the two remaining `<h3 className="font-medium mt-4 mb-2">` headings later in the same file ("Agendamentos" and "Prospecção") to `<h3 className="font-heading text-base font-semibold mt-4 mb-2">`.

- [ ] **Step 2: Brand and recolor the public booking flow**

In `src/components/public-booking-flow.tsx`, change:

```tsx
      <h1 className="text-xl font-semibold mb-4">{barbearia.nome}</h1>
```

to:

```tsx
      <h1 className="font-heading text-2xl font-bold mb-4">{barbearia.nome}</h1>
```

Change:

```tsx
          {reconhecimento && <p className="text-sm text-green-700 mt-2">{reconhecimento}</p>}
          {erro && <p className="text-sm text-red-600 mt-2">{erro}</p>}
```

to:

```tsx
          {reconhecimento && <p className="text-sm text-primary mt-2">{reconhecimento}</p>}
          {erro && <p className="text-sm text-destructive mt-2">{erro}</p>}
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual verification**

As either role, open a cliente's ficha (from the agenda or a lançamento) — confirm the client's name renders in the serif heading font and the "mais usados" bars fill in gold, not green. Open the public booking link `/teste` — confirm the barbearia name renders in the serif heading font, and (if you have a way to trigger it) that a recognized-returning-client message renders in gold and an error message renders in rust-red, not the raw green/red from before.

- [ ] **Step 5: Commit**

```bash
git add src/components/ficha-cliente.tsx src/components/public-booking-flow.tsx
git commit -m "feat: restyle ficha do cliente and public booking page with theme colors"
```

---

### Task 8: Regressão final

**Files:** none (verification only).

- [ ] **Step 1: Full automated regression**

Run:
```bash
npm run build
```
Expected: succeeds with no type errors and all routes present.

- [ ] **Step 2: Manual end-to-end visual walkthrough**

Using the dev server, as `admin@teste.com`: `/login`, `/admin`, `/admin/servicos`, `/admin/produtos`, `/admin/planos-carreira`, `/admin/barbeiros`, `/admin/prospeccao`. As `barbeiro@teste.com`: `/painel`, `/painel/agenda` (open a slot, open an atendimento, trigger the conflict warning), `/painel/prospeccao`, a cliente's ficha. As a público visitor: `/teste`. On every screen, confirm: dark warm-black background, cream text, gold accent on primary actions/highlights/values, rust-red only on destructive actions, no leftover pure red/green/amber-on-white from the old theme, and the serif brand font on every page's `<h1>`/`<h2>`/the nav wordmark.

- [ ] **Step 3: No commit for this task** — it's verification-only; if any issue surfaces, fix it as a small follow-up commit referencing which task's step regressed.
