# Redesign Visual — Admin: Planos de Carreira (Fase 9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reestilizar `/admin/planos-carreira` — envolver o formulário "Adicionar plano" e a tabela de planos cada um num `Card`, com largura explícita em cada campo do formulário — sem mudar nenhum dado, query ou lógica já existente, só a apresentação.

**Architecture:** Uma única mudança em `src/app/admin/planos-carreira/page.tsx`, reaproveitando `Card`/`CardContent` (já existentes desde a Fase 1). `src/components/plano-carreira-row.tsx` **não é tocado** — seus `Input` de edição inline já têm largura própria, e não há `<select>` nesta página.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui, Supabase.

**Spec:** `docs/superpowers/specs/2026-08-25-redesign-visual-admin-planos-carreira-fase9-design.md`

## Global Constraints

- **Nenhum dado, query ou lógica muda** — a server action `criarPlano` continua com o corpo idêntico; só a apresentação (JSX/estilo) é reescrita.
- **`src/components/plano-carreira-row.tsx` não é modificado nesta fase** — só `src/app/admin/planos-carreira/page.tsx`.
- **Largura explícita em cada campo do formulário**: `nome` `w-40`, `percentual_produto` `w-28`, `percentual_servico` `w-28`.

---

### Task 1: Cards no formulário e na tabela de Planos de Carreira

**Files:**
- Modify: `src/app/admin/planos-carreira/page.tsx`

**Interfaces:**
- Consumes: `Card`/`CardContent` (`src/components/ui/card.tsx`, Fase 1) — já existente, sem mudança de interface.

- [ ] **Step 1: Reescrever `src/app/admin/planos-carreira/page.tsx`**

Substituir o arquivo inteiro por:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { PlanoCarreiraRow } from '@/components/plano-carreira-row'
import { Table, TableHeader, TableBody, TableRow, TableHead } from '@/components/ui/table'

async function criarPlano(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('planos_carreira').insert({
    barbearia_id: membro!.barbearia_id,
    nome: formData.get('nome') as string,
    percentual_produto: Number(formData.get('percentual_produto')),
    percentual_servico: Number(formData.get('percentual_servico')),
  })
  revalidatePath('/admin/planos-carreira')
}

export default async function PlanosCarreiraPage() {
  const supabase = await getServerSupabaseClient()
  const { data: planos } = await supabase.from('planos_carreira').select('*').order('nome')

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Planos de carreira</h1>

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Adicionar plano</h2>
          <form action={criarPlano} className="flex gap-2 flex-wrap">
            <Input name="nome" placeholder="Nome (ex: Sênior)" required className="w-40" />
            <Input name="percentual_produto" type="number" step="0.01" placeholder="% produto" required className="w-28" />
            <Input name="percentual_servico" type="number" step="0.01" placeholder="% serviço" required className="w-28" />
            <Button type="submit">Adicionar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Planos cadastrados</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>% produto</TableHead><TableHead>% serviço</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {planos?.map((p) => <PlanoCarreiraRow key={p.id} plano={p} />)}
            </TableBody>
          </Table>
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

Login como admin, abrir `/admin/planos-carreira`. Confirmar os dois `Card` (formulário e tabela) e que o formulário mantém a linha horizontal compacta (os 3 campos + botão numa linha, não empilhados verticalmente). Testar de ponta a ponta: adicionar um plano novo, editar um existente, salvar, cancelar uma edição, desativar e reativar.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/planos-carreira/page.tsx
git commit -m "feat: redesign admin planos de carreira to match SF visual identity"
```
