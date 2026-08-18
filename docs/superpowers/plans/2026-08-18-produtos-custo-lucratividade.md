# Produtos: custo e lucratividade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fase 1 de "Produtos, Estoque, Custo e Lucratividade" — capturar o preço de compra de cada produto (a coluna já existe no banco, só nunca foi usada), congelar o custo no momento de cada venda (mesmo padrão já usado para o preço de venda e a comissão), e mostrar Faturamento de Produtos separado do Lucro de Produtos no painel do barbeiro.

**Architecture:** `produtos.preco_custo` já existe e passa a ser editável pela UI de admin. Nova coluna `vendas_produtos.custo_unitario`, preenchida automaticamente pelo trigger `processar_venda_produto()` (que já congela `preco_unitario` do mesmo jeito). `/painel` passa a buscar `custo_unitario` e o `preco_custo` atual do produto (como fallback para vendas antigas sem o valor congelado), calcula Custo e Lucro de Produtos, e renderiza dois badges novos no bloco "Produtos" que já existe.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres/RLS, pgTAP via `npx supabase test db`), Tailwind CSS v4, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-08-18-produtos-custo-lucratividade-design.md`

## Global Constraints

- Nenhuma coluna nova em `produtos` — `preco_custo` já existe desde a migração original, só nunca foi exposta na UI nem usada em cálculo nenhum.
- `vendas_produtos.custo_unitario` é nullable — vendas registradas antes desta migração ficam sem valor (não há como recuperar o custo real da época retroativamente).
- O campo "Preço de compra" no formulário de produto NÃO é obrigatório — não trava o cadastro de um produto cujo custo ainda não se sabe.
- Cálculo do custo de uma venda no agregado mensal: `(venda.custo_unitario ?? venda.produto.preco_custo ?? 0) * venda.quantidade` — o fallback pro custo atual do produto só se aplica a vendas antigas sem `custo_unitario` próprio.
- Lucro é sempre derivado (`faturamento - custo`), nunca armazenado.
- Terminologia: "lucro" ou "lucro bruto/comercial" — nunca "lucro líquido" (nenhuma despesa como impostos, taxas ou frete é descontada nesta fase).
- Nenhuma mudança de RLS — as policies de `produtos` e `vendas_produtos` já cobrem a tabela inteira, não colunas específicas.

---

### Task 1: Migração — `custo_unitario` congelado na venda

**Files:**
- Create: `supabase/migrations/0028_vendas_produtos_custo_unitario.sql`
- Create: `supabase/tests/database/0015_venda_produto_custo.test.sql`

**Interfaces:**
- Produces: `vendas_produtos.custo_unitario numeric(10,2)` (nullable), preenchida automaticamente pelo trigger `trg_venda_produto` a partir de `produtos.preco_custo` no momento do insert. Task 3 (`/painel`) lê essa coluna.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0028_vendas_produtos_custo_unitario.sql`:

```sql
alter table vendas_produtos add column custo_unitario numeric(10,2);

-- Same freeze-at-insert pattern already used for preco_unitario and
-- comissao_valor: reads produtos.preco_custo at the moment of the sale so a
-- later edit to the product's cost never retroactively changes the profit
-- already recorded on a past sale.
create or replace function public.processar_venda_produto()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_percentual numeric;
  v_estoque int;
  v_preco numeric;
  v_custo numeric;
begin
  select quantidade_estoque, preco_venda, preco_custo into v_estoque, v_preco, v_custo
  from produtos where id = new.produto_id and barbearia_id = new.barbearia_id for update;
  if v_estoque is null then
    raise exception 'Produto inválido para esta barbearia';
  end if;
  if v_estoque < new.quantidade then
    raise exception 'Estoque insuficiente para este produto';
  end if;

  update produtos set quantidade_estoque = quantidade_estoque - new.quantidade where id = new.produto_id;

  -- Same reasoning as aplicar_comissao_atendimento(): preco_unitario and
  -- custo_unitario are looked up server-side, never trusted from the client insert.
  new.preco_unitario := v_preco;
  new.custo_unitario := v_custo;

  select pc.percentual_produto into v_percentual
  from membros m join planos_carreira pc on pc.id = m.plano_carreira_id
  where m.id = new.membro_id;

  new.comissao_percentual_aplicado := coalesce(v_percentual, 0);
  new.comissao_valor := round(new.preco_unitario * new.quantidade * coalesce(v_percentual, 0) / 100, 2);
  return new;
end;
$$;
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase migration up`
Expected: succeeds, no errors. Do **not** run `supabase db reset` — this local database has real data from manual testing throughout this project; `db reset` would wipe all of it. `migration up` applies only the new pending migration without touching existing rows. If it fails, report BLOCKED rather than falling back to `db reset`.

