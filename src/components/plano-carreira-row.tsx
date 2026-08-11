'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type Plano = { id: string; nome: string; percentual_produto: number; percentual_servico: number; ativo: boolean }

export function PlanoCarreiraRow({ plano }: { plano: Plano }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(plano.nome)
  const [percentualProduto, setPercentualProduto] = useState(plano.percentual_produto)
  const [percentualServico, setPercentualServico] = useState(plano.percentual_servico)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('planos_carreira').update({
      nome, percentual_produto: percentualProduto, percentual_servico: percentualServico,
    }).eq('id', plano.id)
    setSalvando(false)
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setNome(plano.nome)
    setPercentualProduto(plano.percentual_produto)
    setPercentualServico(plano.percentual_servico)
    setEditando(false)
  }

  async function alternarAtivo() {
    const supabase = getBrowserSupabaseClient()
    await supabase.from('planos_carreira').update({ ativo: !plano.ativo }).eq('id', plano.id)
    router.refresh()
  }

  if (editando) {
    return (
      <tr>
        <td><Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-32" /></td>
        <td><Input type="number" step="0.01" value={percentualProduto} onChange={(e) => setPercentualProduto(Number(e.target.value))} className="w-24" /></td>
        <td><Input type="number" step="0.01" value={percentualServico} onChange={(e) => setPercentualServico(Number(e.target.value))} className="w-24" /></td>
        <td className="flex gap-2">
          <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
          <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
        </td>
      </tr>
    )
  }

  return (
    <tr className={plano.ativo ? '' : 'opacity-60'}>
      <td>{plano.nome}</td>
      <td>{plano.percentual_produto}%</td>
      <td>{plano.percentual_servico}%</td>
      <td className="flex gap-2">
        <button type="button" onClick={() => setEditando(true)} className="text-xs underline">Editar</button>
        <button type="button" onClick={alternarAtivo} className="text-xs underline">{plano.ativo ? 'Desativar' : 'Reativar'}</button>
      </td>
    </tr>
  )
}
