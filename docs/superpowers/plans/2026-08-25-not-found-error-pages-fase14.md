# Páginas de 404 e Erro Fatal com a Marca (Fase 14) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar `src/app/not-found.tsx` e `src/app/global-error.tsx` — o app não tem nenhuma página de 404/erro fatal com a marca hoje, então qualquer rota inexistente ou erro não tratado cai na tela padrão do Next.js.

**Architecture:** Dois arquivos novos e independentes (nenhum importa o outro, nenhum é usado pelo outro). `not-found.tsx` é um Server Component simples que reaproveita `Card`/`CardContent`. `global-error.tsx` é um Client Component que precisa declarar seu próprio `<html>`/`<body>` e recarregar fontes/CSS globais — exigência do Next.js pra esse tipo de arquivo, que substitui o layout raiz inteiro quando ativado. Nenhum componente compartilhado novo — o cabeçalho "SF" é duplicado inline nos dois arquivos, mesma decisão de duplicação já usada em outras partes do projeto (ver spec).

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-08-25-not-found-error-pages-fase14-design.md`

## Global Constraints

- **Nenhuma lógica muda** — o único `notFound()` existente (`src/app/[barbeariaSlug]/page.tsx:10`) não é tocado.
- **`loading.tsx` está fora de escopo** — decisão explícita do usuário, não incluir nesta fase.
- **`global-error.tsx` precisa ser Client Component com `<html>`/`<body>` próprios** — não é opcional, é como o Next.js App Router exige que esse arquivo especial seja estruturado (ele substitui o layout raiz, não renderiza dentro dele).
- **Nenhum componente `Checkmark`/`Cabecalho` compartilhado é criado** — o bloco do logo "SF" é duplicado inline nos dois arquivos novos.

---

### Task 1: Página 404 (`not-found.tsx`)

**Files:**
- Create: `src/app/not-found.tsx`

**Interfaces:**
- Consumes: `Card`/`CardContent` (`src/components/ui/card.tsx`, Fase 1) — já existente, sem mudança de interface.

- [ ] **Step 1: Criar `src/app/not-found.tsx`**

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
          <p className="font-heading text-lg font-bold">Página não encontrada</p>
          <p className="text-sm text-muted-foreground">O link que você acessou não existe ou pode ter mudado.</p>
          <Link href="/" className="text-sm text-primary underline">Voltar para o início</Link>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 3: Verificação visual manual**

Com o servidor rodando (`npm run dev`), acessar uma rota inexistente (ex.: `http://localhost:3000/pagina-que-nao-existe`) e confirmar a tela de 404 com o cabeçalho "SF" e o Card. Acessar `http://localhost:3000/uma-slug-que-nao-existe` (uma slug de barbearia inválida) e confirmar que cai na mesma tela (via o `notFound()` já existente em `[barbeariaSlug]/page.tsx`). Clicar em "Voltar para o início" e confirmar que volta pra `/`.

- [ ] **Step 4: Commit**

```bash
git add src/app/not-found.tsx
git commit -m "feat: add branded 404 page"
```

---

### Task 2: Página de erro fatal (`global-error.tsx`)

**Files:**
- Create: `src/app/global-error.tsx`

**Interfaces:**
- Consumes: `Card`/`CardContent` (`src/components/ui/card.tsx`, Fase 1), `Button` (`src/components/ui/button.tsx`) — ambos já existentes, sem mudança de interface. `next/font/google` (`Plus_Jakarta_Sans`, `IBM_Plex_Mono`) — mesmas fontes já usadas em `src/app/layout.tsx`.

- [ ] **Step 1: Criar `src/app/global-error.tsx`**

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

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
        <Card className="w-full max-w-sm">
          <CardContent className="p-6 flex flex-col items-center text-center gap-3">
            <p className="font-heading text-lg font-bold">Algo deu errado</p>
            <p className="text-sm text-muted-foreground">Tente novamente em alguns instantes.</p>
            <Button onClick={reset}>Tentar de novo</Button>
          </CardContent>
        </Card>
      </body>
    </html>
  )
}
```

Nota: o parâmetro `error` fica só na assinatura de tipo (não é desestruturado nem usado no corpo) — não exibimos detalhes técnicos do erro pro usuário final, e o Next.js exige essa forma de props pra esse arquivo especial mesmo quando `error` não é consumido.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 3: Verificação visual manual**

Com o servidor rodando (`npm run dev`), forçar um erro não tratado — por exemplo, comentar temporariamente uma variável obrigatória em algum `page.tsx` de servidor pra causar uma exceção não capturada durante o desenvolvimento, ou usar a aba de erros do overlay de dev do Next.js — e confirmar que a tela de erro fatal aparece com o cabeçalho "SF", o Card "Algo deu errado", e que clicar em "Tentar de novo" tenta re-renderizar a árvore. Reverter qualquer alteração temporária feita só pra provocar o erro.

- [ ] **Step 4: Commit**

```bash
git add src/app/global-error.tsx
git commit -m "feat: add branded fatal error page"
```
