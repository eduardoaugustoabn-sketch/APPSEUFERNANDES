'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TableRow, TableCell } from '@/components/ui/table'

type CanalProspeccao = { id: string; nome: string; ativo: boolean }

export function CanalProspeccaoRow({ canal }: { canal: CanalProspeccao }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(canal.nome)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    const nomeAntigo = canal.nome
    await supabase.from('canais_prospeccao').update({ nome }).eq('id', canal.id)
    if (nome !== nomeAntigo) {
      // Renomear precisa propagar pras prospecções já registradas com o
      // nome antigo, senão o ranking e os dados históricos divergem
      // silenciosamente. A policy de update de prospeccoes já restringe
      // isso ao tenant certo, não precisa filtrar por barbearia_id aqui.
      await supabase.from('prospeccoes').update({ canal: nome }).eq('canal', nomeAntigo)
    }
    setSalvando(false)
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setNome(canal.nome)
    setEditando(false)
  }

  async function alternarAtivo() {
    const supabase = getBrowserSupabaseClient()
    await supabase.from('canais_prospeccao').update({ ativo: !canal.ativo }).eq('id', canal.id)
    router.refresh()
  }

  if (editando) {
    return (
      <TableRow>
        <TableCell><Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-48" /></TableCell>
        <TableCell className="flex gap-2">
          <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
          <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow className={canal.ativo ? '' : 'opacity-50'}>
      <TableCell>{canal.nome}</TableCell>
      <TableCell className="flex gap-2">
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">Editar</button>
        <button type="button" onClick={alternarAtivo} className="text-xs text-destructive underline">{canal.ativo ? 'Desativar' : 'Reativar'}</button>
      </TableCell>
    </TableRow>
  )
}
