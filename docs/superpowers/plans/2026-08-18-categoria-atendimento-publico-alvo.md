# Categoria de atendimento e Índice de Público-Alvo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fase 1 de "Categorias de Atendimento e Indicadores de Performance" — marcar cada serviço do catálogo como cabelo/barba/outro, derivar automaticamente a categoria de cada visita (Só Cabelo / Só Barba / Cabelo+Barba) a partir dos serviços realizados nela, e mostrar no painel do barbeiro a distribuição por categoria e um Índice de Público-Alvo em destaque.

**Architecture:** Nova coluna `servicos.categoria_servico` (`'cabelo' | 'barba' | 'outro'`, default `'outro'`), editável pela tela `/admin/servicos` no mesmo padrão do campo `tipo` já existente. Uma função pura nova, `calcularDistribuicaoCategorias`, agrupa os atendimentos do mês por `agendamento_id`, classifica cada visita ignorando serviços `outro`, e soma. `/painel` passa a buscar `categoria_servico` no join que já faz com `servicos` e renderiza os números calculados em dois lugares: um 4º card no topo (Índice de Público-Alvo) e um novo Card de distribuição abaixo de "Ganhos por categoria".

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres/RLS), Tailwind CSS v4, shadcn/ui, Vitest (`tests/unit/**/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-08-18-categoria-atendimento-publico-alvo-design.md`

## Global Constraints

- `categoria_servico` aceita exatamente três valores: `cabelo`, `barba`, `outro`. Todo serviço já cadastrado nasce `outro` — nenhuma tentativa de adivinhar a partir do nome ou do campo `tipo` existente (`corte`/`servico_extra`, eixo diferente, sem correspondência 1:1).
- A categoria de uma visita é sempre **derivada**, nunca escolhida manualmente por ninguém em nenhuma tela de agendamento/atendimento.
- Uma **visita** é um `agendamento_id` — todo `atendimentos.agendamento_id` já é sempre preenchido hoje (confirmado: até um "lançamento avulso" cria um `agendamento` primeiro, em `atender-agora-form.tsx`). Não é necessário nenhum tratamento especial para `agendamento_id` nulo.
- Ao decidir a categoria de uma visita, serviços marcados `outro` são ignorados. Uma visita sem nenhum serviço `cabelo`/`barba` (só `outro`, ou só venda de produto) fica fora do denominador de todos os indicadores desta fase.
- A unidade contada é **visita no mês**, não cliente único — consistente com o resto do `/painel`, que já é inteiramente mensal.
- Divisão por zero (nenhuma visita classificável no mês) resulta em `0`, nunca em `NaN`/traço/card escondido — mesmo padrão já usado por `percentualCortes`/`percentualExtras`/`percentualProdutos` na própria página.
- Não usar `supabase db reset` para aplicar a migração — o banco local tem dados reais de testes manuais anteriores. Usar `npx supabase migration up`, que só aplica a migração pendente sem tocar nas linhas existentes.

---

### Task 1: Migração — coluna `categoria_servico` em `servicos`

**Files:**
- Create: `supabase/migrations/0027_servicos_categoria.sql`

**Interfaces:**
- Produces: `servicos.categoria_servico text not null default 'outro' check (categoria_servico in ('cabelo', 'barba', 'outro'))`. Task 2 (UI admin) e Task 4 (painel) leem essa coluna.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0027_servicos_categoria.sql`:

```sql
alter table servicos add column categoria_servico text not null default 'outro'
  check (categoria_servico in ('cabelo', 'barba', 'outro'));
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase migration up`
Expected: succeeds, no errors. Do **not** run `supabase db reset` — this local database has real data from manual testing throughout this project; `db reset` would wipe all of it. `migration up` applies only the new pending migration without touching existing rows. If it fails, report BLOCKED rather than falling back to `db reset`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0027_servicos_categoria.sql
git commit -m "feat: add categoria_servico column to servicos, defaulting to outro"
```

---

### Task 2: Admin — marcar categoria do serviço em `/admin/servicos`

**Files:**
- Modify: `src/components/servico-row.tsx` (whole file)
- Modify: `src/app/admin/servicos/page.tsx` (whole file)

**Interfaces:**
- Consumes: `servicos.categoria_servico` from Task 1.
- Produces: nothing consumed by later tasks (Task 4 reads `categoria_servico` directly from Supabase, not through this UI).

- [ ] **Step 1: Rewrite `servico-row.tsx`**

Replace `src/components/servico-row.tsx` in full:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TableRow, TableCell } from '@/components/ui/table'

