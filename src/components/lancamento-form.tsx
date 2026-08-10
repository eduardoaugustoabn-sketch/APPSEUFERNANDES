'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { ClienteAutocomplete } from './cliente-autocomplete'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type Servico = { id: string; nome: string; preco: number; duracao_minutos: number }
type Produto = { id: string; nome: string; preco_venda: number; quantidade_estoque: number }
type ServicoSelecionado = Servico
type ProdutoSelecionado = Produto & { quantidade: number }

// Opened from an agendamento (AgendaDia, "Atender agora") to record what
// actually happened when the cliente showed up: pré-preenche o cliente/
// serviço já marcado, deixa adicionar produto/serviço extra, e ao salvar
// linka os atendimentos ao agendamento e marca ele como realizado. Um
// agendamento só vira realizado aqui — nunca automaticamente ao ser criado
// — porque as métricas do dashboard (faturamento, comissão, ociosidade) só
// devem contar quem de fato foi atendido e pagou, não quem apenas marcou um
// horário e pode nem aparecer.
export type ModoAgenda = {
  agendamentoId: string
  clienteNome: string
  clienteTelefone: string
  servicoId: string
  horaInicio: string
}

export function LancamentoForm({
  barbeariaId, membroId, servicos, produtos, modoAgenda, onSalvo,
}: {
  barbeariaId: string
  membroId: string
  servicos: Servico[]
  produtos: Produto[]
  modoAgenda: ModoAgenda
  onSalvo?: () => void
}) {
  const router = useRouter()
  const [cliente, setCliente] = useState<{ nome: string; telefone: string; dataNascimento?: string } | null>(
    { nome: modoAgenda.clienteNome, telefone: modoAgenda.clienteTelefone }
  )
  const [servicosSelecionados, setServicosSelecionados] = useState<ServicoSelecionado[]>(() => {
    const servico = servicos.find((s) => s.id === modoAgenda.servicoId)
    return servico ? [servico] : []
  })
  const [produtosSelecionados, setProdutosSelecionados] = useState<ProdutoSelecionado[]>([])
  const [servicoParaAdicionar, setServicoParaAdicionar] = useState('')
  const [produtoParaAdicionar, setProdutoParaAdicionar] = useState('')
  const [quantidadeParaAdicionar, setQuantidadeParaAdicionar] = useState(1)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [clienteAutocompleteKey, setClienteAutocompleteKey] = useState(0)

  // Agendar a próxima visita do cliente sem sair da tela de lançamento.
  const [agendarRetorno, setAgendarRetorno] = useState(false)
  const [retornoServicoId, setRetornoServicoId] = useState('')
  const [retornoData, setRetornoData] = useState(() => new Date().toISOString().slice(0, 10))
  const [retornoHorarios, setRetornoHorarios] = useState<{ hora_inicio: string; hora_fim: string }[]>([])
  const [retornoHorario, setRetornoHorario] = useState('')
  const [buscandoHorarios, setBuscandoHorarios] = useState(false)

  async function buscarHorariosRetorno() {
    if (!retornoServicoId) return
    setBuscandoHorarios(true)
    setRetornoHorario('')
    const supabase = getBrowserSupabaseClient()
    const { data: slots } = await supabase.rpc('horarios_disponiveis', {
      p_barbearia_id: barbeariaId, p_membro_id: membroId, p_servico_id: retornoServicoId, p_data: retornoData,
    })
    setRetornoHorarios(slots ?? [])
    setBuscandoHorarios(false)
  }

  // Every catalog item stays selectable (not filtered down as items get
  // added) — a visit can need the same serviço twice (e.g. corte + corte
  // infantil for two kids under one cliente) or another round of a produto.
  function adicionarServico() {
    const servico = servicos.find((s) => s.id === servicoParaAdicionar)
    if (!servico) return
    setServicosSelecionados((atual) => [...atual, servico])
    setServicoParaAdicionar('')
  }

  function adicionarProduto() {
    const produto = produtos.find((p) => p.id === produtoParaAdicionar)
    if (!produto) return
    setProdutosSelecionados((atual) => {
      const existente = atual.find((p) => p.id === produto.id)
      if (existente) {
        return atual.map((p) => (p.id === produto.id ? { ...p, quantidade: p.quantidade + quantidadeParaAdicionar } : p))
      }
      return [...atual, { ...produto, quantidade: quantidadeParaAdicionar }]
    })
    setProdutoParaAdicionar('')
    setQuantidadeParaAdicionar(1)
  }

  // By index, not id — the same serviço can appear more than once in the
  // list (see adicionarServico above), so removing "by id" would drop every
  // instance of it instead of just the one the user clicked "remover" on.
  function removerServico(index: number) {
    setServicosSelecionados((atual) => atual.filter((_, i) => i !== index))
  }

  function removerProduto(id: string) {
    setProdutosSelecionados((atual) => atual.filter((p) => p.id !== id))
  }

  async function salvar() {
    if (!cliente || !cliente.nome || !cliente.telefone) { setMensagem('Preencha o cliente.'); return }
    // A produto-only sale (client just buys a pomada, no corte) is valid —
    // only require that at least one of the two lists isn't empty.
    if (servicosSelecionados.length === 0 && produtosSelecionados.length === 0) {
      setMensagem('Adicione ao menos um serviço ou produto.')
      return
    }
    if (agendarRetorno && !retornoHorario) { setMensagem('Escolha um horário para o retorno, ou desmarque "Agendar próxima visita".'); return }

    setSalvando(true)
    setMensagem(null)
    const supabase = getBrowserSupabaseClient()

    const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
      p_barbearia_id: barbeariaId, p_nome: cliente.nome, p_telefone: cliente.telefone, p_data_nascimento: cliente.dataNascimento ?? null,
    })
    if (clienteId.error) { setMensagem(clienteId.error.message); setSalvando(false); return }

    for (const servico of servicosSelecionados) {
      const { error } = await supabase.from('atendimentos').insert({
        barbearia_id: barbeariaId, membro_id: membroId, cliente_id: clienteId.data,
        servico_id: servico.id, preco: servico.preco, agendamento_id: modoAgenda.agendamentoId,
      })
      if (error) { setMensagem(error.message); setSalvando(false); return }
    }

    for (const produto of produtosSelecionados) {
      const { error } = await supabase.from('vendas_produtos').insert({
        barbearia_id: barbeariaId, membro_id: membroId, cliente_id: clienteId.data,
        produto_id: produto.id, quantidade: produto.quantidade, preco_unitario: produto.preco_venda,
      })
      if (error) { setMensagem(error.message); setSalvando(false); return }
    }

    // Um agendamento só vira realizado aqui, quando o cliente de fato foi
    // atendido e o lançamento foi salvo — nunca no momento de marcar o
    // horário. É esse status que separa "quem agendou" de "quem realmente
    // foi e pagou" nos números do dashboard (que só somam atendimentos).
    const { error } = await supabase.from('agendamentos').update({ status: 'realizado' }).eq('id', modoAgenda.agendamentoId)
    if (error) { setMensagem(`Lançamento salvo, mas não deu pra marcar o agendamento como realizado: ${error.message}`); setSalvando(false); return }

    if (agendarRetorno && retornoHorario) {
      const servicoRetorno = servicos.find((s) => s.id === retornoServicoId)!
      const horaFim = new Date(`1970-01-01T${retornoHorario}`)
      horaFim.setMinutes(horaFim.getMinutes() + servicoRetorno.duracao_minutos)
      const { error } = await supabase.from('agendamentos').insert({
        barbearia_id: barbeariaId, membro_id: membroId, cliente_id: clienteId.data,
        servico_id: retornoServicoId, data: retornoData, hora_inicio: retornoHorario,
        hora_fim: horaFim.toTimeString().slice(0, 8), status: 'confirmado', origem: 'interno',
      })
      if (error) {
        setMensagem(`Lançamento salvo, mas o agendamento de retorno falhou: ${error.message}.`)
        setSalvando(false)
        return
      }
    }

    setMensagem(agendarRetorno && retornoHorario ? 'Concluído e retorno agendado com sucesso!' : 'Concluído com sucesso!')
    setServicosSelecionados([])
    setProdutosSelecionados([])
    setCliente(null)
    setClienteAutocompleteKey((atual) => atual + 1)
    setAgendarRetorno(false)
    setRetornoServicoId('')
    setRetornoHorarios([])
    setRetornoHorario('')
    setSalvando(false)
    // The insert above went through the browser Supabase client, not a
    // server action — the page's own `produtos`/`servicos` props (fetched
    // once on load, server-side) never re-run on their own, so "estoque: N"
    // and the AgendaDia grid would keep showing stale data until a manual
    // reload. router.refresh() re-runs the page's own server fetch;
    // onSalvo (from AgendaDia) additionally refetches its own client-side
    // agendamentos list.
    router.refresh()
    onSalvo?.()
  }

  return (
    <div className="flex flex-col gap-4 max-w-md border rounded p-4">
      <h3 className="font-medium">Atender agendamento — {modoAgenda.horaInicio.slice(0, 5)}</h3>

      <ClienteAutocomplete
        key={clienteAutocompleteKey}
        barbeariaId={barbeariaId}
        onResolved={setCliente}
        valorInicial={{ nome: modoAgenda.clienteNome, telefone: modoAgenda.clienteTelefone }}
      />

      <div>
        <p className="text-sm font-medium mb-1">Serviços (corte, serviço extra...)</p>
        {servicosSelecionados.map((s, index) => (
          <div key={`${s.id}-${index}`} className="flex justify-between items-center text-sm border-b py-1">
            <span>{s.nome} (R${s.preco})</span>
            <button type="button" onClick={() => removerServico(index)} className="text-red-600 text-xs">remover</button>
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <select value={servicoParaAdicionar} onChange={(e) => setServicoParaAdicionar(e.target.value)} className="border rounded px-2 py-1 flex-1">
            <option value="">Serviço</option>
            {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome} (R${s.preco})</option>)}
          </select>
          <Button type="button" variant="outline" onClick={adicionarServico} disabled={!servicoParaAdicionar}>+ Adicionar</Button>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-1">Produtos (opcional)</p>
        {produtosSelecionados.map((p) => (
          <div key={p.id} className="flex justify-between items-center text-sm border-b py-1">
            <span>{p.quantidade}x {p.nome} (R${p.preco_venda})</span>
            <button type="button" onClick={() => removerProduto(p.id)} className="text-red-600 text-xs">remover</button>
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <select value={produtoParaAdicionar} onChange={(e) => setProdutoParaAdicionar(e.target.value)} className="border rounded px-2 py-1 flex-1">
            <option value="">Produto</option>
            {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome} (estoque: {p.quantidade_estoque})</option>)}
          </select>
          <Input type="number" min={1} value={quantidadeParaAdicionar} onChange={(e) => setQuantidadeParaAdicionar(Number(e.target.value))} className="w-16" />
          <Button type="button" variant="outline" onClick={adicionarProduto} disabled={!produtoParaAdicionar}>+ Adicionar</Button>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium flex items-center gap-2">
          <input type="checkbox" checked={agendarRetorno} onChange={(e) => setAgendarRetorno(e.target.checked)} />
          Agendar próxima visita deste cliente
        </label>
        {agendarRetorno && (
          <div className="flex flex-col gap-2 mt-2">
            <select value={retornoServicoId} onChange={(e) => { setRetornoServicoId(e.target.value); setRetornoHorarios([]); setRetornoHorario('') }} className="border rounded px-2 py-1">
              <option value="">Serviço do retorno</option>
              {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
            <Input type="date" value={retornoData} onChange={(e) => { setRetornoData(e.target.value); setRetornoHorarios([]); setRetornoHorario('') }} />
            <Button type="button" variant="outline" onClick={buscarHorariosRetorno} disabled={!retornoServicoId || buscandoHorarios}>Ver horários</Button>
            {retornoHorarios.length > 0 && (
              <select value={retornoHorario} onChange={(e) => setRetornoHorario(e.target.value)} className="border rounded px-2 py-1">
                <option value="">Horário</option>
                {retornoHorarios.map((h) => <option key={h.hora_inicio} value={h.hora_inicio}>{h.hora_inicio.slice(0, 5)}</option>)}
              </select>
            )}
            {retornoHorarios.length === 0 && !buscandoHorarios && retornoServicoId && (
              <p className="text-xs text-muted-foreground">Clique em &quot;Ver horários&quot; para escolher.</p>
            )}
          </div>
        )}
      </div>

      <Button type="button" onClick={salvar} disabled={salvando}>Concluir atendimento</Button>
      {mensagem && <p className="text-sm">{mensagem}</p>}
    </div>
  )
}
