# Produtos de Loja (roupas, perfumes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catálogo e venda de produtos de varejo (roupas, perfumes) independentes dos produtos de barbearia, com comissão própria pro barbeiro, em duas telas novas: `/admin/loja` (catálogo + venda em nome de qualquer barbeiro + histórico da barbearia) e `/painel/loja` (catálogo leitura + venda própria + histórico próprio).

**Architecture:** Duas tabelas novas espelhando exatamente `produtos`/`vendas_produtos` (`produtos_loja`, `vendas_loja`, sem `agendamento_id`), um trigger novo (`processar_venda_loja`) que congela preço/custo/comissão no insert e decrementa estoque, e um campo novo (`percentual_loja`) no plano de carreira. RLS já nasce cobrindo tanto "barbeiro vende em nome próprio" quanto "admin vende em nome de qualquer barbeiro" — lição aprendida da feature de agenda, onde essa segunda política faltou e só foi descoberta na revisão final. Um componente de venda compartilhado (`VendaLojaForm`) é reaproveitado pelas duas páginas, cada uma passando o `membroId` certo.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui, Supabase (Postgres + RLS + pgTAP).

**Spec:** `docs/superpowers/specs/2026-08-27-produtos-loja-design.md`

## Global Constraints

- **Fora dos indicadores existentes** — faturamento do admin (`/admin`), ticket médio, `ranking_cliente`, conversão de prospecção (`/admin/prospeccao`) e a meta de faturamento do mês na sidebar do barbeiro (`/painel` layout) NÃO somam `vendas_loja`. A ficha do cliente (`ficha-cliente.tsx`) também não muda.
- **RLS de `vendas_loja` cobre os dois casos de INSERT desde o início**: barbeiro insere em nome próprio, admin insere em nome de qualquer barbeiro da barbearia.
- **`percentual_loja` é opcional** (sem `not null`) — coluna nova numa tabela (`planos_carreira`) que já tem linhas; não dá pra forçar preenchimento retroativo. O trigger trata `null` como 0% de comissão (mesmo padrão de `coalesce(v_percentual, 0)` já usado em `processar_venda_produto`/`aplicar_comissao_atendimento`).
- **Preço/custo/comissão sempre calculados no servidor** (trigger `before insert`), nunca confiados no valor enviado pelo cliente — mesmo padrão de `processar_venda_produto`.

---

### Task 1: Migration (`produtos_loja`, `vendas_loja`, `percentual_loja`, RLS, trigger) + pgTAP

**Files:**
- Create: `supabase/migrations/0035_produtos_loja.sql`
- Create: `supabase/tests/database/0020_produtos_loja.test.sql`

**Interfaces:**
- Produces: tabela `produtos_loja` (`id, barbearia_id, nome, categoria, preco_custo, preco_venda, quantidade_estoque, estoque_minimo, unidade_medida, ativo`); tabela `vendas_loja` (`id, barbearia_id, membro_id, cliente_id, produto_id, quantidade, preco_unitario, custo_unitario, comissao_percentual_aplicado, comissao_valor, data, criado_em`); coluna `planos_carreira.percentual_loja numeric(5,2)`. Usadas por todas as tasks seguintes.

- [ ] **Step 1: Criar `supabase/migrations/0035_produtos_loja.sql`**

