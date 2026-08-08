'use client'

import { useEffect, useRef, useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'

export function ClienteAutocomplete({
  barbeariaId, onResolved, valorInicial,
}: {
  barbeariaId: string
  onResolved: (info: { nome: string; telefone: string; totalCortes: number }) => void
  valorInicial?: { nome: string; telefone: string }
}) {
  const [nome, setNome] = useState(valorInicial?.nome ?? '')
  const [telefone, setTelefone] = useState(valorInicial?.telefone ?? '')
  const [info, setInfo] = useState<string | null>(null)
  // Refs (not just state) so onResolved always reads the latest value
  // regardless of render timing.
  const nomeRef = useRef(valorInicial?.nome ?? '')
  const telefoneRef = useRef(valorInicial?.telefone ?? '')

  // Report the pre-filled value once on mount, so the parent (e.g.
  // LancamentoForm opened from an existing agendamento) has it immediately
  // instead of only after the user types something.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (valorInicial) onResolved({ nome: valorInicial.nome, telefone: valorInicial.telefone, totalCortes: 0 })
  }, [])

  function handleNomeChange(value: string) {
    nomeRef.current = value
    setNome(value)
    onResolved({ nome: value, telefone: telefoneRef.current, totalCortes: 0 })
  }

  async function verificar(tel: string) {
    telefoneRef.current = tel
    setTelefone(tel)
    // Resolve synchronously with the raw typed value first — the caller
    // (LancamentoForm's salvar()) reads whatever onResolved last reported,
    // and reconhecer_cliente() below is
    // an async network round-trip. Without this synchronous resolve, a
    // click on "Salvar" landing before that round-trip completes would
    // submit with an empty/stale telefone, since the only onResolved call
    // for this field previously fired after the await.
    onResolved({ nome: nomeRef.current, telefone: tel, totalCortes: 0 })
    if (tel.length < 10) return
    const supabase = getBrowserSupabaseClient()
    const { data: rows } = await supabase.rpc('reconhecer_cliente', { p_barbearia_id: barbeariaId, p_telefone: tel })
    const encontrado = rows?.[0]
    if (encontrado) {
      nomeRef.current = encontrado.nome
      setNome(encontrado.nome)
      setInfo(`${encontrado.total_cortes}º corte deste cliente aqui`)
      onResolved({ nome: encontrado.nome, telefone: tel, totalCortes: encontrado.total_cortes })
    } else {
      setInfo(null)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Input placeholder="Nome do cliente" value={nome} onChange={(e) => handleNomeChange(e.target.value)} />
      <Input placeholder="Telefone" value={telefone} onChange={(e) => verificar(e.target.value)} />
      {info && <span className="text-xs text-muted-foreground">{info}</span>}
    </div>
  )
}
