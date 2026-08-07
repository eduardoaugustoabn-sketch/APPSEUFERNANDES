'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { ClienteAutocomplete } from './cliente-autocomplete'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function LancamentoProdutoForm({
  barbeariaId, membroId, produtos,
}: { barbeariaId: string; membroId: string; produtos: { id: string; nome: string; preco_venda: number; quantidade_estoque: number }[] }) {
  const [produtoId, setProdutoId] = useState('')
  const [quantidade, setQuantidade] = useState(1)
  const [cliente, setCliente] = useState<{ nome: string; telefone: string } | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)

  async function lancar() {
    if (!produtoId || !cliente) return
    const supabase = getBrowserSupabaseClient()
    const clienteId = await supabase.rpc('criar_ou_obter_cliente', { p_barbearia_id: barbeariaId, p_nome: cliente.nome, p_telefone: cliente.telefone })
    if (clienteId.error) { setMensagem(clienteId.error.message); return }

    const produto = produtos.find((p) => p.id === produtoId)!
    const { error } = await supabase.from('vendas_produtos').insert({
      barbearia_id: barbeariaId, membro_id: membroId, cliente_id: clienteId.data,
      produto_id: produtoId, quantidade, preco_unitario: produto.preco_venda,
    })
    setMensagem(error ? error.message : 'Venda lançada com sucesso!')
  }

  return (
    <div className="flex flex-col gap-2 max-w-sm border rounded p-4">
      <h3 className="font-medium">+ Venda de produto</h3>
      <select value={produtoId} onChange={(e) => setProdutoId(e.target.value)} className="border rounded px-2 py-1">
        <option value="">Produto</option>
        {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome} (estoque: {p.quantidade_estoque})</option>)}
      </select>
      <Input type="number" min={1} value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value))} />
      <ClienteAutocomplete barbeariaId={barbeariaId} onResolved={setCliente} />
      <Button type="button" onClick={lancar}>Salvar</Button>
      {mensagem && <p className="text-sm">{mensagem}</p>}
    </div>
  )
}
