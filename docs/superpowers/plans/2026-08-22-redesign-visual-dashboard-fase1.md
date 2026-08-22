# Redesign Visual — Sistema de Design + Sidebar + Dashboard (Fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a paleta/tipografia atual pela nova ("SF" — fundo `#F6F7F4`, verde `#0F9D6E`, Plus Jakarta Sans + IBM Plex Mono), trocar a nav horizontal do `/painel` por uma sidebar escura fixa (com widget de meta do mês), e reconstruir o Dashboard do barbeiro batendo com o protótipo hi-fi — sem mudar nenhum dado ou cálculo já existente, só a apresentação.

**Architecture:** Tokens de cor/fonte/raio ficam em `src/app/globals.css` (variáveis CSS já usadas por todo o `shadcn`/Tailwind v4 deste projeto) e `src/app/layout.tsx` (fontes via `next/font/google`) — mudam uma vez, no topo, e propagam pra toda a aplicação automaticamente porque toda página já usa o componente `Card` e os utilitários Tailwind ligados a essas variáveis. A sidebar é um novo client component (`src/components/painel/sidebar.tsx`) que substitui a `<nav>` de `src/app/painel/layout.tsx`, que passa a buscar também `meta_faturamento_mes` e o faturamento do mês corrente (mesma soma que `painel/page.tsx` já faz, replicada ali porque a sidebar aparece em toda página do painel). O Dashboard (`src/app/painel/page.tsx`) mantém 100% da lógica de busca/cálculo já existente — só a árvore JSX final muda, usando dois componentes novos e pequenos (`KpiCard`, `DonutChart`) para os blocos que se repetem.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui, Supabase.

**Spec:** `docs/superpowers/specs/2026-08-22-redesign-visual-dashboard-fase1-design.md`

## Global Constraints

- **Nenhum dado ou cálculo muda** — todas as somas, RPCs e classificações já existentes em `painel/page.tsx` continuam idênticas; só a apresentação (JSX/estilo) é reescrita.
- **Tokens são globais**: mudar `--primary`, `--background`, `--border`, etc. em `globals.css` afeta automaticamente `/painel/*` (não redesenhado ainda), `/admin/*`, `/login` e a página pública `/[barbeariaSlug]` — isso é esperado e faz parte da Fase 1 (ver spec).
- **Sparkline de faturamento do protótipo é omitido** (exigiria uma consulta de série temporal nova, fora de escopo) — vira chip "+N transações" no lugar.
- **A barra de progresso de meta que hoje vive dentro do card "Faturamento do mês" é removida dali** — a meta passa a viver só no widget da sidebar.
- **Resumo de "Sonhos" no Dashboard é mantido** (o protótipo não o mostra, mas é decisão explícita de não remover funcionalidade existente), só reestilizado.
- **Diagnóstico preserva os 3 estados visuais** (`positivo` verde-com-ícone / `neutro` sem destaque / os 3 tipos de alerta em âmbar) — o protótipo só mostra o estado `positivo`, mas isso é porque seu dado de exemplo caiu nesse estado, não porque os outros dois estados devem desaparecer.
- **"Novo atendimento" (header) e o seletor de mês são inertes nesta fase** (sem `onClick`/navegação nova) — só existem visualmente pra bater com o protótipo.
- **`nav-links.tsx` e `src/app/admin/layout.tsx` não são tocados** — a sidebar nova implementa sua própria lógica de rota-ativa internamente, para não arriscar quebrar a nav do admin (que reaproveita `nav-links.tsx` sem nenhuma mudança nesta fase).

---

