'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { ClienteAutocomplete } from './cliente-autocomplete'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type Servico = { id: string; nome: string; preco: number }
type Produto = { id: string; nome: string; preco_venda: number; quantidade_estoque: number }
type ServicoSelecionado = Servico
type ProdutoSelecionado = Produto & { quantidade: number }

export function LancamentoForm({
  barbeariaId, membroId, servicos, produtos,
}: { barbeariaId: string; membroId: string; servicos: Servico[]; produtos: Produto[] }) {
  const [cliente, setCliente] = useState<{ nome: string; telefone: string } | null>(null)
  const [servicosSelecionados, setServicosSelecionados] = useState<ServicoSelecionado[]>([])
  const [produtosSelecionados, setProdutosSelecionados] = useState<ProdutoSelecionado[]>([])
  const [servicoParaAdicionar, setServicoParaAdicionar] = useState('')
  const [produtoParaAdicionar, setProdutoParaAdicionar] = useState('')
  const [quantidadeParaAdicionar, setQuantidadeParaAdicionar] = useState(1)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [clienteAutocompleteKey, setClienteAutocompleteKey] = useState(0)

  // Every catalog item stays selectable (not filtered down as items get
  // added) — a visit can need the same serviço twice (e.g. corte + corte
  // infantil for two kids under one cliente) or another round of a produto.
  function adicionarServico() {
    const servico = servicos.find((s) => s.id === servicoParaAdicionar)
    if (!servico) return
    setServicosSelecionados((atual) => [...atual, servico])
    setServicoParaAdicionar('')
  }

  function adicionarProduto() {
    const produto = produtos.find((p) => p.id === produtoParaAdicionar)
    if (!produto) return
    setProdutosSelecionados((atual) => {
      const existente = atual.find((p) => p.id === produto.id)
      if (existente) {
        return atual.map((p) => (p.id === produto.id ? { ...p, quantidade: p.quantidade + quantidadeParaAdicionar } : p))
      }
      return [...atual, { ...produto, quantidade: quantidadeParaAdicionar }]
    })
    setProdutoParaAdicionar('')
    setQuantidadeParaAdicionar(1)
  }

  // By index, not id — the same serviço can appear more than once in the
  // list (see adicionarServico above), so removing "by id" would drop every
  // instance of it instead of just the one the user clicked "remover" on.
  function removerServico(index: number) {
    setServicosSelecionados((atual) => atual.filter((_, i) => i !== index))
  }

  function removerProduto(id: string) {
    setProdutosSelecionados((atual) => atual.filter((p) => p.id !== id))
  }

  async function salvar() {
    if (!cliente || !cliente.nome || !cliente.telefone) { setMensagem('Preencha o cliente.'); return }
    if (servicosSelecionados.length === 0) { setMensagem('Adicione ao menos um serviço (ex: corte).'); return }

    setSalvando(true)
    setMensagem(null)
    const supabase = getBrowserSupabaseClient()

    const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
      p_barbearia_id: barbeariaId, p_nome: cliente.nome, p_telefone: cliente.telefone,
    })
    if (clienteId.error) { setMensagem(clienteId.error.message); setSalvando(false); return }

    for (const servico of servicosSelecionados) {
      const { error } = await supabase.from('atendimentos').insert({
        barbearia_id: barbeariaId, membro_id: membroId, cliente_id: clienteId.data,
        servico_id: servico.id, preco: servico.preco,
      })
      if (error) { setMensagem(error.message); setSalvando(false); return }
    }

    for (const produto of produtosSelecionados) {
      const { error } = await supabase.from('vendas_produtos').insert({
        barbearia_id: barbeariaId, membro_id: membroId, cliente_id: clienteId.data,
        produto_id: produto.id, quantidade: produto.quantidade, preco_unitario: produto.preco_venda,
      })
      if (error) { setMensagem(error.message); setSalvando(false); return }
    }

    setMensagem('Lançado com sucesso!')
    setServicosSelecionados([])
    setProdutosSelecionados([])
    setCliente(null)
    setClienteAutocompleteKey((atual) => atual + 1)
    setSalvando(false)
  }

  return (
    <div className="flex flex-col gap-4 max-w-md border rounded p-4">
      <h3 className="font-medium">Novo lançamento</h3>

      <ClienteAutocomplete key={clienteAutocompleteKey} barbeariaId={barbeariaId} onResolved={setCliente} />

      <div>
        <p className="text-sm font-medium mb-1">Serviços (corte, serviço extra...)</p>
        {servicosSelecionados.map((s, index) => (
          <div key={`${s.id}-${index}`} className="flex justify-between items-center text-sm border-b py-1">
            <span>{s.nome} (R${s.preco})</span>
            <button type="button" onClick={() => removerServico(index)} className="text-red-600 text-xs">remover</button>
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <select value={servicoParaAdicionar} onChange={(e) => setServicoParaAdicionar(e.target.value)} className="border rounded px-2 py-1 flex-1">
            <option value="">Serviço</option>
            {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome} (R${s.preco})</option>)}
          </select>
          <Button type="button" variant="outline" onClick={adicionarServico} disabled={!servicoParaAdicionar}>+ Adicionar</Button>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-1">Produtos (opcional)</p>
        {produtosSelecionados.map((p) => (
          <div key={p.id} className="flex justify-between items-center text-sm border-b py-1">
            <span>{p.quantidade}x {p.nome} (R${p.preco_venda})</span>
            <button type="button" onClick={() => removerProduto(p.id)} className="text-red-600 text-xs">remover</button>
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <select value={produtoParaAdicionar} onChange={(e) => setProdutoParaAdicionar(e.target.value)} className="border rounded px-2 py-1 flex-1">
            <option value="">Produto</option>
            {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome} (estoque: {p.quantidade_estoque})</option>)}
          </select>
          <Input type="number" min={1} value={quantidadeParaAdicionar} onChange={(e) => setQuantidadeParaAdicionar(Number(e.target.value))} className="w-16" />
          <Button type="button" variant="outline" onClick={adicionarProduto} disabled={!produtoParaAdicionar}>+ Adicionar</Button>
        </div>
      </div>

      <Button type="button" onClick={salvar} disabled={salvando}>Salvar lançamento</Button>
      {mensagem && <p className="text-sm">{mensagem}</p>}
    </div>
  )
}
