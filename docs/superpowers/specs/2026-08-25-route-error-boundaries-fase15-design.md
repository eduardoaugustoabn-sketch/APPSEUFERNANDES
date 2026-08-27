# Error Boundaries por Seção — Admin e Painel (Fase 15) — Design Spec

## Contexto e objetivo

A Fase 14 deu ao app uma tela de 404 e uma tela de erro fatal (`global-error.tsx`) com a marca, mas `global-error.tsx` só entra em ação quando o erro escapa até a raiz — inclusive derrubando a sidebar, já que esse arquivo substitui o `layout.tsx` inteiro. Hoje, um erro não tratado em qualquer página de `/admin/*` ou `/painel/*` (ex.: uma falha do Supabase) sobe até lá, apagando a tela inteira em vez de isolar só o conteúdo quebrado.

Confirmado na documentação embutida do projeto (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md:96`): *"`error.js` wraps `loading.js`, `not-found.js`, `page.js`, and nested `layout.js` files in a React error boundary. It does **not** wrap the `layout.js` or `template.js` above it in the same segment."* — ou seja, um `error.tsx` colocado em `src/app/admin/error.tsx` cobre `admin/page.tsx` e todas as páginas aninhadas (`admin/servicos/page.tsx`, etc.), mas **não** cobre `admin/layout.tsx` — que é onde a sidebar é renderizada. Isso significa que a sidebar continua de pé e funcional mesmo se uma página quebrar — exatamente o comportamento desejado, e garantido pelo próprio framework, não por um truque de implementação.

Esta é a **Fase 15**: `src/app/admin/error.tsx` e `src/app/painel/error.tsx`, cobrindo cada seção.

## Decisões de design

- **Um componente compartilhado, `src/components/route-error.tsx`**, usado pelos dois arquivos. Diferente do `global-error.tsx` da Fase 14 (que não podia compartilhar nada por precisar declarar `<html>`/`<body>` próprios e não poder depender do layout raiz), aqui não existe essa restrição — `error.tsx` roda normalmente dentro do layout já existente, então um componente comum é seguro e evita duplicar o mesmo JSX duas vezes.
- **Sem cabeçalho "SF"** — diferente das telas de 404/erro fatal da Fase 14 (que substituem a página inteira, sem nenhum contexto visual ao redor), aqui a sidebar do admin/painel já continua visível e já dá o contexto da marca. O conteúdo do erro é só um `Card` na área onde o conteúdo da página ficaria, como se "a página tivesse sido trocada por uma mensagem de erro" — sem repetir o cabeçalho.
- **`retry()`, não `reset()`** — mesma API usada na Fase 14 (`node_modules/next/dist/docs/.../error.md`, seção `#### retry`), pelo mesmo motivo: tenta re-buscar e re-renderizar o conteúdo que falhou, em vez de só limpar o estado local.
- **`console.error(error)` num `useEffect`** — mesmo padrão sugerido pela própria documentação do Next.js pro arquivo `error.js` (loga o erro no console pra facilitar debug; o app não tem nenhuma integração de observabilidade hoje, então isso não é escopo novo, só o mínimo já documentado como prática padrão).
- **Nenhuma lógica de negócio muda** — isso não altera nenhuma página existente, só adiciona a rede de segurança que faltava.

## `src/components/route-error.tsx`

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

## `src/app/admin/error.tsx`

```tsx
'use client'

import { RouteError } from '@/components/route-error'

export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError error={error} retry={retry} />
}
```

## `src/app/painel/error.tsx`

```tsx
'use client'

import { RouteError } from '@/components/route-error'

export default function PainelError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError error={error} retry={retry} />
}
```

Os dois arquivos são deliberadamente arquivos "finos" que só repassam as props do Next.js pro componente compartilhado — o Next.js exige que o arquivo especial `error.tsx` em si seja o default export de cada segmento (não dá pra apontar diretamente pro componente compartilhado como export default de dois lugares diferentes seria confuso de rastrear), então cada segmento tem seu próprio arquivo fino, mas sem duplicar o conteúdo real.

## Componentização

Um componente novo: `RouteError`. Reaproveita `Card`/`CardContent` (Fase 1) e `Button`.

## Fora de escopo (explicitamente adiado)

- Corrigir o botão de confirmar agendamento público sem trava de duplo clique — bug pré-existente, sem relação com error boundaries, fica pra outra hora.
- Qualquer integração de observabilidade (Sentry, etc.) — o `console.error` é só o mínimo já sugerido pela documentação do Next.js.
- `error.tsx` em segmentos mais específicos (ex.: um por página dentro de `/admin`) — as duas seções (admin, painel) já cobrem tudo que existe hoje sob elas.
- Tocar em `global-error.tsx` ou `not-found.tsx` (Fase 14) — ficam como estão.

## Testes

- **Build**: `npm run build` sem erros de tipo.
- **Manual (navegador)**: login como admin, forçar um erro numa página de `/admin/*` (ex.: comentar temporariamente uma query obrigatória em algum `page.tsx` de servidor pra causar uma exceção, ou usar o overlay de erro do modo dev do Next.js) e confirmar que aparece o `Card` de erro **com a sidebar do admin ainda visível e clicável ao lado**. Clicar em "Tentar de novo" e confirmar que tenta re-renderizar. Repetir o mesmo teste como barbeiro, numa página de `/painel/*`, confirmando que a sidebar do painel continua visível. Reverter qualquer alteração temporária feita só pra provocar o erro.
- Sem testes de unidade novos — são páginas de apresentação pura, sem lógica a testar.
