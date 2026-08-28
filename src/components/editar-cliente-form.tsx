'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import type { CategoriaOrigem } from '@/lib/categorias-origem'

export function EditarClienteForm({
  clienteId, cpfAtual, bairroAtual, cidadeAtual, observacaoAtual, categoriaOrigemAtual, prazoRetornoAtual, categorias,
}: {
  clienteId: string
  cpfAtual: string | null
  bairroAtual: string | null
  cidadeAtual: string | null
  observacaoAtual: string | null
  categoriaOrigemAtual: CategoriaOrigem | null
  prazoRetornoAtual: number | null
  categorias: { id: string; nome: string }[]
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [cpf, setCpf] = useState(cpfAtual ?? '')
  const [bairro, setBairro] = useState(bairroAtual ?? '')
  const [cidade, setCidade] = useState(cidadeAtual ?? '')
  const [observacao, setObservacao] = useState(observacaoAtual ?? '')
  const [categoriaOrigem, setCategoriaOrigem] = useState<CategoriaOrigem | ''>(categoriaOrigemAtual ?? '')
  const [prazoRetorno, setPrazoRetorno] = useState(prazoRetornoAtual != null ? String(prazoRetornoAtual) : '')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    const { data, error } = await supabase
      .from('clientes')
      .update({
        cpf: cpf.trim() || null,
        bairro: bairro.trim() || null, cidade: cidade.trim() || null, observacao: observacao.trim() || null,
        categoria_origem: categoriaOrigem || null,
        prazo_retorno_dias: prazoRetorno === '' ? null : Number(prazoRetorno),
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
    setCpf(cpfAtual ?? '')
    setBairro(bairroAtual ?? '')
    setCidade(cidadeAtual ?? '')
    setObservacao(observacaoAtual ?? '')
    setCategoriaOrigem(categoriaOrigemAtual ?? '')
    setPrazoRetorno(prazoRetornoAtual != null ? String(prazoRetornoAtual) : '')
    setEditando(false)
  }

  if (!editando) {
    return (
      <div>
        {observacaoAtual && <p className="text-sm text-muted-foreground mb-2">Observação: {observacaoAtual}</p>}
        {categoriaOrigemAtual && <p className="text-sm text-muted-foreground mb-2">Como conheceu: {categoriaOrigemAtual}</p>}
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">
          Editar CPF/bairro/cidade/observação/origem/prazo de retorno
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 border rounded-lg p-3">
      <Input placeholder="CPF" value={cpf} onChange={(e) => setCpf(e.target.value)} />
      <Input placeholder="Bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
      <Input placeholder="Cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
      <textarea
        placeholder="Observação"
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
        className="w-full rounded-lg border border-input bg-input-bg px-2.5 py-1.5 text-base md:text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 min-h-20"
      />
      <Select value={categoriaOrigem} onChange={(e) => setCategoriaOrigem(e.target.value as CategoriaOrigem | '')}>
        <option value="">Como conheceu a barbearia?</option>
        {categorias.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
      </Select>
      <Select value={prazoRetorno} onChange={(e) => setPrazoRetorno(e.target.value)}>
        <option value="">Prazo médio de retorno: padrão (12 dias)</option>
        <option value="7">7 dias</option>
        <option value="10">10 dias</option>
        <option value="15">15 dias</option>
        <option value="30">30 dias</option>
      </Select>
      <div className="flex gap-2">
        <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
        <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
      </div>
    </div>
  )
}
