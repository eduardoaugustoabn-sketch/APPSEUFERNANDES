'use client'

import { useCallback, useEffect, useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { LancamentoForm, type ModoAgenda } from './lancamento-form'
import { AgendarSlotForm } from './agendar-slot-form'
import { RemarcarForm } from './remarcar-form'

type Servico = { id: string; nome: string; preco: number; duracao_minutos: number }
type Produto = { id: string; nome: string; preco_venda: number; quantidade_estoque: number }

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

const PASSO_MINUTOS = 30

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
    const agendamento = agendamentos.find((a) => a.hora_inicio.slice(0, 5) <= slot.slice(0, 5) && slot.slice(0, 5) < a.hora_fim.slice(0, 5))
    if (agendamento) return { tipo: 'ocupado' as const, agendamento, primeiroSlot: agendamento.hora_inicio.slice(0, 5) === slot.slice(0, 5) }
    return { tipo: 'livre' as const }
  }

  function fecharPaineis() {
    setModoAgenda(null)
    setSlotParaAgendar(null)
    setRemarcando(null)
  }

  function clicarSlot(slot: string) {
    if (!ehHoje) return
    const info = statusDoSlot(slot)
    if (info.tipo === 'bloqueado') return
    if (info.tipo === 'ocupado') {
      if (info.agendamento.status !== 'confirmado' || !info.agendamento.servicos) return
      fecharPaineis()
      setModoAgenda({
        agendamentoId: info.agendamento.id,
        clienteNome: info.agendamento.clientes?.nome ?? '',
        clienteTelefone: info.agendamento.clientes?.telefone ?? '',
        servicoId: info.agendamento.servicos.id,
        horaInicio: info.agendamento.hora_inicio,
      })
    } else {
      fecharPaineis()
      setSlotParaAgendar(slot)
    }
  }

  async function cancelar(id: string) {
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase.from('agendamentos').update({ status: 'cancelado' }).eq('id', id)
    if (!error) carregar()
  }

  const painelAberto = modoAgenda || slotParaAgendar || remarcando

  return (
    <div className="flex gap-6 flex-wrap items-start">
      <div className="max-w-md flex-1 min-w-[280px]">
        <Input type="date" value={data} onChange={(e) => { setData(e.target.value); fecharPaineis() }} className="w-auto mb-3" />

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
            const concluido = info.agendamento.status === 'concluido'
            return (
              <div key={slot} className={`flex justify-between items-center text-sm py-1.5 px-2 rounded ${concluido ? 'opacity-60' : 'bg-muted'}`}>
                <button
                  type="button"
                  onClick={() => clicarSlot(slot)}
                  disabled={!ehHoje || concluido}
                  className="text-left flex-1 disabled:cursor-default"
                >
                  {info.primeiroSlot
                    ? `${rotulo} — ${info.agendamento.clientes?.nome ?? 'cliente'} · ${info.agendamento.servicos?.nome ?? ''}${concluido ? ' · concluído' : ''}`
                    : `${rotulo} — ↳`}
                </button>
                {info.primeiroSlot && !concluido && (
                  <span className="flex gap-2 ml-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => { fecharPaineis(); setRemarcando({ id: info.agendamento.id, servicoId: info.agendamento.servicos?.id ?? '', clienteNome: info.agendamento.clientes?.nome ?? '' }) }}
                      className="text-xs underline"
                    >
                      remarcar
                    </button>
                    <button type="button" onClick={() => cancelar(info.agendamento.id)} className="text-red-600 text-xs">cancelar</button>
                  </span>
                )}
              </div>
            )
          }

          return (
            <button
              key={slot}
              type="button"
              onClick={() => clicarSlot(slot)}
              disabled={!ehHoje}
              className="w-full text-left text-sm py-1.5 px-2 rounded border-b hover:bg-muted disabled:hover:bg-transparent disabled:cursor-default"
            >
              {rotulo} — livre
            </button>
          )
        })}

        {!ehHoje && slotsUnicos.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">Clique nos horários só funciona para o dia de hoje — use &quot;Novo agendamento&quot; abaixo para marcar em outra data.</p>
        )}
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
        </div>
      )}
    </div>
  )
}
