'use client'

import { useCallback, useEffect, useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
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
  servicos: { id: string; nome: string; preco: number } | null
}

type Bloqueio = { id: string; hora_inicio: string; hora_fim: string; motivo: string | null }
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
      supabase.from('bloqueios_agenda').select('id, hora_inicio, hora_fim, motivo').eq('membro_id', membroId).eq('data', data),
      supabase.from('agendamentos')
        .select('id, hora_inicio, hora_fim, status, origem, clientes(nome, telefone), servicos(id, nome, preco)')
        .eq('membro_id', membroId).eq('data', data).neq('status', 'cancelado')
        .order('hora_inicio'),
    ])

    setExpedientes(expedienteRes.data ?? [])
    setBloqueios(bloqueioRes.data ?? [])
    setAgendamentos((agendamentoRes.data ?? []) as unknown as AgendamentoDia[])
    setCarregando(false)
  }, [data, membroId])

  useEffect(() => { carregar() }, [carregar])

  const slots = expedientes.flatMap((e) => gerarSlots(e.hora_inicio, e.hora_fim))
  const slotsUnicos = Array.from(new Set(slots)).sort()

  function statusDoSlot(slot: string) {
    const bloqueio = bloqueios.find((b) => b.hora_inicio.slice(0, 5) <= slot.slice(0, 5) && slot.slice(0, 5) < b.hora_fim.slice(0, 5))
    if (bloqueio) return { tipo: 'bloqueado' as const, bloqueio }
    const doSlot = agendamentos.filter((a) => a.hora_inicio.slice(0, 5) <= slot.slice(0, 5) && slot.slice(0, 5) < a.hora_fim.slice(0, 5))
    if (doSlot.length > 0) return { tipo: 'ocupado' as const, agendamentos: doSlot }
    return { tipo: 'livre' as const }
  }

  const livresCount = slotsUnicos.filter((s) => statusDoSlot(s).tipo === 'livre').length
  const agendadosCount = slotsUnicos.filter((s) => statusDoSlot(s).tipo === 'ocupado').length
  const bloqueadosCount = slotsUnicos.filter((s) => statusDoSlot(s).tipo === 'bloqueado').length
  const previstoNoDia = agendamentos.reduce((s, a) => s + (a.servicos?.preco ?? 0), 0)

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

  async function desbloquear(id: string) {
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase.from('bloqueios_agenda').delete().eq('id', id)
    if (!error) carregar()
  }

  const painelAberto = modoAgenda || slotParaAgendar || remarcando || atendendoAgora

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Input type="date" value={data} onChange={(e) => { setData(e.target.value); fecharPaineis() }} className="w-auto" />
        <button type="button" onClick={() => { fecharPaineis(); setAtendendoAgora(true) }} className="text-sm font-bold text-primary hover:underline">
          Atender agora
        </button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="font-mono text-[10px] tracking-[0.13em] uppercase text-muted-foreground">Horários livres</p>
            <p className="text-2xl font-extrabold tracking-tight mt-2">{livresCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="font-mono text-[10px] tracking-[0.13em] uppercase text-muted-foreground">Agendados</p>
            <p className="text-2xl font-extrabold tracking-tight mt-2 text-emerald-dark">{agendadosCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="font-mono text-[10px] tracking-[0.13em] uppercase text-muted-foreground">Bloqueados</p>
            <p className="text-2xl font-extrabold tracking-tight mt-2 text-amber-text">{bloqueadosCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="font-mono text-[10px] tracking-[0.13em] uppercase text-muted-foreground">Previsto no dia</p>
            <p className="text-2xl font-extrabold tracking-tight mt-2">R$ {previstoNoDia.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(330px,1fr))] gap-4 items-start">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="font-heading text-base font-bold">Horários do dia</h2>
              <div className="flex gap-3.5 text-[11.5px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-primary" />Agendado</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber" />Bloqueado</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-muted-foreground/30" />Livre</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {carregando && <p className="text-sm text-muted-foreground">Carregando...</p>}
              {!carregando && slotsUnicos.length === 0 && <p className="text-sm text-muted-foreground">Sem expediente cadastrado para este dia.</p>}

              {!carregando && slotsUnicos.map((slot) => {
                const info = statusDoSlot(slot)
                const rotulo = slot.slice(0, 5)

                if (info.tipo === 'bloqueado') {
                  return (
                    <div key={slot} className="flex items-center gap-4 px-4 py-3 rounded-2xl border border-border bg-muted/50 opacity-70">
                      <span className="font-mono text-[13px] text-foreground/70 w-11 shrink-0">{rotulo}</span>
                      <span className="w-2 h-2 rounded-sm bg-amber shrink-0" />
                      <span className="flex-1 text-[13.5px] font-semibold">bloqueado{info.bloqueio.motivo ? ` — ${info.bloqueio.motivo}` : ''}</span>
                      <button type="button" onClick={() => desbloquear(info.bloqueio.id)} className="text-destructive text-xs font-bold underline shrink-0">desbloquear</button>
                    </div>
                  )
                }

                if (info.tipo === 'ocupado') {
                  return (
                    <div key={slot} className="rounded-2xl bg-muted px-4 py-3">
                      <span className="font-mono text-[13px] font-semibold block mb-2">{rotulo}</span>
                      {info.agendamentos.map((agendamento) => {
                        const jaPassou = new Date(`${data}T${agendamento.hora_inicio}`) < new Date()
                        const concluido = agendamento.status === 'realizado' || agendamento.status === 'nao_compareceu'
                        const eDesteSlot = agendamento.hora_inicio.slice(0, 5) === slot.slice(0, 5)
                        const dotColor = agendamento.status === 'realizado' ? 'bg-primary' : agendamento.status === 'nao_compareceu' ? 'bg-muted-foreground/30' : 'bg-amber'
                        return (
                          <div key={agendamento.id} className={`flex items-center gap-3 py-1.5 ${concluido ? 'opacity-60' : ''}`}>
                            <span className={`w-2 h-2 rounded-sm shrink-0 ${dotColor}`} />
                            <button
                              type="button"
                              onClick={() => atenderAgendamento(agendamento)}
                              disabled={concluido}
                              className="text-left flex-1 min-w-0 text-[13.5px] font-semibold disabled:cursor-default"
                            >
                              {eDesteSlot
                                ? `${agendamento.clientes?.nome ?? 'cliente'} · ${agendamento.servicos?.nome ?? ''}${agendamento.status === 'realizado' ? ' · realizado' : ''}${agendamento.status === 'nao_compareceu' ? ' · não compareceu' : ''}`
                                : '↳ continua'}
                            </button>
                            {eDesteSlot && agendamento.status === 'agendado' && (
                              <span className="flex gap-3 shrink-0">
                                <button type="button" onClick={() => confirmarAgendamento(agendamento.id)} className="text-xs font-bold text-primary underline">confirmar</button>
                                <button type="button" onClick={() => cancelar(agendamento.id)} className="text-xs font-bold text-destructive underline">cancelar</button>
                              </span>
                            )}
                            {eDesteSlot && agendamento.status === 'confirmado' && (
                              <span className="flex gap-3 shrink-0">
                                <button type="button" onClick={() => atenderAgendamento(agendamento)} className="text-xs font-bold text-primary underline">atendimento</button>
                                <button
                                  type="button"
                                  onClick={() => { fecharPaineis(); setRemarcando({ id: agendamento.id, servicoId: agendamento.servicos?.id ?? '', clienteNome: agendamento.clientes?.nome ?? '' }) }}
                                  className="text-xs font-bold underline"
                                >
                                  remarcar
                                </button>
                                <button type="button" onClick={() => cancelar(agendamento.id)} className="text-xs font-bold text-destructive underline">cancelar</button>
                                {jaPassou && (
                                  <button type="button" onClick={() => marcarNaoCompareceu(agendamento.id)} className="text-xs font-bold text-amber-text underline">não compareceu</button>
                                )}
                              </span>
                            )}
                          </div>
                        )
                      })}
                      <button type="button" onClick={() => clicarSlot(slot)} className="text-xs font-bold text-primary underline mt-1.5">+ agendar outro aqui</button>
                    </div>
                  )
                }

                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => clicarSlot(slot)}
                    className="w-full flex items-center gap-4 px-4 py-3 rounded-2xl border border-transparent hover:border-border hover:bg-muted/50 text-left"
                  >
                    <span className="font-mono text-[13px] text-muted-foreground w-11 shrink-0">{rotulo}</span>
                    <span className="w-2 h-2 rounded-sm bg-muted-foreground/30 shrink-0" />
                    <span className="text-[13.5px] text-muted-foreground">Livre</span>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          {!painelAberto && (
            <Card>
              <CardContent className="p-6">
                <h2 className="font-heading text-base font-bold">Bloquear horário</h2>
                <p className="text-[12.5px] text-muted-foreground mt-0.5 mb-5">Almoço, ausência ou compromisso pessoal</p>
                <BloqueioForm membroId={membroId} onBloqueado={carregar} />
                <div className="mt-5 p-4 rounded-2xl bg-muted text-[12.5px] text-foreground/70 leading-relaxed">
                  Cada hora vazia é uma oportunidade perdida — bloqueie só o necessário e ofereça os horários livres na prospecção.
                </div>
              </CardContent>
            </Card>
          )}

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
      </div>
    </div>
  )
}
