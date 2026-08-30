'use client'

import { useMemo, useState } from 'react'
import { Select } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'

type Venda = {
  data: string
  quantidade: number
  preco_unitario: number
  comissao_valor: number
  clientes: { nome: string } | null
  produtos_loja: { nome: string } | null
  membros?: { nome: string } | null
}

export function VendasLojaLista({ vendas, mostrarBarbeiro }: { vendas: Venda[]; mostrarBarbeiro?: boolean }) {
  const [filtroProduto, setFiltroProduto] = useState('')
  const [filtroBarbeiro, setFiltroBarbeiro] = useState('')

  const produtos = useMemo(
    () => Array.from(new Set(vendas.map((v) => v.produtos_loja?.nome).filter((n): n is string => !!n))).sort(),
    [vendas]
  )
  const barbeiros = useMemo(
    () => Array.from(new Set(vendas.map((v) => v.membros?.nome).filter((n): n is string => !!n))).sort(),
    [vendas]
  )

  const filtradas = vendas.filter((v) => {
    if (filtroProduto && v.produtos_loja?.nome !== filtroProduto) return false
    if (filtroBarbeiro && v.membros?.nome !== filtroBarbeiro) return false
    return true
  })

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={filtroProduto} onChange={(e) => setFiltroProduto(e.target.value)} aria-label="Filtrar por produto" className="w-48">
          <option value="">Todos os produtos</option>
          {produtos.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        {mostrarBarbeiro && (
          <Select value={filtroBarbeiro} onChange={(e) => setFiltroBarbeiro(e.target.value)} aria-label="Filtrar por barbeiro" className="w-40">
            <option value="">Todos os barbeiros</option>
            {barbeiros.map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Produto</TableHead>
            <TableHead>Qtd</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Comissão</TableHead>
            {mostrarBarbeiro && <TableHead>Barbeiro</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtradas.map((v, i) => (
            <TableRow key={i}>
              <TableCell>{new Date(v.data).toLocaleDateString()}</TableCell>
              <TableCell>{v.clientes?.nome ?? '—'}</TableCell>
              <TableCell>{v.produtos_loja?.nome ?? '—'}</TableCell>
              <TableCell>{v.quantidade}</TableCell>
              <TableCell>R$ {(v.preco_unitario * v.quantidade).toFixed(2)}</TableCell>
              <TableCell>R$ {Number(v.comissao_valor).toFixed(2)}</TableCell>
              {mostrarBarbeiro && <TableCell>{v.membros?.nome ?? '—'}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {filtradas.length === 0 && (
        <p className="text-sm text-muted-foreground mt-4">
          {vendas.length === 0 ? 'Nenhuma venda registrada nesse período.' : 'Nenhuma venda com esse filtro.'}
        </p>
      )}
    </>
  )
}