```sql
-- Produtos de varejo (roupas, perfumes) independentes de uma visita/
-- atendimento — espelha produtos/vendas_produtos (0002_catalogo.sql,
-- 0007_lancamentos.sql, 0028_vendas_produtos_custo_unitario.sql), sem
-- agendamento_id, com comissão própria (percentual_loja) em vez de
-- reaproveitar percentual_produto.
create table produtos_loja (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  nome text not null,
  categoria text,
  preco_custo numeric(10,2) not null default 0,
  preco_venda numeric(10,2) not null check (preco_venda >= 0),
  quantidade_estoque int not null default 0 check (quantidade_estoque >= 0),
  estoque_minimo int not null default 0,
  unidade_medida text not null default 'un',
  ativo boolean not null default true
);

create table vendas_loja (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  membro_id uuid not null references membros(id),
  cliente_id uuid not null references clientes(id),
  produto_id uuid not null references produtos_loja(id),
  quantidade int not null check (quantidade > 0),
  preco_unitario numeric(10,2) not null,
  custo_unitario numeric(10,2),
  comissao_percentual_aplicado numeric(5,2),
  comissao_valor numeric(10,2),
  data date not null default current_date,
  criado_em timestamptz not null default now()
);

alter table planos_carreira add column percentual_loja numeric(5,2) check (percentual_loja between 0 and 100);

create or replace function public.processar_venda_loja()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_percentual numeric;
  v_estoque int;
  v_preco numeric;
  v_custo numeric;
begin
  select quantidade_estoque, preco_venda, preco_custo into v_estoque, v_preco, v_custo
  from produtos_loja where id = new.produto_id and barbearia_id = new.barbearia_id for update;
  if v_estoque is null then
    raise exception 'Produto de loja inválido para esta barbearia';
  end if;
  if v_estoque < new.quantidade then
    raise exception 'Estoque insuficiente para este produto';
  end if;

  update produtos_loja set quantidade_estoque = quantidade_estoque - new.quantidade where id = new.produto_id;

  new.preco_unitario := v_preco;
  new.custo_unitario := v_custo;

  select pc.percentual_loja into v_percentual
  from membros m join planos_carreira pc on pc.id = m.plano_carreira_id
  where m.id = new.membro_id;

  new.comissao_percentual_aplicado := coalesce(v_percentual, 0);
  new.comissao_valor := round(new.preco_unitario * new.quantidade * coalesce(v_percentual, 0) / 100, 2);
  return new;
end;
$$;

create trigger trg_venda_loja
  before insert on vendas_loja
  for each row execute function public.processar_venda_loja();

alter table produtos_loja enable row level security;
alter table vendas_loja enable row level security;

create policy "membros leem produtos_loja" on produtos_loja for select
  using (barbearia_id = auth_barbearia_id());
create policy "admin gerencia produtos_loja" on produtos_loja for all
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin')
  with check (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');

create policy "admin le vendas_loja da barbearia" on vendas_loja for select
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
create policy "barbeiro le proprias vendas_loja" on vendas_loja for select
  using (membro_id = auth_membro_id());
create policy "barbeiro insere proprias vendas_loja" on vendas_loja for insert
  with check (
    membro_id = auth_membro_id()
    and barbearia_id = auth_barbearia_id()
    and exists (select 1 from clientes c where c.id = cliente_id and c.barbearia_id = auth_barbearia_id())
    and exists (select 1 from produtos_loja p where p.id = produto_id and p.barbearia_id = auth_barbearia_id())
  );
create policy "admin insere vendas_loja" on vendas_loja for insert
  with check (
    barbearia_id = auth_barbearia_id()
    and auth_papel() = 'admin'
    and exists (select 1 from membros m where m.id = membro_id and m.barbearia_id = auth_barbearia_id())
    and exists (select 1 from clientes c where c.id = cliente_id and c.barbearia_id = auth_barbearia_id())
    and exists (select 1 from produtos_loja p where p.id = produto_id and p.barbearia_id = auth_barbearia_id())
  );
create policy "admin edita vendas_loja" on vendas_loja for update
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
create policy "admin remove vendas_loja" on vendas_loja for delete
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
```

- [ ] **Step 2: Criar `supabase/tests/database/0020_produtos_loja.test.sql`**

