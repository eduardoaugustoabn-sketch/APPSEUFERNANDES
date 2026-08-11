# Editar/desativar em Serviços, Produtos e Planos de carreira Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add edit and soft-delete (`ativo` toggle) to the three catalog admin screens (`/admin/servicos`, `/admin/produtos`, `/admin/planos-carreira`), and make deactivation actually stop those items from being offered anywhere a barbeiro picks something new.

**Architecture:** Same stack as the rest of the project (Next.js App Router + Supabase Postgres/RLS, no generated types). `servicos.ativo` already exists in the schema; a single migration adds the matching column to `produtos` and `planos_carreira`. Each catalog page keeps its existing create-server-action but swaps its static `<tr>` per row for a small `'use client'` row component (matching the codebase's established pattern — `ProspeccaoStatusForm`, `AgendarSlotForm`, etc. — of a client component calling the browser Supabase client directly and calling `router.refresh()`, not passing server actions down as props). A final task threads `ativo` through every "pick something new" `<select>` in the app without touching the lookups that resolve an *existing* reference (which must keep working even for now-inactive items).

**Tech Stack:** Next.js 16.3 (TypeScript, App Router, Turbopack), Supabase (Postgres, Auth, RLS), Tailwind CSS, shadcn/ui primitives (`Button`, `Input`).

## Global Constraints

- Design source of truth: `docs/superpowers/specs/2026-08-11-catalogo-editar-desativar-design.md`. "Excluir" means deactivate (`ativo = false`), never a real `DELETE` — the three tables already have FK-referencing history (`agendamentos`/`atendimentos`, `vendas_produtos`, `membros`) with no cascade.
- Migration filenames must be plain sequential integers (`0017_*.sql`) — a letter-suffix scheme silently breaks the installed Supabase CLI (see `docs/superpowers/plans/2026-08-03-barbearia-mvp.md` Task 9).
- No RLS changes needed anywhere in this plan — `servicos`, `produtos`, and `planos_carreira` already have an admin `FOR ALL` policy covering UPDATE.
- No pgTAP tests are needed for this plan — no new RLS rule, no trigger, no function. Verification is `npm run build` (type-check) plus manual browser/UI verification per task.
- Inactive rows stay visible in every catalog listing (never hidden/filtered there) with a dimmed style (`opacity-60`, the same class already used for other "muted" rows in `agenda-dia.tsx`) and a "Reativar" button in place of "Desativar".
- The filter for "pick something new" `<select>` option lists is `.filter((x) => x.ativo)` applied only where the `<option>` list is rendered — never on the underlying `servicos`/`produtos`/`planos` prop or query, and never on a `.find()` that resolves an id already chosen earlier (agendamento's existing serviço, cliente's ficha, barbeiro's currently-assigned plano). Filtering those would make an already-existing reference to a now-inactive item disappear from its own display.

---

### Task 1: Migration — `ativo` em `produtos` e `planos_carreira`

**Files:**
- Create: `supabase/migrations/0017_produtos_planos_carreira_ativo.sql`

**Interfaces:**
- Produces: `produtos.ativo boolean not null default true`, `planos_carreira.ativo boolean not null default true` — every later task in this plan reads/writes these two columns.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0017_produtos_planos_carreira_ativo.sql`:

```sql
-- servicos.ativo already exists (0002_catalogo.sql) but was never exposed
-- in the admin UI. produtos and planos_carreira get the same column here,
-- so all three catalog tables support soft-delete (deactivate, never a
-- real DELETE — all three have FK-referencing history with no cascade).
alter table produtos add column ativo boolean not null default true;
alter table planos_carreira add column ativo boolean not null default true;
```

- [ ] **Step 2: Apply and verify**

Run: `npx supabase db reset`
Expected: all 17 migrations apply cleanly in order (the last line printed is `Applying migration 0017_produtos_planos_carreira_ativo.sql...`).

Run: `npx supabase test db`
Expected: `Result: PASS` (the new nullable-defaulted column must not break any existing pgTAP fixture — none of the existing test files insert into `produtos`/`planos_carreira` with an explicit column list that would need to change).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0017_produtos_planos_carreira_ativo.sql
git commit -m "feat: add ativo column to produtos and planos_carreira, matching servicos"
```

---

### Task 2: Serviços — editar/desativar

**Files:**
- Create: `src/components/servico-row.tsx`
- Modify: `src/app/admin/servicos/page.tsx` (whole file)

**Interfaces:**
- Consumes: nothing from earlier tasks (servicos.ativo already existed before Task 1).
- Produces: `ServicoRow({ servico }: { servico: { id: string; nome: string; duracao_minutos: number; preco: number; ativo: boolean } })` — a `<tr>`-returning client component, one per row of the servicos table.

- [ ] **Step 1: Write `ServicoRow`**

Create `src/components/servico-row.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type Servico = { id: string; nome: string; duracao_minutos: number; preco: number; ativo: boolean }

export function ServicoRow({ servico }: { servico: Servico }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(servico.nome)
  const [duracaoMinutos, setDuracaoMinutos] = useState(servico.duracao_minutos)
  const [preco, setPreco] = useState(servico.preco)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('servicos').update({ nome, duracao_minutos: duracaoMinutos, preco }).eq('id', servico.id)
    setSalvando(false)
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setNome(servico.nome)
    setDuracaoMinutos(servico.duracao_minutos)
    setPreco(servico.preco)
    setEditando(false)
  }

  async function alternarAtivo() {
    const supabase = getBrowserSupabaseClient()
    await supabase.from('servicos').update({ ativo: !servico.ativo }).eq('id', servico.id)
    router.refresh()
  }

  if (editando) {
    return (
      <tr>
        <td><Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-32" /></td>
        <td><Input type="number" value={duracaoMinutos} onChange={(e) => setDuracaoMinutos(Number(e.target.value))} className="w-20" /></td>
        <td><Input type="number" step="0.01" value={preco} onChange={(e) => setPreco(Number(e.target.value))} className="w-24" /></td>
        <td className="flex gap-2">
          <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
          <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
        </td>
      </tr>
    )
  }

  return (
    <tr className={servico.ativo ? '' : 'opacity-60'}>
      <td>{servico.nome}</td>
      <td>{servico.duracao_minutos}min</td>
      <td>R$ {servico.preco}</td>
      <td className="flex gap-2">
        <button type="button" onClick={() => setEditando(true)} className="text-xs underline">Editar</button>
        <button type="button" onClick={alternarAtivo} className="text-xs underline">{servico.ativo ? 'Desativar' : 'Reativar'}</button>
      </td>
    </tr>
  )
}
```

- [ ] **Step 2: Rewrite the servicos page to use it**

Replace `src/app/admin/servicos/page.tsx` in full:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ServicoRow } from '@/components/servico-row'

async function criarServico(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('servicos').insert({
    barbearia_id: membro!.barbearia_id,
    nome: formData.get('nome') as string,
    duracao_minutos: Number(formData.get('duracao_minutos')),
    preco: Number(formData.get('preco')),
  })
  revalidatePath('/admin/servicos')
}

export default async function ServicosPage() {
  const supabase = await getServerSupabaseClient()
  const { data: servicos } = await supabase.from('servicos').select('*').order('nome')

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Serviços</h1>
      <form action={criarServico} className="flex gap-2 mb-6">
        <Input name="nome" placeholder="Nome" required />
        <Input name="duracao_minutos" type="number" placeholder="Duração (min)" required />
        <Input name="preco" type="number" step="0.01" placeholder="Preço" required />
        <Button type="submit">Adicionar</Button>
      </form>
      <table className="w-full text-left">
        <thead><tr><th>Nome</th><th>Duração</th><th>Preço</th><th>Ações</th></tr></thead>
        <tbody>
          {servicos?.map((s) => <ServicoRow key={s.id} servico={s} />)}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual verification**

With the dev server running, as `admin@teste.com`: open `/admin/servicos`. Click "Editar" on a row, change the preço, click "Salvar" — confirm the new value persists after the page settles (no manual reload needed). Click "Desativar" on a row — confirm the row goes dim and the button now reads "Reativar"; click it again and confirm the row returns to normal and the button reads "Desativar" again.

- [ ] **Step 5: Commit**

```bash
git add src/components/servico-row.tsx src/app/admin/servicos/page.tsx
git commit -m "feat: edit and deactivate serviços from the admin catalog"
```

---

### Task 3: Produtos — editar/desativar

**Files:**
- Create: `src/components/produto-row.tsx`
- Modify: `src/app/admin/produtos/page.tsx` (whole file)

**Interfaces:**
- Consumes: `produtos.ativo` (Task 1's migration).
- Produces: `ProdutoRow({ produto }: { produto: { id: string; nome: string; categoria: string | null; preco_venda: number; quantidade_estoque: number; estoque_minimo: number; ativo: boolean } })`.

- [ ] **Step 1: Write `ProdutoRow`**

Create `src/components/produto-row.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type Produto = {
  id: string
  nome: string
  categoria: string | null
  preco_venda: number
  quantidade_estoque: number
  estoque_minimo: number
  ativo: boolean
}

export function ProdutoRow({ produto }: { produto: Produto }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(produto.nome)
  const [categoria, setCategoria] = useState(produto.categoria ?? '')
  const [precoVenda, setPrecoVenda] = useState(produto.preco_venda)
  const [quantidadeEstoque, setQuantidadeEstoque] = useState(produto.quantidade_estoque)
  const [estoqueMinimo, setEstoqueMinimo] = useState(produto.estoque_minimo)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('produtos').update({
      nome, categoria: categoria || null, preco_venda: precoVenda,
      quantidade_estoque: quantidadeEstoque, estoque_minimo: estoqueMinimo,
    }).eq('id', produto.id)
    setSalvando(false)
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setNome(produto.nome)
    setCategoria(produto.categoria ?? '')
    setPrecoVenda(produto.preco_venda)
    setQuantidadeEstoque(produto.quantidade_estoque)
    setEstoqueMinimo(produto.estoque_minimo)
    setEditando(false)
  }

  async function alternarAtivo() {
    const supabase = getBrowserSupabaseClient()
    await supabase.from('produtos').update({ ativo: !produto.ativo }).eq('id', produto.id)
    router.refresh()
  }

  if (editando) {
    return (
      <tr>
        <td><Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-32" /></td>
        <td><Input value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-28" /></td>
        <td><Input type="number" step="0.01" value={precoVenda} onChange={(e) => setPrecoVenda(Number(e.target.value))} className="w-24" /></td>
        <td>
          <Input type="number" value={quantidadeEstoque} onChange={(e) => setQuantidadeEstoque(Number(e.target.value))} className="w-20" />
        </td>
        <td className="flex gap-2">
          <Input type="number" value={estoqueMinimo} onChange={(e) => setEstoqueMinimo(Number(e.target.value))} className="w-20" />
          <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
          <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
        </td>
      </tr>
    )
  }

  return (
    <tr className={`${produto.ativo ? '' : 'opacity-60'} ${produto.quantidade_estoque <= produto.estoque_minimo ? 'text-red-600' : ''}`}>
      <td>{produto.nome}</td>
      <td>{produto.categoria}</td>
      <td>R$ {produto.preco_venda}</td>
      <td>{produto.quantidade_estoque}</td>
      <td className="flex gap-2">
        <button type="button" onClick={() => setEditando(true)} className="text-xs underline">Editar</button>
        <button type="button" onClick={alternarAtivo} className="text-xs underline">{produto.ativo ? 'Desativar' : 'Reativar'}</button>
      </td>
    </tr>
  )
}
```

- [ ] **Step 2: Rewrite the produtos page to use it**

Replace `src/app/admin/produtos/page.tsx` in full:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ProdutoRow } from '@/components/produto-row'

async function criarProduto(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('produtos').insert({
    barbearia_id: membro!.barbearia_id,
    nome: formData.get('nome') as string,
    categoria: formData.get('categoria') as string,
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
      <h1 className="text-xl font-semibold mb-4">Produtos</h1>
      <form action={criarProduto} className="flex gap-2 mb-6 flex-wrap">
        <Input name="nome" placeholder="Nome" required />
        <Input name="categoria" placeholder="Categoria" />
        <Input name="preco_venda" type="number" step="0.01" placeholder="Preço de venda" required />
        <Input name="quantidade_estoque" type="number" placeholder="Estoque inicial" required />
        <Input name="estoque_minimo" type="number" placeholder="Estoque mínimo" required />
        <Button type="submit">Adicionar</Button>
      </form>
      <table className="w-full text-left">
        <thead><tr><th>Nome</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th>Ações</th></tr></thead>
        <tbody>
          {produtos?.map((p) => <ProdutoRow key={p.id} produto={p} />)}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual verification**

As `admin@teste.com`: open `/admin/produtos`. Edit a product's estoque, save, confirm it persists (and that the red-text "estoque baixo" styling still reacts correctly if you drop it at/below estoque mínimo). Desativar/Reativar as in Task 2.

- [ ] **Step 5: Commit**

```bash
git add src/components/produto-row.tsx src/app/admin/produtos/page.tsx
git commit -m "feat: edit and deactivate produtos from the admin catalog"
```

---

### Task 4: Planos de carreira — editar/desativar

**Files:**
- Create: `src/components/plano-carreira-row.tsx`
- Modify: `src/app/admin/planos-carreira/page.tsx` (whole file)

**Interfaces:**
- Consumes: `planos_carreira.ativo` (Task 1's migration).
- Produces: `PlanoCarreiraRow({ plano }: { plano: { id: string; nome: string; percentual_produto: number; percentual_servico: number; ativo: boolean } })`.

- [ ] **Step 1: Write `PlanoCarreiraRow`**

Create `src/components/plano-carreira-row.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type Plano = { id: string; nome: string; percentual_produto: number; percentual_servico: number; ativo: boolean }

export function PlanoCarreiraRow({ plano }: { plano: Plano }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(plano.nome)
  const [percentualProduto, setPercentualProduto] = useState(plano.percentual_produto)
  const [percentualServico, setPercentualServico] = useState(plano.percentual_servico)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('planos_carreira').update({
      nome, percentual_produto: percentualProduto, percentual_servico: percentualServico,
    }).eq('id', plano.id)
    setSalvando(false)
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setNome(plano.nome)
    setPercentualProduto(plano.percentual_produto)
    setPercentualServico(plano.percentual_servico)
    setEditando(false)
  }

  async function alternarAtivo() {
    const supabase = getBrowserSupabaseClient()
    await supabase.from('planos_carreira').update({ ativo: !plano.ativo }).eq('id', plano.id)
    router.refresh()
  }

  if (editando) {
    return (
      <tr>
        <td><Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-32" /></td>
        <td><Input type="number" step="0.01" value={percentualProduto} onChange={(e) => setPercentualProduto(Number(e.target.value))} className="w-24" /></td>
        <td><Input type="number" step="0.01" value={percentualServico} onChange={(e) => setPercentualServico(Number(e.target.value))} className="w-24" /></td>
        <td className="flex gap-2">
          <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
          <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
        </td>
      </tr>
    )
  }

  return (
    <tr className={plano.ativo ? '' : 'opacity-60'}>
      <td>{plano.nome}</td>
      <td>{plano.percentual_produto}%</td>
      <td>{plano.percentual_servico}%</td>
      <td className="flex gap-2">
        <button type="button" onClick={() => setEditando(true)} className="text-xs underline">Editar</button>
        <button type="button" onClick={alternarAtivo} className="text-xs underline">{plano.ativo ? 'Desativar' : 'Reativar'}</button>
      </td>
    </tr>
  )
}
```

- [ ] **Step 2: Rewrite the planos-carreira page to use it**

Replace `src/app/admin/planos-carreira/page.tsx` in full:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { PlanoCarreiraRow } from '@/components/plano-carreira-row'

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
      <h1 className="text-xl font-semibold mb-4">Planos de carreira</h1>
      <form action={criarPlano} className="flex gap-2 mb-6">
        <Input name="nome" placeholder="Nome (ex: Sênior)" required />
        <Input name="percentual_produto" type="number" step="0.01" placeholder="% produto" required />
        <Input name="percentual_servico" type="number" step="0.01" placeholder="% serviço" required />
        <Button type="submit">Adicionar</Button>
      </form>
      <table className="w-full text-left">
        <thead><tr><th>Nome</th><th>% produto</th><th>% serviço</th><th>Ações</th></tr></thead>
        <tbody>
          {planos?.map((p) => <PlanoCarreiraRow key={p.id} plano={p} />)}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual verification**

As `admin@teste.com`: open `/admin/planos-carreira`. Edit a plano's percentuais, save, confirm it persists. Desativar/Reativar as in Task 2.

- [ ] **Step 5: Commit**

```bash
git add src/components/plano-carreira-row.tsx src/app/admin/planos-carreira/page.tsx
git commit -m "feat: edit and deactivate planos de carreira from the admin catalog"
```

---

### Task 5: Propagar `ativo` para os pickers de escolha nova

**Files:**
- Modify: `src/app/painel/agenda/page.tsx:9-10`
- Modify: `src/components/agenda-dia.tsx:11-12`
- Modify: `src/components/agendar-slot-form.tsx:8,88-91`
- Modify: `src/components/atender-agora-form.tsx` (the `Servico` type and the serviço `<select>`)
- Modify: `src/components/lancamento-form.tsx:10-11,212-215,229-232,245-248`
- Modify: `src/app/admin/barbeiros/page.tsx:38`

**Interfaces:**
- Consumes: `servicos.ativo`, `produtos.ativo` (already existed / Task 1), `planos_carreira.ativo` (Task 1).
- Produces: nothing new — this task only changes what each existing `<select>` offers.

- [ ] **Step 1: Fetch `ativo` alongside servicos/produtos on the Agenda page**

In `src/app/painel/agenda/page.tsx`, change:

```tsx
  const { data: servicos } = await supabase.from('servicos').select('id, nome, preco, duracao_minutos').eq('barbearia_id', membro!.barbearia_id)
  const { data: produtos } = await supabase.from('produtos').select('id, nome, preco_venda, quantidade_estoque').eq('barbearia_id', membro!.barbearia_id)
```

to:

```tsx
  const { data: servicos } = await supabase.from('servicos').select('id, nome, preco, duracao_minutos, ativo').eq('barbearia_id', membro!.barbearia_id)
  const { data: produtos } = await supabase.from('produtos').select('id, nome, preco_venda, quantidade_estoque, ativo').eq('barbearia_id', membro!.barbearia_id)
```

- [ ] **Step 2: Widen the `Servico`/`Produto` types in `AgendaDia`**

In `src/components/agenda-dia.tsx`, change:

```tsx
type Servico = { id: string; nome: string; preco: number; duracao_minutos: number }
type Produto = { id: string; nome: string; preco_venda: number; quantidade_estoque: number }
```

to:

```tsx
type Servico = { id: string; nome: string; preco: number; duracao_minutos: number; ativo: boolean }
type Produto = { id: string; nome: string; preco_venda: number; quantidade_estoque: number; ativo: boolean }
```

`AgendaDia` only passes these straight through to `LancamentoForm`, `AgendarSlotForm`, and `AtenderAgoraForm` as props — it renders no serviço/produto `<option>` itself, so no other change is needed in this file.

- [ ] **Step 3: Filter the serviço picker in `AgendarSlotForm`**

In `src/components/agendar-slot-form.tsx`, change:

```tsx
type Servico = { id: string; nome: string; duracao_minutos: number }
```

to:

```tsx
type Servico = { id: string; nome: string; duracao_minutos: number; ativo: boolean }
```

And change:

```tsx
      <select value={servicoId} onChange={(e) => { setServicoId(e.target.value); setPedindoConfirmacao(false) }} className="border rounded px-2 py-1">
        <option value="">Serviço</option>
        {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
      </select>
```

to:

```tsx
      <select value={servicoId} onChange={(e) => { setServicoId(e.target.value); setPedindoConfirmacao(false) }} className="border rounded px-2 py-1">
        <option value="">Serviço</option>
        {servicos.filter((s) => s.ativo).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
      </select>
```

Leave `servicoSelecionado = servicos.find((s) => s.id === servicoId)` and every other use of `servicos` in this file untouched — they resolve an id the picker above already restricted to active services, filtering them again would just be redundant.

- [ ] **Step 4: Filter the serviço picker in `AtenderAgoraForm`**

In `src/components/atender-agora-form.tsx`, change:

```tsx
type Servico = { id: string; nome: string; duracao_minutos: number }
```

to:

```tsx
type Servico = { id: string; nome: string; duracao_minutos: number; ativo: boolean }
```

And change:

```tsx
      <select value={servicoId} onChange={(e) => setServicoId(e.target.value)} className="border rounded px-2 py-1">
        <option value="">Serviço</option>
        {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
      </select>
```

to:

```tsx
      <select value={servicoId} onChange={(e) => setServicoId(e.target.value)} className="border rounded px-2 py-1">
        <option value="">Serviço</option>
        {servicos.filter((s) => s.ativo).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
      </select>
```

- [ ] **Step 5: Filter the three pickers in `LancamentoForm`**

In `src/components/lancamento-form.tsx`, change:

```tsx
type Servico = { id: string; nome: string; preco: number; duracao_minutos: number }
type Produto = { id: string; nome: string; preco_venda: number; quantidade_estoque: number }
```

to:

```tsx
type Servico = { id: string; nome: string; preco: number; duracao_minutos: number; ativo: boolean }
type Produto = { id: string; nome: string; preco_venda: number; quantidade_estoque: number; ativo: boolean }
```

Change the "adicionar serviço" picker from:

```tsx
          <select value={servicoParaAdicionar} onChange={(e) => setServicoParaAdicionar(e.target.value)} className="border rounded px-2 py-1 flex-1">
            <option value="">Serviço</option>
            {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome} (R${s.preco})</option>)}
          </select>
```

to:

```tsx
          <select value={servicoParaAdicionar} onChange={(e) => setServicoParaAdicionar(e.target.value)} className="border rounded px-2 py-1 flex-1">
            <option value="">Serviço</option>
            {servicos.filter((s) => s.ativo).map((s) => <option key={s.id} value={s.id}>{s.nome} (R${s.preco})</option>)}
          </select>
```

Change the "adicionar produto" picker from:

```tsx
          <select value={produtoParaAdicionar} onChange={(e) => setProdutoParaAdicionar(e.target.value)} className="border rounded px-2 py-1 flex-1">
            <option value="">Produto</option>
            {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome} (estoque: {p.quantidade_estoque})</option>)}
          </select>
```

to:

```tsx
          <select value={produtoParaAdicionar} onChange={(e) => setProdutoParaAdicionar(e.target.value)} className="border rounded px-2 py-1 flex-1">
            <option value="">Produto</option>
            {produtos.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome} (estoque: {p.quantidade_estoque})</option>)}
          </select>
```

Change the "retorno" serviço picker from:

```tsx
            <select value={retornoServicoId} onChange={(e) => { setRetornoServicoId(e.target.value); setRetornoHorarios([]); setRetornoHorario('') }} className="border rounded px-2 py-1">
              <option value="">Serviço do retorno</option>
              {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
```

to:

```tsx
            <select value={retornoServicoId} onChange={(e) => { setRetornoServicoId(e.target.value); setRetornoHorarios([]); setRetornoHorario('') }} className="border rounded px-2 py-1">
              <option value="">Serviço do retorno</option>
              {servicos.filter((s) => s.ativo).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
```

Leave `servicos.find((s) => s.id === modoAgenda.servicoId)` (the pre-fill on open, line ~46) and `servicos.find((s) => s.id === retornoServicoId)!` (line ~156) untouched — both resolve an id, not a picker list.

- [ ] **Step 6: Keep the barbeiro's current plano visible even if it's now inactive**

In `src/app/admin/barbeiros/page.tsx`, change:

```tsx
          <select name="plano_carreira_id" defaultValue={b.plano_carreira_id ?? ''} className="border rounded px-2 py-1">
            <option value="">Sem plano</option>
            {planos?.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
```

to:

```tsx
          <select name="plano_carreira_id" defaultValue={b.plano_carreira_id ?? ''} className="border rounded px-2 py-1">
            <option value="">Sem plano</option>
            {planos?.filter((p) => p.ativo || p.id === b.plano_carreira_id).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
```

No query change is needed here — `planos` is already fetched with `select('*')` on line 23, which will include `ativo` once Task 1's migration has landed.

- [ ] **Step 7: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 8: Manual verification**

As `admin@teste.com`: on `/admin/servicos`, desativar the "Corte" serviço (or whichever exists). Then as `barbeiro@teste.com`: open `/painel/agenda`, click any free slot — confirm "Corte" no longer appears in the "Serviço" dropdown, but any *existing* agendamento that already uses Corte still displays and opens its atendimento screen normally (its serviço name/preço still resolve correctly in `LancamentoForm`). Reativar "Corte" and confirm it reappears in the dropdown. Repeat the same check for a produto (desativar → confirm it disappears from the "adicionar produto" picker in an atendimento in progress → reativar → reappears). For planos de carreira: desativar a plano currently assigned to a barbeiro on `/admin/barbeiros`, confirm that barbeiro's select still shows the plano as the selected option (not silently blanked), while the "Sem plano" + other planos are still selectable — only the deactivated one is missing from the list of *other* choices.

- [ ] **Step 9: Commit**

```bash
git add src/app/painel/agenda/page.tsx src/components/agenda-dia.tsx src/components/agendar-slot-form.tsx src/components/atender-agora-form.tsx src/components/lancamento-form.tsx src/app/admin/barbeiros/page.tsx
git commit -m "feat: deactivated serviços/produtos/planos stop being offered for new selections"
```

---

### Task 6: Regressão final

**Files:** none (verification only).

- [ ] **Step 1: Full automated regression**

Run, in order:
```bash
npx supabase db reset
npx supabase test db
npm test
npm run build
```
Expected: all 17 migrations apply cleanly; every pgTAP file passes; both Vitest unit tests pass; the production build completes with no type errors.

- [ ] **Step 2: Manual end-to-end walkthrough**

As `admin@teste.com`:
1. `/admin/servicos`: create a new serviço, edit it, desativar it, reativar it — confirm each step reflects immediately.
2. `/admin/produtos`: same roteiro for a produto, including checking the "estoque baixo" red-text styling still triggers correctly after an edit that drops `quantidade_estoque` to/below `estoque_minimo`.
3. `/admin/planos-carreira`: same roteiro for a plano; then on `/admin/barbeiros`, confirm a barbeiro already on that plano keeps it selected even while it's deactivated, and confirm it's excluded from other barbeiros' "choose a plano" options while inactive.

As `barbeiro@teste.com`:
4. `/painel/agenda`: confirm a deactivated serviço/produto never appears in "Agendar horário", "Atender agora", or the "adicionar serviço"/"adicionar produto"/"agendar próxima visita" pickers inside an atendimento — but an agendamento created before deactivation still opens and completes its atendimento normally, showing the original serviço/produto.

- [ ] **Step 3: No commit for this task** — it's verification-only; if any issue surfaces, fix it as a small follow-up commit referencing which task's step regressed.
