'use client'

import { useCallback, useEffect, useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { gerarSlots, statusDoSlot } from '@/lib/agenda-slots'

type Barbeiro = { id: string; nome: string }
type AgendamentoDia = {
  id: string
  membro_id: string
  hora_inicio: string
  hora_fim: string
  status: string
  clientes: { nome: string } | null
  servicos: { nome: string } | null
}
type Bloqueio = { id: string; membro_id: string; hora_inicio: string; hora_fim: string; motivo: string | null }
type Expediente = { membro_id: string; hora_inicio: string; hora_fim: string }

export function AgendaTodosBarbeiros({ barbeiros }: { barbeiros: Barbeiro[] }) {
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [expedientes, setExpedientes] = useState<Expediente[]>([])
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([])
  const [agendamentos, setAgendamentos] = useState<AgendamentoDia[]>([])
  const [carregando, setCarregando] = useState(false)

  const carregar = useCallback(async () => {
    const barbeiroIds = barbeiros.map((b) => b.id)
    if (barbeiroIds.length === 0) return
    setCarregando(true)
    const supabase = getBrowserSupabaseClient()
    const diaSemana = new Date(`${data}T00:00:00`).getDay()

    const [expedienteRes, bloqueioRes, agendamentoRes] = await Promise.all([
      supabase.from('horarios_trabalho').select('membro_id, hora_inicio, hora_fim').in('membro_id', barbeiroIds).eq('dia_semana', diaSemana),
      supabase.from('bloqueios_agenda').select('id, membro_id, hora_inicio, hora_fim, motivo').in('membro_id', barbeiroIds).eq('data', data),
      supabase.from('agendamentos')
        .select('id, membro_id, hora_inicio, hora_fim, status, clientes(nome), servicos(nome)')
        .in('membro_id', barbeiroIds).eq('data', data).neq('status', 'cancelado')
        .order('hora_inicio'),
    ])

    setExpedientes(expedienteRes.data ?? [])
    setBloqueios(bloqueioRes.data ?? [])
    setAgendamentos((agendamentoRes.data ?? []) as unknown as AgendamentoDia[])
    setCarregando(false)
  }, [data, barbeiros])

  useEffect(() => { carregar() }, [carregar])

  return (
    <div className="flex flex-col gap-5">
      <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-auto" />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4 items-start">
        {barbeiros.map((barbeiro) => {
          const expedienteBarbeiro = expedientes.filter((e) => e.membro_id === barbeiro.id)
          const bloqueiosBarbeiro = bloqueios.filter((b) => b.membro_id === barbeiro.id)
          const agendamentosBarbeiro = agendamentos.filter((a) => a.membro_id === barbeiro.id)
          const slots = Array.from(new Set(expedienteBarbeiro.flatMap((e) => gerarSlots(e.hora_inicio, e.hora_fim)))).sort()

          return (
            <Card key={barbeiro.id}>
              <CardContent className="p-6">
                <h2 className="font-heading text-base font-bold mb-4">{barbeiro.nome}</h2>
                <div className="flex flex-col gap-2">
                  {carregando && <p className="text-sm text-muted-foreground">Carregando...</p>}
                  {!carregando && slots.length === 0 && <p className="text-sm text-muted-foreground">Sem expediente cadastrado para este dia.</p>}
                  {!carregando && slots.map((slot) => {
                    const info = statusDoSlot(slot, bloqueiosBarbeiro, agendamentosBarbeiro)
                    const rotulo = slot.slice(0, 5)

                    if (info.tipo === 'bloqueado') {
                      return (
                        <div key={slot} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-border bg-muted/50 opacity-70">
                          <span className="font-mono text-[12px] text-foreground/70 w-10 shrink-0">{rotulo}</span>
                          <span className="w-2 h-2 rounded-sm bg-amber shrink-0" />
                          <span className="flex-1 text-[13px] font-medium">bloqueado{info.bloqueio.motivo ? ` — ${info.bloqueio.motivo}` : ''}</span>
                        </div>
                      )
                    }

                    if (info.tipo === 'ocupado') {
                      return (
                        <div key={slot} className="rounded-xl bg-muted px-3 py-2">
                          <span className="font-mono text-[12px] font-semibold block mb-1">{rotulo}</span>
                          {info.agendamentos.map((a) => (
                            <div key={a.id} className="flex items-center gap-2 py-1">
                              <span className={`w-2 h-2 rounded-sm shrink-0 ${a.status === 'realizado' ? 'bg-primary' : a.status === 'nao_compareceu' ? 'bg-muted-foreground/30' : 'bg-amber'}`} />
                              <span className="text-[13px] font-medium">{a.clientes?.nome ?? 'cliente'} · {a.servicos?.nome ?? ''}</span>
                            </div>
                          ))}
                        </div>
                      )
                    }

                    return (
                      <div key={slot} className="flex items-center gap-3 px-3 py-2">
                        <span className="font-mono text-[12px] text-muted-foreground w-10 shrink-0">{rotulo}</span>
                        <span className="w-2 h-2 rounded-sm bg-muted-foreground/30 shrink-0" />
                        <span className="text-[13px] text-muted-foreground">Livre</span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })}
        {barbeiros.length === 0 && <p className="text-sm text-muted-foreground">Nenhum barbeiro ativo cadastrado.</p>}
      </div>
    </div>
  )
}
