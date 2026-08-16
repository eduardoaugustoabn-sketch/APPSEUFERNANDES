'use client'

import { useRef, useState } from 'react'
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

// Não reaproveita ClienteAutocomplete de propósito — esta tela tem seu
// próprio formulário inline via Server Action (novoContato), sem o
// callback onResolved que ClienteAutocomplete usa pra reportar mudanças
// pro componente pai. Os campos aqui postam direto pelo <form> nativo,
// via os atributos name.
export function TelefoneClienteBusca() {
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [resultados, setResultados] = useState<ResultadoBusca[]>([])
  const [mostrarLista, setMostrarLista] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function verificar(tel: string) {
    setTelefone(tel)

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
    setNome(cliente.nome)
    setTelefone(cliente.telefone)
    setBairro(cliente.bairro ?? '')
    setCidade(cliente.cidade ?? '')
    setMostrarLista(false)
    setResultados([])
  }

  return (
    <>
      <Input name="nome" placeholder="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
      <div className="relative">
        <Input
          name="telefone"
          placeholder="Telefone"
          required
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
      <Input name="bairro" placeholder="Bairro (opcional)" value={bairro} onChange={(e) => setBairro(e.target.value)} />
      <Input name="cidade" placeholder="Cidade (opcional)" value={cidade} onChange={(e) => setCidade(e.target.value)} />
    </>
  )
}
