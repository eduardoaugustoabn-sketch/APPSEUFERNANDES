'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function BloqueioForm({ membroId }: { membroId: string }) {
  const [data, setData] = useState('')
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFim, setHoraFim] = useState('')
  const [motivo, setMotivo] = useState('')

  async function salvar() {
    const supabase = getBrowserSupabaseClient()
    await supabase.from('bloqueios_agenda').insert({ membro_id: membroId, data, hora_inicio: horaInicio, hora_fim: horaFim, motivo })
  }

  return (
    <div className="flex gap-2 items-end">
      <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
      <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
      <Input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
      <Input placeholder="Motivo (almoço, ausência...)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      <Button type="button" onClick={salvar}>Bloquear</Button>
    </div>
  )
}
