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
