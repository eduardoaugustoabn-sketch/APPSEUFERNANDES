'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

export const OPCOES_STATUS_PROSPECCAO = [
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
    <div className="flex gap-2 items-center shrink-0">
      <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className="w-36">
        {OPCOES_STATUS_PROSPECCAO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
      <Button type="button" onClick={salvar} disabled={salvando || status === statusAtual}>Salvar</Button>
    </div>
  )
}