type Servico = { id: string; nome: string; duracao_minutos: number; preco: number; ativo: boolean; tipo: string; categoria_servico: string }

const ROTULO_TIPO: Record<string, string> = { corte: 'Corte', servico_extra: 'Serviço extra' }
const ROTULO_CATEGORIA: Record<string, string> = { cabelo: 'Cabelo', barba: 'Barba', outro: 'Outro' }

export function ServicoRow({ servico }: { servico: Servico }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(servico.nome)
  const [duracaoMinutos, setDuracaoMinutos] = useState(servico.duracao_minutos)
  const [preco, setPreco] = useState(servico.preco)
  const [tipo, setTipo] = useState(servico.tipo)
  const [categoriaServico, setCategoriaServico] = useState(servico.categoria_servico)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('servicos').update({ nome, duracao_minutos: duracaoMinutos, preco, tipo, categoria_servico: categoriaServico }).eq('id', servico.id)
    setSalvando(false)
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setNome(servico.nome)
    setDuracaoMinutos(servico.duracao_minutos)
    setPreco(servico.preco)
    setTipo(servico.tipo)
    setCategoriaServico(servico.categoria_servico)
    setEditando(false)
  }

  async function alternarAtivo() {
    const supabase = getBrowserSupabaseClient()
    await supabase.from('servicos').update({ ativo: !servico.ativo }).eq('id', servico.id)
    router.refresh()
  }

  if (editando) {
    return (
      <TableRow>
        <TableCell><Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-32" /></TableCell>
        <TableCell><Input type="number" value={duracaoMinutos} onChange={(e) => setDuracaoMinutos(Number(e.target.value))} className="w-20" /></TableCell>
        <TableCell><Input type="number" step="0.01" value={preco} onChange={(e) => setPreco(Number(e.target.value))} className="w-24" /></TableCell>
        <TableCell>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="border rounded px-2 py-1 bg-input">
            <option value="corte">Corte</option>
            <option value="servico_extra">Serviço extra</option>
          </select>
        </TableCell>
        <TableCell>
          <select value={categoriaServico} onChange={(e) => setCategoriaServico(e.target.value)} className="border rounded px-2 py-1 bg-input">
            <option value="cabelo">Cabelo</option>
            <option value="barba">Barba</option>
            <option value="outro">Outro</option>
          </select>
        </TableCell>
        <TableCell className="flex gap-2">
          <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
          <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow className={servico.ativo ? '' : 'opacity-50'}>
      <TableCell>{servico.nome}</TableCell>
      <TableCell>{servico.duracao_minutos}min</TableCell>
      <TableCell>R$ {servico.preco}</TableCell>
      <TableCell>{ROTULO_TIPO[servico.tipo] ?? servico.tipo}</TableCell>
      <TableCell>{ROTULO_CATEGORIA[servico.categoria_servico] ?? servico.categoria_servico}</TableCell>
      <TableCell className="flex gap-2">
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">Editar</button>
        <button type="button" onClick={alternarAtivo} className="text-xs text-destructive underline">{servico.ativo ? 'Desativar' : 'Reativar'}</button>
      </TableCell>
    </TableRow>
  )
}
```

- [ ] **Step 2: Rewrite `admin/servicos/page.tsx`**

Replace `src/app/admin/servicos/page.tsx` in full:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ServicoRow } from '@/components/servico-row'
import { Table, TableHeader, TableBody, TableRow, TableHead } from '@/components/ui/table'

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
    tipo: (formData.get('tipo') as string) || 'corte',
    categoria_servico: (formData.get('categoria_servico') as string) || 'outro',
  })
  revalidatePath('/admin/servicos')
}

export default async function ServicosPage() {
  const supabase = await getServerSupabaseClient()
  const { data: servicos } = await supabase.from('servicos').select('*').order('nome')

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Serviços</h1>
      <form action={criarServico} className="flex gap-2 mb-6 flex-wrap">
        <Input name="nome" placeholder="Nome" required />
        <Input name="duracao_minutos" type="number" placeholder="Duração (min)" required />
        <Input name="preco" type="number" step="0.01" placeholder="Preço" required />
        <select name="tipo" defaultValue="corte" className="border rounded px-2 py-1 bg-input">
          <option value="corte">Corte</option>
          <option value="servico_extra">Serviço extra</option>
        </select>
        <select name="categoria_servico" defaultValue="outro" className="border rounded px-2 py-1 bg-input">
          <option value="cabelo">Cabelo</option>
          <option value="barba">Barba</option>
          <option value="outro">Outro</option>
        </select>
        <Button type="submit">Adicionar</Button>
      </form>
      <Table>
        <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Duração</TableHead><TableHead>Preço</TableHead><TableHead>Tipo</TableHead><TableHead>Categoria</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
        <TableBody>
          {servicos?.map((s) => <ServicoRow key={s.id} servico={s} />)}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/servico-row.tsx src/app/admin/servicos/page.tsx
git commit -m "feat: let admin classify servicos as cabelo/barba/outro"
```

