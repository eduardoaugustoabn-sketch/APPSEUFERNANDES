'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function EditarClienteForm({
  clienteId, bairroAtual, cidadeAtual, observacaoAtual,
}: {
  clienteId: string
  bairroAtual: string | null
  cidadeAtual: string | null
  observacaoAtual: string | null
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [bairro, setBairro] = useState(bairroAtual ?? '')
  const [cidade, setCidade] = useState(cidadeAtual ?? '')
  const [observacao, setObservacao] = useState(observacaoAtual ?? '')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase
      .from('clientes')
      .update({ bairro: bairro || null, cidade: cidade || null, observacao: observacao || null })
      .eq('id', clienteId)
    setSalvando(false)
    if (error) {
      alert(error.message)
      return
    }
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setBairro(bairroAtual ?? '')
    setCidade(cidadeAtual ?? '')
    setObservacao(observacaoAtual ?? '')
    setEditando(false)
  }

  if (!editando) {
    return (
      <div className="mb-4">
        {observacaoAtual && <p className="text-sm text-muted-foreground mb-2">Observação: {observacaoAtual}</p>}
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">
          Editar bairro/cidade/observação
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 mb-4 border rounded p-3">
      <Input placeholder="Bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
      <Input placeholder="Cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
      <textarea
        placeholder="Observação"
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
        className="border rounded px-2 py-1 bg-input text-sm min-h-20"
      />
      <div className="flex gap-2">
        <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
        <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
      </div>
    </div>
  )
}
