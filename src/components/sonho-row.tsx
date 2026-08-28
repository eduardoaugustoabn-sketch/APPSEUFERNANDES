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
  percentual_comissao: number
  concluido: boolean
}

export function SonhoRow({ sonho, valorAcumulado, atendimentosFaltam }: { sonho: Sonho; valorAcumulado: number; atendimentosFaltam: number | null }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(sonho.nome)
  const [valorAlvo, setValorAlvo] = useState(String(sonho.valor_alvo))
  const [percentual, setPercentual] = useState(String(sonho.percentual_comissao))
  const [salvando, setSalvando] = useState(false)

  const percentualProgresso = Math.min(Math.round((valorAcumulado / sonho.valor_alvo) * 100), 100)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase
      .from('sonhos')
      .update({ nome, valor_alvo: Number(valorAlvo), percentual_comissao: Number(percentual) })
      .eq('id', sonho.id)
    setSalvando(false)
    if (error) {
      alert(error.message)
      return
    }
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setNome(sonho.nome)
    setValorAlvo(String(sonho.valor_alvo))
    setPercentual(String(sonho.percentual_comissao))
    setEditando(false)
  }

  async function excluir() {
    const supabase = getBrowserSupabaseClient()
    await supabase.from('sonhos').delete().eq('id', sonho.id)
    router.refresh()
  }

  if (editando) {
    return (
      <Card className="mb-4">
        <CardContent className="p-6 flex gap-2 flex-wrap items-center">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-40" />
          <Input type="number" value={valorAlvo} onChange={(e) => setValorAlvo(e.target.value)} className="w-32" placeholder="Valor-alvo" />
          <Input type="number" value={percentual} onChange={(e) => setPercentual(e.target.value)} className="w-24" placeholder="%" />
          <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
          <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mb-4">
      <CardContent className="p-6">
        <div className="flex justify-between items-center mb-2">
          <p className="font-heading text-base font-bold">
            {sonho.nome}
            {sonho.concluido && (
              <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 text-xs font-bold">
                Concluído
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">Editar</button>
            <button type="button" onClick={excluir} className="text-xs text-destructive underline">Excluir</button>
          </div>
        </div>
        <div className="w-full bg-muted rounded-full h-6 overflow-hidden mb-2">
          <div className="bg-primary h-full text-primary-foreground text-xs flex items-center justify-center" style={{ width: `${percentualProgresso}%` }}>
            {percentualProgresso}%
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          R$ {valorAcumulado.toFixed(2)} de R$ {Number(sonho.valor_alvo).toFixed(2)} · {sonho.percentual_comissao}% da comissão reservado
        </p>
        {!sonho.concluido && atendimentosFaltam != null && (
          <p className="text-xs text-muted-foreground mt-1">Faltam ~{atendimentosFaltam} atendimentos (na sua média atual)</p>
        )}
      </CardContent>
    </Card>
  )
}
