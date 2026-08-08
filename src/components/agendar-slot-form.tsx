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
  // clicar às 09:30 livre, mas um corte de 40min começando aí vai até
  // 10:10, e já tem alguém marcado às 10:00). Por isso, ao escolher o
  // serviço, confere de verdade contra horarios_disponiveis antes de deixar
  // confirmar — em vez de deixar o insert estourar a constraint do banco
  // com um erro cru na tela.
  const [conflito, setConflito] = useState(false)
  const [verificando, setVerificando] = useState(false)

  useEffect(() => {
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

  async function confirmar() {
    if (!cliente || !cliente.nome || !cliente.telefone) { setMensagem('Preencha o cliente.'); return }
    if (!servicoId) { setMensagem('Escolha o serviço.'); return }
    if (conflito) { setMensagem('Esse horário não cabe esse serviço (esbarra em outro agendamento). Escolha outro horário ou outro serviço.'); return }

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
    if (error) {
      // exclusion_violation (SQLSTATE 23P01) — a checagem acima já cobre o
      // caso comum, isso aqui é só rede de segurança pra uma corrida rara
      // (outra pessoa marcou esse mesmo horário entre a checagem e o clique).
      setMensagem(
        error.code === '23P01'
          ? 'Esse horário acabou de ser ocupado por outro agendamento. Escolha outro horário.'
          : error.message
      )
      return
    }
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
      {servicoId && !verificando && conflito && (
        <p className="text-xs text-red-600">Esse horário não cabe esse serviço (esbarra em outro agendamento). Escolha outro horário ou outro serviço.</p>
      )}
      <Button type="button" onClick={confirmar} disabled={salvando || verificando || conflito}>Confirmar agendamento</Button>
      {mensagem && <p className="text-sm">{mensagem}</p>}
    </div>
  )
}
