# Redesign Visual — Clientes (Fase 8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reestilizar os 3 componentes compartilhados de Clientes (`ListaClientes`, `FichaCliente`, `EditarClienteForm`) — usados por `/admin/clientes(+[id])` e `/painel/clientes(+[id])` ao mesmo tempo — com `Card`s e o `Select` compartilhado, sem mudar nenhum dado, query ou lógica já existente, só a apresentação. Nenhum arquivo `page.tsx` é tocado nesta fase.

**Architecture:** Duas mudanças independentes: (1) `ListaClientes` ganha um `Card` ao redor da busca + lista — arquivo isolado, sem dependência de outro componente desta fase. (2) `FichaCliente` (5 blocos → 5 `Card`) e `EditarClienteForm` (`Select` no lugar do `<select>`, `<textarea>` restilizado) — tratados juntos porque `FichaCliente` importa e renderiza `EditarClienteForm` diretamente, e a Fase 4 já estabeleceu o padrão de tratar página+sub-componente citado como uma unidade só. Reaproveita `Card`/`CardContent` (Fase 1) e `Select` (Fase 2), ambos já existentes — nenhum componente novo.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui, Supabase.

**Spec:** `docs/superpowers/specs/2026-08-24-redesign-visual-clientes-fase8-design.md`

## Global Constraints

- **Nenhum dado, query ou lógica muda** — a busca em `ListaClientes`, todas as queries de `FichaCliente`, e `salvar`/`cancelar` de `EditarClienteForm` continuam com o corpo idêntico; só a apresentação (JSX/estilo) é reescrita.
- **Nenhum arquivo `page.tsx` é tocado** — `/admin/clientes(+[id])` e `/painel/clientes(+[id])` já delegam 100% do conteúdo pros 3 componentes desta fase; reestilizar os componentes atualiza as 4 rotas automaticamente.
- **Sem componente `Textarea` novo** — o campo de observação continua `<textarea>` nativo, só com classes atualizadas pra bater visualmente com `Input`.
- **`Card`/`Select` já existem** (Fases 1 e 2) — nenhum token novo, nenhum componente novo nesta fase.

---

### Task 1: Card em `ListaClientes`

**Files:**
- Modify: `src/components/lista-clientes.tsx`

**Interfaces:**
- Consumes: `Card`/`CardContent` (`src/components/ui/card.tsx`, Fase 1) — já existente, sem mudança de interface.
- Produces: `ListaClientes` continua exportando a mesma assinatura de props (`{ clientes, baseHref }`) — nenhuma mudança de interface pros dois `page.tsx` que a consomem.

- [ ] **Step 1: Reescrever `src/components/lista-clientes.tsx`**

Substituir o arquivo inteiro por:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'

type Cliente = { id: string; nome: string; telefone: string; cidade: string | null }

