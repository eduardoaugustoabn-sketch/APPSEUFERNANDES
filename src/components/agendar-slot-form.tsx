'use client'

import { useEffect, useState } from 'react'
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
  // O grid marca um horário como "livre" olhando só se ELE MESMO cai dentro
  // de outro agendamento — mas não sabe, até o serviço ser escolhido aqui,
  // se a duração desse serviço vai esbarrar no PRÓXIMO agendamento (ex:
  // clicar às 09:00 livre, mas um corte de 40min vai até 09:40, e já tem
  // alguém marcado às 09:30). Isso não trava mais o agendamento (overbooking
  // interno é permitido de propósito) — só avisa, e pede uma segunda
  // confirmação antes de gravar.
  const [conflito, setConflito] = useState(false)
  const [verificando, setVerificando] = useState(false)
  const [pedindoConfirmacao, setPedindoConfirmacao] = useState(false)

  useEffect(() => {
    setPedindoConfirmacao(false)
    if (!servicoId) { setConflito(false); return }
    let cancelado = false
    async function verificar() {
      setVerificando(true)
      const supabase = getBrowserSupabaseClient()
      const { data: slots } = await supabase.rpc('horarios_disponiveis', {
        p_barbearia_id: barbeariaId, p_membro_id: membroId, p_servico_id: servicoId, p_data: data,
      })
      if (!cancelado) {
        const disponivel = (slots ?? []).some((s: { hora_inicio: string }) => s.hora_inicio === horaInicio)
        setConflito(!disponivel)
        setVerificando(false)
      }
    }
    verificar()
    return () => { cancelado = true }
  }, [servicoId, barbeariaId, membroId, data, horaInicio])

  async function gravar() {
    setSalvando(true)
    setMensagem(null)
    const supabase = getBrowserSupabaseClient()

    const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
      p_barbearia_id: barbeariaId, p_nome: cliente!.nome, p_telefone: cliente!.telefone,
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

  function confirmar() {
    if (!cliente || !cliente.nome || !cliente.telefone) { setMensagem('Preencha o cliente.'); return }
    if (!servicoId) { setMensagem('Escolha o serviço.'); return }
    if (conflito && !pedindoConfirmacao) { setPedindoConfirmacao(true); return }
    gravar()
  }

  return (
    <div className="flex flex-col gap-3 max-w-md border rounded p-4">
      <h3 className="font-medium">Agendar horário — {horaInicio.slice(0, 5)}</h3>
      <ClienteAutocomplete barbeariaId={barbeariaId} onResolved={setCliente} />
      <select value={servicoId} onChange={(e) => { setServicoId(e.target.value); setPedindoConfirmacao(false) }} className="border rounded px-2 py-1">
        <option value="">Serviço</option>
        {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
      </select>

      {pedindoConfirmacao && (
        <div className="border border-amber-400 bg-amber-50 rounded p-3 flex flex-col gap-2">
          <p className="text-sm">Este horário já possui um serviço agendado. Tem certeza de que deseja confirmar este agendamento?</p>
          <div className="flex gap-2">
            <Button type="button" onClick={gravar} disabled={salvando}>Confirmar mesmo assim</Button>
            <Button type="button" variant="outline" onClick={() => setPedindoConfirmacao(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {!pedindoConfirmacao && (
        <Button type="button" onClick={confirmar} disabled={salvando || verificando}>Confirmar agendamento</Button>
      )}
      {mensagem && <p className="text-sm">{mensagem}</p>}
    </div>
  )
}