- [ ] **Step 3: Write the pgTAP test**

Create `supabase/tests/database/0015_venda_produto_custo.test.sql`:

```sql
begin;
select plan(3);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com');

insert into planos_carreira (id, barbearia_id, nome, percentual_produto, percentual_servico) values
  ('ac000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Sênior', 10, 30);

insert into membros (id, barbearia_id, user_id, papel, nome, plano_carreira_id) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João', 'ac000000-0000-0000-0000-000000000001');

insert into clientes (id, barbearia_id, nome, telefone) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Marcos', '11900000009');

insert into produtos (id, barbearia_id, nome, preco_custo, preco_venda, quantidade_estoque) values
  ('d1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Pomada', 20, 25, 50);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

-- Deliberately send a bogus preco_unitario (999999) too, mirroring the
-- existing atendimentos test's proof that client-supplied values are ignored.
insert into vendas_produtos (barbearia_id, membro_id, cliente_id, produto_id, quantidade, preco_unitario) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 3, 999999);

select is(
  (select custo_unitario from vendas_produtos order by criado_em desc limit 1),
  20.00,
  'custo_unitario is frozen at the produto''s preco_custo (R$20) at the time of sale'
);

reset role;

update produtos set preco_custo = 35 where id = 'd1000000-0000-0000-0000-000000000001';

select is(
  (select custo_unitario from vendas_produtos order by criado_em desc limit 1),
  20.00,
  'editing the produto''s preco_custo afterward does not retroactively change custo_unitario on the already-recorded sale'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

insert into vendas_produtos (barbearia_id, membro_id, cliente_id, produto_id, quantidade, preco_unitario) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 1, 999999);

reset role;

select is(
  (select custo_unitario from vendas_produtos order by criado_em desc limit 1),
  35.00,
  'a new sale made after the price change freezes the new preco_custo (R$35)'
);

select * from finish();
rollback;
```

- [ ] **Step 4: Run the pgTAP suite**