```sql
begin;
select plan(4);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'admin@example.com'),
  ('cccccccc-0000-0000-0000-000000000003', 'marcos@example.com');

insert into planos_carreira (id, barbearia_id, nome, percentual_produto, percentual_servico, percentual_loja) values
  ('ac000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Sênior', 10, 30, 15);

insert into membros (id, barbearia_id, user_id, papel, nome, plano_carreira_id) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João', 'ac000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000002', 'admin', 'Admin', null),
  ('a1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000003', 'barbeiro', 'Marcos', 'ac000000-0000-0000-0000-000000000001');

insert into produtos_loja (id, barbearia_id, nome, preco_custo, preco_venda, quantidade_estoque, estoque_minimo) values
  ('e1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Camisa polo', 40, 100, 10, 1);

insert into clientes (id, barbearia_id, nome, telefone) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Cliente Um', '11900000001');

-- João vende 2 camisas pra si mesmo.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

insert into vendas_loja (barbearia_id, membro_id, cliente_id, produto_id, quantidade, preco_unitario) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 2, 999999);

select is(
  (select comissao_valor from vendas_loja where membro_id = 'a1000000-0000-0000-0000-000000000001'),
  30.00,
  'commission uses percentual_loja (15% of R$100 x 2 = R$30), ignoring the bogus client-supplied preco_unitario'
);

select is(
  (select quantidade_estoque from produtos_loja where id = 'e1000000-0000-0000-0000-000000000001'),
  8,
  'stock is decremented by the quantity sold'
);

-- Admin vende em nome do Marcos (outro barbeiro).
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);

insert into vendas_loja (barbearia_id, membro_id, cliente_id, produto_id, quantidade, preco_unitario) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 1, 100);

select is(
  (select count(*)::int from vendas_loja where membro_id = 'a1000000-0000-0000-0000-000000000003'),
  1,
  'admin can insert a venda_loja on behalf of another barbeiro'
);

select is(
  (select comissao_valor from vendas_loja where membro_id = 'a1000000-0000-0000-0000-000000000003'),
  15.00,
  'commission on the admin-recorded sale is credited using the TARGET barbeiro (Marcos) plano, not the admin'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Verificação (se houver Supabase CLI/docker disponível)**

Run: `supabase test db`
Expected: todos os testes passam, incluindo `0020_produtos_loja.test.sql`.

Se não houver Supabase CLI disponível no ambiente (sem docker), pular este step e sinalizar no relatório — mesma situação já registrada nas tasks anteriores desta sessão (migrations `0032`/`0034`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0035_produtos_loja.sql supabase/tests/database/0020_produtos_loja.test.sql
git commit -m "feat: add produtos_loja/vendas_loja tables with own commission rate"
```

---

### Task 2: `VendaLojaForm` (componente de venda compartilhado)

**Files:**
- Create: `src/components/venda-loja-form.tsx`

**Interfaces:**
- Consumes: `ClienteAutocomplete` (`src/components/cliente-autocomplete.tsx`, já existente); RPC `criar_ou_obter_cliente` e tabela `vendas_loja` (Task 1).
- Produces: `VendaLojaForm({ barbeariaId: string; membroId: string; produtos: { id: string; nome: string; preco_venda: number; quantidade_estoque: number; ativo: boolean }[]; onSalvo?: () => void })` — usado por `/admin/loja` (Task 3, via `AdminVendaLoja`) e `/painel/loja` (Task 4).

