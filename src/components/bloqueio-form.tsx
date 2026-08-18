'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function BloqueioForm({ membroId, onBloqueado }: { membroId: string; onBloqueado?: () => void }) {
  const [data, setData] = useState('')
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFim, setHoraFim] = useState('')
  const [motivo, setMotivo] = useState('')
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (!data || !horaInicio || !horaFim) { setMensagem('Preencha data, início e fim.'); return }
    if (horaFim <= horaInicio) { setMensagem('O fim precisa ser depois do início.'); return }

    setSalvando(true)
    setMensagem(null)
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase.from('bloqueios_agenda').insert({ membro_id: membroId, data, hora_inicio: horaInicio, hora_fim: horaFim, motivo: motivo || null })
    setSalvando(false)
    if (error) { setMensagem(error.message); return }

    setMensagem('Horário bloqueado.')
    setData('')
    setHoraInicio('')
    setHoraFim('')
    setMotivo('')
    onBloqueado?.()
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 items-end flex-wrap">
        <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
        <Input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
        <Input placeholder="Motivo (almoço, ausência...)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <Button type="button" onClick={salvar} disabled={salvando}>Bloquear</Button>
      </div>
      {mensagem && <p className="text-sm">{mensagem}</p>}
    </div>
  )
}