Run: `npx supabase test db`
Expected: all files pass, including the new `0015_venda_produto_custo.test.sql` (3/3 assertions), with no regressions in the other 14 files.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0028_vendas_produtos_custo_unitario.sql supabase/tests/database/0015_venda_produto_custo.test.sql
git commit -m "feat: freeze custo_unitario on vendas_produtos at time of sale"
```

---

### Task 2: Admin — capturar preço de compra em `/admin/produtos`

**Files:**
- Modify: `src/app/admin/produtos/page.tsx` (whole file)
- Modify: `src/components/produto-row.tsx` (whole file)

**Interfaces:**
- Consumes: `produtos.preco_custo` (already exists in the schema, from before this plan).
- Produces: nothing consumed by later tasks (Task 3 reads `preco_custo` directly from Supabase, not through this UI).

- [ ] **Step 1: Rewrite `admin/produtos/page.tsx`**

Replace `src/app/admin/produtos/page.tsx` in full:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
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
      <form action={criarProduto} className="flex gap-2 mb-6 flex-wrap">
        <Input name="nome" placeholder="Nome" required />
        <Input name="categoria" placeholder="Categoria" />
        <Input name="preco_custo" type="number" step="0.01" placeholder="Preço de compra" />
        <Input name="preco_venda" type="number" step="0.01" placeholder="Preço de venda" required />
        <Input name="quantidade_estoque" type="number" placeholder="Estoque inicial" required />
        <Input name="estoque_minimo" type="number" placeholder="Estoque mínimo" required />
        <Button type="submit">Adicionar</Button>
      </form>
      <Table>
        <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Categoria</TableHead><TableHead>Custo</TableHead><TableHead>Preço</TableHead><TableHead>Estoque</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
        <TableBody>
          {produtos?.map((p) => <ProdutoRow key={p.id} produto={p} />)}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `produto-row.tsx`**

Replace `src/components/produto-row.tsx` in full:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TableRow, TableCell } from '@/components/ui/table'

type Produto = {
  id: string
  nome: string
  categoria: string | null
  preco_custo: number
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
  const [precoCusto, setPrecoCusto] = useState(produto.preco_custo)
  const [precoVenda, setPrecoVenda] = useState(produto.preco_venda)
  const [quantidadeEstoque, setQuantidadeEstoque] = useState(produto.quantidade_estoque)
  const [estoqueMinimo, setEstoqueMinimo] = useState(produto.estoque_minimo)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('produtos').update({
      nome, categoria: categoria || null, preco_custo: precoCusto, preco_venda: precoVenda,
      quantidade_estoque: quantidadeEstoque, estoque_minimo: estoqueMinimo,
    }).eq('id', produto.id)
    setSalvando(false)
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setNome(produto.nome)
    setCategoria(produto.categoria ?? '')
    setPrecoCusto(produto.preco_custo)
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
      <TableRow>
        <TableCell><Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-32" /></TableCell>
        <TableCell><Input value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-28" /></TableCell>
        <TableCell><Input type="number" step="0.01" value={precoCusto} onChange={(e) => setPrecoCusto(Number(e.target.value))} className="w-24" /></TableCell>
        <TableCell><Input type="number" step="0.01" value={precoVenda} onChange={(e) => setPrecoVenda(Number(e.target.value))} className="w-24" /></TableCell>
        <TableCell>
          <Input type="number" value={quantidadeEstoque} onChange={(e) => setQuantidadeEstoque(Number(e.target.value))} className="w-20" />
        </TableCell>
        <TableCell className="flex gap-2">
          <Input type="number" value={estoqueMinimo} onChange={(e) => setEstoqueMinimo(Number(e.target.value))} className="w-20" />
          <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
          <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow className={`${produto.ativo ? '' : 'opacity-50'} ${produto.quantidade_estoque <= produto.estoque_minimo ? 'text-destructive' : ''}`}>
      <TableCell>{produto.nome}</TableCell>
      <TableCell>{produto.categoria}</TableCell>
      <TableCell>R$ {produto.preco_custo}</TableCell>
      <TableCell>R$ {produto.preco_venda}</TableCell>
      <TableCell>{produto.quantidade_estoque}</TableCell>
      <TableCell className="flex gap-2">
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">Editar</button>
        <button type="button" onClick={alternarAtivo} className="text-xs text-destructive underline">{produto.ativo ? 'Desativar' : 'Reativar'}</button>
      </TableCell>
    </TableRow>
  )
}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/produtos/page.tsx src/components/produto-row.tsx
git commit -m "feat: let admin set preco de compra on produtos"
```

---

### Task 3: `/painel` — Custo e Lucro de Produtos

**Files:**
- Modify: `src/app/painel/page.tsx`

**Interfaces:**
- Consumes: `vendas_produtos.custo_unitario` and `produtos.preco_custo` from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Extend the `VendaRow` type**

Change the `VendaRow` type (currently `produtos: { nome: string } | null`) to:

```tsx
type VendaRow = {
  quantidade: number
  preco_unitario: string
  custo_unitario: string | null
  comissao_valor: string | null
  produto_id: string
  produtos: { nome: string; preco_custo: string } | null
}
```

Note: `preco_custo` here is typed `string`, not `number` — matching this file's existing convention for every other numeric Postgres column (`preco`, `preco_unitario`, `comissao_valor` are all `string`/`string | null`, because PostgREST serializes `numeric` columns as JSON strings to avoid float precision loss). This differs from `produto-row.tsx`'s `Produto` type, which already types `preco_venda` as `number` — that's a separate, pre-existing convention in that other file; don't "fix" it as part of this task, and don't copy it here.

- [ ] **Step 2: Extend the `vendas_produtos` query**

Change the query (currently `.select('quantidade, preco_unitario, comissao_valor, produto_id, produtos(nome)')`) to:

