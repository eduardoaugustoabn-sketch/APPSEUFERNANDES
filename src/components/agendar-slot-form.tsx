'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { ClienteAutocomplete } from './cliente-autocomplete'
import { Button } from '@/components/ui/button'

type Servico = { id: string; nome: string; duracao_minutos: number }

// Só reserva o horário (agendamento status confirmado) — nenhum
// atendimento/venda é criado aqui. O lançamento real (e a conclusão do
// agendamento) acontece depois, reabrindo esse mesmo horário já ocupado
// (ver AgendaDia + LancamentoForm), que é quando o cliente de fato chega.
export function AgendarSlotForm({
  barbeariaId, membroId, servicos, data, horaInicio, onAgendado,
}: {
  barbeariaId: string
  membroId: string
  servicos: Servico[]
  data: string
  horaInicio: string
  onAgendado?: () => void
}) {
  const [cliente, setCliente] = useState<{ nome: string; telefone: string } | null>(null)
  const [servicoId, setServicoId] = useState('')
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function confirmar() {
    if (!cliente || !cliente.nome || !cliente.telefone) { setMensagem('Preencha o cliente.'); return }
    if (!servicoId) { setMensagem('Escolha o serviço.'); return }

    setSalvando(true)
    setMensagem(null)
    const supabase = getBrowserSupabaseClient()

    const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
      p_barbearia_id: barbeariaId, p_nome: cliente.nome, p_telefone: cliente.telefone,
    })
    if (clienteId.error) { setMensagem(clienteId.error.message); setSalvando(false); return }

    const servico = servicos.find((s) => s.id === servicoId)!
    const horaFim = new Date(`1970-01-01T${horaInicio}`)
    horaFim.setMinutes(horaFim.getMinutes() + servico.duracao_minutos)

    const { error } = await supabase.from('agendamentos').insert({
      barbearia_id: barbeariaId, membro_id: membroId, cliente_id: clienteId.data,
      servico_id: servicoId, data, hora_inicio: horaInicio,
      hora_fim: horaFim.toTimeString().slice(0, 8), status: 'confirmado', origem: 'interno',
    })
    setSalvando(false)
    if (error) { setMensagem(error.message); return }
    onAgendado?.()
  }

  return (
    <div className="flex flex-col gap-3 max-w-md border rounded p-4">
      <h3 className="font-medium">Agendar horário — {horaInicio.slice(0, 5)}</h3>
      <ClienteAutocomplete barbeariaId={barbeariaId} onResolved={setCliente} />
      <select value={servicoId} onChange={(e) => setServicoId(e.target.value)} className="border rounded px-2 py-1">
        <option value="">Serviço</option>
        {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
      </select>
      <Button type="button" onClick={confirmar} disabled={salvando}>Confirmar agendamento</Button>
      {mensagem && <p className="text-sm">{mensagem}</p>}
    </div>
  )
}