### Task 1: Tokens de design (cores, fontes, raio) e `Card`

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/ui/card.tsx`

**Interfaces:**
- Produces: variáveis CSS `--color-emerald-tint`, `--color-emerald-tint-border`, `--color-emerald-dark`, `--color-amber`, `--color-amber-text`, `--color-amber-tint`, `--color-indigo`, `--color-indigo-tint`, `--color-sidebar-bg`, `--color-sidebar-fg`, `--color-sidebar-muted`, `--color-sidebar-icon` — utilizáveis como classes Tailwind (`bg-emerald-tint`, `text-amber-text`, etc.) pelas Tasks 2 e 3.

- [ ] **Step 1: Atualizar `src/app/globals.css`**

Substituir o conteúdo inteiro do arquivo por:

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
  --color-emerald-tint: var(--emerald-tint);
  --color-emerald-tint-border: var(--emerald-tint-border);
  --color-emerald-dark: var(--emerald-dark);
  --color-amber: var(--amber);
  --color-amber-text: var(--amber-text);
  --color-amber-tint: var(--amber-tint);
  --color-indigo: var(--indigo);
  --color-indigo-tint: var(--indigo-tint);
  --color-sidebar-bg: var(--sidebar-bg);
  --color-sidebar-fg: var(--sidebar-fg);
  --color-sidebar-muted: var(--sidebar-muted);
  --color-sidebar-icon: var(--sidebar-icon);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

:root {
  --background: #F6F7F4;
  --foreground: #16201C;
  --card: #ffffff;
  --card-foreground: #16201C;
  --popover: #ffffff;
  --popover-foreground: #16201C;
  --primary: #0F9D6E;
  --primary-foreground: #06231A;
  --secondary: #F0F1EE;
  --secondary-foreground: #16201C;
  --muted: #F0F1EE;
  --muted-foreground: #8A968F;
  --accent: #F0F1EE;
  --accent-foreground: #16201C;
  --destructive: #dc2626;
  --border: #E8E9E5;
  --input: #E4E6E1;
  --ring: #0F9D6E;
  --radius: 0.85rem;

  --emerald-tint: #EAF6F0;
  --emerald-tint-border: #CFE8DC;
  --emerald-dark: #0B7F58;
  --amber: #E0942F;
  --amber-text: #B26A00;
  --amber-tint: #FDF3E3;
  --indigo: #5B5BD6;
  --indigo-tint: #EEEEFB;
  --sidebar-bg: #101A16;
  --sidebar-fg: #E8EFEA;
  --sidebar-muted: #7E8C85;
  --sidebar-icon: #8FE3C2;
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

- [ ] **Step 2: Trocar as fontes em `src/app/layout.tsx`**

Substituir o conteúdo inteiro do arquivo por:

```tsx
import type { Metadata } from "next";
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Seu Fernandes",
  description: "Sistema de gestão da barbearia Seu Fernandes",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${plusJakartaSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

Nota: as variáveis CSS continuam se chamando `--font-geist-sans`/`--font-geist-mono` (mesmo carregando fontes diferentes agora) — é assim que `globals.css` já as referencia (`--font-mono: var(--font-geist-mono)`), então não é necessário tocar em mais nada além da fonte carregada.

- [ ] **Step 3: Trocar o `ring` do `Card` por borda + sombra**

Em `src/components/ui/card.tsx`, na função `Card`, trocar:

```
ring-1 ring-foreground/10
```

por:

```
border border-border shadow-[0_1px_2px_rgba(20,32,27,0.04)]
```

(mantendo todas as outras classes do `cn(...)` exatamente como estão).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 5: Verificação visual manual**

Se um navegador estiver disponível: abrir `/login` e confirmar que o fundo mudou pra um branco levemente esverdeado (`#F6F7F4`), a fonte mudou (Plus Jakarta Sans, visivelmente diferente de Geist), e o botão "Entrar" tem fundo verde `#0F9D6E` com texto escuro (não mais branco). Login como barbeiro ou admin e confirmar que os cards existentes (ainda não redesenhados) já aparecem com borda + sombra sutil em vez do ring anterior — é o efeito esperado da Task 1 se propagando antes das Tasks 2–3.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx src/components/ui/card.tsx
git commit -m "feat: update design tokens to new SF visual identity (fase 1)"
```

---

### Task 2: Sidebar do painel + widget de meta do mês

**Files:**
- Create: `src/components/painel/sidebar.tsx`
- Modify: `src/app/painel/layout.tsx`
- Modify: `src/components/sign-out-button.tsx`

**Interfaces:**
- Consumes: tokens `--color-sidebar-*`, `--color-emerald-*` da Task 1.
- Produces: `PainelSidebar` component, `SignOutButton` agora aceita `className?: string` opcional (Task 3 não usa isso, mas outros consumidores existentes — `src/app/admin/layout.tsx` — continuam funcionando sem passar a prop).

- [ ] **Step 1: `SignOutButton` aceita `className` opcional**

Substituir `src/components/sign-out-button.tsx` por:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

export function SignOutButton({ className }: { className?: string } = {}) {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = getBrowserSupabaseClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button onClick={handleSignOut} className={cn('text-sm text-muted-foreground hover:text-primary underline', className)}>
      Sair
    </button>
  )
}
```

- [ ] **Step 2: Criar `src/components/painel/sidebar.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SignOutButton } from '@/components/sign-out-button'

const ICON_PATHS: Record<string, React.ReactNode> = {
  '/painel': (
    <>
      <rect x="3" y="3" width="7" height="8" rx="2" />
      <rect x="14" y="3" width="7" height="5" rx="2" />
      <rect x="3" y="15" width="7" height="6" rx="2" />
      <rect x="14" y="11" width="7" height="10" rx="2" />
    </>
  ),
  '/painel/agenda': (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  '/painel/prospeccao': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
    </>
  ),
  '/painel/clientes': (
    <>
      <circle cx="9" cy="8" r="3.6" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5.5a3.5 3.5 0 0 1 0 7M17.5 14.4c2.1.8 3.5 2.6 3.5 5.6" />
    </>
  ),
  '/painel/sonhos': (
    <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9L3.5 9.7l5.9-.8z" />
  ),
}

function NavIcon({ href }: { href: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--color-sidebar-icon)" strokeWidth="1.8" className="shrink-0">
      {ICON_PATHS[href]}
    </svg>
  )
}

export function PainelSidebar({
  navItems, nomeMembro, faturamentoMes, metaFaturamentoMes,
}: {
  navItems: { href: string; label: string }[]
  nomeMembro: string
  faturamentoMes: number
  metaFaturamentoMes: number | null
}) {
  const pathname = usePathname()
  // Mesmo critério de nav-links.tsx (href mais longo que casa), reimplementado
  // aqui em vez de reaproveitado — a sidebar é visualmente muito diferente da
  // nav horizontal do admin, e nav-links.tsx não pode mudar nesta fase.
  const ativoHref = navItems
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  const iniciais = nomeMembro.trim().split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase()

  return (
    <aside className="w-[250px] shrink-0 bg-sidebar-bg text-sidebar-fg px-[18px] py-[26px] flex flex-col gap-[30px] sticky top-0 h-screen overflow-y-auto">
      <div className="flex items-center gap-[11px] px-2">
        <div className="w-[38px] h-[38px] rounded-[12px] bg-primary flex items-center justify-center font-extrabold text-[15px] text-primary-foreground shrink-0">SF</div>
        <div className="flex flex-col leading-[1.15]">
          <span className="text-sm font-bold tracking-tight">Seu Fernandes</span>
          <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-sidebar-muted">Barbearia</span>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {navItems.map((item) => {
          const ativo = item.href === ativoHref
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center gap-3 px-3 py-[11px] rounded-xl text-sm font-semibold text-sidebar-fg hover:bg-white/[0.06] ${ativo ? 'bg-primary/[0.18] shadow-[inset_2px_0_0_var(--color-primary)]' : ''}`}
            >
              <NavIcon href={item.href} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3.5">
        {metaFaturamentoMes != null && metaFaturamentoMes > 0 && (
          <div className="rounded-2xl bg-white/5 border border-white/[0.07] p-4">
            <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-sidebar-muted mb-2">Meta do mês</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold tracking-tight">R$ {faturamentoMes.toFixed(0)}</span>
              <span className="text-xs text-sidebar-muted">/ R$ {metaFaturamentoMes.toFixed(0)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 mt-2.5 overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min((faturamentoMes / metaFaturamentoMes) * 100, 100)}%` }} />
            </div>
          </div>
        )}
        <div className="flex items-center gap-[11px] px-2 py-1.5">
          <div className="w-[34px] h-[34px] rounded-[11px] bg-[#25352D] flex items-center justify-center text-[13px] font-bold text-sidebar-icon shrink-0">{iniciais}</div>
          <div className="flex flex-col leading-tight flex-1 min-w-0">
            <span className="text-[13px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis">{nomeMembro}</span>
            <span className="text-[11px] text-sidebar-muted">Barbeiro</span>
          </div>
          <SignOutButton className="text-sidebar-muted hover:text-sidebar-fg text-xs font-semibold no-underline shrink-0" />
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Ligar a sidebar em `src/app/painel/layout.tsx`**

Substituir o arquivo inteiro por:

```tsx
import { redirect } from 'next/navigation'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { PainelSidebar } from '@/components/painel/sidebar'

const NAV_ITEMS = [
  { href: '/painel', label: 'Dashboard' },
  { href: '/painel/agenda', label: 'Agenda' },
  { href: '/painel/prospeccao', label: 'Prospecção' },
  { href: '/painel/clientes', label: 'Clientes' },
  { href: '/painel/sonhos', label: 'Sonhos' },
]

export default async function BarbeiroLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membro } = await supabase
    .from('membros')
    .select('id, nome, papel, meta_faturamento_mes')
    .eq('user_id', user.id)
    .single()

  if (!membro) {
    await supabase.auth.signOut()
    redirect('/login')
  }

  if (membro.papel !== 'barbeiro') redirect('/')

  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

  const { data: atendimentosMes } = await supabase
    .from('atendimentos')
    .select('preco')
    .eq('membro_id', membro.id)
    .gte('data', inicioMes)
  const { data: vendasMes } = await supabase
    .from('vendas_produtos')
    .select('preco_unitario, quantidade')
    .eq('membro_id', membro.id)
    .gte('data', inicioMes)

  const faturamentoMes =
    (atendimentosMes ?? []).reduce((s, a) => s + Number(a.preco), 0) +
    (vendasMes ?? []).reduce((s, v) => s + Number(v.preco_unitario) * v.quantidade, 0)

  return (
    <div className="flex min-h-screen items-stretch">
      <PainelSidebar
        navItems={NAV_ITEMS}
        nomeMembro={membro.nome}
        faturamentoMes={faturamentoMes}
        metaFaturamentoMes={membro.meta_faturamento_mes}
      />
      <div className="flex-1 min-w-0 p-6 md:p-8 lg:p-10">{children}</div>
    </div>
  )
}
```

Nota sobre `meta_faturamento_mes`: o tipo já é `numeric(10,2) | null` no banco — o Supabase client devolve `number | null` diretamente pra colunas numéricas simples selecionadas fora de RPC (diferente do caso de RPCs sem `returns table`, que devolvem string — ver comentários já existentes em `painel/page.tsx` sobre isso). `membro.meta_faturamento_mes` já é usado como `number | null` em `painel/page.tsx:228` hoje sem conversão, então este código segue o mesmo padrão.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 5: Verificação visual manual**

Login como barbeiro. Confirmar: sidebar escura à esquerda, com os 5 links e destaque visual (fundo verde translúcido + barra verde à esquerda) no link da página atual; navegar entre `/painel`, `/painel/agenda`, `/painel/clientes`, `/painel/sonhos`, `/painel/prospeccao` e confirmar que o destaque muda corretamente. Se o barbeiro logado tiver `meta_faturamento_mes` cadastrada (via `/admin/barbeiros`), confirmar que o widget "Meta do mês" aparece com o valor e a barra de progresso corretos; se não tiver, confirmar que o widget não aparece (sem espaço vazio estranho). Confirmar que "Sair" funciona a partir da sidebar.

- [ ] **Step 6: Commit**

```bash
git add src/components/painel/sidebar.tsx src/app/painel/layout.tsx src/components/sign-out-button.tsx
git commit -m "feat: replace painel top nav with sidebar shell + meta do mês widget"
```

---

### Task 3: Dashboard redesenhado

**Files:**
- Create: `src/components/painel/kpi-card.tsx`
- Create: `src/components/painel/donut-chart.tsx`
- Modify: `src/app/painel/page.tsx`

**Interfaces:**
- Consumes: `PainelSidebar`/tokens das Tasks 1–2 (indiretamente, via layout já trocado).
- Produces: nada consumido por tasks futuras desta fase (é a última tela desta fase).

- [ ] **Step 1: Criar `src/components/painel/kpi-card.tsx`**

```tsx
import { Card, CardContent } from '@/components/ui/card'

