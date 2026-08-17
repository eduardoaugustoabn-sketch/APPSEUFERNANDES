'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CATEGORIAS_ORIGEM, type CategoriaOrigem } from '@/lib/categorias-origem'

export function EditarClienteForm({
  clienteId, bairroAtual, cidadeAtual, observacaoAtual, categoriaOrigemAtual,
}: {
  clienteId: string
  bairroAtual: string | null
  cidadeAtual: string | null
  observacaoAtual: string | null
  categoriaOrigemAtual: CategoriaOrigem | null
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [bairro, setBairro] = useState(bairroAtual ?? '')
  const [cidade, setCidade] = useState(cidadeAtual ?? '')
  const [observacao, setObservacao] = useState(observacaoAtual ?? '')
  const [categoriaOrigem, setCategoriaOrigem] = useState<CategoriaOrigem | ''>(categoriaOrigemAtual ?? '')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    const { data, error } = await supabase
      .from('clientes')
      .update({
        bairro: bairro.trim() || null, cidade: cidade.trim() || null, observacao: observacao.trim() || null,
        categoria_origem: categoriaOrigem || null,
      })
      .eq('id', clienteId)
      .select('id')
    setSalvando(false)
    if (error) {
      alert(error.message)
      return
    }
    if (!data || data.length === 0) {
      alert('Não foi possível salvar — você não tem permissão para editar este cliente.')
      return
    }
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setBairro(bairroAtual ?? '')
    setCidade(cidadeAtual ?? '')
    setObservacao(observacaoAtual ?? '')
    setCategoriaOrigem(categoriaOrigemAtual ?? '')
    setEditando(false)
  }

  const categoriaLabel = CATEGORIAS_ORIGEM.find((c) => c.value === categoriaOrigemAtual)?.label

  if (!editando) {
    return (
      <div className="mb-4">
        {observacaoAtual && <p className="text-sm text-muted-foreground mb-2">Observação: {observacaoAtual}</p>}
        {categoriaLabel && <p className="text-sm text-muted-foreground mb-2">Como conheceu: {categoriaLabel}</p>}
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">
          Editar bairro/cidade/observação/origem
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
      <select value={categoriaOrigem} onChange={(e) => setCategoriaOrigem(e.target.value as CategoriaOrigem | '')} className="border rounded px-2 py-1">
        <option value="">Como conheceu a barbearia?</option>
        {CATEGORIAS_ORIGEM.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
      <div className="flex gap-2">
        <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
        <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
      </div>
    </div>
  )
}