export function ListaClientes({ clientes, baseHref }: { clientes: Cliente[]; baseHref: string }) {
  const [busca, setBusca] = useState('')

  const termo = busca.trim()
  const termoLower = termo.toLowerCase()
  const termoDigitos = termo.replace(/\D/g, '')
  const filtrados = clientes.filter((c) => {
    if (termo === '') return true
    const nomeBate = c.nome.toLowerCase().includes(termoLower)
    const telefoneBate = termoDigitos.length > 0 && c.telefone.includes(termoDigitos)
    return nomeBate || telefoneBate
  })

  return (
    <Card>
      <CardContent className="p-6">
        <Input placeholder="Buscar por nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} className="mb-4" />
        {filtrados.map((c) => (
          <Link key={c.id} href={`${baseHref}/${c.id}`} className="flex justify-between border-b py-2 hover:bg-muted/50">
            <span>{c.nome}</span>
            <span className="text-muted-foreground text-sm">{c.telefone}{c.cidade ? ` · ${c.cidade}` : ''}</span>
          </Link>
        ))}
        {filtrados.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 3: Verificação visual manual**

Login como admin, abrir `/admin/clientes`. Confirmar o `Card` ao redor da busca + lista. Testar a busca por nome e por telefone. Repetir login como barbeiro em `/painel/clientes` (mesmo componente).

- [ ] **Step 4: Commit**

```bash
git add src/components/lista-clientes.tsx
git commit -m "feat: wrap ListaClientes in a Card to match SF visual identity"
```

---

### Task 2: 5 Cards em `FichaCliente` + `Select` em `EditarClienteForm`

**Files:**
- Modify: `src/components/ficha-cliente.tsx`
- Modify: `src/components/editar-cliente-form.tsx`

**Interfaces:**
- Consumes: `Card`/`CardContent` (Fase 1), `Select` (Fase 2) — ambos já existentes, sem mudança de interface. `EditarClienteForm` mantém a mesma assinatura de props (`{ clienteId, bairroAtual, cidadeAtual, observacaoAtual, categoriaOrigemAtual }`) — `FichaCliente` continua chamando-o exatamente como antes.

- [ ] **Step 1: Reescrever `src/components/ficha-cliente.tsx`**

Substituir o arquivo inteiro por:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { EditarClienteForm } from '@/components/editar-cliente-form'
import { Card, CardContent } from '@/components/ui/card'

type Ranking = { item: string; tipo: string; quantidade: number; valor_total: number }
type AtendimentoHistorico = { data: string; preco: number; servicos: { nome: string } | null }
type VendaHistorico = { data: string; preco_unitario: number; quantidade: number; produtos: { nome: string } | null }

export async function FichaCliente({ clienteId }: { clienteId: string }) {
  const supabase = await getServerSupabaseClient()

  const { data: cliente } = await supabase.from('clientes').select('nome, telefone, criado_em, data_nascimento, bairro, cidade, observacao, categoria_origem').eq('id', clienteId).single()
  const { data: ranking } = await supabase.rpc('ranking_cliente', { p_cliente_id: clienteId }) as { data: Ranking[] | null }
  const { data: atendimentos } = await supabase.from('atendimentos').select('data, preco, servicos(nome)').eq('cliente_id', clienteId).order('data', { ascending: false }) as { data: AtendimentoHistorico[] | null }
  const { data: vendas } = await supabase.from('vendas_produtos').select('data, preco_unitario, quantidade, produtos(nome)').eq('cliente_id', clienteId).order('data', { ascending: false }) as { data: VendaHistorico[] | null }

  const { data: agendamentosHistorico } = await supabase
    .from('agendamentos')
    .select('data, hora_inicio, status, servicos(nome)')
    .eq('cliente_id', clienteId)
    .order('data', { ascending: false }) as { data: { data: string; hora_inicio: string; status: string; servicos: { nome: string } | null }[] | null }

  const { data: prospeccaoHistorico } = await supabase
    .from('prospeccoes')
    .select('data, canal, status, convertido_em')
    .eq('cliente_id', clienteId)
    .order('criado_em', { ascending: false }) as { data: { data: string; canal: string | null; status: string; convertido_em: string | null }[] | null }

  const maiorQuantidade = Math.max(1, ...(ranking ?? []).map((r) => r.quantidade))

  const historico = [
    ...(atendimentos ?? []).map((a) => ({ data: a.data, texto: a.servicos?.nome ?? '—', valor: a.preco })),
    ...(vendas ?? []).map((v) => ({ data: v.data, texto: `${v.produtos?.nome ?? '—'} (produto)`, valor: v.preco_unitario * v.quantidade })),
  ].sort((a, b) => (a.data < b.data ? 1 : -1))

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-1">Dados do cliente</h2>
          <p className="font-heading text-lg font-semibold mt-3">
            {cliente?.nome} · {cliente?.telefone}
            {cliente?.data_nascimento ? ` · nasc. ${new Date(cliente.data_nascimento).toLocaleDateString()}` : ''}
            {cliente?.bairro ? ` · ${cliente.bairro}` : ''}
            {cliente?.cidade ? ` · ${cliente.cidade}` : ''}
          </p>
          <p className="text-xs text-muted-foreground mb-4">Cliente desde {cliente?.criado_em ? new Date(cliente.criado_em).toLocaleDateString() : ''}</p>

          <EditarClienteForm
            clienteId={clienteId}
            bairroAtual={cliente?.bairro ?? null}
            cidadeAtual={cliente?.cidade ?? null}
            observacaoAtual={cliente?.observacao ?? null}
            categoriaOrigemAtual={cliente?.categoria_origem ?? null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Mais usados por ele</h2>
          {ranking?.map((r) => (
            <div key={`${r.tipo}-${r.item}`} className="mb-2">
              <div className="flex justify-between text-sm">
                <span>{r.item}</span>
                <span>{r.quantidade}x · <strong>R$ {Number(r.valor_total).toFixed(2)}</strong></span>
              </div>
              <div className="w-full bg-muted rounded h-2 overflow-hidden">
                <div className="bg-primary h-full" style={{ width: `${(r.quantidade / maiorQuantidade) * 100}%` }} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Histórico completo</h2>
          {historico.map((h, i) => (
            <div key={i} className="flex justify-between text-sm border-b py-1">
              <span>{new Date(h.data).toLocaleDateString()} — {h.texto}</span>
              <span>R$ {Number(h.valor).toFixed(2)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Agendamentos</h2>
          {(agendamentosHistorico ?? []).map((a, i) => (
            <div key={i} className="flex justify-between text-sm border-b py-1">
              <span>{new Date(a.data).toLocaleDateString()} {a.hora_inicio.slice(0, 5)} — {a.servicos?.nome ?? '—'}</span>
              <span className="text-muted-foreground">{a.status}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {(prospeccaoHistorico ?? []).length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h2 className="font-heading text-base font-bold mb-5">Prospecção</h2>
            {prospeccaoHistorico!.map((p, i) => (
              <div key={i} className="flex justify-between text-sm border-b py-1">
                <span>{new Date(p.data).toLocaleDateString()} — {p.canal ?? 'sem canal'}</span>
                <span className="text-muted-foreground">{p.status}{p.convertido_em ? ` (${new Date(p.convertido_em).toLocaleDateString()})` : ''}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Reescrever `src/components/editar-cliente-form.tsx`**

Substituir o arquivo inteiro por:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { CATEGORIAS_ORIGEM, type CategoriaOrigem } from '@/lib/categorias-origem'

export function EditarClienteForm({
  clienteId, bairroAtual, cidadeAtual, observacaoAtual, categoriaOrigemAtual,
}: {
  clienteId: string
  bairroAtual: string | null
  cidadeAtual: string | null
  observacaoAtual: string | null
  categoriaOrigemAtual: CategoriaOrigem | null
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [bairro, setBairro] = useState(bairroAtual ?? '')
  const [cidade, setCidade] = useState(cidadeAtual ?? '')
  const [observacao, setObservacao] = useState(observacaoAtual ?? '')
  const [categoriaOrigem, setCategoriaOrigem] = useState<CategoriaOrigem | ''>(categoriaOrigemAtual ?? '')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    const { data, error } = await supabase
      .from('clientes')
      .update({
        bairro: bairro.trim() || null, cidade: cidade.trim() || null, observacao: observacao.trim() || null,
        categoria_origem: categoriaOrigem || null,
      })
      .eq('id', clienteId)
      .select('id')
    setSalvando(false)
    if (error) {
      alert(error.message)
      return
    }
    if (!data || data.length === 0) {
      alert('Não foi possível salvar — você não tem permissão para editar este cliente.')
      return
    }
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setBairro(bairroAtual ?? '')
    setCidade(cidadeAtual ?? '')
    setObservacao(observacaoAtual ?? '')
    setCategoriaOrigem(categoriaOrigemAtual ?? '')
    setEditando(false)
  }

  const categoriaLabel = CATEGORIAS_ORIGEM.find((c) => c.value === categoriaOrigemAtual)?.label

  if (!editando) {
    return (
      <div className="mb-4">
        {observacaoAtual && <p className="text-sm text-muted-foreground mb-2">Observação: {observacaoAtual}</p>}
        {categoriaLabel && <p className="text-sm text-muted-foreground mb-2">Como conheceu: {categoriaLabel}</p>}
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">
          Editar bairro/cidade/observação/origem
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 mb-4 border rounded p-3">
      <Input placeholder="Bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
      <Input placeholder="Cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
      <textarea
        placeholder="Observação"
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
        className="w-full rounded-lg border border-input bg-input-bg px-2.5 py-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 min-h-20"
      />
      <Select value={categoriaOrigem} onChange={(e) => setCategoriaOrigem(e.target.value as CategoriaOrigem | '')}>
        <option value="">Como conheceu a barbearia?</option>
        {CATEGORIAS_ORIGEM.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </Select>
      <div className="flex gap-2">
        <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
        <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 4: Verificação visual manual**

Login como admin, abrir a ficha de um cliente em `/admin/clientes/[id]`. Confirmar os 5 `Card` (Dados do cliente, Mais usados por ele, Histórico completo, Agendamentos, e Prospecção se houver histórico). Clicar "Editar bairro/cidade/observação/origem", confirmar que o `Select` de categoria e o `textarea` de observação aparecem com o visual atualizado, editar um campo, salvar, depois cancelar uma edição sem salvar. Confirmar que um cliente sem histórico de prospecção não mostra o Card "Prospecção". Repetir em `/painel/clientes/[id]` como barbeiro (mesmo componente).

- [ ] **Step 5: Commit**

```bash
git add src/components/ficha-cliente.tsx src/components/editar-cliente-form.tsx
git commit -m "feat: redesign FichaCliente and EditarClienteForm to match SF visual identity"
```
