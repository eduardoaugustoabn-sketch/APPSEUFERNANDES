'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function InternalBookingForm({
  barbeariaId, membroId, servicos,
}: { barbeariaId: string; membroId: string; servicos: { id: string; nome: string; duracao_minutos: number }[] }) {
  const [servicoId, setServicoId] = useState('')
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [horarios, setHorarios] = useState<{ hora_inicio: string; hora_fim: string }[]>([])
  const [horario, setHorario] = useState('')
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [mensagem, setMensagem] = useState<string | null>(null)

  async function buscarHorarios() {
    const supabase = getBrowserSupabaseClient()
    const { data: slots } = await supabase.rpc('horarios_disponiveis', { p_barbearia_id: barbeariaId, p_membro_id: membroId, p_servico_id: servicoId, p_data: data })
    setHorarios(slots ?? [])
  }

  async function agendar() {
    const supabase = getBrowserSupabaseClient()
    const clienteId = await supabase.rpc('criar_ou_obter_cliente', { p_barbearia_id: barbeariaId, p_nome: nome, p_telefone: telefone })
    if (clienteId.error) { setMensagem(clienteId.error.message); return }

    const servico = servicos.find((s) => s.id === servicoId)!
    const horaFim = new Date(`1970-01-01T${horario}`)
    horaFim.setMinutes(horaFim.getMinutes() + servico.duracao_minutos)

    const { error } = await supabase.from('agendamentos').insert({
      barbearia_id: barbeariaId, membro_id: membroId, cliente_id: clienteId.data,
      servico_id: servicoId, data, hora_inicio: horario,
      hora_fim: horaFim.toTimeString().slice(0, 8), status: 'confirmado', origem: 'interno',
    })
    if (error) {
      setMensagem(error.code === '23P01' ? 'Esse horário acabou de ser ocupado por outro agendamento. Escolha outro horário.' : error.message)
      return
    }
    setMensagem('Agendado com sucesso!')
  }

  return (
    <div className="flex flex-col gap-2 max-w-sm">
      <select value={servicoId} onChange={(e) => setServicoId(e.target.value)} className="border rounded px-2 py-1">
        <option value="">Serviço</option>
        {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
      </select>
      <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
      <Button type="button" onClick={buscarHorarios}>Ver horários</Button>
      <select value={horario} onChange={(e) => setHorario(e.target.value)} className="border rounded px-2 py-1">
        <option value="">Horário</option>
        {horarios.map((h) => <option key={h.hora_inicio} value={h.hora_inicio}>{h.hora_inicio}</option>)}
      </select>
      <Input placeholder="Nome do cliente" value={nome} onChange={(e) => setNome(e.target.value)} />
      <Input placeholder="Telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
      <Button type="button" onClick={agendar}>Confirmar</Button>
      {mensagem && <p className="text-sm">{mensagem}</p>}
    </div>
  )
}
