'use client'

import { useEffect, useRef, useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'

type ResultadoBusca = {
  id: string
  nome: string
  telefone: string
  total_cortes: number
  data_nascimento: string | null
  bairro: string | null
  cidade: string | null
}

export function ClienteAutocomplete({
  onResolved, valorInicial,
}: {
  onResolved: (info: { nome: string; telefone: string; totalCortes: number; dataNascimento?: string; bairro?: string; cidade?: string }) => void
  valorInicial?: { nome: string; telefone: string }
}) {
  const [nome, setNome] = useState(valorInicial?.nome ?? '')
  const [telefone, setTelefone] = useState(valorInicial?.telefone ?? '')
  const [dataNascimento, setDataNascimento] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [resultados, setResultados] = useState<ResultadoBusca[]>([])
  const [mostrarLista, setMostrarLista] = useState(false)
  // Refs (not just state) so onResolved always reads the latest value
  // regardless of render timing.
  const nomeRef = useRef(valorInicial?.nome ?? '')
  const telefoneRef = useRef(valorInicial?.telefone ?? '')
  const dataNascimentoRef = useRef('')
  const bairroRef = useRef('')
  const cidadeRef = useRef('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    onResolved({
      nome: value, telefone: telefoneRef.current, totalCortes: 0,
      dataNascimento: dataNascimentoRef.current || undefined,
      bairro: bairroRef.current || undefined, cidade: cidadeRef.current || undefined,
    })
  }

  function handleDataNascimentoChange(value: string) {
    dataNascimentoRef.current = value
    setDataNascimento(value)
    onResolved({
      nome: nomeRef.current, telefone: telefoneRef.current, totalCortes: 0,
      dataNascimento: value || undefined,
      bairro: bairroRef.current || undefined, cidade: cidadeRef.current || undefined,
    })
  }

  function handleBairroChange(value: string) {
    bairroRef.current = value
    setBairro(value)
    onResolved({
      nome: nomeRef.current, telefone: telefoneRef.current, totalCortes: 0,
      dataNascimento: dataNascimentoRef.current || undefined,
      bairro: value || undefined, cidade: cidadeRef.current || undefined,
    })
  }

  function handleCidadeChange(value: string) {
    cidadeRef.current = value
    setCidade(value)
    onResolved({
      nome: nomeRef.current, telefone: telefoneRef.current, totalCortes: 0,
      dataNascimento: dataNascimentoRef.current || undefined,
      bairro: bairroRef.current || undefined, cidade: value || undefined,
    })
  }

  function verificar(tel: string) {
    telefoneRef.current = tel
    setTelefone(tel)
    // Resolve synchronously with the raw typed value first — the caller
    // (LancamentoForm's salvar()) reads whatever onResolved last reported,
    // and buscar_clientes_por_telefone below is an async, debounced
    // network round-trip. Without this synchronous resolve, a click on
    // "Salvar" landing before the debounce/round-trip completes would
    // submit with an empty/stale telefone.
    onResolved({
      nome: nomeRef.current, telefone: tel, totalCortes: 0,
      dataNascimento: dataNascimentoRef.current || undefined,
      bairro: bairroRef.current || undefined, cidade: cidadeRef.current || undefined,
    })

    if (debounceRef.current) clearTimeout(debounceRef.current)

    const digitos = tel.replace(/\D/g, '')
    if (digitos.length < 4) {
      setResultados([])
      setMostrarLista(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      const supabase = getBrowserSupabaseClient()
      const { data: rows } = await supabase.rpc('buscar_clientes_por_telefone', { p_busca: tel })
      setResultados(rows ?? [])
      setMostrarLista((rows ?? []).length > 0)
    }, 300)
  }

  function selecionar(cliente: ResultadoBusca) {
    nomeRef.current = cliente.nome
    telefoneRef.current = cliente.telefone
    dataNascimentoRef.current = cliente.data_nascimento ?? ''
    bairroRef.current = cliente.bairro ?? ''
    cidadeRef.current = cliente.cidade ?? ''
    setNome(cliente.nome)
    setTelefone(cliente.telefone)
    setDataNascimento(cliente.data_nascimento ?? '')
    setBairro(cliente.bairro ?? '')
    setCidade(cliente.cidade ?? '')
    setMostrarLista(false)
    setResultados([])
    onResolved({
      nome: cliente.nome, telefone: cliente.telefone, totalCortes: cliente.total_cortes,
      dataNascimento: cliente.data_nascimento ?? undefined,
      bairro: cliente.bairro ?? undefined, cidade: cliente.cidade ?? undefined,
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <Input placeholder="Nome do cliente" value={nome} onChange={(e) => handleNomeChange(e.target.value)} />
      <div className="relative">
        <Input
          placeholder="Telefone"
          value={telefone}
          onChange={(e) => verificar(e.target.value)}
          onBlur={() => setMostrarLista(false)}
        />
        {mostrarLista && resultados.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-card border rounded shadow-md max-h-48 overflow-y-auto">
            {resultados.map((r) => (
              <button
                key={r.id}
                type="button"
                onMouseDown={() => selecionar(r)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0"
              >
                {r.nome} · {r.telefone} · {r.total_cortes}º corte aqui
              </button>
            ))}
          </div>
        )}
      </div>
      <Input type="date" placeholder="Data de nascimento (opcional)" value={dataNascimento} onChange={(e) => handleDataNascimentoChange(e.target.value)} />
      <Input placeholder="Bairro (opcional)" value={bairro} onChange={(e) => handleBairroChange(e.target.value)} />
      <Input placeholder="Cidade (opcional)" value={cidade} onChange={(e) => handleCidadeChange(e.target.value)} />
    </div>
  )
}
