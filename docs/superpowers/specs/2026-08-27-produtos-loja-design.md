# Produtos de Loja (roupas, perfumes) — Design Spec

## Contexto e objetivo

Hoje `produtos`/`vendas_produtos` cobrem só insumos de barbearia (pomada, cera) vendidos durante um atendimento, via `LancamentoForm`. O admin quer um catálogo separado pra itens de varejo (roupas, perfumes) que não dependem de uma visita/atendimento — um cliente pode comprar uma camisa sem cortar o cabelo. Precisa: catálogo próprio com estoque, e venda registrada com comissão pro barbeiro que vendeu (igual ao fluxo de produtos hoje), numa tela nova e separada.

## Decisões de escopo (validadas com o usuário)

- **Página nova e separada** — não entra na tela `/admin/produtos` existente nem mistura com `LancamentoForm`/`AtenderAgoraForm`.
- **Comissão com percentual próprio** — novo campo `percentual_loja` no plano de carreira, independente de `percentual_produto`. Planos existentes ficam em 0% de comissão de loja até o admin configurar (campo opcional, sem obrigar edição de todo plano já cadastrado).
- **Fica fora dos indicadores/relatórios existentes** — faturamento do admin (`/admin`), ticket médio, `ranking_cliente`, conversão de prospecção (`/admin/prospeccao`) e a meta de faturamento do mês na sidebar do barbeiro (`/painel` layout) continuam somando só `atendimentos` + `vendas_produtos`, sem mudança. Loja fica isolada nas duas telas novas. O histórico da ficha do cliente (`ficha-cliente.tsx`) também não muda — mesma decisão de escopo.
- **Venda em nome de qualquer barbeiro pelo admin desde o início** — aprendendo da lacuna de RLS encontrada na feature de agenda (admin não podia registrar atendimento em nome de um barbeiro), a política de INSERT em `vendas_loja` já nasce cobrindo os dois casos: barbeiro registra a própria venda, admin registra em nome de qualquer barbeiro da barbearia.

## Modelo de dados (nova migration)

Espelha exatamente `produtos`/`vendas_produtos` (`0002_catalogo.sql`, `0007_lancamentos.sql`, `0028_vendas_produtos_custo_unitario.sql`), sem `agendamento_id` (venda de loja não depende de uma visita):

```sql
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

`ativo` em `produtos_loja` já nasce na tabela (em vez de precisar de uma migration posterior como aconteceu com `produtos` em `0017_produtos_planos_carreira_ativo.sql`) — mesmo padrão de soft-delete de `servicos`/`produtos`/`planos_carreira`, usado no filtro do `<Select>` da venda.

## `src/components/venda-loja-form.tsx` (novo)

Client Component. Mais simples que `LancamentoForm`: sem serviços, sem "agendar retorno", `membroId` fixo (quem chama decide de quem é a venda) — cliente via `ClienteAutocomplete`, um produto por vez, quantidade, salvar.

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

`ClienteAutocomplete.onResolved` já manda `dataNascimento`/`bairro`/`cidade` opcionais além de `categoriaOrigem` — o form só usa o que precisa, o resto é ignorado (mesmo padrão de `AgendarSlotForm`, que também não usa todos os campos que o autocomplete relata).

## `src/components/produto-loja-row.tsx` (novo)

Cópia de `src/components/produto-row.tsx` (`src/components/produto-row.tsx:1`) trocando a tabela para `produtos_loja` — mesmos campos, mesmo comportamento de editar/ativar/desativar inline na tabela.

## `src/app/admin/loja/page.tsx` (novo)

Server Component, mesmo padrão de `src/app/admin/produtos/page.tsx`: form de criar produto de loja (server action) + tabela de catálogo (`ProdutoLojaRow`), mais a parte nova — barbeiro select + `VendaLojaForm` + histórico de vendas:

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

## `src/components/admin-venda-loja.tsx` (novo)

Client Component pequeno — mesmo padrão de `admin-agenda.tsx`: admin escolhe o barbeiro antes de ver o formulário de venda, porque a venda é sempre registrada em nome de um barbeiro específico.

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

## `src/app/painel/loja/page.tsx` (novo)

Server Component: catálogo em modo leitura (`Table` simples, sem `ProdutoLojaRow` — barbeiro não edita) + `VendaLojaForm` com o próprio `membroId` + histórico das próprias vendas.

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

## Navegação (sidebars)

`src/app/admin/layout.tsx`: novo item em `NAV_ITEMS`, depois de "Produtos":
```ts
{ href: '/admin/loja', label: 'Loja' },
```
`src/components/admin/sidebar.tsx`: novo ícone (sacola, distinto do ícone de caixa já usado em `/admin/produtos`):
```tsx
'/admin/loja': (
  <>
    <path d="M6 8h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </>
),
```

`src/app/painel/layout.tsx`: novo item em `NAV_ITEMS`, depois de "Clientes":
```ts
{ href: '/painel/loja', label: 'Loja' },
```
`src/components/painel/sidebar.tsx`: mesmo ícone de sacola.

## Plano de carreira: campo de comissão de loja

`src/app/admin/planos-carreira/page.tsx` e `src/components/plano-carreira-row.tsx` ganham um campo `percentual_loja` a mais, ao lado de `percentual_produto`/`percentual_servico` — mas **opcional** (sem `required`), diferente dos outros dois, porque é um campo novo numa tabela que já tem planos cadastrados (não dá pra forçar preenchimento retroativo). Placeholder `"% loja"`, mesmo padrão de input dos outros dois (`type="number" step="0.01"`).

## Fora de escopo (explicitamente adiado)

- Faturamento do admin (`/admin`), ticket médio, `ranking_cliente`, conversão de prospecção (`/admin/prospeccao`) e a meta de faturamento do mês na sidebar do barbeiro — nenhum soma `vendas_loja`.
- Histórico da ficha do cliente (`ficha-cliente.tsx`) — não lista compras de loja.
- Qualquer coisa parecida com "estoque baixo" alertando fora da própria tabela (a cor vermelha de `quantidade_estoque <= estoque_minimo`, que `ProdutoRow` já tem, é reaproveitada em `ProdutoLojaRow` por já vir de copiar o componente — não é um novo alerta, é o comportamento que já existe hoje).
- Edição de vendas já registradas (nem `vendas_produtos` tem isso hoje — só admin consegue via update policy direto no banco, não tem UI pra isso).

## Testes

- **Build**: `npm run build` sem erros de tipo.
- **pgTAP**: barbeiro insere `vendas_loja` em nome próprio (comissão calculada por `percentual_loja`, estoque de `produtos_loja` decrementado); admin insere `vendas_loja` em nome de outro barbeiro (mesma verificação de comissão indo pro barbeiro-alvo, não pro admin); barbeiro não consegue inserir em nome de outro barbeiro (RLS bloqueia).
- **Manual (navegador)**: `/admin/loja` — cadastrar um produto, editar estoque/preço inline, escolher um barbeiro e registrar uma venda, conferir que aparece em "Vendas recentes" com a comissão certa e que o estoque baixou. `/painel/loja` — como barbeiro, ver catálogo (sem poder editar), registrar uma venda própria, conferir "Minhas vendas recentes".
