# Ranking de serviços e produtos por barbeiro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split "Ganhos por categoria" on the barbeiro's dashboard into Cortes/Serviços extras/Produtos with a per-item breakdown, and give the admin a new page comparing all barbeiros per serviço/produto — including who's at zero — so it's visible who's selling what.

**Architecture:** `servicos` gains a `tipo` column (`'corte'` | `'servico_extra'`), set manually by the admin per serviço. The barbeiro dashboard's existing aggregate queries expand to join `servicos`/`produtos` names and group in memory. A new admin page runs the same kind of per-item grouping barbearia-wide, cross-referenced against every active barbeiro (including zero counts).

**Tech Stack:** Next.js 16.3 App Router, TypeScript, Supabase (Postgres/RLS), Tailwind CSS v4, shadcn/ui.

## Global Constraints

- No RLS changes anywhere in this plan — every query added reuses read access already granted by existing policies (barbeiro reads own `atendimentos`/`vendas_produtos`, admin reads barbearia-wide — both patterns already proven working in `src/app/painel/page.tsx` and `src/app/admin/page.tsx` today).
- `tipo` is always one of the literal strings `'corte'` or `'servico_extra'` — never free text. Every `<select>` for it uses exactly those two `value`s.
- Every aggregation in this plan is a plain in-memory `reduce`/grouping over already-fetched rows — no new database functions or RPCs.
- Migration file goes in `supabase/migrations/`, numbered the next integer after whatever is the highest-numbered file present when Task 1 starts (do not hardcode a number here — check `ls supabase/migrations` first, since another in-flight plan may have already claimed the next number).

---

### Task 1: `servicos.tipo` — migration + admin categorization UI

**Files:**
- Create: `supabase/migrations/00NN_servicos_tipo.sql` (NN = next available number — see Global Constraints)
- Modify: `src/app/admin/servicos/page.tsx` (whole file)
- Modify: `src/components/servico-row.tsx` (whole file)

**Interfaces:**
- Produces: `servicos.tipo: 'corte' | 'servico_extra'`, read by Task 2 (`painel/page.tsx`) and Task 3 (`admin/ranking/page.tsx`) via `servicos(nome, tipo)` joins.

- [ ] **Step 1: Check the next migration number and write the migration**

Run: `ls supabase/migrations | sort | tail -3` and use the next integer (zero-padded to 4 digits) that isn't already taken.

Create the migration file with this content:

```sql
alter table servicos
  add column tipo text not null default 'corte' check (tipo in ('corte', 'servico_extra'));
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase migration up`
Expected: succeeds, no errors. Applies only the new pending migration against the already-running local Supabase instance — do NOT use `supabase db reset` here, it would wipe every row in the local database (including real test data already created through the app during manual testing this session: barbeiros, agendamentos, bloqueios, atendimentos).

- [ ] **Step 3: Replace `src/components/servico-row.tsx` in full**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TableRow, TableCell } from '@/components/ui/table'

type Servico = { id: string; nome: string; duracao_minutos: number; preco: number; ativo: boolean; tipo: string }

const ROTULO_TIPO: Record<string, string> = { corte: 'Corte', servico_extra: 'Serviço extra' }

export function ServicoRow({ servico }: { servico: Servico }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(servico.nome)
  const [duracaoMinutos, setDuracaoMinutos] = useState(servico.duracao_minutos)
  const [preco, setPreco] = useState(servico.preco)
  const [tipo, setTipo] = useState(servico.tipo)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('servicos').update({ nome, duracao_minutos: duracaoMinutos, preco, tipo }).eq('id', servico.id)
    setSalvando(false)
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setNome(servico.nome)
    setDuracaoMinutos(servico.duracao_minutos)
    setPreco(servico.preco)
    setTipo(servico.tipo)
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
      <TableCell className="flex gap-2">
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">Editar</button>
        <button type="button" onClick={alternarAtivo} className="text-xs text-destructive underline">{servico.ativo ? 'Desativar' : 'Reativar'}</button>
      </TableCell>
    </TableRow>
  )
}
```

- [ ] **Step 4: Replace `src/app/admin/servicos/page.tsx` in full**

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
        <Button type="submit">Adicionar</Button>
      </form>
      <Table>
        <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Duração</TableHead><TableHead>Preço</TableHead><TableHead>Tipo</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
        <TableBody>
          {servicos?.map((s) => <ServicoRow key={s.id} servico={s} />)}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 5: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Manual verification**

No browser tools available in this environment (Playwright/Chrome MCP tools may be flaky or disconnected — do not spend time retrying them). Verify by reading the diff: `criarServico` now inserts `tipo`; `ServicoRow`'s edit mode includes the `tipo` select and `salvar()` persists it; the read-mode row shows the label via `ROTULO_TIPO`. If a browser is available when this task runs, also confirm by hand: create a serviço, see it default to "Corte" in the table; edit an existing serviço, change its tipo to "Serviço extra", Salvar, confirm the table cell updates.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/*_servicos_tipo.sql src/components/servico-row.tsx src/app/admin/servicos/page.tsx
git commit -m "feat: add tipo (corte/serviço extra) to servicos"
```

