import { getServerSupabaseClient } from '@/lib/supabase/server'
import { calcularOciosidade } from '@/lib/ociosidade'

export default async function AdminOverviewPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const hoje = new Date().toISOString().slice(0, 10)

  const { data: atendimentos } = await supabase.from('atendimentos').select('membro_id, preco, comissao_valor').eq('barbearia_id', membro!.barbearia_id).gte('data', inicioMes)
  const { data: vendas } = await supabase.from('vendas_produtos').select('membro_id, quantidade, preco_unitario, comissao_valor').eq('barbearia_id', membro!.barbearia_id).gte('data', inicioMes)
  // supabase-js's .filter(column, op, value) compares against a literal
  // value, not another column — .filter('quantidade_estoque', 'lte',
  // 'estoque_minimo') was silently comparing against the string
  // "estoque_minimo" (always false), not the estoque_minimo column. Fetch
  // both columns and compare them in JS instead.
  const { data: produtos } = await supabase.from('produtos').select('id, quantidade_estoque, estoque_minimo').eq('barbearia_id', membro!.barbearia_id)
  const produtosBaixos = (produtos ?? []).filter((p) => p.quantidade_estoque <= p.estoque_minimo)
  const { data: barbeiros } = await supabase.from('membros').select('id, nome, plano_carreira_id').eq('barbearia_id', membro!.barbearia_id).eq('papel', 'barbeiro')

  const faturamentoTotal =
    (atendimentos ?? []).reduce((sum, a) => sum + Number(a.preco), 0) +
    (vendas ?? []).reduce((sum, v) => sum + Number(v.preco_unitario) * v.quantidade, 0)
  const comissaoTotal =
    (atendimentos ?? []).reduce((sum, a) => sum + Number(a.comissao_valor ?? 0), 0) +
    (vendas ?? []).reduce((sum, v) => sum + Number(v.comissao_valor ?? 0), 0)

  const linhas = await Promise.all(
    (barbeiros ?? []).map(async (b) => {
      const atendimentosB = (atendimentos ?? []).filter((a) => a.membro_id === b.id)
      const vendasB = (vendas ?? []).filter((v) => v.membro_id === b.id)
      const faturamentoB = atendimentosB.reduce((s, a) => s + Number(a.preco), 0) + vendasB.reduce((s, v) => s + Number(v.preco_unitario) * v.quantidade, 0)
      const comissaoB = atendimentosB.reduce((s, a) => s + Number(a.comissao_valor ?? 0), 0) + vendasB.reduce((s, v) => s + Number(v.comissao_valor ?? 0), 0)

      // Same cast reasoning as the barbeiro dashboard (Task 15): no
      // generated Supabase types, so .rpc().single() is otherwise untyped.
      const { data: ociosidadeRaw } = await supabase
        .rpc('ociosidade', { p_membro_id: b.id, p_data_inicio: inicioMes, p_data_fim: hoje })
        .single() as { data: { minutos_disponiveis: number; minutos_ocupados: number; faturamento_servicos: number } | null }
      const ocupacao = calcularOciosidade({
        minutosDisponiveis: ociosidadeRaw?.minutos_disponiveis ?? 0,
        minutosOcupados: ociosidadeRaw?.minutos_ocupados ?? 0,
        faturamentoServicos: Number(ociosidadeRaw?.faturamento_servicos ?? 0),
      }).percentualOcupacao

      return { nome: b.nome, faturamentoB, comissaoB, ocupacao }
    })
  )

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Visão geral</h1>
      <div className="flex gap-4 flex-wrap mb-6">
        <div className="border rounded p-4 flex-1 min-w-[160px]">
          <p className="text-xs uppercase text-muted-foreground">Faturamento do mês (todos)</p>
          <p className="text-2xl font-bold">R$ {faturamentoTotal.toFixed(2)}</p>
        </div>
        <div className="border rounded p-4 flex-1 min-w-[160px]">
          <p className="text-xs uppercase text-muted-foreground">Comissões acumuladas no mês</p>
          <p className="text-2xl font-bold">R$ {comissaoTotal.toFixed(2)}</p>
        </div>
        <div className="border rounded p-4 flex-1 min-w-[160px] border-red-300">
          <p className="text-xs uppercase text-muted-foreground">Produtos com estoque baixo</p>
          <p className="text-2xl font-bold text-red-600">{produtosBaixos?.length ?? 0} itens</p>
        </div>
      </div>

      <h2 className="font-medium mb-2">Barbeiros</h2>
      <table className="w-full text-left">
        <thead><tr><th>Nome</th><th>Faturamento mês</th><th>Comissão mês</th><th>Ocupação</th></tr></thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.nome}><td>{l.nome}</td><td>R$ {l.faturamentoB.toFixed(2)}</td><td>R$ {l.comissaoB.toFixed(2)}</td><td>{l.ocupacao}%</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