- [ ] **Step 1: Criar `src/components/venda-loja-form.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { ClienteAutocomplete } from './cliente-autocomplete'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { CategoriaOrigem } from '@/lib/categorias-origem'

type ProdutoLoja = { id: string; nome: string; preco_venda: number; quantidade_estoque: number; ativo: boolean }

export function VendaLojaForm({
  barbeariaId, membroId, produtos, onSalvo,
}: {
  barbeariaId: string
  membroId: string
  produtos: ProdutoLoja[]
  onSalvo?: () => void
}) {
  const router = useRouter()
  const [cliente, setCliente] = useState<{ nome: string; telefone: string; categoriaOrigem?: CategoriaOrigem; reconhecido?: boolean } | null>(null)
  const [produtoId, setProdutoId] = useState('')
  const [quantidade, setQuantidade] = useState(1)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [clienteAutocompleteKey, setClienteAutocompleteKey] = useState(0)

  async function salvar() {
    if (!cliente || !cliente.nome || !cliente.telefone) { setMensagem('Preencha o cliente.'); return }
    if (!cliente.reconhecido && !cliente.categoriaOrigem) { setMensagem('Escolha como o cliente conheceu a barbearia.'); return }
    if (!produtoId) { setMensagem('Escolha um produto.'); return }

    setSalvando(true)
    setMensagem(null)
    const supabase = getBrowserSupabaseClient()

    const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
      p_barbearia_id: barbeariaId, p_nome: cliente.nome, p_telefone: cliente.telefone,
      p_categoria_origem: cliente.categoriaOrigem ?? null,
    })
    if (clienteId.error) { setMensagem(clienteId.error.message); setSalvando(false); return }

    const produto = produtos.find((p) => p.id === produtoId)!
    const { error } = await supabase.from('vendas_loja').insert({
      barbearia_id: barbeariaId, membro_id: membroId, cliente_id: clienteId.data,
      produto_id: produtoId, quantidade, preco_unitario: produto.preco_venda,
    })
    setSalvando(false)
    if (error) { setMensagem(error.message); return }

    setMensagem('Venda registrada com sucesso!')
    setCliente(null)
    setClienteAutocompleteKey((atual) => atual + 1)
    setProdutoId('')
    setQuantidade(1)
    router.refresh()
    onSalvo?.()
  }

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="font-heading text-base font-bold mb-5">Registrar venda</h2>
        <ClienteAutocomplete key={clienteAutocompleteKey} onResolved={setCliente} />
        <div className="flex gap-2 mt-3">
          <Select value={produtoId} onChange={(e) => setProdutoId(e.target.value)} className="flex-1">
            <option value="">Produto</option>
            {produtos.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome} (R${p.preco_venda} · estoque: {p.quantidade_estoque})</option>)}
          </Select>
          <Input type="number" min={1} value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value))} className="w-20" />
        </div>
        <Button type="button" onClick={salvar} disabled={salvando} className="w-full mt-4">Registrar venda</Button>
        {mensagem && <p className="text-sm text-muted-foreground mt-2">{mensagem}</p>}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 3: Commit**

```bash
git add src/components/venda-loja-form.tsx
git commit -m "feat: add shared VendaLojaForm component"
```

---

### Task 3: `/admin/loja` (catálogo, venda em nome de qualquer barbeiro, histórico) + navegação admin

**Files:**
- Create: `src/components/produto-loja-row.tsx`
- Create: `src/components/admin-venda-loja.tsx`
- Create: `src/app/admin/loja/page.tsx`
- Modify: `src/app/admin/layout.tsx`
- Modify: `src/components/admin/sidebar.tsx`

**Interfaces:**
- Consumes: `VendaLojaForm` (Task 2), `produtos_loja`/`vendas_loja` (Task 1).
- Produces: `AdminVendaLoja({ barbeariaId, barbeiros, produtos })` — só usado por `src/app/admin/loja/page.tsx`, nenhuma outra task consome.

- [ ] **Step 1: Criar `src/components/produto-loja-row.tsx`**

Cópia de `src/components/produto-row.tsx`, trocando a tabela pra `produtos_loja`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TableRow, TableCell } from '@/components/ui/table'

type ProdutoLoja = {
  id: string
  nome: string
  categoria: string | null
  preco_custo: number
  preco_venda: number
  quantidade_estoque: number
  estoque_minimo: number
  ativo: boolean
}

export function ProdutoLojaRow({ produto }: { produto: ProdutoLoja }) {
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
    await supabase.from('produtos_loja').update({
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
    await supabase.from('produtos_loja').update({ ativo: !produto.ativo }).eq('id', produto.id)
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

- [ ] **Step 2: Criar `src/components/admin-venda-loja.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { Select } from '@/components/ui/select'
import { VendaLojaForm } from './venda-loja-form'

type Barbeiro = { id: string; nome: string }
type ProdutoLoja = { id: string; nome: string; preco_venda: number; quantidade_estoque: number; ativo: boolean }

