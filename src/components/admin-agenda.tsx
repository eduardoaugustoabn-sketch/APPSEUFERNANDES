'use client'

import { useState } from 'react'
import { Select } from '@/components/ui/select'
import { AgendaDia } from './agenda-dia'
import { AgendaTodosBarbeiros } from './agenda-todos-barbeiros'

type Barbeiro = { id: string; nome: string }
type Servico = { id: string; nome: string; preco: number; duracao_minutos: number; ativo: boolean }
type Produto = { id: string; nome: string; preco_venda: number; quantidade_estoque: number; ativo: boolean }
type Categoria = { id: string; nome: string }

export function AdminAgenda({
  barbeariaId, barbeiros, servicos, produtos, categorias,
}: { barbeariaId: string; barbeiros: Barbeiro[]; servicos: Servico[]; produtos: Produto[]; categorias: Categoria[] }) {
  const [barbeiroId, setBarbeiroId] = useState('')

  return (
    <div className="flex flex-col gap-5">
      <Select value={barbeiroId} onChange={(e) => setBarbeiroId(e.target.value)} aria-label="Barbeiro" className="w-56">
        <option value="">Todos os barbeiros</option>
        {barbeiros.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
      </Select>

      {barbeiroId ? (
        <AgendaDia barbeariaId={barbeariaId} membroId={barbeiroId} servicos={servicos} produtos={produtos} categorias={categorias} />
      ) : (
        <AgendaTodosBarbeiros barbeiros={barbeiros} />
      )}
    </div>
  )
}
