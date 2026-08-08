'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { ClienteAutocomplete } from './cliente-autocomplete'
import { Button } from '@/components/ui/button'

export function LancamentoServicoForm({
  barbeariaId, membroId, servicos,
}: { barbeariaId: string; membroId: string; servicos: { id: string; nome: string; preco: number }[] }) {
  const [servicoId, setServicoId] = useState('')
  const [cliente, setCliente] = useState<{ nome: string; telefone: string } | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)

  async function lancar() {
    if (!servicoId || !cliente) return
    const supabase = getBrowserSupabaseClient()
    const clienteId = await supabase.rpc('criar_ou_obter_cliente', { p_barbearia_id: barbeariaId, p_nome: cliente.nome, p_telefone: cliente.telefone })
    if (clienteId.error) { setMensagem(clienteId.error.message); return }

    const servico = servicos.find((s) => s.id === servicoId)!
    const { error } = await supabase.from('atendimentos').insert({
      barbearia_id: barbeariaId, membro_id: membroId, cliente_id: clienteId.data,
      servico_id: servicoId, preco: servico.preco,
    })
    setMensagem(error ? error.message : 'Lançado com sucesso!')
  }

  return (
    <div className="flex flex-col gap-2 max-w-sm border rounded p-4">
      <h3 className="font-medium">+ Corte / serviço</h3>
      <select value={servicoId} onChange={(e) => setServicoId(e.target.value)} className="border rounded px-2 py-1">
        <option value="">Serviço</option>
        {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome} (R${s.preco})</option>)}
      </select>
      <ClienteAutocomplete barbeariaId={barbeariaId} onResolved={setCliente} />
      <Button type="button" onClick={lancar}>Salvar</Button>
      {mensagem && <p className="text-sm">{mensagem}</p>}
    </div>
  )
}