export function AdminVendaLoja({
  barbeariaId, barbeiros, produtos,
}: { barbeariaId: string; barbeiros: Barbeiro[]; produtos: ProdutoLoja[] }) {
  const [barbeiroId, setBarbeiroId] = useState('')

  return (
    <div className="flex flex-col gap-4">
      <Select value={barbeiroId} onChange={(e) => setBarbeiroId(e.target.value)} aria-label="Barbeiro" className="w-56">
        <option value="">Selecione um barbeiro</option>
        {barbeiros.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
      </Select>

      {barbeiroId && <VendaLojaForm barbeariaId={barbeariaId} membroId={barbeiroId} produtos={produtos} />}
    </div>
  )
}
```

- [ ] **Step 3: Criar `src/app/admin/loja/page.tsx`**

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ProdutoLojaRow } from '@/components/produto-loja-row'
import { AdminVendaLoja } from '@/components/admin-venda-loja'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'

async function criarProdutoLoja(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('produtos_loja').insert({
    barbearia_id: membro!.barbearia_id,
    nome: formData.get('nome') as string,
    categoria: formData.get('categoria') as string,
    preco_custo: Number(formData.get('preco_custo')) || 0,
    preco_venda: Number(formData.get('preco_venda')),
    quantidade_estoque: Number(formData.get('quantidade_estoque')),
    estoque_minimo: Number(formData.get('estoque_minimo')),
  })
  revalidatePath('/admin/loja')
}

export default async function LojaPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const { data: produtos } = await supabase.from('produtos_loja').select('*').eq('barbearia_id', membro!.barbearia_id).order('nome')
  const { data: barbeiros } = await supabase
    .from('membros').select('id, nome')
    .eq('barbearia_id', membro!.barbearia_id).eq('papel', 'barbeiro').eq('ativo', true)
    .order('nome')
  const { data: vendas } = await supabase
    .from('vendas_loja')
    .select('data, quantidade, preco_unitario, comissao_valor, clientes(nome), produtos_loja(nome), membros(nome)')
    .eq('barbearia_id', membro!.barbearia_id)
    .order('criado_em', { ascending: false })
    .limit(50) as {
      data: { data: string; quantidade: number; preco_unitario: number; comissao_valor: number; clientes: { nome: string } | null; produtos_loja: { nome: string } | null; membros: { nome: string } | null }[] | null
    }

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Loja</h1>

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Adicionar produto</h2>
          <form action={criarProdutoLoja} className="flex gap-2 flex-wrap">
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

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Produtos cadastrados</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Categoria</TableHead><TableHead>Custo</TableHead><TableHead>Preço</TableHead><TableHead>Estoque</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {produtos?.map((p) => <ProdutoLojaRow key={p.id} produto={p} />)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="mb-6">
        <AdminVendaLoja barbeariaId={membro!.barbearia_id} barbeiros={barbeiros ?? []} produtos={(produtos ?? []).filter((p) => p.ativo)} />
      </div>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Vendas recentes</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Produto</TableHead><TableHead>Qtd</TableHead><TableHead>Valor</TableHead><TableHead>Comissão</TableHead><TableHead>Barbeiro</TableHead></TableRow></TableHeader>
            <TableBody>
              {(vendas ?? []).map((v, i) => (
                <TableRow key={i}>
                  <TableCell>{new Date(v.data).toLocaleDateString()}</TableCell>
                  <TableCell>{v.clientes?.nome ?? '—'}</TableCell>
                  <TableCell>{v.produtos_loja?.nome ?? '—'}</TableCell>
                  <TableCell>{v.quantidade}</TableCell>
                  <TableCell>R$ {(v.preco_unitario * v.quantidade).toFixed(2)}</TableCell>
                  <TableCell>R$ {Number(v.comissao_valor).toFixed(2)}</TableCell>
                  <TableCell>{v.membros?.nome ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {(vendas ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma venda registrada ainda.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Adicionar "Loja" ao `NAV_ITEMS` de `src/app/admin/layout.tsx`**

Encontrar:
```ts
  { href: '/admin/produtos', label: 'Produtos' },
  { href: '/admin/planos-carreira', label: 'Planos de carreira' },
```
Substituir por:
```ts
  { href: '/admin/produtos', label: 'Produtos' },
  { href: '/admin/loja', label: 'Loja' },
  { href: '/admin/planos-carreira', label: 'Planos de carreira' },
```

- [ ] **Step 5: Adicionar o ícone de "Loja" ao `ICON_PATHS` de `src/components/admin/sidebar.tsx`**

Encontrar:
```tsx
  '/admin/produtos': (
    <>
      <path d="M3 7.5l9-4.5 9 4.5-9 4.5-9-4.5z" />
      <path d="M3 7.5v9l9 4.5 9-4.5v-9" />
      <path d="M12 12v9" />
    </>
  ),
  '/admin/planos-carreira': (
```
Substituir por:
```tsx
  '/admin/produtos': (
    <>
      <path d="M3 7.5l9-4.5 9 4.5-9 4.5-9-4.5z" />
      <path d="M3 7.5v9l9 4.5 9-4.5v-9" />
      <path d="M12 12v9" />
    </>
  ),
  '/admin/loja': (
    <>
      <path d="M6 8h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  '/admin/planos-carreira': (
```

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 7: Verificação visual manual**

Login como admin. Confirmar o novo item "Loja" na sidebar (ícone de sacola), logo depois de "Produtos". Abrir `/admin/loja`: cadastrar um produto, confirmar que aparece na tabela, editar preço/estoque inline e salvar, desativar e reativar. Selecionar um barbeiro no seletor de venda, registrar uma venda (cliente novo via autocomplete + produto + quantidade), confirmar que aparece em "Vendas recentes" com a comissão certa e que o estoque do produto baixou na tabela de cima.

- [ ] **Step 8: Commit**

```bash
git add src/components/produto-loja-row.tsx src/components/admin-venda-loja.tsx src/app/admin/loja/page.tsx src/app/admin/layout.tsx src/components/admin/sidebar.tsx
git commit -m "feat: add admin loja page (catalog, sell on behalf of any barbeiro, history)"
```

---

### Task 4: `/painel/loja` (catálogo leitura, venda própria, histórico próprio) + navegação painel

**Files:**
- Create: `src/app/painel/loja/page.tsx`
- Modify: `src/app/painel/layout.tsx`
- Modify: `src/components/painel/sidebar.tsx`

**Interfaces:**
- Consumes: `VendaLojaForm` (Task 2), `produtos_loja`/`vendas_loja` (Task 1).

- [ ] **Step 1: Criar `src/app/painel/loja/page.tsx`**

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { VendaLojaForm } from '@/components/venda-loja-form'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'

export default async function PainelLojaPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()

  const { data: produtos } = await supabase.from('produtos_loja').select('*').eq('barbearia_id', membro!.barbearia_id).eq('ativo', true).order('nome')
  const { data: vendas } = await supabase
    .from('vendas_loja')
    .select('data, quantidade, preco_unitario, comissao_valor, clientes(nome), produtos_loja(nome)')
    .eq('membro_id', membro!.id)
    .order('criado_em', { ascending: false })
    .limit(50) as {
      data: { data: string; quantidade: number; preco_unitario: number; comissao_valor: number; clientes: { nome: string } | null; produtos_loja: { nome: string } | null }[] | null
    }

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Loja</h1>

      <div className="mb-6">
        <VendaLojaForm barbeariaId={membro!.barbearia_id} membroId={membro!.id} produtos={produtos ?? []} />
      </div>

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Catálogo</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Categoria</TableHead><TableHead>Preço</TableHead><TableHead>Estoque</TableHead></TableRow></TableHeader>
            <TableBody>
              {(produtos ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.nome}</TableCell>
                  <TableCell>{p.categoria}</TableCell>
                  <TableCell>R$ {p.preco_venda}</TableCell>
                  <TableCell>{p.quantidade_estoque}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Minhas vendas recentes</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Produto</TableHead><TableHead>Qtd</TableHead><TableHead>Valor</TableHead><TableHead>Comissão</TableHead></TableRow></TableHeader>
            <TableBody>
              {(vendas ?? []).map((v, i) => (
                <TableRow key={i}>
                  <TableCell>{new Date(v.data).toLocaleDateString()}</TableCell>
                  <TableCell>{v.clientes?.nome ?? '—'}</TableCell>
                  <TableCell>{v.produtos_loja?.nome ?? '—'}</TableCell>
                  <TableCell>{v.quantidade}</TableCell>
                  <TableCell>R$ {(v.preco_unitario * v.quantidade).toFixed(2)}</TableCell>
                  <TableCell>R$ {Number(v.comissao_valor).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {(vendas ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma venda registrada ainda.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Adicionar "Loja" ao `NAV_ITEMS` de `src/app/painel/layout.tsx`**

Encontrar:
```ts
const NAV_ITEMS = [
  { href: '/painel', label: 'Dashboard' },
  { href: '/painel/agenda', label: 'Agenda' },
  { href: '/painel/prospeccao', label: 'Prospecção' },
  { href: '/painel/clientes', label: 'Clientes' },
  { href: '/painel/sonhos', label: 'Sonhos' },
]
```
Substituir por:
```ts
const NAV_ITEMS = [
  { href: '/painel', label: 'Dashboard' },
  { href: '/painel/agenda', label: 'Agenda' },
  { href: '/painel/prospeccao', label: 'Prospecção' },
  { href: '/painel/clientes', label: 'Clientes' },
  { href: '/painel/loja', label: 'Loja' },
  { href: '/painel/sonhos', label: 'Sonhos' },
]
```

- [ ] **Step 3: Adicionar o ícone de "Loja" ao `ICON_PATHS` de `src/components/painel/sidebar.tsx`**

Encontrar:
```tsx
  '/painel/clientes': (
    <>
      <circle cx="9" cy="8" r="3.6" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5.5a3.5 3.5 0 0 1 0 7M17.5 14.4c2.1.8 3.5 2.6 3.5 5.6" />
    </>
  ),
  '/painel/sonhos': (
```
Substituir por:
```tsx
  '/painel/clientes': (
    <>
      <circle cx="9" cy="8" r="3.6" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5.5a3.5 3.5 0 0 1 0 7M17.5 14.4c2.1.8 3.5 2.6 3.5 5.6" />
    </>
  ),
  '/painel/loja': (
    <>
      <path d="M6 8h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  '/painel/sonhos': (
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 5: Verificação visual manual**

Login como barbeiro. Confirmar o novo item "Loja" na sidebar, logo depois de "Clientes". Abrir `/painel/loja`: catálogo aparece em modo leitura (sem botões de editar), registrar uma venda própria, confirmar que aparece em "Minhas vendas recentes" com a comissão certa.

- [ ] **Step 6: Commit**

```bash
git add src/app/painel/loja/page.tsx src/app/painel/layout.tsx src/components/painel/sidebar.tsx
git commit -m "feat: add painel loja page (read-only catalog, own sales)"
```

---

### Task 5: Campo `percentual_loja` no plano de carreira

**Files:**
- Modify: `src/app/admin/planos-carreira/page.tsx`
- Modify: `src/components/plano-carreira-row.tsx`

**Interfaces:**
- Consumes: `planos_carreira.percentual_loja` (Task 1).

- [ ] **Step 1: Adicionar o campo ao form de criar plano em `src/app/admin/planos-carreira/page.tsx`**

Encontrar:
```tsx
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
```
Substituir por:
```tsx
async function criarPlano(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const percentualLojaRaw = formData.get('percentual_loja') as string
  await supabase.from('planos_carreira').insert({
    barbearia_id: membro!.barbearia_id,
    nome: formData.get('nome') as string,
    percentual_produto: Number(formData.get('percentual_produto')),
    percentual_servico: Number(formData.get('percentual_servico')),
    percentual_loja: percentualLojaRaw === '' ? null : Number(percentualLojaRaw),
  })
  revalidatePath('/admin/planos-carreira')
}
```

Encontrar:
```tsx
            <Input name="nome" placeholder="Nome (ex: Sênior)" required className="w-40" />
            <Input name="percentual_produto" type="number" step="0.01" placeholder="% produto" required className="w-28" />
            <Input name="percentual_servico" type="number" step="0.01" placeholder="% serviço" required className="w-28" />
            <Button type="submit">Adicionar</Button>
```
Substituir por:
```tsx
            <Input name="nome" placeholder="Nome (ex: Sênior)" required className="w-40" />
            <Input name="percentual_produto" type="number" step="0.01" placeholder="% produto" required className="w-28" />
            <Input name="percentual_servico" type="number" step="0.01" placeholder="% serviço" required className="w-28" />
            <Input name="percentual_loja" type="number" step="0.01" placeholder="% loja" className="w-28" />
            <Button type="submit">Adicionar</Button>
```

Encontrar:
```tsx
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>% produto</TableHead><TableHead>% serviço</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
```
Substituir por:
```tsx
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>% produto</TableHead><TableHead>% serviço</TableHead><TableHead>% loja</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
```

- [ ] **Step 2: Reescrever `src/components/plano-carreira-row.tsx`**

Substituir o arquivo inteiro por (idêntico ao original, com `percentual_loja` adicionado como campo opcional — estado `number | ''`, igual ao padrão já usado pra campos numéricos opcionais neste código, ex. `meta_prospeccao_dia` em `src/app/admin/barbeiros/page.tsx`):

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TableRow, TableCell } from '@/components/ui/table'

type Plano = { id: string; nome: string; percentual_produto: number; percentual_servico: number; percentual_loja: number | null; ativo: boolean }

export function PlanoCarreiraRow({ plano }: { plano: Plano }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(plano.nome)
  const [percentualProduto, setPercentualProduto] = useState(plano.percentual_produto)
  const [percentualServico, setPercentualServico] = useState(plano.percentual_servico)
  const [percentualLoja, setPercentualLoja] = useState<number | ''>(plano.percentual_loja ?? '')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('planos_carreira').update({
      nome, percentual_produto: percentualProduto, percentual_servico: percentualServico,
      percentual_loja: percentualLoja === '' ? null : percentualLoja,
    }).eq('id', plano.id)
    setSalvando(false)
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setNome(plano.nome)
    setPercentualProduto(plano.percentual_produto)
    setPercentualServico(plano.percentual_servico)
    setPercentualLoja(plano.percentual_loja ?? '')
    setEditando(false)
  }

  async function alternarAtivo() {
    const supabase = getBrowserSupabaseClient()
    await supabase.from('planos_carreira').update({ ativo: !plano.ativo }).eq('id', plano.id)
    router.refresh()
  }

  if (editando) {
    return (
      <TableRow>
        <TableCell><Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-32" /></TableCell>
        <TableCell><Input type="number" step="0.01" value={percentualProduto} onChange={(e) => setPercentualProduto(Number(e.target.value))} className="w-24" /></TableCell>
        <TableCell><Input type="number" step="0.01" value={percentualServico} onChange={(e) => setPercentualServico(Number(e.target.value))} className="w-24" /></TableCell>
        <TableCell><Input type="number" step="0.01" value={percentualLoja} onChange={(e) => setPercentualLoja(e.target.value === '' ? '' : Number(e.target.value))} className="w-24" /></TableCell>
        <TableCell className="flex gap-2">
          <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
          <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow className={plano.ativo ? '' : 'opacity-50'}>
      <TableCell>{plano.nome}</TableCell>
      <TableCell>{plano.percentual_produto}%</TableCell>
      <TableCell>{plano.percentual_servico}%</TableCell>
      <TableCell>{plano.percentual_loja != null ? `${plano.percentual_loja}%` : '—'}</TableCell>
      <TableCell className="flex gap-2">
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">Editar</button>
        <button type="button" onClick={alternarAtivo} className="text-xs text-destructive underline">{plano.ativo ? 'Desativar' : 'Reativar'}</button>
      </TableCell>
    </TableRow>
  )
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 4: Verificação visual manual**

Login como admin, abrir `/admin/planos-carreira`. Confirmar a coluna nova "% loja" na tabela (mostrando "—" pros planos que já existiam antes desta task). Criar um plano novo com "% loja" em branco — confirmar que salva sem erro (`null`, mostrando "—"). Editar um plano existente, preencher "% loja" e salvar — confirmar que aparece corretamente na tabela e passa a valer pras próximas vendas de loja daquele barbeiro.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/planos-carreira/page.tsx src/components/plano-carreira-row.tsx
git commit -m "feat: add optional percentual_loja field to plano de carreira"
```
