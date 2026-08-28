'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

type Barbeiro = { id: string; nome: string }

export function ReatribuirDonoForm({
  clienteId, barbeiros, donoAtualId,
}: { clienteId: string; barbeiros: Barbeiro[]; donoAtualId: string | null }) {
  const router = useRouter()
  const [donoId, setDonoId] = useState(donoAtualId ?? '')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    const { data, error } = await supabase
      .from('clientes')
      .update({ cadastrado_por_membro_id: donoId || null })
      .eq('id', clienteId)
      .select('id')
    setSalvando(false)
    if (error) {
      alert(error.message)
      return
    }
    if (!data || data.length === 0) {
      alert('Não foi possível salvar — você não tem permissão para editar este cliente.')
      return
    }
    router.refresh()
  }

  return (
    <div className="flex gap-2 items-center">
      <Select value={donoId} onChange={(e) => setDonoId(e.target.value)} aria-label="Dono do cadastro" className="w-48">
        <option value="">Sem dono</option>
        {barbeiros.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
      </Select>
      <Button type="button" onClick={salvar} disabled={salvando || donoId === (donoAtualId ?? '')}>Salvar dono</Button>
    </div>
  )
}
