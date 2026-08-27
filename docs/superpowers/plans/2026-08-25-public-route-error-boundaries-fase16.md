# Error Boundaries nas Rotas Públicas — Login e Agendamento (Fase 16) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar `src/app/login/error.tsx` e `src/app/[barbeariaSlug]/error.tsx` — as duas únicas rotas do app sem `error.tsx` próprio, que hoje caem direto no `global-error.tsx` (Fase 14) quando algo quebra.

**Architecture:** Um componente novo e compartilhado, `src/components/public-route-error.tsx` (Card com cabeçalho "SF" — diferente do `RouteError` da Fase 15, que não tem cabeçalho porque assume uma sidebar ao redor), consumido por dois arquivos finos que só repassam as props do Next.js.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-08-25-public-route-error-boundaries-fase16-design.md`

## Global Constraints

- **`retry()`, não `reset()`** — mesma API das Fases 14 e 15.
- **`error.digest` visível desde o início** — lição da Fase 15, aplicada de saída.
- **Ambos os arquivos `error.tsx` precisam de `'use client'`** — exigência do Next.js.
- **Nenhuma lógica de negócio muda.**

---

### Task 1: `PublicRouteError` + os dois error boundaries

**Files:**
- Create: `src/components/public-route-error.tsx`
- Create: `src/app/login/error.tsx`
- Create: `src/app/[barbeariaSlug]/error.tsx`

**Interfaces:**
- Produces: `PublicRouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void })` — usado pelos dois arquivos `error.tsx`.
- Consumes: `Card`/`CardContent` (`src/components/ui/card.tsx`, Fase 1), `Button` (`src/components/ui/button.tsx`) — já existentes.

- [ ] **Step 1: Criar `src/components/public-route-error.tsx`**

```tsx
'use client'

import { useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function PublicRouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-4">
      <div className="flex flex-col items-center gap-3">
        <div className="w-[46px] h-[46px] rounded-[14px] bg-primary flex items-center justify-center font-extrabold text-lg text-primary-foreground">SF</div>
        <div className="flex flex-col items-center leading-tight">
          <span className="text-lg font-bold tracking-tight">Seu Fernandes</span>
          <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground">Barbearia</span>
        </div>
      </div>
      <Card className="w-full max-w-sm">
        <CardContent className="p-6 flex flex-col items-center text-center gap-3">
          <h1 className="font-heading text-lg font-bold">Algo deu errado</h1>
          <p className="text-sm text-muted-foreground">Tente novamente em alguns instantes.</p>
          <Button onClick={() => retry()}>Tentar de novo</Button>
          {error.digest && (
            <p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground">{error.digest}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Criar `src/app/login/error.tsx`**

```tsx
'use client'

import { PublicRouteError } from '@/components/public-route-error'

export default function LoginError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PublicRouteError error={error} retry={retry} />
}
```

- [ ] **Step 3: Criar `src/app/[barbeariaSlug]/error.tsx`**

```tsx
'use client'

import { PublicRouteError } from '@/components/public-route-error'

export default function BarbeariaError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PublicRouteError error={error} retry={retry} />
}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 5: Verificação visual manual**

Forçar um erro em `/login` (ex.: editar temporariamente `src/app/login/page.tsx` pra lançar `throw new Error('teste')` no início do componente, salvar, recarregar) e confirmar a tela com cabeçalho "SF" + Card "Algo deu errado" + botão "Tentar de novo". Reverter o `throw` de teste. Repetir o mesmo teste em `/<slug-de-uma-barbearia>` (editando temporariamente `src/app/[barbeariaSlug]/page.tsx`), confirmando a mesma tela. Reverter o `throw` de teste antes de finalizar. Confirmar que nenhuma das duas rotas cai mais no `global-error.tsx` da Fase 14 ao testar isso.

- [ ] **Step 6: Commit**

```bash
git add src/components/public-route-error.tsx src/app/login/error.tsx "src/app/[barbeariaSlug]/error.tsx"
git commit -m "feat: add error boundaries for login and public booking routes"
```
