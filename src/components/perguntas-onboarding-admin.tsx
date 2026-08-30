'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type Alternativa = { id: string; texto: string; correta: boolean; ordem: number }
type Pergunta = { id: string; enunciado: string; ordem: number; alternativas_onboarding: Alternativa[] }

export function PerguntasOnboardingAdmin({ processoId, perguntas }: { processoId: string; perguntas: Pergunta[] }) {
  const router = useRouter()
  const [enunciado, setEnunciado] = useState('')
  const [textos, setTextos] = useState(['', '', '', ''])
  const [correta, setCorreta] = useState(0)
  const [salvando, setSalvando] = useState(false)

  async function adicionarPergunta() {
    if (!enunciado.trim() || textos.some((t) => !t.trim())) return
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    const { data: pergunta, error } = await supabase
      .from('perguntas_onboarding')
      .insert({ processo_id: processoId, enunciado, ordem: perguntas.length })
      .select('id')
      .single()
    if (error || !pergunta) {
      setSalvando(false)
      return
    }
    await supabase.from('alternativas_onboarding').insert(
      textos.map((texto, i) => ({ pergunta_id: pergunta.id, texto, correta: i === correta, ordem: i }))
    )
    setEnunciado('')
    setTextos(['', '', '', ''])
    setCorreta(0)
    setSalvando(false)
    router.refresh()
  }

  async function removerPergunta(perguntaId: string) {
    const supabase = getBrowserSupabaseClient()
    await supabase.from('perguntas_onboarding').delete().eq('id', perguntaId)
    router.refresh()
  }

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="font-heading text-base font-bold mb-5">Perguntas da prova ({perguntas.length})</h2>

        {perguntas.map((p, i) => (
          <div key={p.id} className="border-b py-3 last:border-b-0">
            <div className="flex justify-between items-start gap-2 mb-2">
              <p className="font-semibold text-sm">{i + 1}. {p.enunciado}</p>
              <button type="button" onClick={() => removerPergunta(p.id)} className="text-xs text-destructive underline shrink-0">Remover</button>
            </div>
            <ul className="text-sm text-muted-foreground flex flex-col gap-0.5">
              {[...p.alternativas_onboarding].sort((a, b) => a.ordem - b.ordem).map((a) => (
                <li key={a.id} className={a.correta ? 'text-primary font-semibold' : ''}>{a.correta ? '✓ ' : '— '}{a.texto}</li>
              ))}
            </ul>
          </div>
        ))}

        <div className="mt-5 pt-5 border-t flex flex-col gap-3">
          <p className="font-semibold text-sm">Nova pergunta</p>
          <Input placeholder="Enunciado da pergunta" value={enunciado} onChange={(e) => setEnunciado(e.target.value)} />
          {textos.map((texto, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name="correta" checked={correta === i} onChange={() => setCorreta(i)} aria-label={`Alternativa ${i + 1} é a correta`} />
              <Input
                placeholder={`Alternativa ${i + 1}`}
                value={texto}
                onChange={(e) => setTextos((prev) => prev.map((t, idx) => (idx === i ? e.target.value : t)))}
              />
            </div>
          ))}
          <Button type="button" onClick={adicionarPergunta} disabled={salvando} className="self-start">Adicionar pergunta</Button>
        </div>
      </CardContent>
    </Card>
  )
}
