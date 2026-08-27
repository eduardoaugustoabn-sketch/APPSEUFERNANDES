# Páginas de 404 e Erro Fatal com a Marca (Fase 14) — Design Spec

## Contexto e objetivo

O redesign visual (Fases 1-13) cobriu todas as páginas reais do app (`/admin/*`, `/painel/*`, `/login`, `/[barbeariaSlug]`), mas o app nunca teve páginas de erro/404 personalizadas — confirmado por busca (`src/app/**/{not-found,error,loading,global-error}.tsx`, zero resultados). Hoje, qualquer rota inexistente ou uma barbearia com slug inválido (`if (!barbearia) notFound()` em `src/app/[barbeariaSlug]/page.tsx:10`, o único lugar que chama `notFound()` hoje) cai na tela padrão do Next.js — monocromática, em inglês, sem nenhuma marca.

Esta é a **Fase 14**: adicionar `not-found.tsx` e `global-error.tsx` na raiz de `src/app`, cobrindo o app inteiro de uma vez (não é uma reestilização — são arquivos novos, usando as convenções especiais do Next.js App Router pra esses casos).

**Decisão de escopo validada com o usuário**: só 404 + erro fatal nesta fase. Um `loading.tsx` global fica de fora — as páginas já carregam rápido, sem indicador quebrado hoje, seria "feature nova" em vez de "corrigir buraco".

## Decisões de design

- **`src/app/not-found.tsx`**: um único arquivo na raiz cobre o app inteiro (rota inexistente sob qualquer segmento, e o `notFound()` de `[barbeariaSlug]`) — o Next.js usa o `not-found.tsx` mais próximo na árvore de rotas, e como nenhuma outra rota tem um mais específico, este serve todo mundo. Layout: mesmo cabeçalho "SF" do `/login` (círculo `bg-primary` + "Seu Fernandes" + "Barbearia" em mono uppercase — hardcoded, como no login, já que uma 404 genérica não tem contexto de qual barbearia), com um `Card` abaixo contendo a mensagem "Página não encontrada" e um link de volta pra `/` (que já redireciona pro lugar certo conforme sessão/papel).
- **`src/app/global-error.tsx`**: captura erros não tratados na árvore inteira, incluindo o próprio `layout.tsx` raiz — por isso, por exigência do Next.js (não escolha de design), esse arquivo precisa ser Client Component (`'use client'`) e declarar seu próprio `<html>`/`<body>` do zero, já que ele *substitui* o layout raiz quando entra em ação (não é renderizado dentro dele). Isso significa recarregar as fontes (`Plus_Jakarta_Sans`/`IBM_Plex_Mono`) e reimportar `globals.css`, exatamente como `src/app/layout.tsx` já faz — duplicação inevitável nesse tipo de arquivo, é o padrão documentado do Next.js pra `global-error.tsx`. Mesmo cabeçalho "SF", `Card` com "Algo deu errado" e um botão "Tentar de novo" que chama a função `reset()` que o Next.js passa como prop (tentativa de re-renderizar a árvore sem recarregar a página inteira).
- **Nenhuma lógica muda** — o único `notFound()` existente continua exatamente como está; esta fase só adiciona os arquivos que faltavam pra ele (e pra qualquer 404/erro futuro) renderizarem com a marca em vez do padrão do Next.js.

## `src/app/not-found.tsx`

Server Component (não precisa de estado/interatividade). Reaproveita `Card`/`CardContent` (Fase 1).

```tsx
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'

export default function NotFound() {
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
          <h1 className="font-heading text-lg font-bold">Página não encontrada</h1>
          <p className="text-sm text-muted-foreground">O link que você acessou não existe ou pode ter mudado.</p>
          <Link href="/" className="text-sm text-primary underline">Voltar para o início</Link>
        </CardContent>
      </Card>
    </div>
  )
}
```

## `src/app/global-error.tsx`

Client Component, declara `<html>`/`<body>` próprios. Reaproveita `Card`/`CardContent` e `Button`.

