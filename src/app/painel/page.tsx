import { getServerSupabaseClient } from '@/lib/supabase/server'
import { calcularOciosidade } from '@/lib/ociosidade'

export default async function BarbeiroDashboardPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, nome').eq('user_id', user!.id).single()

  const hoje = new Date()
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10)
  const fimMes = hoje.toISOString().slice(0, 10)

  const { data: atendimentos } = await supabase
    .from('atendimentos')
    .select('preco, comissao_valor')
    .eq('membro_id', membro!.id)
    .gte('data', inicioMes)

  const { data: vendas } = await supabase
    .from('vendas_produtos')
    .select('quantidade, preco_unitario, comissao_valor')
    .eq('membro_id', membro!.id)
    .gte('data', inicioMes)

  const faturamentoServicos = (atendimentos ?? []).reduce((sum, a) => sum + Number(a.preco), 0)
  const comissaoServicos = (atendimentos ?? []).reduce((sum, a) => sum + Number(a.comissao_valor ?? 0), 0)
  const faturamentoProdutos = (vendas ?? []).reduce((sum, v) => sum + Number(v.preco_unitario) * v.quantidade, 0)
  const comissaoProdutos = (vendas ?? []).reduce((sum, v) => sum + Number(v.comissao_valor ?? 0), 0)

  // No generated Supabase types in this project (no `supabase gen types` step
  // in the plan), so .rpc() infers an untyped result — cast to the RPC's
  // known return shape (matches ociosidade()'s `returns table(...)`, Task 14).
  const { data: ociosidadeRaw } = await supabase
    .rpc('ociosidade', { p_membro_id: membro!.id, p_data_inicio: inicioMes, p_data_fim: fimMes })
    .single() as { data: { minutos_disponiveis: number; minutos_ocupados: number; faturamento_servicos: number } | null }

  const ociosidade = calcularOciosidade({
    minutosDisponiveis: ociosidadeRaw?.minutos_disponiveis ?? 0,
    minutosOcupados: ociosidadeRaw?.minutos_ocupados ?? 0,
    faturamentoServicos: Number(ociosidadeRaw?.faturamento_servicos ?? 0),
  })

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Olá, {membro!.nome}</h1>

      <div className="flex gap-4 flex-wrap mb-6">
        <div className="border rounded p-4 flex-1 min-w-[160px]">
          <p className="text-xs uppercase text-muted-foreground">Faturamento do mês</p>
          <p className="text-2xl font-bold">R$ {(faturamentoServicos + faturamentoProdutos).toFixed(2)}</p>
        </div>
        <div className="border rounded p-4 flex-1 min-w-[160px]">
          <p className="text-xs uppercase text-muted-foreground">Comissão do mês</p>
          <p className="text-2xl font-bold">R$ {(comissaoServicos + comissaoProdutos).toFixed(2)}</p>
        </div>
        <div className="border rounded p-4 flex-1 min-w-[160px]">
          <p className="text-xs uppercase text-muted-foreground">Ocupação da agenda</p>
          <p className="text-2xl font-bold">{ociosidade.percentualOcupacao}%</p>
        </div>
      </div>

      <h2 className="font-medium mb-2">Ganhos por categoria</h2>
      <p>Cortes e serviços: R$ {faturamentoServicos.toFixed(2)} → comissão R$ {comissaoServicos.toFixed(2)}</p>
      <p>Produtos: R$ {faturamentoProdutos.toFixed(2)} → comissão R$ {comissaoProdutos.toFixed(2)}</p>

      <h2 className="font-medium mt-6 mb-2">Tempo de cadeira (mês)</h2>
      <div className="w-full bg-muted rounded h-6 overflow-hidden flex">
        <div className="bg-green-600 flex items-center justify-center text-white text-xs" style={{ width: `${ociosidade.percentualOcupacao}%` }}>
          Ocupado {ociosidade.percentualOcupacao}%
        </div>
      </div>
      <div className="flex gap-4 mt-2">
        <p>Ganho médio por hora ocupada: <strong>R$ {ociosidade.ganhoPorHoraOcupada.toFixed(2)}</strong></p>
        <p className="text-red-600">Estimativa perdida no mês: <strong>R$ {ociosidade.valorPerdidoEstimado.toFixed(2)}</strong></p>
      </div>
    </div>
  )
}
