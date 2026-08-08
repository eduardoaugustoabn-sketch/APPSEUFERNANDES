'use client'

import { useEffect, useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'

type Agendamento = {
  id: string
  hora_inicio: string
  hora_fim: string
  status: string
  origem: string
  clientes: { nome: string; telefone: string } | null
  servicos: { nome: string } | null
}

export function AgendaLista({ membroId }: { membroId: string }) {
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    let cancelado = false
    async function carregar() {
      setCarregando(true)
      const supabase = getBrowserSupabaseClient()
      const { data: rows } = await supabase
        .from('agendamentos')
        .select('id, hora_inicio, hora_fim, status, origem, clientes(nome, telefone), servicos(nome)')
        .eq('membro_id', membroId)
        .eq('data', data)
        .order('hora_inicio')
      if (!cancelado) {
        setAgendamentos((rows ?? []) as unknown as Agendamento[])
        setCarregando(false)
      }
    }
    carregar()
    return () => { cancelado = true }
  }, [data, membroId])

  async function cancelar(id: string) {
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase.from('agendamentos').update({ status: 'cancelado' }).eq('id', id)
    if (!error) {
      setAgendamentos((atual) => atual.map((a) => (a.id === id ? { ...a, status: 'cancelado' } : a)))
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-auto" />
      </div>
      {carregando && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {!carregando && agendamentos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum agendamento nesse dia.</p>}
      {agendamentos.map((a) => (
        <div key={a.id} className={`flex justify-between items-center border-b py-2 text-sm ${a.status === 'cancelado' ? 'opacity-50 line-through' : ''}`}>
          <span>
            {a.hora_inicio.slice(0, 5)}–{a.hora_fim.slice(0, 5)} · {a.clientes?.nome ?? '—'} · {a.servicos?.nome ?? '—'} ·{' '}
            {a.origem === 'publico' ? 'público' : 'interno'}
            {a.status === 'cancelado' && ' · cancelado'}
            {a.status === 'concluido' && ' · concluído'}
          </span>
          {a.status === 'confirmado' && (
            <button type="button" onClick={() => cancelar(a.id)} className="text-red-600 text-xs">cancelar</button>
          )}
        </div>
      ))}
    </div>
  )
}
