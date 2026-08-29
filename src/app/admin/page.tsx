import { getServerSupabaseClient } from '@/lib/supabase/server'
import { calcularOciosidade } from '@/lib/ociosidade'
import { resolverPeriodo } from '@/lib/periodo'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { KpiCard } from '@/components/painel/kpi-card'
import { PeriodoFiltro } from '@/components/periodo-filtro'

export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const { preset, inicio, fim, label } = resolverPeriodo(await searchParams)

  const { data: atendimentos } = await supabase.from('atendimentos').select('membro_id, preco, comissao_valor').eq('barbearia_id', membro!.barbearia_id).gte('data', inicio).lte('data', fim)
  const { data: vendas } = await supabase.from('vendas_produtos').select('membro_id, quantidade, preco_unitario, comissao_valor').eq('barbearia_id', membro!.barbearia_id).gte('data', inicio).lte('data', fim)
  // supabase-js's .filter(column, op, value) compares against a literal
  // value, not another column — .filter('quantidade_estoque', 'lte',
  // 'estoque_minimo') was silently comparing against the string
  // "estoque_minimo" (always false), not the estoque_minimo column. Fetch
  // both columns and compare them in JS instead.
  const { data: produtos } = await supabase.from('produtos').select('id, quantidade_estoque, estoque_minimo').eq('barbearia_id', membro!.barbearia_id)
  const produtosBaixos = (produtos ?? []).filter((p) => p.quantidade_estoque <= p.estoque_minimo)
  const { data: barbeiros } = await supabase.from('membros').select('id, nome, plano_carreira_id').eq('barbearia_id', membro!.barbearia_id).eq('papel', 'barbeiro')

  const { data: agendamentosMes } = await supabase
    .from('agendamentos')
    .select('status, vezes_remarcado')
    .eq('barbearia_id', membro!.barbearia_id)
    .gte('data', inicio)
    .lte('data', fim)

  const totalAgendamentos = agendamentosMes?.length ?? 0
  const realizadosCount = agendamentosMes?.filter((a) => a.status === 'realizado').length ?? 0
  const naoCompareceram = agendamentosMes?.filter((a) => a.status === 'nao_compareceu').length ?? 0
  const canceladosCount = agendamentosMes?.filter((a) => a.status === 'cancelado').length ?? 0
  const remarcados = (agendamentosMes ?? []).reduce((s, a) => s + a.vezes_remarcado, 0)

  const { data: prospeccoesMes } = await supabase
    .from('prospeccoes')
    .select('status, agendamento_id')
    .eq('barbearia_id', membro!.barbearia_id)
    .gte('data', inicio)
    .lte('data', fim)

  const prospectados = prospeccoesMes?.length ?? 0
  const convertidosProspeccao = prospeccoesMes?.filter((p) => p.status === 'convertido').length ?? 0
  const naoConvertidosProspeccao = prospeccoesMes?.filter((p) => p.status === 'nao_convertido').length ?? 0
  const agendamentoIdsConvertidos = (prospeccoesMes ?? [])
    .filter((p) => p.status === 'convertido' && p.agendamento_id)
    .map((p) => p.agendamento_id as string)

  const { data: atendimentosProspeccao } = await supabase
    .from('atendimentos')
    .select('preco')
    .in('agendamento_id', agendamentoIdsConvertidos.length > 0 ? agendamentoIdsConvertidos : ['00000000-0000-0000-0000-000000000000'])
  const { data: vendasProspeccao } = await supabase
    .from('vendas_produtos')
    .select('preco_unitario, quantidade')
    .in('agendamento_id', agendamentoIdsConvertidos.length > 0 ? agendamentoIdsConvertidos : ['00000000-0000-0000-0000-000000000000'])

  const faturamentoProspeccao =
    (atendimentosProspeccao ?? []).reduce((s, a) => s + Number(a.preco), 0) +
    (vendasProspeccao ?? []).reduce((s, v) => s + Number(v.preco_unitario) * v.quantidade, 0)

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
        .rpc('ociosidade', { p_membro_id: b.id, p_data_inicio: inicio, p_data_fim: fim })
        .single() as { data: { minutos_disponiveis: number; minutos_ocupados: number; faturamento_servicos: number } | null }
      const ocupacao = calcularOciosidade({
        minutosDisponiveis: ociosidadeRaw?.minutos_disponiveis ?? 0,
        minutosOcupados: ociosidadeRaw?.minutos_ocupados ?? 0,
        faturamentoServicos: Number(ociosidadeRaw?.faturamento_servicos ?? 0),
        quantidadeAtendimentos: atendimentosB.length,
      }).percentualOcupacao

      return { nome: b.nome, faturamentoB, comissaoB, ocupacao }
    })
  )

  return (
    <div>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <h1 className="font-heading text-2xl font-bold">Visão geral — {label}</h1>
        <PeriodoFiltro preset={preset} inicio={inicio} fim={fim} />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-4 mb-6">
        <KpiCard
          label="Faturamento do mês (todos)"
          value={`R$ ${faturamentoTotal.toFixed(2)}`}
        />
        <KpiCard
          label="Comissões acumuladas no mês"
          value={`R$ ${comissaoTotal.toFixed(2)}`}
        />
        <KpiCard
          label="Produtos com estoque baixo"
          value={`${produtosBaixos.length} itens`}
          chip={produtosBaixos.length > 0 ? { text: 'estoque baixo', tone: 'amber' } : undefined}
        />
      </div>

      <h2 className="font-heading text-lg font-semibold mb-2">Barbeiros</h2>
      <Table>
        <TableHeader>
          <TableRow><TableHead>Nome</TableHead><TableHead>Faturamento mês</TableHead><TableHead>Comissão mês</TableHead><TableHead>Ocupação</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((l) => (
            <TableRow key={l.nome}><TableCell>{l.nome}</TableCell><TableCell>R$ {l.faturamentoB.toFixed(2)}</TableCell><TableCell>R$ {l.comissaoB.toFixed(2)}</TableCell><TableCell>{l.ocupacao}%</TableCell></TableRow>
          ))}
        </TableBody>
      </Table>

      <Card className="mt-6 mb-5">
        <CardContent className="p-6">
          <p className="font-heading text-base font-bold mb-5">Indicadores de agendamento (mês, toda a barbearia) <span className="font-normal text-muted-foreground text-sm">— não somado ao financeiro acima</span></p>
          <div className="grid grid-cols-5 gap-5 text-center">
            <div><p className="text-2xl font-bold">{totalAgendamentos}</p><p className="text-xs text-muted-foreground mt-1">Total</p></div>
            <div><p className="text-2xl font-bold text-primary">{realizadosCount}</p><p className="text-xs text-muted-foreground mt-1">Realizados</p></div>
            <div><p className="text-2xl font-bold">{naoCompareceram}</p><p className="text-xs text-muted-foreground mt-1">Não compareceram</p></div>
            <div><p className="text-2xl font-bold">{canceladosCount}</p><p className="text-xs text-muted-foreground mt-1">Cancelados</p></div>
            <div><p className="text-2xl font-bold">{remarcados}</p><p className="text-xs text-muted-foreground mt-1">Remarcados</p></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <p className="font-heading text-base font-bold mb-5">Prospecção (mês, toda a barbearia)</p>
          <div className="grid grid-cols-4 gap-5 text-center">
            <div><p className="text-2xl font-bold">{prospectados}</p><p className="text-xs text-muted-foreground mt-1">Prospectados</p></div>
            <div><p className="text-2xl font-bold text-primary">{convertidosProspeccao}</p><p className="text-xs text-muted-foreground mt-1">Convertidos</p></div>
            <div><p className="text-2xl font-bold">{naoConvertidosProspeccao}</p><p className="text-xs text-muted-foreground mt-1">Não convertidos</p></div>
            <div><p className="text-2xl font-bold">R$ {faturamentoProspeccao.toFixed(2)}</p><p className="text-xs text-muted-foreground mt-1">Faturamento gerado</p></div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
