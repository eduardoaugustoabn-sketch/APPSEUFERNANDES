'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { ClienteAutocomplete } from './cliente-autocomplete'
import { Button } from '@/components/ui/button'

type Servico = { id: string; nome: string; duracao_minutos: number; ativo: boolean }
type AgendamentoExistente = { hora_inicio: string; hora_fim: string }

// Só reserva o horário (agendamento status confirmado) — nenhum
// atendimento/venda é criado aqui. O lançamento real (e a conclusão do
// agendamento) acontece depois, reabrindo esse mesmo horário já ocupado
// (ver AgendaDia + LancamentoForm), que é quando o cliente de fato chega.
export function AgendarSlotForm({
  barbeariaId, membroId, servicos, data, horaInicio, agendamentosExistentes, onAgendado,
}: {
  barbeariaId: string
  membroId: string
  servicos: Servico[]
  data: string
  horaInicio: string
  agendamentosExistentes: AgendamentoExistente[]
  onAgendado?: () => void
}) {
  const [cliente, setCliente] = useState<{ nome: string; telefone: string; dataNascimento?: string; bairro?: string; cidade?: string; categoriaOrigem?: string; reconhecido?: boolean } | null>(null)
  const [servicoId, setServicoId] = useState('')
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [pedindoConfirmacao, setPedindoConfirmacao] = useState(false)

  // O grid marca um horário como "livre" olhando só se ELE MESMO cai dentro
  // de outro agendamento — mas não sabe, até o serviço ser escolhido aqui,
  // se a duração desse serviço vai esbarrar no PRÓXIMO agendamento (ex:
  // clicar às 09:00 livre, mas um corte de 40min vai até 09:40, e já tem
  // alguém marcado às 09:30). Isso não trava mais o agendamento (overbooking
  // interno é permitido de propósito) — só avisa, e pede uma segunda
  // confirmação antes de gravar. Checa sobreposição real contra os
  // agendamentos já carregados do dia (mesmo formato do overlap check de
  // criar_agendamento_publico()) — depender de horarios_disponiveis() aqui
  // dava falso positivo sempre que a duração do serviço não dividia 60min
  // exatamente, porque aquela RPC só reconhece os horários "canônicos" do
  // seu próprio passo, não qualquer início livre.
  const servicoSelecionado = servicos.find((s) => s.id === servicoId)
  const conflito = (() => {
    if (!servicoSelecionado) return false
    const fim = new Date(`1970-01-01T${horaInicio}`)
    fim.setMinutes(fim.getMinutes() + servicoSelecionado.duracao_minutos)
    const horaFim = fim.toTimeString().slice(0, 8)
    return agendamentosExistentes.some((a) => horaInicio < a.hora_fim && horaFim > a.hora_inicio)
  })()

  async function gravar() {
    setSalvando(true)
    setMensagem(null)
    const supabase = getBrowserSupabaseClient()

    const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
      p_barbearia_id: barbeariaId, p_nome: cliente!.nome, p_telefone: cliente!.telefone,
      p_data_nascimento: cliente!.dataNascimento ?? null,
      p_bairro: cliente!.bairro ?? null, p_cidade: cliente!.cidade ?? null,
      p_categoria_origem: cliente!.categoriaOrigem ?? null,
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
    if (!cliente.reconhecido && !cliente.categoriaOrigem) { setMensagem('Escolha como o cliente conheceu a barbearia.'); return }
    if (!servicoId) { setMensagem('Escolha o serviço.'); return }
    if (conflito && !pedindoConfirmacao) { setPedindoConfirmacao(true); return }
    gravar()
  }

  return (
    <div className="flex flex-col gap-3 max-w-md border rounded p-4">
      <h3 className="font-heading text-base font-semibold">Agendar horário — {horaInicio.slice(0, 5)}</h3>
      <ClienteAutocomplete onResolved={setCliente} />
      <select value={servicoId} onChange={(e) => { setServicoId(e.target.value); setPedindoConfirmacao(false) }} className="border rounded px-2 py-1">
        <option value="">Serviço</option>
        {servicos.filter((s) => s.ativo).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
      </select>

      {pedindoConfirmacao && (
        <div className="border border-primary/40 bg-primary/10 rounded p-3 flex flex-col gap-2">
          <p className="text-sm">Este horário já possui um serviço agendado. Tem certeza de que deseja confirmar este agendamento?</p>
          <div className="flex gap-2">
            <Button type="button" onClick={gravar} disabled={salvando}>Confirmar mesmo assim</Button>
            <Button type="button" variant="outline" onClick={() => setPedindoConfirmacao(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {!pedindoConfirmacao && (
        <Button type="button" onClick={confirmar} disabled={salvando}>Confirmar agendamento</Button>
      )}
      {mensagem && <p className="text-sm">{mensagem}</p>}
    </div>
  )
}