```tsx
'use client'

import { Plus_Jakarta_Sans, IBM_Plex_Mono } from 'next/font/google'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import './globals.css'

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
})

const ibmPlexMono = IBM_Plex_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
})

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="pt-BR" className={`${plusJakartaSans.variable} ${ibmPlexMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col items-center justify-center gap-8 px-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-[46px] h-[46px] rounded-[14px] bg-primary flex items-center justify-center font-extrabold text-lg text-primary-foreground">SF</div>
          <div className="flex flex-col items-center leading-tight">
            <span className="text-lg font-bold tracking-tight">Seu Fernandes</span>
            <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground">Barbearia</span>
          </div>
        </div>
        <title>Seu Fernandes</title>
        <Card className="w-full max-w-sm">
          <CardContent className="p-6 flex flex-col items-center text-center gap-3">
            <h1 className="font-heading text-lg font-bold">Algo deu errado</h1>
            <p className="text-sm text-muted-foreground">Tente novamente em alguns instantes.</p>
            <Button onClick={() => retry()}>Tentar de novo</Button>
          </CardContent>
        </Card>
      </body>
    </html>
  )
}
```

`error` (o objeto de erro) é recebido como prop mas não usado no corpo — não exibimos detalhes técnicos do erro pro usuário final (nem em produção isso seria apropriado). O parâmetro fica só na assinatura de tipo por exigência do contrato do Next.js pra esse arquivo especial.

**Correção pós-revisão**: o nome correto da prop de re-tentativa nesta versão do Next.js (16.3.0) é `retry`, não `reset` — `retry()` re-busca e re-renderiza os filhos do error boundary a partir do servidor; `reset()` só limpa o estado local e re-renderiza o mesmo payload já falho, então o mesmo erro voltaria a acontecer imediatamente. A doc embutida do projeto (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`) documenta isso explicitamente e foi a fonte usada pra essa correção — deveria ter sido consultada antes de escrever a primeira versão desta spec, conforme o `AGENTS.md` do projeto já instrui. Título da página (`<title>`, via o componente nativo do React 19, já que `metadata` não funciona em Client Component) e os `<h1>` (no lugar de `<p>`, tanto aqui quanto em `not-found.tsx`) também foram adicionados nesta correção.

## Componentização

Nenhum componente novo — reaproveita `Card`/`CardContent` (Fase 1) e `Button` (já existente). O cabeçalho "SF" é duplicado inline nos dois arquivos (não extraído em componente compartilhado) — mesma decisão já tomada em outras duplicações pequenas ao longo do projeto (ex.: sidebars do admin/painel), e aqui ainda mais justificada: `global-error.tsx` não pode importar um componente que dependa de contexto do layout raiz sem risco, então manter os dois arquivos autocontidos e simples é mais seguro pra um caminho de código que só roda quando algo já deu errado.

## Fora de escopo (explicitamente adiado)

- `loading.tsx` (indicador de carregamento entre navegações) — decisão explícita do usuário de não incluir nesta fase.
- Qualquer `not-found.tsx`/`error.tsx` específico por segmento de rota (ex.: um 404 diferente dentro de `/admin`) — o único arquivo na raiz já cobre o app inteiro, não há necessidade concreta de diferenciar.
- Registrar o erro em algum serviço de observabilidade (Sentry, etc.) — o app não tem nenhuma integração desse tipo hoje; fora de escopo pra uma fase de "página de erro visual".
- Mudar o único `notFound()` existente ou qualquer lógica de negócio.

## Testes

- **Build**: `npm run build` sem erros de tipo.
- **Manual (navegador)**:
  - Acessar uma rota inexistente (ex.: `/pagina-que-nao-existe`) e confirmar a tela de 404 com o cabeçalho SF e o Card.
  - Acessar `/uma-slug-de-barbearia-que-nao-existe` e confirmar que cai na mesma tela de 404 (via o `notFound()` já existente).
  - Clicar em "Voltar para o início" e confirmar que volta pra `/` (que redireciona conforme sessão).
  - Forçar um erro não tratado (ex.: lançar um erro temporário em algum componente do servidor durante o teste, ou usar as ferramentas de dev do Next.js) e confirmar que a tela de erro fatal aparece com o cabeçalho SF, o Card, e que o botão "Tentar de novo" tenta re-renderizar.
- Sem testes de unidade novos — são páginas de apresentação pura, sem lógica a testar.
