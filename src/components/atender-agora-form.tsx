'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { ClienteAutocomplete } from './cliente-autocomplete'
import { Button } from '@/components/ui/button'
import type { ModoAgenda } from './lancamento-form'
import type { CategoriaOrigem } from '@/lib/categorias-origem'
import { Select } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'

type Servico = { id: string; nome: string; duracao_minutos: number; ativo: boolean }

// Walk-in: cliente chegou sem hora marcada. Em vez de uma tela de
// "lançamento avulso" separada, isso cria um agendamento normal pro
// horário atual e entrega o controle pro mesmo fluxo de "atender
// agendamento" (LancamentoForm com modoAgenda) que a Agenda já usa — sem
// caminho de dado que não passe por agendamentos.
export function AtenderAgoraForm({
  barbeariaId, membroId, servicos, onCriado, onCancelar,
}: {
  barbeariaId: string
  membroId: string
  servicos: Servico[]
  onCriado: (modoAgenda: ModoAgenda) => void
  onCancelar?: () => void
}) {
  const [cliente, setCliente] = useState<{ nome: string; telefone: string; dataNascimento?: string; bairro?: string; cidade?: string; categoriaOrigem?: CategoriaOrigem; reconhecido?: boolean } | null>(null)
  const [servicoId, setServicoId] = useState('')
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function criar() {
    if (!cliente || !cliente.nome || !cliente.telefone) { setMensagem('Preencha o cliente.'); return }
    if (!cliente.reconhecido && !cliente.categoriaOrigem) { setMensagem('Escolha como o cliente conheceu a barbearia.'); return }
    if (!servicoId) { setMensagem('Escolha o serviço.'); return }

    setSalvando(true)
    setMensagem(null)
    const supabase = getBrowserSupabaseClient()

    const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
      p_barbearia_id: barbeariaId, p_nome: cliente.nome, p_telefone: cliente.telefone,
      p_data_nascimento: cliente.dataNascimento ?? null,
      p_bairro: cliente.bairro ?? null, p_cidade: cliente.cidade ?? null,
      p_categoria_origem: cliente.categoriaOrigem ?? null,
    })
    if (clienteId.error) { setMensagem(clienteId.error.message); setSalvando(false); return }

    const servico = servicos.find((s) => s.id === servicoId)!
    const agora = new Date()
    const data = agora.toISOString().slice(0, 10)
    const horaInicio = agora.toTimeString().slice(0, 8)
    const horaFim = new Date(agora)
    horaFim.setMinutes(horaFim.getMinutes() + servico.duracao_minutos)

    const { data: agendamento, error } = await supabase.from('agendamentos').insert({
      barbearia_id: barbeariaId, membro_id: membroId, cliente_id: clienteId.data,
      servico_id: servicoId, data, hora_inicio: horaInicio,
      hora_fim: horaFim.toTimeString().slice(0, 8), status: 'confirmado', origem: 'interno',
    }).select('id').single()

    setSalvando(false)
    if (error || !agendamento) { setMensagem(error?.message ?? 'Não foi possível iniciar o atendimento.'); return }

    onCriado({
      agendamentoId: agendamento.id,
      clienteNome: cliente.nome,
      clienteTelefone: cliente.telefone,
      servicoId,
      horaInicio,
    })
  }

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="font-heading text-base font-bold mb-4">Atender agora</h3>
        <div className="flex flex-col gap-3">
          <ClienteAutocomplete onResolved={setCliente} />
          <Select value={servicoId} onChange={(e) => setServicoId(e.target.value)}>
            <option value="">Serviço</option>
            {servicos.filter((s) => s.ativo).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </Select>
        </div>
        <div className="flex gap-2 mt-4">
          <Button type="button" onClick={criar} disabled={salvando}>Iniciar atendimento</Button>
          <Button type="button" variant="outline" onClick={onCancelar}>Cancelar</Button>
        </div>
        {mensagem && <p className="text-sm text-muted-foreground mt-2">{mensagem}</p>}
      </CardContent>
    </Card>
  )
}
