'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type PerguntaRpc = {
  pergunta_id: string
  enunciado: string
  pergunta_ordem: number
  alternativa_id: string
  alternativa_texto: string
  alternativa_ordem: number
}
type Pergunta = { id: string; enunciado: string; alternativas: { id: string; texto: string }[] }
type UltimaTentativa = { nota_percentual: number; aprovado: boolean; respondido_em: string } | null

export function ProvaOnboardingForm({ processoId, ultimaTentativa }: { processoId: string; ultimaTentativa: UltimaTentativa }) {
  const router = useRouter()
  const [fazendo, setFazendo] = useState(false)
  const [perguntas, setPerguntas] = useState<Pergunta[]>([])
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const [carregando, setCarregando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{ nota_percentual: number; aprovado: boolean } | null>(null)

  async function iniciarProva() {
    setCarregando(true)
    setResultado(null)
    setRespostas({})
    const supabase = getBrowserSupabaseClient()
    const { data } = await supabase.rpc('processo_onboarding_perguntas', { p_processo_id: processoId }) as { data: PerguntaRpc[] | null }

    const agrupadas = new Map<string, Pergunta>()
    for (const linha of data ?? []) {
      const atual = agrupadas.get(linha.pergunta_id) ?? { id: linha.pergunta_id, enunciado: linha.enunciado, alternativas: [] }
      atual.alternativas.push({ id: linha.alternativa_id, texto: linha.alternativa_texto })
      agrupadas.set(linha.pergunta_id, atual)
    }
    setPerguntas(Array.from(agrupadas.values()))
    setCarregando(false)
    setFazendo(true)
  }

  async function enviarRespostas() {
    setEnviando(true)
    const supabase = getBrowserSupabaseClient()
    const payload = perguntas.map((p) => ({ pergunta_id: p.id, alternativa_id: respostas[p.id] })).filter((r) => r.alternativa_id)
    const { data, error } = await supabase.rpc('submeter_tentativa_onboarding', { p_processo_id: processoId, p_respostas: payload }) as { data: { nota_percentual: number; aprovado: boolean }[] | null; error: { message: string } | null }
    setEnviando(false)
    if (error || !data?.[0]) return
    setResultado(data[0])
    setFazendo(false)
    router.refresh()
  }

  if (resultado) {
    return (
      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-3">Resultado</h2>
          <p className={`text-2xl font-extrabold ${resultado.aprovado ? 'text-primary' : 'text-destructive'}`}>{resultado.nota_percentual}%</p>
          <p className="text-sm text-muted-foreground mt-1">{resultado.aprovado ? 'Aprovado' : 'Reprovado'} — nota mínima 70%</p>
          <Button type="button" className="mt-4" onClick={iniciarProva}>Refazer prova</Button>
        </CardContent>
      </Card>
    )
  }

  if (fazendo) {
    const respondidas = Object.keys(respostas).length
    return (
      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Prova</h2>
          {carregando && <p className="text-sm text-muted-foreground">Carregando perguntas...</p>}
          {perguntas.map((p, i) => (
            <div key={p.id} className="mb-5">
              <p className="font-semibold text-sm mb-2">{i + 1}. {p.enunciado}</p>
              <div className="flex flex-col gap-1.5">
                {p.alternativas.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-sm">
                    <input type="radio" name={p.id} checked={respostas[p.id] === a.id} onChange={() => setRespostas((prev) => ({ ...prev, [p.id]: a.id }))} />
                    {a.texto}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <Button type="button" onClick={enviarRespostas} disabled={enviando || respondidas < perguntas.length || perguntas.length === 0}>
            Enviar respostas
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="font-heading text-base font-bold mb-3">Prova</h2>
        {ultimaTentativa && (
          <p className="text-sm text-muted-foreground mb-4">
            Última tentativa: {ultimaTentativa.nota_percentual}% — {ultimaTentativa.aprovado ? 'Aprovado' : 'Reprovado'} em {new Date(ultimaTentativa.respondido_em).toLocaleDateString()}
          </p>
        )}
        <Button type="button" onClick={iniciarProva} disabled={carregando}>
          {ultimaTentativa ? 'Refazer prova' : 'Fazer prova'}
        </Button>
      </CardContent>
    </Card>
  )
}
