'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TableRow, TableCell } from '@/components/ui/table'

type Servico = { id: string; nome: string; duracao_minutos: number; preco: number; ativo: boolean }

export function ServicoRow({ servico }: { servico: Servico }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(servico.nome)
  const [duracaoMinutos, setDuracaoMinutos] = useState(servico.duracao_minutos)
  const [preco, setPreco] = useState(servico.preco)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('servicos').update({ nome, duracao_minutos: duracaoMinutos, preco }).eq('id', servico.id)
    setSalvando(false)
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setNome(servico.nome)
    setDuracaoMinutos(servico.duracao_minutos)
    setPreco(servico.preco)
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
      <TableCell className="flex gap-2">
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">Editar</button>
        <button type="button" onClick={alternarAtivo} className="text-xs text-destructive underline">{servico.ativo ? 'Desativar' : 'Reativar'}</button>
      </TableCell>
    </TableRow>
  )
}
