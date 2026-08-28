'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'

type Cliente = {
  id: string
  nome: string
  telefone: string
  cidade: string | null
  observacao: string | null
  cadastrado_por_nome: string | null
  dias_sem_vir: number | null
  status: string | null
  tem_agendamento_futuro: boolean
}

const COR_STATUS: Record<string, string> = {
  verde: 'bg-primary',
  amarelo: 'bg-amber',
  vermelho: 'bg-destructive',
}

export function ListaClientes({ clientes, baseHref, mostrarDono }: { clientes: Cliente[]; baseHref: string; mostrarDono?: boolean }) {
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
          <Link key={c.id} href={`${baseHref}/${c.id}`} className="flex flex-col gap-1 border-b py-2.5 hover:bg-muted/50">
            <div className="flex justify-between items-center gap-2">
              <span className="flex items-center gap-2">
                {c.status && <span className={`w-2 h-2 rounded-sm shrink-0 ${COR_STATUS[c.status]}`} title={c.status} />}
                {c.nome}
                {c.tem_agendamento_futuro && <span className="text-[11px] font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5">já remarcou</span>}
              </span>
              <span className="text-muted-foreground text-sm text-right">
                {c.telefone}{c.cidade ? ` · ${c.cidade}` : ''}
                {c.dias_sem_vir != null ? ` · ${c.dias_sem_vir}d sem vir` : ''}
              </span>
            </div>
            {mostrarDono && c.cadastrado_por_nome && (
              <span className="text-[11.5px] text-muted-foreground">Cadastrado por {c.cadastrado_por_nome}</span>
            )}
            {c.observacao && <span className="text-[12.5px] text-muted-foreground italic truncate">{c.observacao}</span>}
          </Link>
        ))}
        {filtrados.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>}
      </CardContent>
    </Card>
  )
}
