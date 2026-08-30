'use client'

import { useMemo, useState } from 'react'
import { Select } from '@/components/ui/select'
import { ProspeccaoStatusForm, OPCOES_STATUS_PROSPECCAO } from '@/components/prospeccao-status-form'

type Prospeccao = {
  id: string
  nome: string
  telefone: string
  canal: string | null
  status: string
  oferta_corte_gratis: boolean
  criado_em: string
}

export function PendentesConversaoLista({ pendentes }: { pendentes: Prospeccao[] }) {
  const [filtroCanal, setFiltroCanal] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')

  const canais = useMemo(
    () => Array.from(new Set(pendentes.map((p) => p.canal).filter((c): c is string => !!c))).sort(),
    [pendentes]
  )

  const filtrados = pendentes.filter((p) => {
    if (filtroCanal && p.canal !== filtroCanal) return false
    if (filtroStatus && p.status !== filtroStatus) return false
    return true
  })

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={filtroCanal} onChange={(e) => setFiltroCanal(e.target.value)} aria-label="Filtrar por canal" className="w-40">
          <option value="">Todos os canais</option>
          {canais.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} aria-label="Filtrar por status" className="w-40">
          <option value="">Todos os status</option>
          {OPCOES_STATUS_PROSPECCAO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </div>
      {filtrados.map((p) => (
        <div key={p.id} className="flex justify-between items-center border-b py-2 last:border-b-0">
          <span>{p.nome} · {p.telefone} · {p.canal ?? 'sem canal'}{p.oferta_corte_gratis && ' · corte grátis'} · {new Date(p.criado_em).toLocaleDateString()}</span>
          <ProspeccaoStatusForm prospeccaoId={p.id} statusAtual={p.status} />
        </div>
      ))}
      {filtrados.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {pendentes.length === 0 ? 'Nenhuma prospecção pendente.' : 'Nenhuma prospecção pendente com esse filtro.'}
        </p>
      )}
    </>
  )
}