---

### Task 3: Lógica pura — `calcularDistribuicaoCategorias`

**Files:**
- Create: `src/lib/categoria-atendimento.ts`
- Test: `tests/unit/categoria-atendimento.test.ts`

**Interfaces:**
- Produces: `type CategoriaServico = 'cabelo' | 'barba' | 'outro'`; `type AtendimentoParaCategoria = { agendamentoId: string; categoriaServico: CategoriaServico }`; `function calcularDistribuicaoCategorias(atendimentos: AtendimentoParaCategoria[]): { soCabelo: number; soBarba: number; cabeloEBarba: number; totalClassificado: number; indicePublicoAlvo: number }`. Task 4's `painel/page.tsx` calls this exact function with this exact input shape.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/categoria-atendimento.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { calcularDistribuicaoCategorias } from '@/lib/categoria-atendimento'

describe('calcularDistribuicaoCategorias', () => {
  it('classifies a visit with only cabelo services as Só Cabelo', () => {
    const result = calcularDistribuicaoCategorias([
      { agendamentoId: 'a1', categoriaServico: 'cabelo' },
    ])
    expect(result).toEqual({ soCabelo: 1, soBarba: 0, cabeloEBarba: 0, totalClassificado: 1, indicePublicoAlvo: 0 })
  })

  it('classifies a visit with only barba services as Só Barba', () => {
    const result = calcularDistribuicaoCategorias([
      { agendamentoId: 'a1', categoriaServico: 'barba' },
    ])
    expect(result).toEqual({ soCabelo: 0, soBarba: 1, cabeloEBarba: 0, totalClassificado: 1, indicePublicoAlvo: 0 })
  })

  it('classifies a visit with both cabelo and barba services as Cabelo + Barba', () => {
    const result = calcularDistribuicaoCategorias([
      { agendamentoId: 'a1', categoriaServico: 'cabelo' },
      { agendamentoId: 'a1', categoriaServico: 'barba' },
    ])
    expect(result).toEqual({ soCabelo: 0, soBarba: 0, cabeloEBarba: 1, totalClassificado: 1, indicePublicoAlvo: 100 })
  })

  it('ignores outro services when deciding a visit that also has cabelo/barba', () => {
    const result = calcularDistribuicaoCategorias([
      { agendamentoId: 'a1', categoriaServico: 'cabelo' },
      { agendamentoId: 'a1', categoriaServico: 'outro' },
    ])
    expect(result).toEqual({ soCabelo: 1, soBarba: 0, cabeloEBarba: 0, totalClassificado: 1, indicePublicoAlvo: 0 })
  })

  it('excludes a visit with only outro services from the total', () => {
    const result = calcularDistribuicaoCategorias([
      { agendamentoId: 'a1', categoriaServico: 'outro' },
    ])
    expect(result).toEqual({ soCabelo: 0, soBarba: 0, cabeloEBarba: 0, totalClassificado: 0, indicePublicoAlvo: 0 })
  })

  it('aggregates multiple visits and computes the índice de público-alvo', () => {
    const result = calcularDistribuicaoCategorias([
      { agendamentoId: 'a1', categoriaServico: 'cabelo' },
      { agendamentoId: 'a2', categoriaServico: 'barba' },
      { agendamentoId: 'a3', categoriaServico: 'cabelo' },
      { agendamentoId: 'a3', categoriaServico: 'barba' },
      { agendamentoId: 'a4', categoriaServico: 'cabelo' },
      { agendamentoId: 'a4', categoriaServico: 'barba' },
    ])
    expect(result).toEqual({ soCabelo: 1, soBarba: 1, cabeloEBarba: 2, totalClassificado: 4, indicePublicoAlvo: 50 })
  })

  it('returns all zeros for an empty list, with no division by zero', () => {
    const result = calcularDistribuicaoCategorias([])
    expect(result).toEqual({ soCabelo: 0, soBarba: 0, cabeloEBarba: 0, totalClassificado: 0, indicePublicoAlvo: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/categoria-atendimento'` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/categoria-atendimento.ts`:

```ts
export type CategoriaServico = 'cabelo' | 'barba' | 'outro'

export type AtendimentoParaCategoria = {
  agendamentoId: string
  categoriaServico: CategoriaServico
}

export type DistribuicaoCategorias = {
  soCabelo: number
  soBarba: number
  cabeloEBarba: number
  totalClassificado: number
  indicePublicoAlvo: number
}

export function calcularDistribuicaoCategorias(atendimentos: AtendimentoParaCategoria[]): DistribuicaoCategorias {
  const categoriasPorVisita = new Map<string, Set<CategoriaServico>>()
  for (const { agendamentoId, categoriaServico } of atendimentos) {
    if (categoriaServico === 'outro') continue
    const categorias = categoriasPorVisita.get(agendamentoId) ?? new Set<CategoriaServico>()
    categorias.add(categoriaServico)
    categoriasPorVisita.set(agendamentoId, categorias)
  }

  let soCabelo = 0
  let soBarba = 0
  let cabeloEBarba = 0

  for (const categorias of categoriasPorVisita.values()) {
    const temCabelo = categorias.has('cabelo')
    const temBarba = categorias.has('barba')
    if (temCabelo && temBarba) cabeloEBarba++
    else if (temCabelo) soCabelo++
    else if (temBarba) soBarba++
  }

  const totalClassificado = soCabelo + soBarba + cabeloEBarba
  const indicePublicoAlvo = totalClassificado > 0 ? Math.round((cabeloEBarba / totalClassificado) * 100) : 0

  return { soCabelo, soBarba, cabeloEBarba, totalClassificado, indicePublicoAlvo }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all 7 new tests green, no regressions in the existing `ociosidade.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/categoria-atendimento.ts tests/unit/categoria-atendimento.test.ts
git commit -m "feat: add calcularDistribuicaoCategorias pure function"
```

---

### Task 4: `/painel` — Índice de Público-Alvo e distribuição por categoria

**Files:**
- Modify: `src/app/painel/page.tsx`

**Interfaces:**
- Consumes: `calcularDistribuicaoCategorias`, `AtendimentoParaCategoria` from Task 3 (`src/lib/categoria-atendimento.ts`); `servicos.categoria_servico` from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the import**

In `src/app/painel/page.tsx`, add to the existing imports:

```tsx
import { calcularDistribuicaoCategorias } from '@/lib/categoria-atendimento'
```

- [ ] **Step 2: Extend the `AtendimentoRow` type and the `atendimentos` query**

Change the `AtendimentoRow` type (currently `servicos: { nome: string; tipo: 'corte' | 'servico_extra' } | null`) to:

```tsx
type AtendimentoRow = {
  preco: string
  comissao_valor: string | null
  servico_id: string
  agendamento_id: string
  servicos: { nome: string; tipo: 'corte' | 'servico_extra'; categoria_servico: 'cabelo' | 'barba' | 'outro' } | null
}
```

Change the `atendimentos` query (currently `.select('preco, comissao_valor, servico_id, servicos(nome, tipo)')`) to:

```tsx
  const { data: atendimentosData } = (await supabase
    .from('atendimentos')
    .select('preco, comissao_valor, servico_id, agendamento_id, servicos(nome, tipo, categoria_servico)')
    .eq('membro_id', membro!.id)
    .gte('data', inicioMes)) as { data: AtendimentoRow[] | null }
  const atendimentos = atendimentosData ?? []
```

- [ ] **Step 3: Compute the distribution**

Right after the existing `atendimentosCortes`/`atendimentosExtras` lines (which stay unchanged), add:

```tsx
  const distribuicaoCategorias = calcularDistribuicaoCategorias(
    atendimentos
      .filter((a) => a.agendamento_id && a.servicos)
      .map((a) => ({ agendamentoId: a.agendamento_id, categoriaServico: a.servicos!.categoria_servico }))
  )
```

- [ ] **Step 4: Add the 4th top card**

In the top `<div className="flex gap-4 flex-wrap mb-6">` block, right after the existing "Ocupação da agenda" `Card` and before the closing `</div>`, add:

```tsx
        <Card className="flex-1 min-w-[160px]">
          <CardContent>
            <p className="text-xs uppercase text-muted-foreground">Índice de Público-Alvo</p>
            <p className="text-2xl font-bold text-primary">{distribuicaoCategorias.indicePublicoAlvo}%</p>
          </CardContent>
        </Card>
```

- [ ] **Step 5: Add the distribution Card**

Right after the closing `</Card>` of the existing "Ganhos por categoria" Card (the one ending just before the "Tempo de cadeira (mês)" Card), add a new Card:

```tsx
      <Card className="mb-5">
        <CardContent className="p-6">
          <p className="font-heading text-base font-bold mb-5">Perfil dos clientes atendidos (mês)</p>
          <div className="grid grid-cols-3 gap-5 text-center">
            <div>
              <p className="text-2xl font-bold">{distribuicaoCategorias.soCabelo}</p>
              <p className="text-xs text-muted-foreground mt-1">Só Cabelo</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{distribuicaoCategorias.soBarba}</p>
              <p className="text-xs text-muted-foreground mt-1">Só Barba</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary">{distribuicaoCategorias.cabeloEBarba}</p>
              <p className="text-xs text-muted-foreground mt-1">Cabelo + Barba</p>
            </div>
          </div>
        </CardContent>
      </Card>
```

- [ ] **Step 6: Verify the build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/painel/page.tsx
git commit -m "feat: show categoria de atendimento distribution and índice de público-alvo on painel"
```

---

### Task 5: Regressão final

**Files:** none (verification only).

- [ ] **Step 1: Full automated regression**

Run:
```bash
npm test
npm run build
```
Expected: `npm test` shows all existing unit tests plus the 7 new `calcularDistribuicaoCategorias` tests passing, no regressions in `ociosidade.test.ts`; `npm run build` succeeds with no type errors.

- [ ] **Step 2: Manual end-to-end walkthrough (if a browser is available)**

As admin, go to `/admin/servicos` and mark one existing serviço as `Cabelo` and another as `Barba` (e.g. "Corte" → Cabelo, "Barba" → Barba). As barbeiro (or admin via "Atender agora"), register a lançamento avulso for a cliente including both of those two serviços in the same atendimento. Open `/painel` and confirm: the "Perfil dos clientes atendidos (mês)" card shows 1 in Cabelo + Barba, and the Índice de Público-Alvo card shows a non-zero percentage reflecting it. Register a second lançamento for a different cliente with only the Cabelo-tagged serviço, and confirm the "Só Cabelo" count increases by 1 while Cabelo + Barba is unaffected.

If no browser is available, document that limitation in the ledger instead of skipping the check silently — same pattern used in every prior plan this session.

- [ ] **Step 3: No commit for this task** — it's verification-only; if any issue surfaces, fix it as a small follow-up commit referencing which task's step regressed.
