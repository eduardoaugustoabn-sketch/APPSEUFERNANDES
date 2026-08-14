'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type Sonho = {
  id: string
  nome: string
  valor_alvo: number
  percentual: number
  status: string
  criado_em: string
  concluido_em: string | null
}

export function SonhoPessoalCard({
  membroId,
  barbeariaId,
  sonhoAtivo,
  guardado,
  historico,
}: {
  membroId: string
  barbeariaId: string
  sonhoAtivo: Sonho | null
  guardado: number
  historico: Sonho[]
}) {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [valorAlvo, setValorAlvo] = useState('')
  const [percentual, setPercentual] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function criarSonho() {
    if (!nome || !valorAlvo || !percentual) return
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('sonhos_pessoais').insert({
      membro_id: membroId,
      barbearia_id: barbeariaId,
      nome,
      valor_alvo: Number(valorAlvo),
      percentual: Number(percentual),
    })
    setSalvando(false)
    setNome('')
    setValorAlvo('')
    setPercentual('')
    router.refresh()
  }

  async function concluir(status: 'conquistado' | 'cancelado') {
    const supabase = getBrowserSupabaseClient()
    await supabase
      .from('sonhos_pessoais')
      .update({ status, concluido_em: new Date().toISOString() })
      .eq('id', sonhoAtivo!.id)
    router.refresh()
  }

  const percentualProgresso = sonhoAtivo ? Math.min((guardado / sonhoAtivo.valor_alvo) * 100, 100) : 0
  const conquistado = sonhoAtivo ? guardado >= sonhoAtivo.valor_alvo : false

  return (
    <Card className="mb-5">
      <CardContent className="p-6">
        <p className="font-heading text-base font-bold mb-5">Sonho pessoal</p>

        {!sonhoAtivo && (
          <div className="flex gap-2 items-end flex-wrap">
            <Input placeholder="Nome (ex: Moto)" value={nome} onChange={(e) => setNome(e.target.value)} className="w-40" />
            <Input type="number" step="0.01" placeholder="Valor alvo (R$)" value={valorAlvo} onChange={(e) => setValorAlvo(e.target.value)} className="w-36" />
            <Input type="number" step="0.01" placeholder="% da comissão" value={percentual} onChange={(e) => setPercentual(e.target.value)} className="w-32" />
            <Button type="button" onClick={criarSonho} disabled={salvando}>Começar a guardar</Button>
          </div>
        )}

        {sonhoAtivo && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-foreground/80">{sonhoAtivo.nome}</span>
              <span className="text-xs text-muted-foreground">{sonhoAtivo.percentual}% da comissão</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden mb-2">
              <div className="h-full rounded-full bg-primary" style={{ width: `${percentualProgresso}%` }} />
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {conquistado
                ? 'Sonho conquistado! 🎉'
                : `R$ ${guardado.toFixed(2)} de R$ ${sonhoAtivo.valor_alvo.toFixed(2)} — faltam R$ ${(sonhoAtivo.valor_alvo - guardado).toFixed(2)}`}
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => concluir('conquistado')} className="text-xs text-primary underline">Conquistei!</button>
              <button type="button" onClick={() => concluir('cancelado')} className="text-xs text-destructive underline">Cancelar</button>
            </div>
          </div>
        )}

        {historico.length > 0 && (
          <div className="mt-6 pt-4 border-t">
            <p className="text-xs uppercase text-muted-foreground mb-2">Histórico</p>
            <div className="flex flex-col gap-1 text-sm">
              {historico.map((s) => (
                <div key={s.id} className="flex justify-between text-muted-foreground">
                  <span>{s.nome} — R$ {s.valor_alvo.toFixed(2)}</span>
                  <span>{s.status === 'conquistado' ? 'Conquistado' : 'Cancelado'} em {s.concluido_em ? new Date(s.concluido_em).toLocaleDateString() : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
