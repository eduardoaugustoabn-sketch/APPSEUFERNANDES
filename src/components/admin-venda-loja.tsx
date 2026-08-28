'use client'

import { useState } from 'react'
import { Select } from '@/components/ui/select'
import { VendaLojaForm } from './venda-loja-form'

type Barbeiro = { id: string; nome: string }
type ProdutoLoja = { id: string; nome: string; preco_venda: number; quantidade_estoque: number; ativo: boolean }
type Categoria = { id: string; nome: string }

export function AdminVendaLoja({
  barbeariaId, barbeiros, produtos, categorias,
}: { barbeariaId: string; barbeiros: Barbeiro[]; produtos: ProdutoLoja[]; categorias: Categoria[] }) {
  const [barbeiroId, setBarbeiroId] = useState('')

  return (
    <div className="flex flex-col gap-4">
      <Select value={barbeiroId} onChange={(e) => setBarbeiroId(e.target.value)} aria-label="Barbeiro" className="w-56">
        <option value="">Selecione um barbeiro</option>
        {barbeiros.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
      </Select>

      {barbeiroId && <VendaLojaForm barbeariaId={barbeariaId} membroId={barbeiroId} produtos={produtos} categorias={categorias} />}
    </div>
  )
}
