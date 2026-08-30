'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export function FluxogramaUploadForm({ processoId, barbeariaId, fluxogramaUrlAtual }: { processoId: string; barbeariaId: string; fluxogramaUrlAtual: string | null }) {
  const router = useRouter()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar() {
    if (!arquivo) return
    setEnviando(true)
    setErro(null)
    const supabase = getBrowserSupabaseClient()
    const extensao = arquivo.name.split('.').pop()
    const path = `${barbeariaId}/${processoId}.${extensao}`

    const { error: erroUpload } = await supabase.storage.from('fluxogramas').upload(path, arquivo, { upsert: true })
    if (erroUpload) {
      setErro(erroUpload.message)
      setEnviando(false)
      return
    }

    await supabase.from('processos_onboarding').update({ fluxograma_path: path }).eq('id', processoId)
    setEnviando(false)
    setArquivo(null)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3">
      {fluxogramaUrlAtual && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fluxogramaUrlAtual} alt="Fluxograma atual" className="max-w-full rounded-lg border border-border" />
      )}
      <div className="flex gap-2 items-center flex-wrap">
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} className="text-sm" />
        <Button type="button" onClick={enviar} disabled={!arquivo || enviando}>
          {fluxogramaUrlAtual ? 'Trocar fluxograma' : 'Enviar fluxograma'}
        </Button>
      </div>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </div>
  )
}
