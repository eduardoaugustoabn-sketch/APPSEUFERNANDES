'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TableRow, TableCell } from '@/components/ui/table'

type CategoriaOrigem = { id: string; nome: string; ativo: boolean }

export function CategoriaOrigemRow({ categoria }: { categoria: CategoriaOrigem }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(categoria.nome)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('categorias_origem').update({ nome }).eq('id', categoria.id)
    setSalvando(false)
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setNome(categoria.nome)
    setEditando(false)
  }

  async function alternarAtivo() {
    const supabase = getBrowserSupabaseClient()
    await supabase.from('categorias_origem').update({ ativo: !categoria.ativo }).eq('id', categoria.id)
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
    <TableRow className={categoria.ativo ? '' : 'opacity-50'}>
      <TableCell>{categoria.nome}</TableCell>
      <TableCell className="flex gap-2">
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">Editar</button>
        <button type="button" onClick={alternarAtivo} className="text-xs text-destructive underline">{categoria.ativo ? 'Desativar' : 'Reativar'}</button>
      </TableCell>
    </TableRow>
  )
}
