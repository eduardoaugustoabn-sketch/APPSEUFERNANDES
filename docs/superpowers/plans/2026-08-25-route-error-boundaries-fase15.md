# Error Boundaries por Seção — Admin e Painel (Fase 15) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar `src/app/admin/error.tsx` e `src/app/painel/error.tsx` — hoje um erro não tratado em qualquer página dessas duas seções sobe até `global-error.tsx` (Fase 14) e derruba a sidebar junto; esses dois arquivos isolam o erro só na área de conteúdo, mantendo a sidebar visível e funcional.

**Architecture:** Um componente novo e compartilhado, `src/components/route-error.tsx` (a UI real do erro), consumido por dois arquivos finos (`admin/error.tsx`, `painel/error.tsx`) que só repassam as props que o Next.js injeta. Diferente do `global-error.tsx` da Fase 14, este componente pode ser compartilhado com segurança — `error.tsx` roda normalmente dentro do layout de cada seção, sem a restrição de `<html>`/`<body>` próprios.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-08-25-route-error-boundaries-fase15-design.md`

## Global Constraints

- **`error.tsx` cobre `page.js` e `layout.js` aninhados, mas não o `layout.js` do próprio segmento** — confirmado em `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md:96`. É por isso que a sidebar de `admin/layout.tsx`/`painel/layout.tsx` continua funcionando mesmo com o boundary ativo — não é uma escolha de implementação, é a garantia do próprio Next.js.
- **`retry()`, não `reset()`** — mesma API da Fase 14, pelo mesmo motivo (re-busca e re-renderiza em vez de só limpar estado local).
- **Ambos os arquivos `error.tsx` precisam de `'use client'`** — exigência do Next.js pra esse arquivo especial, mesmo delegando o conteúdo real pro componente compartilhado.
- **Nenhuma lógica de negócio muda** — nenhuma página existente é tocada.

---

### Task 1: `RouteError` + os dois error boundaries

**Files:**
- Create: `src/components/route-error.tsx`
- Create: `src/app/admin/error.tsx`
- Create: `src/app/painel/error.tsx`

**Interfaces:**
- Produces: `RouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void })` — usado pelos dois arquivos `error.tsx`, que só repassam as props recebidas do Next.js sem modificá-las.
- Consumes: `Card`/`CardContent` (`src/components/ui/card.tsx`, Fase 1), `Button` (`src/components/ui/button.tsx`) — ambos já existentes.

- [ ] **Step 1: Criar `src/components/route-error.tsx`**

```tsx
'use client'

import { useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function RouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <Card>
      <CardContent className="p-6 flex flex-col items-center text-center gap-3">
        <h1 className="font-heading text-lg font-bold">Algo deu errado nesta página</h1>
        <p className="text-sm text-muted-foreground">Tente novamente em alguns instantes.</p>
        <Button onClick={() => retry()}>Tentar de novo</Button>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Criar `src/app/admin/error.tsx`**

```tsx
'use client'

import { RouteError } from '@/components/route-error'

export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError error={error} retry={retry} />
}
```

- [ ] **Step 3: Criar `src/app/painel/error.tsx`**

```tsx
'use client'

import { RouteError } from '@/components/route-error'

export default function PainelError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError error={error} retry={retry} />
}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 5: Verificação visual manual**

Login como admin. Forçar um erro numa página de `/admin/*` — por exemplo, editar temporariamente `src/app/admin/page.tsx` pra lançar `throw new Error('teste')` logo no início da função, salvar, recarregar a página. Confirmar que aparece o `Card` "Algo deu errado nesta página" **com a sidebar do admin ainda visível e clicável ao lado** (navegar pra outra página da sidebar deve funcionar normalmente). Clicar em "Tentar de novo". Reverter o `throw` de teste. Repetir o mesmo teste como barbeiro, editando temporariamente `src/app/painel/page.tsx`, confirmando que a sidebar do painel continua visível. Reverter o `throw` de teste antes de finalizar.

- [ ] **Step 6: Commit**

```bash
git add src/components/route-error.tsx src/app/admin/error.tsx src/app/painel/error.tsx
git commit -m "feat: add route-level error boundaries for admin and painel sections"
```
