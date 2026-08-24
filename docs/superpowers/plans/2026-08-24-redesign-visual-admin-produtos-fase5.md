# Redesign Visual — Admin: Produtos (Fase 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reestilizar `/admin/produtos` — envolver o formulário "Adicionar produto" e a tabela de produtos cada um num `Card`, com largura explícita em cada campo do formulário — sem mudar nenhum dado, query ou lógica já existente, só a apresentação.

**Architecture:** Uma única mudança em `src/app/admin/produtos/page.tsx`, reaproveitando `Card`/`CardContent` (já existentes desde a Fase 1). `src/components/produto-row.tsx` **não é tocado** — seus `Input` de edição inline já têm largura própria, e não há nenhum `<select>` nesta página (diferente de Serviços na Fase 4).

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui, Supabase.

**Spec:** `docs/superpowers/specs/2026-08-24-redesign-visual-admin-produtos-fase5-design.md`

## Global Constraints

- **Nenhum dado, query ou lógica muda** — a server action `criarProduto` continua com o corpo idêntico; só a apresentação (JSX/estilo) é reescrita.
- **`src/components/produto-row.tsx` não é modificado nesta fase** — só `src/app/admin/produtos/page.tsx`.
- **Largura explícita em cada campo do formulário** (lição da revisão da Fase 4): `Input` é `w-full` por padrão, então uma linha `flex` sem larguras próprias empilha os campos verticalmente em vez de manter a linha horizontal. Larguras exatas: `nome` `w-40`, `categoria` `w-32`, `preco_custo`/`preco_venda`/`quantidade_estoque`/`estoque_minimo` `w-28` cada.
- **Destaque de estoque baixo** (`text-destructive` na `TableRow` de `produto-row.tsx` quando `quantidade_estoque <= estoque_minimo`) continua exatamente como está.

---

### Task 1: Cards no formulário e na tabela de Produtos

**Files:**
- Modify: `src/app/admin/produtos/page.tsx`

**Interfaces:**
- Consumes: `Card`/`CardContent` (`src/components/ui/card.tsx`, Fase 1) — já existente, sem mudança de interface.

- [ ] **Step 1: Reescrever `src/app/admin/produtos/page.tsx`**

Substituir o arquivo inteiro por:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ProdutoRow } from '@/components/produto-row'
import { Table, TableHeader, TableBody, TableRow, TableHead } from '@/components/ui/table'

async function criarProduto(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('produtos').insert({
    barbearia_id: membro!.barbearia_id,
    nome: formData.get('nome') as string,
    categoria: formData.get('categoria') as string,
    preco_custo: Number(formData.get('preco_custo')) || 0,
    preco_venda: Number(formData.get('preco_venda')),
    quantidade_estoque: Number(formData.get('quantidade_estoque')),
    estoque_minimo: Number(formData.get('estoque_minimo')),
  })
  revalidatePath('/admin/produtos')
}

export default async function ProdutosPage() {
  const supabase = await getServerSupabaseClient()
  const { data: produtos } = await supabase.from('produtos').select('*').order('nome')

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Produtos</h1>

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Adicionar produto</h2>
          <form action={criarProduto} className="flex gap-2 flex-wrap">
            <Input name="nome" placeholder="Nome" required className="w-40" />
            <Input name="categoria" placeholder="Categoria" className="w-32" />
            <Input name="preco_custo" type="number" step="0.01" placeholder="Preço de compra" className="w-28" />
            <Input name="preco_venda" type="number" step="0.01" placeholder="Preço de venda" required className="w-28" />
            <Input name="quantidade_estoque" type="number" placeholder="Estoque inicial" required className="w-28" />
            <Input name="estoque_minimo" type="number" placeholder="Estoque mínimo" required className="w-28" />
            <Button type="submit">Adicionar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Produtos cadastrados</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Categoria</TableHead><TableHead>Custo</TableHead><TableHead>Preço</TableHead><TableHead>Estoque</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {produtos?.map((p) => <ProdutoRow key={p.id} produto={p} />)}
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

Login como admin, abrir `/admin/produtos`. Confirmar os dois `Card` (formulário e tabela) e que o formulário mantém a linha horizontal compacta (os 6 campos + botão numa linha, não empilhados verticalmente). Testar de ponta a ponta: adicionar um produto novo, editar um existente, salvar, cancelar uma edição, desativar e reativar. Confirmar que um produto com `quantidade_estoque <= estoque_minimo` continua aparecendo em vermelho.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/produtos/page.tsx
git commit -m "feat: redesign admin produtos to match SF visual identity"
```
