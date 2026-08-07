'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'

export function ClienteAutocomplete({
  barbeariaId, onResolved,
}: { barbeariaId: string; onResolved: (info: { nome: string; telefone: string; totalCortes: number }) => void }) {
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [info, setInfo] = useState<string | null>(null)

  async function verificar(tel: string) {
    setTelefone(tel)
    if (tel.length < 10) return
    const supabase = getBrowserSupabaseClient()
    const { data: rows } = await supabase.rpc('reconhecer_cliente', { p_barbearia_id: barbeariaId, p_telefone: tel })
    const encontrado = rows?.[0]
    if (encontrado) {
      setNome(encontrado.nome)
      setInfo(`${encontrado.total_cortes}º corte deste cliente aqui`)
      onResolved({ nome: encontrado.nome, telefone: tel, totalCortes: encontrado.total_cortes })
    } else {
      setInfo(null)
      onResolved({ nome, telefone: tel, totalCortes: 0 })
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Input placeholder="Nome do cliente" value={nome} onChange={(e) => { setNome(e.target.value); onResolved({ nome: e.target.value, telefone, totalCortes: 0 }) }} />
      <Input placeholder="Telefone" value={telefone} onChange={(e) => verificar(e.target.value)} />
      {info && <span className="text-xs text-muted-foreground">{info}</span>}
    </div>
  )
}
