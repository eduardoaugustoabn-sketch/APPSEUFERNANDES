# Redesign Visual — Admin: Sidebar + Visão Geral (Fase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a nav horizontal de `/admin` por uma sidebar escura fixa (mesmo padrão visual da sidebar do `/painel`, sem widget de meta), e trocar os 3 cards resumo do topo da página "Visão geral" pelo componente `KpiCard` já existente — sem mudar nenhum dado, query ou cálculo já existente, só a apresentação.

**Architecture:** Novo componente `src/components/admin/sidebar.tsx` (client component, mesma estrutura de `src/components/painel/sidebar.tsx`, deliberadamente duplicado em vez de compartilhado — mesmo padrão já usado no projeto entre `nav-links.tsx` e a sidebar do painel), consumido por `src/app/admin/layout.tsx` no lugar da `<nav>` horizontal atual. `nav-links.tsx` fica sem nenhum consumidor depois dessa troca (era usado só ali) e é removido. `src/app/admin/page.tsx` troca só o bloco JSX dos 3 cards do topo pelo `KpiCard` (`src/components/painel/kpi-card.tsx`, já genérico) — toda a lógica de busca/cálculo da página continua idêntica.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui, Supabase.

**Spec:** `docs/superpowers/specs/2026-08-23-redesign-visual-admin-fase3-design.md`

## Global Constraints

- **Nenhum dado ou cálculo muda** — todas as queries e somas já existentes em `admin/page.tsx` continuam idênticas; só a apresentação (JSX/estilo) é reescrita.
- **Sem widget de meta na sidebar do admin** — diferente da sidebar do painel, não há "Meta do mês" (é uma meta pessoal do barbeiro, sem equivalente agregado pro admin).
- **Sidebar do admin é um componente novo e duplicado, não uma generalização** de `painel/sidebar.tsx` — decisão validada na spec.
- **Só a sidebar + "Visão geral" mudam nesta fase.** As outras 8 páginas do admin (Serviços, Produtos, Planos de carreira, Barbeiros, Ranking, Prospecção, Clientes, Sonhos) continuam com o conteúdo atual — só passam a renderizar dentro da sidebar nova.
- **Tokens/cores já existem desde a Fase 1** (`--color-sidebar-bg`, `--color-sidebar-fg`, `--color-sidebar-muted`, `--color-sidebar-icon`, `--color-amber`/`--color-amber-text`/`--color-amber-tint`, etc., em `src/app/globals.css`) — nenhum token novo é necessário nesta fase.

---

### Task 1: Sidebar do admin

**Files:**
- Create: `src/components/admin/sidebar.tsx`
- Modify: `src/app/admin/layout.tsx`
- Delete: `src/components/nav-links.tsx`

**Interfaces:**
- Consumes: tokens `--color-sidebar-*` (Fase 1), `SignOutButton` (`src/components/sign-out-button.tsx`, já aceita `className?: string`).
- Produces: `AdminSidebar` component — `{ navItems: { href: string; label: string }[], nomeAdmin: string }`.

- [ ] **Step 1: Criar `src/components/admin/sidebar.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SignOutButton } from '@/components/sign-out-button'

const ICON_PATHS: Record<string, React.ReactNode> = {
  '/admin': (
    <>
      <rect x="3" y="3" width="7" height="8" rx="2" />
      <rect x="14" y="3" width="7" height="5" rx="2" />
      <rect x="3" y="15" width="7" height="6" rx="2" />
      <rect x="14" y="11" width="7" height="10" rx="2" />
    </>
  ),
  '/admin/servicos': (
    <>
      <circle cx="6" cy="6" r="2.6" />
      <circle cx="6" cy="18" r="2.6" />
      <path d="M20 4L8.3 15.7M8.3 8.3L20 20" />
    </>
  ),
  '/admin/produtos': (
    <>
      <path d="M3 7.5l9-4.5 9 4.5-9 4.5-9-4.5z" />
      <path d="M3 7.5v9l9 4.5 9-4.5v-9" />
      <path d="M12 12v9" />
    </>
  ),
  '/admin/planos-carreira': (
    <>
      <path d="M3 17l5-5 4 4 8-9" />
      <path d="M14 7h6v6" />
    </>
  ),
  '/admin/barbeiros': (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c0-4.14 3.36-7.5 7.5-7.5s7.5 3.36 7.5 7.5" />
    </>
  ),
  '/admin/ranking': (
    <path d="M4 20V13M12 20V6M20 20v-9" />
  ),
  '/admin/prospeccao': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
    </>
  ),
  '/admin/clientes': (
    <>
      <circle cx="9" cy="8" r="3.6" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5.5a3.5 3.5 0 0 1 0 7M17.5 14.4c2.1.8 3.5 2.6 3.5 5.6" />
    </>
  ),
  '/admin/sonhos': (
    <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9L3.5 9.7l5.9-.8z" />
  ),
}

function NavIcon({ href }: { href: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--color-sidebar-icon)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {ICON_PATHS[href]}
    </svg>
  )
}

export function AdminSidebar({
  navItems, nomeAdmin,
}: {
  navItems: { href: string; label: string }[]
  nomeAdmin: string
}) {
  const pathname = usePathname()
  // Mesmo critério de nav-links.tsx (href mais longo que casa), reimplementado
  // aqui em vez de reaproveitado — mesma decisão já tomada em painel/sidebar.tsx.
  const ativoHref = navItems
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  const iniciais = nomeAdmin.trim().split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase()

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

      <div className="mt-auto flex items-center gap-[11px] px-2 py-1.5">
        <div className="w-[34px] h-[34px] rounded-[11px] bg-[#25352D] flex items-center justify-center text-[13px] font-bold text-sidebar-icon shrink-0">{iniciais}</div>
        <div className="flex flex-col leading-tight flex-1 min-w-0">
          <span className="text-[13px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis">{nomeAdmin}</span>
          <span className="text-[11px] text-sidebar-muted">Admin</span>
        </div>
        <SignOutButton className="text-sidebar-muted hover:text-sidebar-fg text-xs font-semibold no-underline shrink-0" />
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Ligar a sidebar em `src/app/admin/layout.tsx`**

Substituir o arquivo inteiro por:

```tsx
import { redirect } from 'next/navigation'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { AdminSidebar } from '@/components/admin/sidebar'

