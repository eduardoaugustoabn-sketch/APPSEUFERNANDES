'use client'

import { useCallback, useEffect, useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { LancamentoForm, type ModoAgenda } from './lancamento-form'
import { AgendarSlotForm } from './agendar-slot-form'
import { RemarcarForm } from './remarcar-form'
import { AtenderAgoraForm } from './atender-agora-form'
import { BloqueioForm } from './bloqueio-form'

type Servico = { id: string; nome: string; preco: number; duracao_minutos: number; ativo: boolean }
type Produto = { id: string; nome: string; preco_venda: number; quantidade_estoque: number; ativo: boolean }

type AgendamentoDia = {
  id: string
  hora_inicio: string
  hora_fim: string
  status: string
  origem: string
  clientes: { nome: string; telefone: string } | null
  servicos: { id: string; nome: string } | null
}

type Bloqueio = { hora_inicio: string; hora_fim: string; motivo: string | null }
type Expediente = { hora_inicio: string; hora_fim: string }

const PASSO_MINUTOS = 60

function gerarSlots(horaInicio: string, horaFim: string): string[] {
  const slots: string[] = []
  let atual = horaInicio.slice(0, 5)
  const fim = horaFim.slice(0, 5)
  while (atual < fim) {
    slots.push(`${atual}:00`)
    const [h, m] = atual.split(':').map(Number)
    const totalMin = h * 60 + m + PASSO_MINUTOS
    atual = `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`
  }
  return slots
}

export function AgendaDia({
  barbeariaId, membroId, servicos, produtos,
}: { barbeariaId: string; membroId: string; servicos: Servico[]; produtos: Produto[] }) {
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [expedientes, setExpedientes] = useState<Expediente[]>([])
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([])
  const [agendamentos, setAgendamentos] = useState<AgendamentoDia[]>([])
  const [carregando, setCarregando] = useState(false)
  const [modoAgenda, setModoAgenda] = useState<ModoAgenda | null>(null)
  const [slotParaAgendar, setSlotParaAgendar] = useState<string | null>(null)
  const [remarcando, setRemarcando] = useState<{ id: string; servicoId: string; clienteNome: string } | null>(null)
  const [atendendoAgora, setAtendendoAgora] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const supabase = getBrowserSupabaseClient()
    const diaSemana = new Date(`${data}T00:00:00`).getDay()

    const [expedienteRes, bloqueioRes, agendamentoRes] = await Promise.all([
      supabase.from('horarios_trabalho').select('hora_inicio, hora_fim').eq('membro_id', membroId).eq('dia_semana', diaSemana),
      supabase.from('bloqueios_agenda').select('hora_inicio, hora_fim, motivo').eq('membro_id', membroId).eq('data', data),
      supabase.from('agendamentos')
        .select('id, hora_inicio, hora_fim, status, origem, clientes(nome, telefone), servicos(id, nome)')
        .eq('membro_id', membroId).eq('data', data).neq('status', 'cancelado')
        .order('hora_inicio'),
    ])

    setExpedientes(expedienteRes.data ?? [])
    setBloqueios(bloqueioRes.data ?? [])
    setAgendamentos((agendamentoRes.data ?? []) as unknown as AgendamentoDia[])
    setCarregando(false)
  }, [data, membroId])

  useEffect(() => { carregar() }, [carregar])

  const hoje = new Date().toISOString().slice(0, 10)
  const ehHoje = data === hoje

  const slots = expedientes.flatMap((e) => gerarSlots(e.hora_inicio, e.hora_fim))
  const slotsUnicos = Array.from(new Set(slots)).sort()

  function statusDoSlot(slot: string) {
    const bloqueio = bloqueios.find((b) => b.hora_inicio.slice(0, 5) <= slot.slice(0, 5) && slot.slice(0, 5) < b.hora_fim.slice(0, 5))
    if (bloqueio) return { tipo: 'bloqueado' as const, bloqueio }
    const doSlot = agendamentos.filter((a) => a.hora_inicio.slice(0, 5) <= slot.slice(0, 5) && slot.slice(0, 5) < a.hora_fim.slice(0, 5))
    if (doSlot.length > 0) return { tipo: 'ocupado' as const, agendamentos: doSlot }
    return { tipo: 'livre' as const }
  }

  function fecharPaineis() {
    setModoAgenda(null)
    setSlotParaAgendar(null)
    setRemarcando(null)
    setAtendendoAgora(false)
  }

  function clicarSlot(slot: string) {
    const info = statusDoSlot(slot)
    if (info.tipo === 'bloqueado') return
    fecharPaineis()
    setSlotParaAgendar(slot)
  }

  function atenderAgendamento(agendamento: AgendamentoDia) {
    if (agendamento.status !== 'confirmado' || !agendamento.servicos) return
    fecharPaineis()
    setModoAgenda({
      agendamentoId: agendamento.id,
      clienteNome: agendamento.clientes?.nome ?? '',
      clienteTelefone: agendamento.clientes?.telefone ?? '',
      servicoId: agendamento.servicos.id,
      horaInicio: agendamento.hora_inicio,
    })
  }

  async function cancelar(id: string) {
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase.from('agendamentos').update({ status: 'cancelado' }).eq('id', id)
    if (!error) carregar()
  }

  async function confirmarAgendamento(id: string) {
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase.from('agendamentos').update({ status: 'confirmado' }).eq('id', id)
    if (!error) carregar()
  }

  async function marcarNaoCompareceu(id: string) {
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase.from('agendamentos').update({ status: 'nao_compareceu' }).eq('id', id)
    if (!error) carregar()
  }

  const painelAberto = modoAgenda || slotParaAgendar || remarcando || atendendoAgora

  return (
    <div className="flex gap-6 flex-wrap items-start">
      <div className="max-w-md flex-1 min-w-[280px]">
        <div className="flex items-center gap-3 mb-3">
          <Input type="date" value={data} onChange={(e) => { setData(e.target.value); fecharPaineis() }} className="w-auto" />
          <button type="button" onClick={() => { fecharPaineis(); setAtendendoAgora(true) }} className="text-sm underline">Atender agora</button>
        </div>

        {carregando && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!carregando && slotsUnicos.length === 0 && <p className="text-sm text-muted-foreground">Sem expediente cadastrado para este dia.</p>}

        {!carregando && slotsUnicos.map((slot) => {
          const info = statusDoSlot(slot)
          const rotulo = slot.slice(0, 5)

          if (info.tipo === 'bloqueado') {
            return (
              <div key={slot} className="flex justify-between items-center text-sm py-1.5 px-2 opacity-60">
                <span>{rotulo} — bloqueado{info.bloqueio.motivo ? ` (${info.bloqueio.motivo})` : ''}</span>
              </div>
            )
          }

          if (info.tipo === 'ocupado') {
            return (
              <div key={slot} className="rounded bg-muted px-2 py-1.5">
                <span className="block text-sm font-medium mb-1">{rotulo}</span>
                {info.agendamentos.map((agendamento) => {
                  const jaPassou = new Date(`${data}T${agendamento.hora_inicio}`) < new Date()
                  const concluido = agendamento.status === 'realizado' || agendamento.status === 'nao_compareceu'
                  const eDesteSlot = agendamento.hora_inicio.slice(0, 5) === slot.slice(0, 5)
                  const corStatus = agendamento.status === 'realizado'
                    ? 'bg-emerald-100 border-emerald-300'
                    : agendamento.status === 'nao_compareceu'
                      ? 'bg-transparent border-transparent'
                      : 'bg-yellow-50 border-yellow-200'
                  return (
                    <div key={agendamento.id} className={`flex justify-between items-center text-sm py-1 px-1.5 rounded border ${corStatus} ${concluido ? 'opacity-60' : ''}`}>
                      <button
                        type="button"
                        onClick={() => atenderAgendamento(agendamento)}
                        disabled={concluido}
                        className="text-left flex-1 disabled:cursor-default"
                      >
                        {eDesteSlot
                          ? `${agendamento.clientes?.nome ?? 'cliente'} · ${agendamento.servicos?.nome ?? ''}${agendamento.status === 'realizado' ? ' · realizado' : ''}${agendamento.status === 'nao_compareceu' ? ' · não compareceu' : ''}`
                          : '↳ continua'}
                      </button>
                      {eDesteSlot && agendamento.status === 'agendado' && (
                        <span className="flex gap-2 ml-2 shrink-0">
                          <button type="button" onClick={() => confirmarAgendamento(agendamento.id)} className="text-xs underline">confirmar</button>
                          <button type="button" onClick={() => cancelar(agendamento.id)} className="text-destructive text-xs">cancelar</button>
                        </span>
                      )}
                      {eDesteSlot && agendamento.status === 'confirmado' && (
                        <span className="flex gap-2 ml-2 shrink-0">
                          <button type="button" onClick={() => atenderAgendamento(agendamento)} className="text-primary text-xs underline">
                            atendimento
                          </button>
                          <button
                            type="button"
                            onClick={() => { fecharPaineis(); setRemarcando({ id: agendamento.id, servicoId: agendamento.servicos?.id ?? '', clienteNome: agendamento.clientes?.nome ?? '' }) }}
                            className="text-xs underline"
                          >
                            remarcar
                          </button>
                          <button type="button" onClick={() => cancelar(agendamento.id)} className="text-destructive text-xs">cancelar</button>
                          {jaPassou && (
                            <button type="button" onClick={() => marcarNaoCompareceu(agendamento.id)} className="text-primary text-xs">não compareceu</button>
                          )}
                        </span>
                      )}
                    </div>
                  )
                })}
                <button type="button" onClick={() => clicarSlot(slot)} className="text-xs underline mt-1">+ agendar outro aqui</button>
              </div>
            )
          }

          return (
            <button
              key={slot}
              type="button"
              onClick={() => clicarSlot(slot)}
              className="w-full text-left text-sm py-1.5 px-2 rounded border-b hover:bg-muted disabled:hover:bg-transparent disabled:cursor-default"
            >
              {rotulo} — livre
            </button>
          )
        })}

        <h2 className="font-heading text-base font-semibold mt-6 mb-2">Bloquear horário</h2>
        <BloqueioForm membroId={membroId} onBloqueado={carregar} />
      </div>

      {painelAberto && (
        <div className="flex flex-col gap-2">
          {modoAgenda && (
            <LancamentoForm
              barbeariaId={barbeariaId}
              membroId={membroId}
              servicos={servicos}
              produtos={produtos}
              modoAgenda={modoAgenda}
              onSalvo={() => { fecharPaineis(); carregar() }}
            />
          )}
          {slotParaAgendar && (
            <AgendarSlotForm
              barbeariaId={barbeariaId}
              membroId={membroId}
              servicos={servicos}
              data={data}
              horaInicio={slotParaAgendar}
              agendamentosExistentes={agendamentos}
              onAgendado={() => { fecharPaineis(); carregar() }}
            />
          )}
          {remarcando && (
            <RemarcarForm
              barbeariaId={barbeariaId}
              membroId={membroId}
              servicoId={remarcando.servicoId}
              agendamentoId={remarcando.id}
              clienteNome={remarcando.clienteNome}
              onRemarcado={() => { fecharPaineis(); carregar() }}
              onCancelar={fecharPaineis}
            />
          )}
          {atendendoAgora && (
            <AtenderAgoraForm
              barbeariaId={barbeariaId}
              membroId={membroId}
              servicos={servicos}
              onCriado={(modo) => { fecharPaineis(); setModoAgenda(modo) }}
              onCancelar={fecharPaineis}
            />
          )}
        </div>
      )}
    </div>
  )
}