type ChipTone = 'primary' | 'amber' | 'indigo' | 'neutral'

const CHIP_CLASSES: Record<ChipTone, string> = {
  primary: 'text-emerald-dark bg-emerald-tint',
  amber: 'text-amber-text bg-amber-tint',
  indigo: 'text-indigo bg-indigo-tint',
  neutral: 'text-muted-foreground bg-muted',
}

export function KpiCard({
  label, value, chip, barPercent, barColor = 'bg-primary', caption,
}: {
  label: string
  value: string
  chip?: { text: string; tone: ChipTone }
  barPercent?: number
  barColor?: string
  caption?: string
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="font-mono text-[10px] tracking-[0.13em] uppercase text-muted-foreground">{label}</p>
        <div className="flex items-baseline flex-wrap gap-2 my-3">
          <span className="text-[28px] font-extrabold tracking-tight tabular-nums whitespace-nowrap">{value}</span>
          {chip && (
            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${CHIP_CLASSES[chip.tone]}`}>{chip.text}</span>
          )}
        </div>
        {barPercent !== undefined && (
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(Math.max(barPercent, 0), 100)}%` }} />
          </div>
        )}
        {caption && <p className="text-[11.5px] text-muted-foreground mt-2">{caption}</p>}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Criar `src/components/painel/donut-chart.tsx`**

