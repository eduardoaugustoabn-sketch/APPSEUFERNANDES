'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function RemarcarForm({
  barbeariaId, membroId, servicoId, agendamentoId, clienteNome, onRemarcado, onCancelar,
}: {
  barbeariaId: string
  membroId: string
  servicoId: string
  agendamentoId: string
  clienteNome: string
  onRemarcado?: () => void
  onCancelar?: () => void
}) {
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [horarios, setHorarios] = useState<{ hora_inicio: string; hora_fim: string }[]>([])
  const [horario, setHorario] = useState('')
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [salvando, setSalvando] = useState(false)

  async function buscarHorarios() {
    setBuscando(true)
    setHorario('')
    const supabase = getBrowserSupabaseClient()
    const { data: slots } = await supabase.rpc('horarios_disponiveis', {
      p_barbearia_id: barbeariaId, p_membro_id: membroId, p_servico_id: servicoId, p_data: data,
    })
    setHorarios(slots ?? [])
    setBuscando(false)
  }

  async function confirmar() {
    if (!horario) { setMensagem('Escolha um horário.'); return }
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    const slot = horarios.find((h) => h.hora_inicio === horario)!
    const { error } = await supabase.from('agendamentos').update({
      data, hora_inicio: slot.hora_inicio, hora_fim: slot.hora_fim,
    }).eq('id', agendamentoId)
    setSalvando(false)
    if (error) {
      setMensagem(
        error.code === '23P01'
          ? 'Esse horário acabou de ser ocupado por outro agendamento. Escolha outro horário.'
          : error.message
      )
      return
    }
    onRemarcado?.()
  }

  return (
    <div className="flex flex-col gap-2 max-w-sm border rounded p-4">
      <h3 className="font-heading text-base font-semibold">Remarcar — {clienteNome}</h3>
      <Input type="date" value={data} onChange={(e) => { setData(e.target.value); setHorarios([]); setHorario('') }} />
      <Button type="button" variant="outline" onClick={buscarHorarios} disabled={buscando}>Ver horários</Button>
      {horarios.length > 0 && (
        <select value={horario} onChange={(e) => setHorario(e.target.value)} className="border rounded px-2 py-1">
          <option value="">Horário</option>
          {horarios.map((h) => <option key={h.hora_inicio} value={h.hora_inicio}>{h.hora_inicio.slice(0, 5)}</option>)}
        </select>
      )}
      <div className="flex gap-2">
        <Button type="button" onClick={confirmar} disabled={salvando || !horario}>Confirmar</Button>
        <Button type="button" variant="outline" onClick={onCancelar}>Cancelar</Button>
      </div>
      {mensagem && <p className="text-sm">{mensagem}</p>}
    </div>
  )
}
