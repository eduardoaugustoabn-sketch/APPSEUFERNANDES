'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { ClienteAutocomplete } from './cliente-autocomplete'
import { Button } from '@/components/ui/button'
import type { ModoAgenda } from './lancamento-form'

type Servico = { id: string; nome: string; duracao_minutos: number }

// Walk-in: cliente chegou sem hora marcada. Em vez de uma tela de
// "lançamento avulso" separada, isso cria um agendamento normal pro
// horário atual e entrega o controle pro mesmo fluxo de "atender
// agendamento" (LancamentoForm com modoAgenda) que a Agenda já usa — sem
// caminho de dado que não passe por agendamentos.
export function AtenderAgoraForm({
  barbeariaId, membroId, servicos, onCriado, onCancelar,
}: {
  barbeariaId: string
  membroId: string
  servicos: Servico[]
  onCriado: (modoAgenda: ModoAgenda) => void
  onCancelar?: () => void
}) {
  const [cliente, setCliente] = useState<{ nome: string; telefone: string } | null>(null)
  const [servicoId, setServicoId] = useState('')
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function criar() {
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
    const agora = new Date()
    const data = agora.toISOString().slice(0, 10)
    const horaInicio = agora.toTimeString().slice(0, 8)
    const horaFim = new Date(agora)
    horaFim.setMinutes(horaFim.getMinutes() + servico.duracao_minutos)

    const { data: agendamento, error } = await supabase.from('agendamentos').insert({
      barbearia_id: barbeariaId, membro_id: membroId, cliente_id: clienteId.data,
      servico_id: servicoId, data, hora_inicio: horaInicio,
      hora_fim: horaFim.toTimeString().slice(0, 8), status: 'confirmado', origem: 'interno',
    }).select('id').single()

    setSalvando(false)
    if (error || !agendamento) { setMensagem(error?.message ?? 'Não foi possível iniciar o atendimento.'); return }

    onCriado({
      agendamentoId: agendamento.id,
      clienteNome: cliente.nome,
      clienteTelefone: cliente.telefone,
      servicoId,
      horaInicio,
    })
  }

  return (
    <div className="flex flex-col gap-3 max-w-md border rounded p-4">
      <h3 className="font-medium">Atender agora</h3>
      <ClienteAutocomplete barbeariaId={barbeariaId} onResolved={setCliente} />
      <select value={servicoId} onChange={(e) => setServicoId(e.target.value)} className="border rounded px-2 py-1">
        <option value="">Serviço</option>
        {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
      </select>
      <div className="flex gap-2">
        <Button type="button" onClick={criar} disabled={salvando}>Iniciar atendimento</Button>
        <Button type="button" variant="outline" onClick={onCancelar}>Cancelar</Button>
      </div>
      {mensagem && <p className="text-sm">{mensagem}</p>}
    </div>
  )
}
