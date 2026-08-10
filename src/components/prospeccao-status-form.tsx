'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

const OPCOES = [
  { value: 'novo_lead', label: 'Novo lead' },
  { value: 'em_contato', label: 'Em contato' },
  { value: 'interessado', label: 'Interessado' },
]

// agendou/compareceu/convertido/nao_convertido não aparecem aqui de
// propósito — esses só mudam sozinhos, via o agendamento vinculado (ver
// migration 0015_prospeccao_auto_conversao.sql), nunca por edição manual.
export function ProspeccaoStatusForm({ prospeccaoId, statusAtual }: { prospeccaoId: string; statusAtual: string }) {
  const [status, setStatus] = useState(statusAtual)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('prospeccoes').update({ status }).eq('id', prospeccaoId)
    setSalvando(false)
    window.location.reload()
  }

  return (
    <div className="flex gap-2 items-center">
      <select value={status} onChange={(e) => setStatus(e.target.value)} className="border rounded px-2 py-1">
        {OPCOES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Button type="button" onClick={salvar} disabled={salvando || status === statusAtual}>Salvar</Button>
    </div>
  )
}
