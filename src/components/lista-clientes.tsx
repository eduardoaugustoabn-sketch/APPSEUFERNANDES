'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'

type Cliente = { id: string; nome: string; telefone: string; cidade: string | null }

export function ListaClientes({ clientes, baseHref }: { clientes: Cliente[]; baseHref: string }) {
  const [busca, setBusca] = useState('')

  const buscaLower = busca.toLowerCase()
  const buscaDigitos = busca.replace(/\D/g, '')
  const filtrados = clientes.filter((c) => {
    if (busca === '') return true
    const nomeBate = c.nome.toLowerCase().includes(buscaLower)
    const telefoneBate = buscaDigitos.length > 0 && c.telefone.includes(buscaDigitos)
    return nomeBate || telefoneBate
  })

  return (
    <div>
      <Input placeholder="Buscar por nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} className="mb-4" />
      {filtrados.map((c) => (
        <Link key={c.id} href={`${baseHref}/${c.id}`} className="flex justify-between border-b py-2 hover:bg-muted/50">
          <span>{c.nome}</span>
          <span className="text-muted-foreground text-sm">{c.telefone}{c.cidade ? ` · ${c.cidade}` : ''}</span>
        </Link>
      ))}
      {filtrados.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>}
    </div>
  )
}
