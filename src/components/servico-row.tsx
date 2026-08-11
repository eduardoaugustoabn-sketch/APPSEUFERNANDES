'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

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
      <tr>
        <td><Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-32" /></td>
        <td><Input type="number" value={duracaoMinutos} onChange={(e) => setDuracaoMinutos(Number(e.target.value))} className="w-20" /></td>
        <td><Input type="number" step="0.01" value={preco} onChange={(e) => setPreco(Number(e.target.value))} className="w-24" /></td>
        <td className="flex gap-2">
          <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
          <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
        </td>
      </tr>
    )
  }

  return (
    <tr className={servico.ativo ? '' : 'opacity-60'}>
      <td>{servico.nome}</td>
      <td>{servico.duracao_minutos}min</td>
      <td>R$ {servico.preco}</td>
      <td className="flex gap-2">
        <button type="button" onClick={() => setEditando(true)} className="text-xs underline">Editar</button>
        <button type="button" onClick={alternarAtivo} className="text-xs underline">{servico.ativo ? 'Desativar' : 'Reativar'}</button>
      </td>
    </tr>
  )
}
