'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'

type Cliente = { id: string; nome: string; telefone: string; cidade: string | null }

export function ListaClientes({ clientes, baseHref }: { clientes: Cliente[]; baseHref: string }) {
  const [busca, setBusca] = useState('')

  const termo = busca.trim()
  const termoLower = termo.toLowerCase()
  const termoDigitos = termo.replace(/\D/g, '')
  const filtrados = clientes.filter((c) => {
    if (termo === '') return true
    const nomeBate = c.nome.toLowerCase().includes(termoLower)
    const telefoneBate = termoDigitos.length > 0 && c.telefone.includes(termoDigitos)
    return nomeBate || telefoneBate
  })

  return (
    <Card>
      <CardContent className="p-6">
        <Input placeholder="Buscar por nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} className="mb-4" />
        {filtrados.map((c) => (
          <Link key={c.id} href={`${baseHref}/${c.id}`} className="flex justify-between border-b py-2 hover:bg-muted/50">
            <span>{c.nome}</span>
            <span className="text-muted-foreground text-sm">{c.telefone}{c.cidade ? ` · ${c.cidade}` : ''}</span>
          </Link>
        ))}
        {filtrados.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>}
      </CardContent>
    </Card>
  )
}
