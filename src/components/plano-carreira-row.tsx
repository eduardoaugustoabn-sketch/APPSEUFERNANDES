'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TableRow, TableCell } from '@/components/ui/table'

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
      <TableRow>
        <TableCell><Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-32" /></TableCell>
        <TableCell><Input type="number" step="0.01" value={percentualProduto} onChange={(e) => setPercentualProduto(Number(e.target.value))} className="w-24" /></TableCell>
        <TableCell><Input type="number" step="0.01" value={percentualServico} onChange={(e) => setPercentualServico(Number(e.target.value))} className="w-24" /></TableCell>
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
      <TableCell className="flex gap-2">
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">Editar</button>
        <button type="button" onClick={alternarAtivo} className="text-xs text-destructive underline">{plano.ativo ? 'Desativar' : 'Reativar'}</button>
      </TableCell>
    </TableRow>
  )
}