```tsx
export function DonutChart({
  segments, centerValue, centerLabel,
}: {
  segments: { value: number; color: string }[]
  centerValue: string
  centerLabel: string
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  let acc = 0
  const stops = segments.map((seg) => {
    const start = total > 0 ? (acc / total) * 100 : 0
    acc += seg.value
    const end = total > 0 ? (acc / total) * 100 : 0
    return `${seg.color} ${start}% ${end}%`
  })
  const gradient = stops.length > 0 && total > 0 ? `conic-gradient(${stops.join(', ')})` : '#F0F1EE'

  return (
    <div className="w-[118px] h-[118px] shrink-0 rounded-full flex items-center justify-center" style={{ background: gradient }}>
      <div className="w-[78px] h-[78px] rounded-full bg-card flex flex-col items-center justify-center leading-[1.1]">
        <span className="text-xl font-extrabold tracking-tight">{centerValue}</span>
        <span className="text-[10px] text-muted-foreground">{centerLabel}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Reescrever `src/app/painel/page.tsx`**

Manter **linhas 1–206 do arquivo atual inalteradas** (todos os imports — adicionando os dois novos abaixo —, tipos, `agruparPorId`, e toda a busca/cálculo de dados dentro de `BarbeiroDashboardPage`, até o fim do bloco `sonhosComProgresso`). Adicionar aos imports do topo:

```tsx
import { KpiCard } from '@/components/painel/kpi-card'
import { DonutChart } from '@/components/painel/donut-chart'
```

Logo antes do `return (`, adicionar os novos valores derivados (nenhum deles busca dado novo — todos vêm de variáveis que já existem no escopo da função):

```tsx
  const transacoesCount = atendimentos.length + vendas.length
  const comissaoTotal = comissaoCortes + comissaoExtras + comissaoProdutos
  const percentualComissaoDoTotal = totalGanhos > 0 ? Math.round((comissaoTotal / totalGanhos) * 100) : 0
  const horariosPossiveis = Math.round((ociosidadeRaw?.minutos_disponiveis ?? 0) / 60)
  const horariosUsados = Math.round((ociosidadeRaw?.minutos_ocupados ?? 0) / 60)
  const statusOcupacao =
    ociosidade.percentualOcupacao >= 80 ? { text: 'ótimo', tone: 'primary' as const } :
    ociosidade.percentualOcupacao >= 40 ? { text: 'moderado', tone: 'neutral' as const } :
    { text: 'crítico', tone: 'amber' as const }
  const statusPublicoAlvo = distribuicaoCategorias.cabeloEBarba === 0
    ? 'sem cabelo+barba'
    : `${distribuicaoCategorias.cabeloEBarba} cabelo+barba`
  const dataHoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const dataHojeCapitalizada = dataHoje.charAt(0).toUpperCase() + dataHoje.slice(1)
  const mesAno = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const mesAnoCapitalizado = mesAno.charAt(0).toUpperCase() + mesAno.slice(1)
```

Substituir todo o `return (...)` (da linha `return (` original até o `)` final da função) por:

```tsx
  return (
    <div className="flex flex-col gap-5">

      <header className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-muted-foreground mb-1.5">{dataHojeCapitalizada}</div>
          <h1 className="text-[31px] font-extrabold tracking-tight">Olá, {membro!.nome}</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3.5 py-2.5 text-[13px] font-semibold text-foreground/80">
            {mesAnoCapitalizado}
          </div>
          <button type="button" className="rounded-xl bg-[#101A16] text-white px-4.5 py-2.5 text-[13px] font-bold hover:bg-primary hover:text-primary-foreground">
            Novo atendimento
          </button>
        </div>
      </header>

      <div className={`flex gap-4 items-start rounded-2xl border p-5 ${
        diagnostico.tipo === 'positivo' ? 'bg-emerald-tint border-emerald-tint-border' :
        diagnostico.tipo === 'neutro' ? 'bg-card border-border' :
        'bg-amber-tint border-amber/30'
      }`}>
        {diagnostico.tipo === 'positivo' && (
          <div className="w-[34px] h-[34px] shrink-0 rounded-[11px] bg-primary flex items-center justify-center">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4"><path d="M5 13l4 4 10-10" /></svg>
          </div>
        )}
        <div>
          <p className="font-heading text-sm font-bold mb-1">Diagnóstico</p>
          <p className="text-[13.5px] text-foreground/80 leading-relaxed max-w-[760px]">{diagnostico.mensagem}</p>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-4">
        <KpiCard
          label="Faturamento do mês"
          value={`R$ ${totalGanhos.toFixed(2)}`}
          chip={{ text: `+${transacoesCount} transações`, tone: 'primary' }}
        />
        <KpiCard
          label="Comissão do mês"
          value={`R$ ${comissaoTotal.toFixed(2)}`}
          chip={{ text: `${percentualComissaoDoTotal}% do total`, tone: 'indigo' }}
          barPercent={percentualComissaoDoTotal}
          barColor="bg-indigo"
          caption={`Serviços R$ ${(comissaoCortes + comissaoExtras).toFixed(2)} · Produtos R$ ${comissaoProdutos.toFixed(2)}`}
        />
        <KpiCard
          label="Ocupação da agenda"
          value={`${ociosidade.percentualOcupacao}%`}
          chip={{ text: statusOcupacao.text, tone: statusOcupacao.tone }}
          barPercent={ociosidade.percentualOcupacao}
          barColor={statusOcupacao.tone === 'amber' ? 'bg-amber' : 'bg-primary'}
          caption={`${horariosUsados} de ${horariosPossiveis} horários possíveis`}
        />
        <KpiCard
          label="Índice de Público-Alvo"
          value={`${distribuicaoCategorias.indicePublicoAlvo}%`}
          chip={{ text: statusPublicoAlvo, tone: distribuicaoCategorias.cabeloEBarba === 0 ? 'neutral' : 'primary' }}
          barPercent={distribuicaoCategorias.indicePublicoAlvo}
          caption="Meta ideal: 60% dos atendidos"
        />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(330px,1fr))] gap-4 items-start">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-heading text-base font-bold">Ganhos por categoria</h2>
                <p className="text-[12.5px] text-muted-foreground mt-0.5">R$ {totalGanhos.toFixed(2)} no total</p>
              </div>
            </div>

            <div className="flex flex-col gap-5">
              <div>
                <div className="flex items-baseline justify-between gap-4 mb-2">
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm bg-primary" /><span className="text-sm font-bold">Cortes</span></div>
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold tabular-nums">R$ {faturamentoCortes.toFixed(2)}</span>
                    <span className="text-[11px] font-bold text-emerald-dark bg-emerald-tint px-2 py-1 rounded-md">comissão R$ {comissaoCortes.toFixed(2)}</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${percentualCortes}%` }} /></div>
                {detalheCortes.length > 0 && (
                  <div className="mt-2.5 flex flex-col gap-0.5 text-[13px] text-foreground/70">
                    {detalheCortes.map((item) => (
                      <div key={item.id} className="flex justify-between py-1"><span>{item.nome}</span><span className="tabular-nums">{item.quantidade}x · R$ {item.valor.toFixed(2)}</span></div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-baseline justify-between gap-4 mb-2">
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm bg-muted-foreground/40" /><span className="text-sm font-bold">Serviços extras</span></div>
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold tabular-nums text-muted-foreground">R$ {faturamentoExtras.toFixed(2)}</span>
                    <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2 py-1 rounded-md">comissão R$ {comissaoExtras.toFixed(2)}</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-amber" style={{ width: `${percentualExtras}%` }} /></div>
                {detalheExtras.length > 0 && (
                  <div className="mt-2.5 flex flex-col gap-0.5 text-[13px] text-foreground/70">
                    {detalheExtras.map((item) => (
                      <div key={item.id} className="flex justify-between py-1"><span>{item.nome}</span><span className="tabular-nums">{item.quantidade}x · R$ {item.valor.toFixed(2)}</span></div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-baseline justify-between gap-4 mb-2 flex-wrap">
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm bg-indigo" /><span className="text-sm font-bold">Produtos</span></div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <span className="text-[15px] font-bold tabular-nums">R$ {faturamentoProdutos.toFixed(2)}</span>
                    <span className="text-[11px] font-bold text-indigo bg-indigo-tint px-2 py-1 rounded-md">comissão R$ {comissaoProdutos.toFixed(2)}</span>
                    <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2 py-1 rounded-md">custo R$ {custoProdutos.toFixed(2)}</span>
                    <span className="text-[11px] font-bold text-emerald-dark bg-emerald-tint px-2 py-1 rounded-md">lucro R$ {lucroProdutos.toFixed(2)}</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-indigo" style={{ width: `${percentualProdutos}%` }} /></div>
                {detalheProdutos.length > 0 && (
                  <div className="mt-2.5 flex flex-col gap-0.5 text-[13px] text-foreground/70">
                    {detalheProdutos.map((item) => (
                      <div key={item.id} className="flex justify-between py-1"><span>{item.nome}</span><span className="tabular-nums">{item.quantidade}x · R$ {item.valor.toFixed(2)}</span></div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="p-6">
              <h2 className="font-heading text-base font-bold">Perfil dos clientes</h2>
              <p className="text-[12.5px] text-muted-foreground mt-0.5">{distribuicaoCategorias.totalClassificado} visitas classificadas no mês</p>
              <div className="flex items-center gap-5 mt-5">
                <DonutChart
                  segments={[
                    { value: distribuicaoCategorias.soCabelo, color: 'var(--color-amber)' },
                    { value: distribuicaoCategorias.soBarba, color: 'var(--color-indigo)' },
                    { value: distribuicaoCategorias.cabeloEBarba, color: 'var(--color-primary)' },
                  ]}
                  centerValue={String(distribuicaoCategorias.totalClassificado)}
                  centerLabel="visitas"
                />
                <div className="flex flex-col gap-3 flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm bg-amber" /><span className="text-[13.5px] font-semibold flex-1">Só Cabelo</span><span className="text-[13px] font-bold tabular-nums">{distribuicaoCategorias.soCabelo} · {percentualSoCabelo}%</span></div>
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm bg-indigo" /><span className="text-[13.5px] font-semibold flex-1">Só Barba</span><span className="text-[13px] font-bold tabular-nums">{distribuicaoCategorias.soBarba} · {percentualSoBarba}%</span></div>
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm bg-primary" /><span className="text-[13.5px] font-semibold flex-1">Cabelo + Barba</span><span className="text-[13px] font-bold tabular-nums">{distribuicaoCategorias.cabeloEBarba} · {percentualCabeloEBarba}%</span></div>
                </div>
              </div>
              {distribuicaoCategorias.cabeloEBarba < distribuicaoCategorias.totalClassificado && (
                <div className="mt-5 p-3.5 rounded-2xl bg-amber-tint text-[12.5px] text-amber-text leading-relaxed">
                  Todo cliente atendido é oportunidade de virar <strong>Cabelo + Barba</strong>.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="font-heading text-base font-bold mb-4.5">Prospecção do mês</h2>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3.5">
                <div className="p-3.5 rounded-2xl bg-muted"><div className="text-[22px] font-extrabold tracking-tight">{prospectados}</div><div className="text-[11.5px] text-muted-foreground mt-0.5">Prospectados</div></div>
                <div className="p-3.5 rounded-2xl bg-muted"><div className="text-[22px] font-extrabold tracking-tight text-emerald-dark">{convertidosProspeccao}</div><div className="text-[11.5px] text-muted-foreground mt-0.5">Convertidos</div></div>
                <div className="p-3.5 rounded-2xl bg-muted"><div className="text-[22px] font-extrabold tracking-tight">{naoConvertidosProspeccao}</div><div className="text-[11.5px] text-muted-foreground mt-0.5">Não convertidos</div></div>
                <div className="p-3.5 rounded-2xl bg-muted"><div className="text-[22px] font-extrabold tracking-tight">R$ {faturamentoProspeccao.toFixed(2)}</div><div className="text-[11.5px] text-muted-foreground mt-0.5">Faturamento gerado</div></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-baseline gap-3 flex-wrap mb-5">
            <h2 className="font-heading text-base font-bold">Recorrência e conversão</h2>
            <span className="text-[12.5px] text-muted-foreground">Histórico completo do cliente com você, não só o mês</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-3.5 mb-5">
            <div className="p-4.5 rounded-2xl bg-muted border border-border"><div className="text-2xl font-extrabold tracking-tight">{recorrenciaSoCabelo}%</div><div className="text-xs text-muted-foreground mt-1">Só Cabelo</div></div>
            <div className="p-4.5 rounded-2xl bg-muted border border-border"><div className="text-2xl font-extrabold tracking-tight">{recorrenciaSoBarba}%</div><div className="text-xs text-muted-foreground mt-1">Só Barba</div></div>
            <div className="p-4.5 rounded-2xl bg-muted border border-border"><div className="text-2xl font-extrabold tracking-tight">{recorrenciaCabeloBarba}%</div><div className="text-xs text-muted-foreground mt-1">Cabelo + Barba</div></div>
            <div className="p-4.5 rounded-2xl bg-emerald-tint border border-emerald-tint-border"><div className="text-2xl font-extrabold tracking-tight text-emerald-dark">{recorrenciaTotal}%</div><div className="text-xs text-emerald-dark/80 mt-1">Recorrência total</div></div>
          </div>
          <div className="h-px bg-border mb-5" />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-3.5 items-center">
            <div><div className="text-2xl font-extrabold tracking-tight">{conversaoCategoriaAlvo}%</div><div className="text-xs text-muted-foreground mt-1">Converteram p/ Cabelo + Barba</div></div>
            <div><div className="text-2xl font-extrabold tracking-tight">{clientesSoCabeloForaAlvo}</div><div className="text-xs text-muted-foreground mt-1">Fora do alvo — Só Cabelo</div></div>
            <div><div className="text-2xl font-extrabold tracking-tight">{clientesSoBarbaForaAlvo}</div><div className="text-xs text-muted-foreground mt-1">Fora do alvo — Só Barba</div></div>
            <div><div className="text-2xl font-extrabold tracking-tight text-emerald-dark">{potencialConversao}%</div><div className="text-xs text-muted-foreground mt-1">Potencial de conversão</div></div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(330px,1fr))] gap-4 items-start">
        <div className="bg-sidebar-bg text-sidebar-fg rounded-2xl p-6.5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="font-heading text-base font-bold">Tempo de cadeira</h2>
          </div>
          <div className="flex items-baseline gap-2.5 mt-5 mb-2.5">
            <span className="text-[40px] font-extrabold tracking-tight">{ociosidade.percentualOcupacao}%</span>
            <span className="text-[13px] text-sidebar-muted">da sua cadeira ocupada no mês</span>
          </div>
          <div className="h-2.5 rounded-full bg-white/[0.09] overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(ociosidade.percentualOcupacao, 100)}%` }} /></div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4 mt-6.5">
            <div><div className="font-mono text-[10px] tracking-[0.12em] uppercase text-sidebar-muted">Clientes atendidos</div><div className="text-[22px] font-extrabold mt-1.5">{realizados}</div></div>
            <div><div className="font-mono text-[10px] tracking-[0.12em] uppercase text-sidebar-muted">Ganho médio / hora</div><div className="text-[22px] font-extrabold mt-1.5">R$ {ociosidade.ganhoPorHoraOcupada.toFixed(2)}</div></div>
            <div><div className="font-mono text-[10px] tracking-[0.12em] uppercase text-sidebar-muted">Estimativa perdida</div><div className="text-[22px] font-extrabold mt-1.5 text-[#FF9D8A]">R$ {ociosidade.valorPerdidoEstimado.toFixed(2)}</div><div className="text-[11.5px] text-sidebar-muted mt-0.5">≈ {ociosidade.atendimentosPerdidosEstimado} atendimentos</div></div>
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            <h2 className="font-heading text-base font-bold">Indicadores de agendamento</h2>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">Mês · não somado ao financeiro acima</p>
            <div className="flex flex-col mt-4.5">
              <div className="flex items-center justify-between py-2.5 border-b border-muted"><span className="text-[13.5px] font-semibold">Total</span><span className="text-[15px] font-extrabold tabular-nums">{totalAgendamentos}</span></div>
              <div className="flex items-center justify-between py-2.5 border-b border-muted"><span className="text-[13.5px] font-semibold text-emerald-dark">Realizados</span><span className="text-[15px] font-extrabold text-emerald-dark tabular-nums">{realizados}</span></div>
              <div className="flex items-center justify-between py-2.5 border-b border-muted"><span className="text-[13.5px] font-semibold text-foreground/70">Não compareceram</span><span className="text-[15px] font-extrabold text-muted-foreground tabular-nums">{naoCompareceram}</span></div>
              <div className="flex items-center justify-between py-2.5 border-b border-muted"><span className="text-[13.5px] font-semibold text-foreground/70">Cancelados</span><span className="text-[15px] font-extrabold text-muted-foreground tabular-nums">{cancelados}</span></div>
              <div className="flex items-center justify-between py-2.5"><span className="text-[13.5px] font-semibold text-foreground/70">Remarcados</span><span className="text-[15px] font-extrabold text-muted-foreground tabular-nums">{remarcados}</span></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {sonhosComProgresso.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-center mb-5">
              <h2 className="font-heading text-base font-bold">Sonhos</h2>
              <Link href="/painel/sonhos" className="text-xs text-primary underline">Ver todos</Link>
            </div>
            {sonhosComProgresso.map(({ sonho, valorAcumulado }) => {
              const percentualProgresso = Math.min(Math.round((valorAcumulado / sonho.valor_alvo) * 100), 100)
              return (
                <div key={sonho.id} className="mb-4 last:mb-0">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm font-semibold text-foreground/80">{sonho.nome}</span>
                    <span className="text-xs text-muted-foreground">R$ {valorAcumulado.toFixed(2)} de R$ {Number(sonho.valor_alvo).toFixed(2)}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                    <div className="bg-primary h-full rounded-full" style={{ width: `${percentualProgresso}%` }} />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 5: Verificação visual manual (obrigatória — esta task não tem cobertura automatizada)**

Login como barbeiro e abrir `/painel`. Confirmar visualmente, comparando com
`Layout barbeiro/handoff/Seu Fernandes.dc.html` (tela Dashboard):

- Header com data por extenso, saudação, seletor de mês e botão "Novo atendimento" (ambos
  sem ação — ok não fazerem nada ao clicar).
- Banner de Diagnóstico com a cor certa pro estado atual dos dados de teste. Se possível,
  gerar dados que produzam os 3 estados (`positivo`, `neutro`, e um alerta como
  `ocupacao_alta_alvo_baixo`) e confirmar visualmente cada um.
- 4 KPIs com chip e barra/legenda corretos.
- "Ganhos por categoria" com as 3 barras, chips de comissão/custo/lucro, e detalhamento por
  item.
- "Perfil dos clientes" como donut colorido + legenda (confirmar que as cores do donut batem
  com as da legenda: âmbar=Só Cabelo, índigo=Só Barba, verde=Cabelo+Barba).
- "Prospecção do mês" ao lado do card de perfil.
- "Recorrência e conversão" com os 8 números.
- "Tempo de cadeira" em card escuro.
- "Indicadores de agendamento" em lista.
- Card de "Sonhos" no final, só se houver sonhos ativos cadastrados para o barbeiro.

Depois, navegar para `/painel/agenda`, `/painel/clientes`, `/painel/prospeccao`,
`/painel/sonhos` e `/admin` e confirmar que todas carregam sem erro — o conteúdo delas
continua com o layout antigo (fora de escopo desta fase), mas já deve refletir a cor de
fundo e a fonte novas (efeito da Task 1).

Se nenhum navegador estiver disponível, documentar essa limitação explicitamente em vez de
pular a verificação silenciosamente.

- [ ] **Step 6: Commit**

```bash
git add src/components/painel/kpi-card.tsx src/components/painel/donut-chart.tsx src/app/painel/page.tsx
git commit -m "feat: redesign barbeiro dashboard to match SF visual identity"
```

---

### Task 4: Regressão final

**Files:** none (verification only).

- [ ] **Step 1: Automatizada**

Run:
```bash
npm test
npm run build
npx supabase test db
```
Expected: todos os testes existentes continuam passando (nenhuma lógica de cálculo mudou
nesta fase — só apresentação); build sem erros; suíte pgTAP sem regressão.

- [ ] **Step 2: Passagem manual completa (se navegador disponível)**

Repetir a checagem visual da Task 3 uma vez mais de ponta a ponta (login → sidebar → cada
link do menu → Dashboard completo), agora com o resultado final de todas as 3 tasks
combinadas. Conferir também `/login` e uma página do `/admin` pra confirmar que o
herdamento global de cor/fonte não quebrou nada (contraste de texto legível, botões
clicáveis, nenhum elemento com cor de texto igual à cor de fundo).

- [ ] **Step 3: Sem commit para esta task** — é só verificação; se algo for encontrado,
corrigir como um commit pequeno separado, referenciando qual task/step regrediu.
