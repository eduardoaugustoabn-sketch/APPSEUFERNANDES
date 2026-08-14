'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TableRow, TableCell } from '@/components/ui/table'

type Barbeiro = {
  id: string
  nome: string
  telefone: string | null
  ativo: boolean
  plano_carreira_id: string | null
  meta_prospeccao_dia: number | null
}
type Plano = { id: string; nome: string; ativo: boolean }

export function BarbeiroRow({
  barbeiro,
  planos,
  vincularPlanoAction,
}: {
  barbeiro: Barbeiro
  planos: Plano[]
  vincularPlanoAction: (formData: FormData) => void
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(barbeiro.nome)
  const [telefone, setTelefone] = useState(barbeiro.telefone ?? '')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('membros').update({ nome, telefone: telefone || null }).eq('id', barbeiro.id)
    setSalvando(false)
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setNome(barbeiro.nome)
    setTelefone(barbeiro.telefone ?? '')
    setEditando(false)
  }

  async function alternarAtivo() {
    const supabase = getBrowserSupabaseClient()
    await supabase.from('membros').update({ ativo: !barbeiro.ativo }).eq('id', barbeiro.id)
    router.refresh()
  }

  const celulaPlano = (
    <TableCell>
      <form
        key={`${barbeiro.id}-${barbeiro.plano_carreira_id ?? 'none'}-${barbeiro.meta_prospeccao_dia ?? 'none'}`}
        action={vincularPlanoAction}
        className="flex gap-2 items-center flex-wrap"
      >
        <input type="hidden" name="membro_id" value={barbeiro.id} />
        <select name="plano_carreira_id" defaultValue={barbeiro.plano_carreira_id ?? ''} className="border rounded px-2 py-1 bg-input">
          <option value="">Sem plano</option>
          {planos.filter((p) => p.ativo || p.id === barbeiro.plano_carreira_id).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <input
          name="meta_prospeccao_dia"
          type="number"
          defaultValue={barbeiro.meta_prospeccao_dia ?? ''}
          placeholder="Meta diária"
          className="border rounded px-2 py-1 w-32 bg-input"
        />
        <Button type="submit" variant="outline">Salvar</Button>
      </form>
    </TableCell>
  )

  if (editando) {
    return (
      <TableRow>
        <TableCell><Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-32" /></TableCell>
        <TableCell><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} className="w-32" /></TableCell>
        {celulaPlano}
        <TableCell className="flex gap-2">
          <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
          <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow className={barbeiro.ativo ? '' : 'opacity-50'}>
      <TableCell>{barbeiro.nome}</TableCell>
      <TableCell>{barbeiro.telefone}</TableCell>
      {celulaPlano}
      <TableCell className="flex gap-2">
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">Editar</button>
        <button type="button" onClick={alternarAtivo} className="text-xs text-destructive underline">{barbeiro.ativo ? 'Desativar' : 'Reativar'}</button>
      </TableCell>
    </TableRow>
  )
}