```tsx
  const { data: vendasData } = (await supabase
    .from('vendas_produtos')
    .select('quantidade, preco_unitario, custo_unitario, comissao_valor, produto_id, produtos(nome, preco_custo)')
    .eq('membro_id', membro!.id)
    .gte('data', inicioMes)) as { data: VendaRow[] | null }
  const vendas = vendasData ?? []
```

- [ ] **Step 3: Compute custo and lucro**

Right after the existing `const comissaoProdutos = vendas.reduce((s, v) => s + Number(v.comissao_valor ?? 0), 0)` line (which stays unchanged), add:

```tsx
  const custoProdutos = vendas.reduce((s, v) => s + Number(v.custo_unitario ?? v.produtos?.preco_custo ?? 0) * v.quantidade, 0)
  const lucroProdutos = faturamentoProdutos - custoProdutos
```

- [ ] **Step 4: Add the Custo and Lucro badges**

In the "Produtos" block inside the "Ganhos por categoria" Card, change this:

```tsx
              <span className="flex items-center gap-2">
                <span className="text-base font-bold">R$ {faturamentoProdutos.toFixed(2)}</span>
                <span className="inline-flex items-baseline gap-1 rounded-full bg-primary/10 text-primary border border-primary/30 px-3 py-1 text-xs font-bold">
                  <span className="text-[10px] font-semibold uppercase tracking-wide opacity-75">comissão</span> R$ {comissaoProdutos.toFixed(2)}
                </span>
              </span>
```

to:

```tsx
              <span className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-bold">R$ {faturamentoProdutos.toFixed(2)}</span>
                <span className="inline-flex items-baseline gap-1 rounded-full bg-primary/10 text-primary border border-primary/30 px-3 py-1 text-xs font-bold">
                  <span className="text-[10px] font-semibold uppercase tracking-wide opacity-75">comissão</span> R$ {comissaoProdutos.toFixed(2)}
                </span>
                <span className="inline-flex items-baseline gap-1 rounded-full bg-muted text-muted-foreground border border-border px-3 py-1 text-xs font-bold">
                  <span className="text-[10px] font-semibold uppercase tracking-wide opacity-75">custo</span> R$ {custoProdutos.toFixed(2)}
                </span>
                <span className="inline-flex items-baseline gap-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 px-3 py-1 text-xs font-bold">
                  <span className="text-[10px] font-semibold uppercase tracking-wide opacity-75">lucro</span> R$ {lucroProdutos.toFixed(2)}
                </span>
              </span>
```

(This is the only `<span className="flex items-center gap-2">` inside the "Produtos" block specifically — the "Cortes" and "Serviços extras" blocks above it have the identical wrapper markup but are not touched by this task.)

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/painel/page.tsx
git commit -m "feat: show custo and lucro de produtos on painel"
```

---

### Task 4: Regressão final

**Files:** none (verification only).

- [ ] **Step 1: Full automated regression**

Run:
```bash
npm test
npm run build
npx supabase test db
```
Expected: `npm test` shows all existing unit tests still passing (this plan adds no new pure-function logic — no unit test file to create, same precedent as the categoria-origem-cliente plan); `npm run build` succeeds with no type errors; `npx supabase test db` shows all 15 pgTAP suites passing, including the new `0015_venda_produto_custo.test.sql`.

- [ ] **Step 2: Manual end-to-end walkthrough (if a browser is available)**

As admin, go to `/admin/produtos` and either create a new produto or edit an existing one to set: Preço de compra R$ 20, Preço de venda R$ 25. As barbeiro (or admin via "Atender agora"/lançamento avulso), register a sale of 10 units of that produto. Open `/painel` and confirm the "Produtos" block shows Faturamento R$ 250,00, Custo R$ 200,00, Lucro R$ 50,00. Then, back in `/admin/produtos`, edit the same produto's Preço de compra to R$ 22, refresh `/painel`, and confirm the Custo/Lucro numbers for that already-recorded sale are unchanged (still R$ 200,00 / R$ 50,00) — proving the freeze-at-sale behavior works end-to-end, not just at the database level.

If no browser is available, document that limitation in the ledger instead of skipping the check silently — same pattern used in every prior plan this session.

- [ ] **Step 3: No commit for this task** — it's verification-only; if any issue surfaces, fix it as a small follow-up commit referencing which task's step regressed.