const NAV_ITEMS = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/servicos', label: 'Serviços' },
  { href: '/admin/produtos', label: 'Produtos' },
  { href: '/admin/planos-carreira', label: 'Planos de carreira' },
  { href: '/admin/barbeiros', label: 'Barbeiros' },
  { href: '/admin/ranking', label: 'Ranking' },
  { href: '/admin/prospeccao', label: 'Prospecção' },
  { href: '/admin/clientes', label: 'Clientes' },
  { href: '/admin/sonhos', label: 'Sonhos' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membro } = await supabase
    .from('membros')
    .select('nome, papel')
    .eq('user_id', user.id)
    .single()

  if (membro?.papel !== 'admin') redirect('/')

  return (
    <div className="flex min-h-screen items-stretch">
      <AdminSidebar navItems={NAV_ITEMS} nomeAdmin={membro.nome} />
      <div className="flex-1 min-w-0 p-6 md:p-8 lg:p-10">{children}</div>
    </div>
  )
}
```

- [ ] **Step 3: Remover `src/components/nav-links.tsx`**

Era usado só por `src/app/admin/layout.tsx` (confirmado via busca — nenhum outro arquivo importa `NavLinks`). Depois do Step 2, fica sem consumidor.

```bash
rm src/components/nav-links.tsx
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo (confirma que nada mais importava `NavLinks` ou `nome`/`papel` de `admin/layout.tsx` de um jeito incompatível).

- [ ] **Step 5: Verificação visual manual**

Se um navegador estiver disponível: login como admin, confirmar a sidebar escura fixa (mesmo visual da sidebar do painel) com os 9 itens de nav, cada um com ícone, o item da rota atual destacado (fundo verde translúcido + barra lateral), e o rodapé mostrando iniciais + nome do admin logado + "Admin" + botão "Sair" funcional. Navegar por pelo menos 3 das 9 páginas (ex.: Serviços, Barbeiros, Sonhos) e confirmar que carregam normalmente dentro da sidebar nova, mesmo com conteúdo interno ainda no visual antigo.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/sidebar.tsx src/app/admin/layout.tsx src/components/nav-links.tsx
git commit -m "feat: replace admin top nav with sidebar shell"
```

---

### Task 2: KpiCard na página "Visão geral"

**Files:**
- Modify: `src/app/admin/page.tsx`

**Interfaces:**
- Consumes: `KpiCard` (`src/components/painel/kpi-card.tsx`) — `{ label: string, value: string, chip?: { text: string, tone: 'primary'|'amber'|'indigo'|'neutral' } }` (já existente, sem mudança).

- [ ] **Step 1: Substituir o bloco dos 3 cards do topo por `KpiCard`**

Em `src/app/admin/page.tsx`, adicionar o import:

```tsx
import { KpiCard } from '@/components/painel/kpi-card'
```

E substituir este bloco:

```tsx
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
```

por:

```tsx
      <div className="grid grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-4 mb-6">
        <KpiCard
          label="Faturamento do mês (todos)"
          value={`R$ ${faturamentoTotal.toFixed(2)}`}
        />
        <KpiCard
          label="Comissões acumuladas no mês"
          value={`R$ ${comissaoTotal.toFixed(2)}`}
        />
        <KpiCard
          label="Produtos com estoque baixo"
          value={`${produtosBaixos?.length ?? 0} itens`}
          chip={produtosBaixos && produtosBaixos.length > 0 ? { text: `${produtosBaixos.length} itens`, tone: 'amber' } : undefined}
        />
      </div>
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 3: Verificação visual manual**

Login como admin, abrir `/admin`. Confirmar que os 3 cards do topo agora seguem o visual do `KpiCard` (rótulo mono uppercase pequeno + número grande) e que "Produtos com estoque baixo" mostra um chip âmbar quando há pelo menos 1 produto abaixo do mínimo, e sem chip quando não há nenhum. Confirmar que a tabela "Barbeiros" e os cards "Indicadores de agendamento"/"Prospecção" abaixo continuam idênticos (não fazem parte desta task).

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat: use KpiCard for admin overview summary metrics"
```
