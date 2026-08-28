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
  barbeariaId, membroId, produtos, categorias, onSalvo,
}: {
  barbeariaId: string
  membroId: string
  produtos: ProdutoLoja[]
  categorias: { id: string; nome: string }[]
  onSalvo?: () => void
}) {
  const router = useRouter()
  const [cliente, setCliente] = useState<{
    nome: string; telefone: string
    dataNascimento?: string; bairro?: string; cidade?: string
    categoriaOrigem?: CategoriaOrigem; reconhecido?: boolean
  } | null>(null)
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
      p_data_nascimento: cliente.dataNascimento ?? null,
      p_bairro: cliente.bairro ?? null, p_cidade: cliente.cidade ?? null,
      p_categoria_origem: cliente.categoriaOrigem ?? null,
      p_membro_id: membroId,
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
        <ClienteAutocomplete key={clienteAutocompleteKey} onResolved={setCliente} meuMembroId={membroId} categorias={categorias} />
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
