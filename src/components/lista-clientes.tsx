'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'

type Cliente = {
  id: string
  nome: string
  telefone: string
  cidade: string | null
  observacao: string | null
  cadastrado_por_nome: string | null
  prazo_retorno_dias: number
  dias_sem_vir: number | null
  status: string | null
  tem_agendamento_futuro: boolean
}

const COR_STATUS: Record<string, string> = {
  verde: 'bg-primary',
  amarelo: 'bg-amber',
  vermelho: 'bg-destructive',
}

const LABEL_STATUS: Record<string, string> = {
  verde: 'Em dia',
  amarelo: 'Atenção',
  vermelho: 'Atrasado',
}

const LEGENDA = [
  { cor: 'bg-primary', label: 'Em dia', descricao: 'dentro do prazo de retorno do cliente' },
  { cor: 'bg-amber', label: 'Atenção', descricao: 'até 3 dias após o prazo' },
  { cor: 'bg-destructive', label: 'Atrasado', descricao: 'mais de 3 dias após o prazo' },
  { cor: 'bg-muted-foreground/40', label: 'Sem histórico', descricao: 'cadastrado, ainda sem nenhum atendimento' },
]

export function ListaClientes({ clientes, baseHref, mostrarDono }: { clientes: Cliente[]; baseHref: string; mostrarDono?: boolean }) {
  const router = useRouter()
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
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 mb-4 pb-4 border-b">
          {LEGENDA.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`w-2 h-2 rounded-sm shrink-0 ${l.cor}`} />
              <strong className="font-semibold text-foreground">{l.label}</strong> — {l.descricao}
            </span>
          ))}
        </div>

        <Input placeholder="Buscar por nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} className="mb-4" />

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Cidade</TableHead>
              <TableHead>Dias sem vir / Prazo</TableHead>
              <TableHead>Observação</TableHead>
              {mostrarDono && <TableHead>Cadastrado por</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.map((c) => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => router.push(`${baseHref}/${c.id}`)}>
                <TableCell>
                  <span className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-sm shrink-0 ${c.status ? COR_STATUS[c.status] : 'bg-muted-foreground/40'}`} />
                    <span className="text-xs text-muted-foreground">{c.status ? LABEL_STATUS[c.status] : 'Sem histórico'}</span>
                  </span>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    {c.nome}
                    {c.tem_agendamento_futuro && <span className="text-[11px] font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5">já remarcou</span>}
                  </span>
                </TableCell>
                <TableCell>{c.telefone}</TableCell>
                <TableCell>{c.cidade ?? '—'}</TableCell>
                <TableCell>{c.dias_sem_vir != null ? `${c.dias_sem_vir}d / prazo ${c.prazo_retorno_dias}d` : '—'}</TableCell>
                <TableCell className="max-w-56 truncate italic text-muted-foreground">{c.observacao ?? ''}</TableCell>
                {mostrarDono && <TableCell>{c.cadastrado_por_nome ?? '—'}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtrados.length === 0 && <p className="text-sm text-muted-foreground mt-4">Nenhum cliente encontrado.</p>}
      </CardContent>
    </Card>
  )
}
