# Error Boundaries nas Rotas Públicas — Login e Agendamento (Fase 16) — Design Spec

## Contexto e objetivo

A Fase 15 deu a `/admin` e `/painel` seus próprios `error.tsx`, isolando erros de página sem derrubar a sidebar. As únicas duas rotas do app que ainda não têm `error.tsx` próprio são `/login` e `/[barbeariaSlug]` (o agendamento público) — um erro em qualquer uma delas ainda sobe até `global-error.tsx` (Fase 14), que substitui a página inteira.

Diferente de `/admin`/`/painel`, essas duas rotas **não têm sidebar** — não há nenhum "shell" que sobreviveria ao redor do erro. Por isso, o componente de erro aqui precisa do mesmo cabeçalho "SF" completo já usado em `not-found.tsx`/`global-error.tsx` (Fase 14), não o `RouteError` "só o card de conteúdo" da Fase 15 (que assume que a sidebar já dá o contexto de marca).

Esta é a **Fase 16**: `src/components/public-route-error.tsx` (compartilhado) + `src/app/login/error.tsx` + `src/app/[barbeariaSlug]/error.tsx`.

## Decisões de design

- **Um componente novo, `PublicRouteError`**, não uma extensão do `RouteError` da Fase 15 — os dois têm layouts visuais diferentes (com/sem cabeçalho SF), então forçar um prop condicional num componente só criaria mais complexidade do que dois componentes pequenos e diretos.
- **`retry()`, não `reset()`** — mesma API já usada nas Fases 14 e 15.
- **`error.digest` visível desde o início** — lição da revisão final da Fase 15 (sem isso, um erro em produção não tem como ser rastreado no log do servidor), aplicada de saída em vez de esperar a revisão apontar de novo.
- **Cabeçalho "SF" duplicado inline** (mesma decisão já tomada 3 vezes: `/login`, `public-booking-flow.tsx`, `not-found.tsx`/`global-error.tsx`) — continua sendo pouco código pra justificar extrair agora, e tocar nesses arquivos já existentes pra compartilhar um componente novo estaria fora do escopo desta fase (que é só adicionar os `error.tsx` que faltam).
- **Nenhuma lógica de negócio muda.**

## `src/components/public-route-error.tsx`

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

## `src/app/login/error.tsx`

```tsx
'use client'

import { PublicRouteError } from '@/components/public-route-error'

export default function LoginError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PublicRouteError error={error} retry={retry} />
}
```

## `src/app/[barbeariaSlug]/error.tsx`

```tsx
'use client'

import { PublicRouteError } from '@/components/public-route-error'

export default function BarbeariaError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PublicRouteError error={error} retry={retry} />
}
```

Assim como na Fase 15, os dois arquivos são finos por exigência do Next.js (o arquivo especial precisa existir em cada segmento), delegando o conteúdo real pro componente compartilhado.

## Componentização

Um componente novo: `PublicRouteError`. Reaproveita `Card`/`CardContent` (Fase 1) e `Button`.

## Fora de escopo (explicitamente adiado)

- `error.tsx` na raiz (`src/app/page.tsx`) — essa página só faz `redirect()`, não renderiza conteúdo; um erro ali é raro e continuaria caindo no `global-error.tsx`, o que é aceitável.
- Extrair o cabeçalho "SF" num componente compartilhado entre os 4 lugares que já o duplicam (`/login`, `public-booking-flow.tsx`, `not-found.tsx`, `global-error.tsx`, e agora `public-route-error.tsx`) — candidato a uma fase de consolidação futura, não desta.
- Corrigir o botão de confirmar agendamento sem trava de duplo clique, ou adicionar `error.digest` ao `global-error.tsx` da Fase 14 — pendências separadas, sem relação com esta fase.

## Testes

- **Build**: `npm run build` sem erros de tipo.
- **Manual (navegador)**: forçar um erro em `/login` (ex.: `throw` temporário no componente) e confirmar a tela com cabeçalho SF + Card + botão "Tentar de novo". Repetir em `/<slug-de-uma-barbearia>`. Confirmar que nenhuma das duas cai mais no `global-error.tsx` da Fase 14. Reverter qualquer alteração temporária.
- Sem testes de unidade novos.