---

### Task 2: Painel do barbeiro — Cortes/Serviços extras/Produtos detalhados

**Files:**
- Modify: `src/app/painel/page.tsx` (whole file)

**Interfaces:**
- Consumes: `servicos.tipo` (Task 1).

- [ ] **Step 1: Replace `src/app/painel/page.tsx` in full**

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { calcularOciosidade } from '@/lib/ociosidade'
import { Card, CardContent } from '@/components/ui/card'

type ItemContagem = { id: string; nome: string; quantidade: number; valor: number }

// Agrupa por id (não por nome) — dois serviços/produtos distintos podem ter
// o mesmo nome, e o id é a chave real que os diferencia.
function agruparPorId(itens: { id: string; nome: string; quantidade: number; valor: number }[]): ItemContagem[] {
  const mapa = new Map<string, ItemContagem>()
  for (const { id, nome, quantidade, valor } of itens) {
    const atual = mapa.get(id) ?? { id, nome, quantidade: 0, valor: 0 }
    atual.quantidade += quantidade
    atual.valor += valor
    mapa.set(id, atual)
  }
  return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor)
}

export default async function BarbeiroDashboardPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, nome').eq('user_id', user!.id).single()

  const hoje = new Date()
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10)
  const fimMes = hoje.toISOString().slice(0, 10)

  const { data: atendimentosData } = await supabase
    .from('atendimentos')
    .select('preco, comissao_valor, servico_id, servicos(nome, tipo)')
    .eq('membro_id', membro!.id)
    .gte('data', inicioMes)
  const atendimentos = atendimentosData ?? []

  const { data: vendasData } = await supabase
    .from('vendas_produtos')
    .select('quantidade, preco_unitario, comissao_valor, produto_id, produtos(nome)')
    .eq('membro_id', membro!.id)
    .gte('data', inicioMes)
  const vendas = vendasData ?? []

  const { data: agendamentosMes } = await supabase
    .from('agendamentos')
    .select('status, vezes_remarcado')
    .eq('membro_id', membro!.id)
    .gte('data', inicioMes)

  const totalAgendamentos = agendamentosMes?.length ?? 0
  const realizados = agendamentosMes?.filter((a) => a.status === 'realizado').length ?? 0
  const naoCompareceram = agendamentosMes?.filter((a) => a.status === 'nao_compareceu').length ?? 0
  const cancelados = agendamentosMes?.filter((a) => a.status === 'cancelado').length ?? 0
  const remarcados = (agendamentosMes ?? []).reduce((s, a) => s + a.vezes_remarcado, 0)

  const { data: prospeccoesMes } = await supabase
    .from('prospeccoes')
    .select('status, agendamento_id')
    .eq('membro_id', membro!.id)
    .gte('data', inicioMes)

  const prospectados = prospeccoesMes?.length ?? 0
  const convertidosProspeccao = prospeccoesMes?.filter((p) => p.status === 'convertido').length ?? 0
  const naoConvertidosProspeccao = prospeccoesMes?.filter((p) => p.status === 'nao_convertido').length ?? 0
  const agendamentoIdsConvertidos = (prospeccoesMes ?? [])
    .filter((p) => p.status === 'convertido' && p.agendamento_id)
    .map((p) => p.agendamento_id as string)

  const { data: atendimentosProspeccao } = await supabase
    .from('atendimentos')
    .select('preco')
    .in('agendamento_id', agendamentoIdsConvertidos.length > 0 ? agendamentoIdsConvertidos : ['00000000-0000-0000-0000-000000000000'])
  const { data: vendasProspeccao } = await supabase
    .from('vendas_produtos')
    .select('preco_unitario, quantidade')
    .in('agendamento_id', agendamentoIdsConvertidos.length > 0 ? agendamentoIdsConvertidos : ['00000000-0000-0000-0000-000000000000'])

  const faturamentoProspeccao =
    (atendimentosProspeccao ?? []).reduce((s, a) => s + Number(a.preco), 0) +
    (vendasProspeccao ?? []).reduce((s, v) => s + Number(v.preco_unitario) * v.quantidade, 0)

  const atendimentosCortes = atendimentos.filter((a) => a.servicos?.tipo === 'corte')
  const atendimentosExtras = atendimentos.filter((a) => a.servicos?.tipo === 'servico_extra')

  const faturamentoCortes = atendimentosCortes.reduce((s, a) => s + Number(a.preco), 0)
  const comissaoCortes = atendimentosCortes.reduce((s, a) => s + Number(a.comissao_valor ?? 0), 0)
  const faturamentoExtras = atendimentosExtras.reduce((s, a) => s + Number(a.preco), 0)
  const comissaoExtras = atendimentosExtras.reduce((s, a) => s + Number(a.comissao_valor ?? 0), 0)
  const faturamentoProdutos = vendas.reduce((s, v) => s + Number(v.preco_unitario) * v.quantidade, 0)
  const comissaoProdutos = vendas.reduce((s, v) => s + Number(v.comissao_valor ?? 0), 0)

  const detalheCortes = agruparPorId(atendimentosCortes.map((a) => ({ id: a.servico_id, nome: a.servicos?.nome ?? 'Serviço', quantidade: 1, valor: Number(a.preco) })))
  const detalheExtras = agruparPorId(atendimentosExtras.map((a) => ({ id: a.servico_id, nome: a.servicos?.nome ?? 'Serviço', quantidade: 1, valor: Number(a.preco) })))
  const detalheProdutos = agruparPorId(vendas.map((v) => ({ id: v.produto_id, nome: v.produtos?.nome ?? 'Produto', quantidade: v.quantidade, valor: Number(v.preco_unitario) * v.quantidade })))

  // No generated Supabase types in this project (no `supabase gen types` step
  // in the plan), so .rpc().single() is otherwise untyped.
  const { data: ociosidadeRaw } = await supabase
    .rpc('ociosidade', { p_membro_id: membro!.id, p_data_inicio: inicioMes, p_data_fim: fimMes })
    .single() as { data: { minutos_disponiveis: number; minutos_ocupados: number; faturamento_servicos: number } | null }

  const ociosidade = calcularOciosidade({
    minutosDisponiveis: ociosidadeRaw?.minutos_disponiveis ?? 0,
    minutosOcupados: ociosidadeRaw?.minutos_ocupados ?? 0,
    faturamentoServicos: Number(ociosidadeRaw?.faturamento_servicos ?? 0),
    quantidadeAtendimentos: atendimentos.length,
  })

  const totalGanhos = faturamentoCortes + faturamentoExtras + faturamentoProdutos
  const percentualCortes = totalGanhos > 0 ? Math.round((faturamentoCortes / totalGanhos) * 100) : 0
  const percentualExtras = totalGanhos > 0 ? Math.round((faturamentoExtras / totalGanhos) * 100) : 0
  const percentualProdutos = totalGanhos > 0 ? Math.round((faturamentoProdutos / totalGanhos) * 100) : 0

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Olá, {membro!.nome}</h1>

      <div className="flex gap-4 flex-wrap mb-6">
        <Card className="flex-1 min-w-[160px]">
          <CardContent>
            <p className="text-xs uppercase text-muted-foreground">Faturamento do mês</p>
            <p className="text-2xl font-bold text-primary">R$ {totalGanhos.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[160px]">
          <CardContent>
            <p className="text-xs uppercase text-muted-foreground">Comissão do mês</p>
            <p className="text-2xl font-bold text-primary">R$ {(comissaoCortes + comissaoExtras + comissaoProdutos).toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[160px]">
          <CardContent>
            <p className="text-xs uppercase text-muted-foreground">Ocupação da agenda</p>
            <p className="text-2xl font-bold text-primary">{ociosidade.percentualOcupacao}%</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-5">
        <CardContent className="p-6">
          <p className="font-heading text-base font-bold mb-5">Ganhos por categoria</p>

          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-foreground/80">Cortes</span>
              <span className="flex items-center gap-2">
                <span className="text-base font-bold">R$ {faturamentoCortes.toFixed(2)}</span>
                <span className="inline-flex items-baseline gap-1 rounded-full bg-primary/10 text-primary border border-primary/30 px-3 py-1 text-xs font-bold">
                  <span className="text-[10px] font-semibold uppercase tracking-wide opacity-75">comissão</span> R$ {comissaoCortes.toFixed(2)}
                </span>
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden mb-3">
              <div className="h-full rounded-full bg-primary" style={{ width: `${percentualCortes}%` }} />
            </div>
            {detalheCortes.length > 0 && (
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                {detalheCortes.map((item) => (
                  <div key={item.id} className="flex justify-between">
                    <span>{item.nome}</span>
                    <span>{item.quantidade}x — R$ {item.valor.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-foreground/80">Serviços extras</span>
              <span className="flex items-center gap-2">
                <span className="text-base font-bold">R$ {faturamentoExtras.toFixed(2)}</span>
                <span className="inline-flex items-baseline gap-1 rounded-full bg-primary/10 text-primary border border-primary/30 px-3 py-1 text-xs font-bold">
                  <span className="text-[10px] font-semibold uppercase tracking-wide opacity-75">comissão</span> R$ {comissaoExtras.toFixed(2)}
                </span>
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden mb-3">
              <div className="h-full rounded-full bg-amber-500" style={{ width: `${percentualExtras}%` }} />
            </div>
            {detalheExtras.length > 0 && (
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                {detalheExtras.map((item) => (
                  <div key={item.id} className="flex justify-between">
                    <span>{item.nome}</span>
                    <span>{item.quantidade}x — R$ {item.valor.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-foreground/80">Produtos</span>
              <span className="flex items-center gap-2">
                <span className="text-base font-bold">R$ {faturamentoProdutos.toFixed(2)}</span>
                <span className="inline-flex items-baseline gap-1 rounded-full bg-primary/10 text-primary border border-primary/30 px-3 py-1 text-xs font-bold">
                  <span className="text-[10px] font-semibold uppercase tracking-wide opacity-75">comissão</span> R$ {comissaoProdutos.toFixed(2)}
                </span>
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden mb-3">
              <div className="h-full rounded-full bg-indigo-500" style={{ width: `${percentualProdutos}%` }} />
            </div>
            {detalheProdutos.length > 0 && (
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                {detalheProdutos.map((item) => (
                  <div key={item.id} className="flex justify-between">
                    <span>{item.nome}</span>
                    <span>{item.quantidade}x — R$ {item.valor.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-6">
          <p className="font-heading text-base font-bold mb-5">Tempo de cadeira (mês)</p>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-3xl font-bold text-primary">{ociosidade.percentualOcupacao}%</span>
            <span className="text-sm text-muted-foreground">ocupado no mês</span>
          </div>
          <div className="w-full bg-muted rounded-full h-7 overflow-hidden mb-5">
            <div className="bg-primary h-full rounded-full flex items-center justify-end pr-3" style={{ width: `${ociosidade.percentualOcupacao}%` }}>
              <span className="text-primary-foreground text-xs font-bold">{ociosidade.percentualOcupacao}%</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Clientes atendidos</p>
              <p className="text-lg font-bold">{realizados}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Ganho médio / hora ocupada</p>
              <p className="text-lg font-bold">R$ {ociosidade.ganhoPorHoraOcupada.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Estimativa perdida no mês</p>
              <p className="text-lg font-bold">
                R$ {ociosidade.valorPerdidoEstimado.toFixed(2)}
                <span className="block text-xs font-semibold text-destructive mt-0.5">≈ {ociosidade.atendimentosPerdidosEstimado} atendimentos</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-6">
          <p className="font-heading text-base font-bold mb-5">Indicadores de agendamento (mês) <span className="font-normal text-muted-foreground text-sm">— não somado ao financeiro acima</span></p>
          <div className="grid grid-cols-5 gap-5 text-center">
            <div><p className="text-2xl font-bold">{totalAgendamentos}</p><p className="text-xs text-muted-foreground mt-1">Total</p></div>
            <div><p className="text-2xl font-bold text-primary">{realizados}</p><p className="text-xs text-muted-foreground mt-1">Realizados</p></div>
            <div><p className="text-2xl font-bold">{naoCompareceram}</p><p className="text-xs text-muted-foreground mt-1">Não compareceram</p></div>
            <div><p className="text-2xl font-bold">{cancelados}</p><p className="text-xs text-muted-foreground mt-1">Cancelados</p></div>
            <div><p className="text-2xl font-bold">{remarcados}</p><p className="text-xs text-muted-foreground mt-1">Remarcados</p></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <p className="font-heading text-base font-bold mb-5">Prospecção (mês)</p>
          <div className="grid grid-cols-4 gap-5 text-center">
            <div><p className="text-2xl font-bold">{prospectados}</p><p className="text-xs text-muted-foreground mt-1">Prospectados</p></div>
            <div><p className="text-2xl font-bold text-primary">{convertidosProspeccao}</p><p className="text-xs text-muted-foreground mt-1">Convertidos</p></div>
            <div><p className="text-2xl font-bold">{naoConvertidosProspeccao}</p><p className="text-xs text-muted-foreground mt-1">Não convertidos</p></div>
            <div><p className="text-2xl font-bold">R$ {faturamentoProspeccao.toFixed(2)}</p><p className="text-xs text-muted-foreground mt-1">Faturamento gerado</p></div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds. Requires Task 1's migration to already be applied (`servicos.tipo` must exist) — if the build fails on a `tipo` reference, confirm Task 1 finished first.

- [ ] **Step 3: Manual verification**

No browser tools available in this environment — verify via code trace against this task's Step 1 code, matching exactly. If a browser is available: as a barbeiro with at least one atendimento of a "corte" serviço, one of a "serviço extra" serviço, and one produto sale this month, open `/painel` and confirm three separate bars (Cortes/Serviços extras/Produtos) each with the right total, comissão pill, and a per-item list below matching what was actually sold.

- [ ] **Step 4: Commit**

```bash
git add src/app/painel/page.tsx
git commit -m "feat: split painel ganhos por categoria into cortes/extras/produtos with per-item detail"
```

---

### Task 3: `/admin/ranking` — comparação entre barbeiros

**Files:**
- Create: `src/app/admin/ranking/page.tsx`
- Modify: `src/app/admin/layout.tsx`

**Interfaces:**
- Consumes: `servicos.tipo` (Task 1).

- [ ] **Step 1: Create `src/app/admin/ranking/page.tsx`**

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'

export default async function RankingPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

  const { data: barbeiros } = await supabase
    .from('membros').select('id, nome')
    .eq('barbearia_id', membro!.barbearia_id).eq('papel', 'barbeiro').eq('ativo', true)
    .order('nome')
  const { data: servicos } = await supabase
    .from('servicos').select('id, nome, tipo')
    .eq('barbearia_id', membro!.barbearia_id).eq('ativo', true)
    .order('nome')
  const { data: produtos } = await supabase
    .from('produtos').select('id, nome')
    .eq('barbearia_id', membro!.barbearia_id).eq('ativo', true)
    .order('nome')

  const { data: atendimentos } = await supabase
    .from('atendimentos').select('membro_id, servico_id')
    .eq('barbearia_id', membro!.barbearia_id).gte('data', inicioMes)
  const { data: vendas } = await supabase
    .from('vendas_produtos').select('membro_id, produto_id, quantidade')
    .eq('barbearia_id', membro!.barbearia_id).gte('data', inicioMes)

  function rankingServico(servicoId: string) {
    return (barbeiros ?? [])
      .map((b) => ({
        nome: b.nome,
        quantidade: (atendimentos ?? []).filter((a) => a.servico_id === servicoId && a.membro_id === b.id).length,
      }))
      .sort((a, b) => b.quantidade - a.quantidade)
  }

  function rankingProduto(produtoId: string) {
    return (barbeiros ?? [])
      .map((b) => ({
        nome: b.nome,
        quantidade: (vendas ?? [])
          .filter((v) => v.produto_id === produtoId && v.membro_id === b.id)
          .reduce((s, v) => s + v.quantidade, 0),
      }))
      .sort((a, b) => b.quantidade - a.quantidade)
  }

  const cortes = (servicos ?? []).filter((s) => s.tipo === 'corte')
  const extras = (servicos ?? []).filter((s) => s.tipo === 'servico_extra')

  function Secao({ titulo, itens, ranking }: { titulo: string; itens: { id: string; nome: string }[]; ranking: (id: string) => { nome: string; quantidade: number }[] }) {
    return (
      <>
        <h2 className="font-heading text-lg font-semibold mb-3">{titulo}</h2>
        <div className="grid gap-4 mb-8 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
          {itens.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4">
                <p className="font-semibold mb-2">{item.nome}</p>
                <ol className="text-sm flex flex-col gap-1">
                  {ranking(item.id).map((r, i) => (
                    <li key={r.nome} className="flex justify-between">
                      <span>{i + 1}. {r.nome}</span>
                      <span className="font-medium">{r.quantidade}x</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
          {itens.length === 0 && <p className="text-sm text-muted-foreground">Nada cadastrado nessa categoria.</p>}
        </div>
      </>
    )
  }

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Ranking (mês)</h1>
      <Secao titulo="Cortes" itens={cortes} ranking={rankingServico} />
      <Secao titulo="Serviços extras" itens={extras} ranking={rankingServico} />
      <Secao titulo="Produtos" itens={produtos ?? []} ranking={rankingProduto} />
    </div>
  )
}
```

- [ ] **Step 2: Add "Ranking" to the admin nav**

In `src/app/admin/layout.tsx`, the `NAV_ITEMS` array currently reads:

```ts
const NAV_ITEMS = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/servicos', label: 'Serviços' },
  { href: '/admin/produtos', label: 'Produtos' },
  { href: '/admin/planos-carreira', label: 'Planos de carreira' },
  { href: '/admin/barbeiros', label: 'Barbeiros' },
  { href: '/admin/prospeccao', label: 'Prospecção' },
]
```

Replace it with:

```ts
const NAV_ITEMS = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/servicos', label: 'Serviços' },
  { href: '/admin/produtos', label: 'Produtos' },
  { href: '/admin/planos-carreira', label: 'Planos de carreira' },
  { href: '/admin/barbeiros', label: 'Barbeiros' },
  { href: '/admin/ranking', label: 'Ranking' },
  { href: '/admin/prospeccao', label: 'Prospecção' },
]
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: succeeds, `/admin/ranking` listed among the routes.

- [ ] **Step 4: Manual verification**

No browser tools available in this environment — verify via code trace against this task's Step 1/2 code. If a browser is available: as `admin@teste.com`, click "Ranking" in the nav, confirm every active serviço and produto shows a card listing every active barbeiro (including ones with `0x` for items they haven't sold), sorted highest-to-lowest.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/ranking/page.tsx src/app/admin/layout.tsx
git commit -m "feat: add /admin/ranking comparing barbeiros per serviço/produto"
```

---

### Task 4: Regressão final

**Files:** none (verification only).

- [ ] **Step 1: Full automated regression**

Run:
```bash
npm test
npm run build
```
Expected: `npm test` shows all existing unit tests still passing (this plan adds no new ones — it's grouping/aggregation over existing tables, no new pure-function logic comparable to `calcularOciosidade`); `npm run build` succeeds with no type errors and all routes present, including `/admin/ranking`.

- [ ] **Step 2: Manual end-to-end walkthrough (if a browser is available)**

As `admin@teste.com`: categorize at least one serviço as "Corte" and one as "Serviço extra" in `/admin/servicos`. As a barbeiro, complete at least one atendimento of each type plus one produto sale this month (via "Atender agora" or attending a confirmed agendamento). Then:
- `/painel`: confirm "Ganhos por categoria" shows three bars (Cortes/Serviços extras/Produtos) with correct totals, comissão pills, and per-item breakdowns matching what was actually sold.
- `/admin/ranking`: confirm the serviços/produtos used show up with the right barbeiro and quantity, and that a barbeiro who did NOT sell a given item shows `0x` for it rather than being omitted.

If no browser is available, document that limitation in the ledger instead of skipping the check silently — same pattern used in prior plans.

- [ ] **Step 3: No commit for this task** — it's verification-only; if any issue surfaces, fix it as a small follow-up commit referencing which task's step regressed.
