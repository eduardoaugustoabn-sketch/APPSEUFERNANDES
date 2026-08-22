import Link from 'next/link'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { calcularOciosidade } from '@/lib/ociosidade'
import { calcularDistribuicaoCategorias } from '@/lib/categoria-atendimento'
import { calcularDiagnostico } from '@/lib/diagnostico'
import { Card, CardContent } from '@/components/ui/card'
import { KpiCard } from '@/components/painel/kpi-card'
import { DonutChart } from '@/components/painel/donut-chart'

type ItemContagem = { id: string; nome: string; quantidade: number; valor: number }

// Tipos para dados de Supabase sem generated types
type AtendimentoRow = {
  preco: string
  comissao_valor: string | null
  servico_id: string
  agendamento_id: string | null
  servicos: { nome: string; tipo: 'corte' | 'servico_extra'; categoria_servico: 'cabelo' | 'barba' | 'outro' } | null
}

type VendaRow = {
  quantidade: number
  preco_unitario: string
  custo_unitario: string | null
  comissao_valor: string | null
  produto_id: string
  produtos: { nome: string; preco_custo: string } | null
}

// Agrupa por id (não por nome) — dois serviços/produtos distintos podem ter
// o mesmo nome, e o id é a chave real que os diferencia.
function agruparPorId(itens: { id: string; nome: string; quantidade: number; valor: number }[]): ItemContagem[] {
  const mapa = new Map<string, ItemContagem>()
  for (const { id, nome, quantidade, valor } of itens) {
    const atual = mapa.get(id) ?? { id, nome, quantidade: 0, valor: 0 }
    atual.quantidade += quantidade
    atual.valor += valor
    mapa.set(id, atual)
  }
  return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor)
}

export default async function BarbeiroDashboardPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, nome, barbearia_id, meta_faturamento_mes').eq('user_id', user!.id).single()

  const hoje = new Date()
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10)
  const fimMes = hoje.toISOString().slice(0, 10)

  const { data: atendimentosData } = (await supabase
    .from('atendimentos')
    .select('preco, comissao_valor, servico_id, agendamento_id, servicos(nome, tipo, categoria_servico)')
    .eq('membro_id', membro!.id)
    .gte('data', inicioMes)) as { data: AtendimentoRow[] | null }
  const atendimentos = atendimentosData ?? []

  const { data: vendasData } = (await supabase
    .from('vendas_produtos')
    .select('quantidade, preco_unitario, custo_unitario, comissao_valor, produto_id, produtos(nome, preco_custo)')
    .eq('membro_id', membro!.id)
    .gte('data', inicioMes)) as { data: VendaRow[] | null }
  const vendas = vendasData ?? []

  const { data: agendamentosMes } = await supabase
    .from('agendamentos')
    .select('status, vezes_remarcado')
    .eq('membro_id', membro!.id)
    .gte('data', inicioMes)

  const totalAgendamentos = agendamentosMes?.length ?? 0
  const realizados = agendamentosMes?.filter((a) => a.status === 'realizado').length ?? 0
  const naoCompareceram = agendamentosMes?.filter((a) => a.status === 'nao_compareceu').length ?? 0
  const cancelados = agendamentosMes?.filter((a) => a.status === 'cancelado').length ?? 0
  const remarcados = (agendamentosMes ?? []).reduce((s, a) => s + a.vezes_remarcado, 0)

  const { data: prospeccoesMes } = await supabase
    .from('prospeccoes')
    .select('status, agendamento_id')
    .eq('membro_id', membro!.id)
    .gte('data', inicioMes)

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

  const atendimentosCortes = atendimentos.filter((a) => a.servicos?.tipo === 'corte')
  const atendimentosExtras = atendimentos.filter((a) => a.servicos?.tipo === 'servico_extra')

  const distribuicaoCategorias = calcularDistribuicaoCategorias(
    atendimentos
      .filter((a): a is typeof a & { agendamento_id: string; servicos: NonNullable<typeof a.servicos> } => !!a.agendamento_id && !!a.servicos)
      .map((a) => ({ agendamentoId: a.agendamento_id, categoriaServico: a.servicos.categoria_servico }))
  )

  const faturamentoCortes = atendimentosCortes.reduce((s, a) => s + Number(a.preco), 0)
  const comissaoCortes = atendimentosCortes.reduce((s, a) => s + Number(a.comissao_valor ?? 0), 0)
  const faturamentoExtras = atendimentosExtras.reduce((s, a) => s + Number(a.preco), 0)
  const comissaoExtras = atendimentosExtras.reduce((s, a) => s + Number(a.comissao_valor ?? 0), 0)
  const faturamentoProdutos = vendas.reduce((s, v) => s + Number(v.preco_unitario) * v.quantidade, 0)
  const comissaoProdutos = vendas.reduce((s, v) => s + Number(v.comissao_valor ?? 0), 0)
  const custoProdutos = vendas.reduce((s, v) => s + Number(v.custo_unitario ?? v.produtos?.preco_custo ?? 0) * v.quantidade, 0)
  const lucroProdutos = faturamentoProdutos - custoProdutos

  const detalheCortes = agruparPorId(atendimentosCortes.map((a) => ({ id: a.servico_id, nome: a.servicos?.nome ?? 'Serviço', quantidade: 1, valor: Number(a.preco) })))
  const detalheExtras = agruparPorId(atendimentosExtras.map((a) => ({ id: a.servico_id, nome: a.servicos?.nome ?? 'Serviço', quantidade: 1, valor: Number(a.preco) })))
  const detalheProdutos = agruparPorId(vendas.map((v) => ({ id: v.produto_id, nome: v.produtos?.nome ?? 'Produto', quantidade: v.quantidade, valor: Number(v.preco_unitario) * v.quantidade })))

  // No generated Supabase types in this project (no `supabase gen types` step
  // in the plan), so .rpc().single() is otherwise untyped.
  const { data: ociosidadeRaw } = await supabase
    .rpc('ociosidade', { p_membro_id: membro!.id, p_data_inicio: inicioMes, p_data_fim: fimMes })
    .single() as { data: { minutos_disponiveis: number; minutos_ocupados: number; faturamento_servicos: number } | null }

  const ociosidade = calcularOciosidade({
    minutosDisponiveis: ociosidadeRaw?.minutos_disponiveis ?? 0,
    minutosOcupados: ociosidadeRaw?.minutos_ocupados ?? 0,
    faturamentoServicos: Number(ociosidadeRaw?.faturamento_servicos ?? 0),
    quantidadeAtendimentos: atendimentos.length,
  })

  const totalGanhos = faturamentoCortes + faturamentoExtras + faturamentoProdutos
  const percentualCortes = totalGanhos > 0 ? Math.round((faturamentoCortes / totalGanhos) * 100) : 0
  const percentualExtras = totalGanhos > 0 ? Math.round((faturamentoExtras / totalGanhos) * 100) : 0
  const percentualProdutos = totalGanhos > 0 ? Math.round((faturamentoProdutos / totalGanhos) * 100) : 0

  const percentualSoCabelo = distribuicaoCategorias.totalClassificado > 0 ? Math.round((distribuicaoCategorias.soCabelo / distribuicaoCategorias.totalClassificado) * 100) : 0
  const percentualSoBarba = distribuicaoCategorias.totalClassificado > 0 ? Math.round((distribuicaoCategorias.soBarba / distribuicaoCategorias.totalClassificado) * 100) : 0
  const percentualCabeloEBarba = distribuicaoCategorias.totalClassificado > 0 ? Math.round((distribuicaoCategorias.cabeloEBarba / distribuicaoCategorias.totalClassificado) * 100) : 0

  const ticketMedio = realizados > 0 ? totalGanhos / realizados : 0

  // Sem returns table(...), então data já vem como o escalar direto (string
  // | null — numeric chega como string via PostgREST), sem precisar de .single().
  const { data: mediaTicketBarbeariaRaw } = await supabase.rpc('media_ticket_barbearia') as { data: string | null }
  const mediaTicketBarbearia = mediaTicketBarbeariaRaw !== null ? Number(mediaTicketBarbeariaRaw) : null

  const diagnostico = calcularDiagnostico({
    percentualOcupacao: ociosidade.percentualOcupacao,
    indicePublicoAlvo: distribuicaoCategorias.indicePublicoAlvo,
    ticketMedio,
    mediaTicketBarbearia,
    percentualSoCabelo,
    percentualSoBarba,
  })

  const { data: indicadoresRaw } = await supabase
    .rpc('indicadores_recorrencia_conversao', { p_membro_id: membro!.id })
    .single() as {
      data: {
        recorrencia_so_cabelo: string | null
        recorrencia_so_barba: string | null
        recorrencia_cabelo_barba: string | null
        recorrencia_total: string | null
        conversao_categoria_alvo: string | null
        clientes_fora_alvo: number | null
        clientes_so_cabelo: number | null
        clientes_so_barba: number | null
        potencial_conversao: string | null
      } | null
    }

  const recorrenciaSoCabelo = Number(indicadoresRaw?.recorrencia_so_cabelo ?? 0)
  const recorrenciaSoBarba = Number(indicadoresRaw?.recorrencia_so_barba ?? 0)
  const recorrenciaCabeloBarba = Number(indicadoresRaw?.recorrencia_cabelo_barba ?? 0)
  const recorrenciaTotal = Number(indicadoresRaw?.recorrencia_total ?? 0)
  const conversaoCategoriaAlvo = Number(indicadoresRaw?.conversao_categoria_alvo ?? 0)
  const clientesSoCabeloForaAlvo = indicadoresRaw?.clientes_so_cabelo ?? 0
  const clientesSoBarbaForaAlvo = indicadoresRaw?.clientes_so_barba ?? 0
  const potencialConversao = Number(indicadoresRaw?.potencial_conversao ?? 0)

  const { data: sonhosAtivos } = await supabase
    .from('sonhos')
    .select('*')
    .eq('membro_id', membro!.id)
    .eq('concluido', false)
    .order('criado_em')

  const sonhosComProgresso = await Promise.all(
    (sonhosAtivos ?? []).map(async (sonho) => {
      const { data: comissaoSonho } = await supabase.rpc('comissao_acumulada', {
        p_membro_id: membro!.id,
        p_data_inicio: sonho.criado_em,
      })
      const valorAcumulado = Math.min(
        Number(comissaoSonho ?? 0) * (sonho.percentual_comissao / 100),
        sonho.valor_alvo
      )
      return { sonho, valorAcumulado }
    })
  )

  const transacoesCount = atendimentos.length + vendas.length
  const comissaoTotal = comissaoCortes + comissaoExtras + comissaoProdutos
  const percentualComissaoDoTotal = totalGanhos > 0 ? Math.round((comissaoTotal / totalGanhos) * 100) : 0
  const horariosPossiveis = Math.round((ociosidadeRaw?.minutos_disponiveis ?? 0) / 60)
  const horariosUsados = Math.round((ociosidadeRaw?.minutos_ocupados ?? 0) / 60)
  const statusOcupacao =
    ociosidade.percentualOcupacao >= 80 ? { text: 'ótimo', tone: 'primary' as const } :
    ociosidade.percentualOcupacao >= 40 ? { text: 'moderado', tone: 'neutral' as const } :
    { text: 'crítico', tone: 'amber' as const }
  const statusPublicoAlvo = distribuicaoCategorias.cabeloEBarba === 0
    ? 'sem cabelo+barba'
    : `${distribuicaoCategorias.cabeloEBarba} cabelo+barba`
  const dataHoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const dataHojeCapitalizada = dataHoje.charAt(0).toUpperCase() + dataHoje.slice(1)
  const mesAno = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const mesAnoCapitalizado = mesAno.charAt(0).toUpperCase() + mesAno.slice(1)

  return (
    <div className="flex flex-col gap-5">

      <header className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-muted-foreground mb-1.5">{dataHojeCapitalizada}</div>
          <h1 className="text-[31px] font-extrabold tracking-tight">Olá, {membro!.nome}</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3.5 py-2.5 text-[13px] font-semibold text-foreground/80">
            {mesAnoCapitalizado}
          </div>
          <button type="button" className="rounded-xl bg-[#101A16] text-white px-4.5 py-2.5 text-[13px] font-bold hover:bg-primary hover:text-primary-foreground">
            Novo atendimento
          </button>
        </div>
      </header>

      <div className={`flex gap-4 items-start rounded-2xl border p-5 ${
        diagnostico.tipo === 'positivo' ? 'bg-emerald-tint border-emerald-tint-border' :
        diagnostico.tipo === 'neutro' ? 'bg-card border-border' :
        'bg-amber-tint border-amber/30'
      }`}>
        {diagnostico.tipo === 'positivo' && (
          <div className="w-[34px] h-[34px] shrink-0 rounded-[11px] bg-primary flex items-center justify-center">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4"><path d="M5 13l4 4 10-10" /></svg>
          </div>
        )}
        <div>
          <p className="font-heading text-sm font-bold mb-1">Diagnóstico</p>
          <p className="text-[13.5px] text-foreground/80 leading-relaxed max-w-[760px]">{diagnostico.mensagem}</p>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-4">
        <KpiCard
          label="Faturamento do mês"
          value={`R$ ${totalGanhos.toFixed(2)}`}
          chip={{ text: `+${transacoesCount} transações`, tone: 'primary' }}
        />
        <KpiCard
          label="Comissão do mês"
          value={`R$ ${comissaoTotal.toFixed(2)}`}
          chip={{ text: `${percentualComissaoDoTotal}% do total`, tone: 'indigo' }}
          barPercent={percentualComissaoDoTotal}
          barColor="bg-indigo"
          caption={`Serviços R$ ${(comissaoCortes + comissaoExtras).toFixed(2)} · Produtos R$ ${comissaoProdutos.toFixed(2)}`}
        />
        <KpiCard
          label="Ocupação da agenda"
          value={`${ociosidade.percentualOcupacao}%`}
          chip={{ text: statusOcupacao.text, tone: statusOcupacao.tone }}
          barPercent={ociosidade.percentualOcupacao}
          barColor={statusOcupacao.tone === 'amber' ? 'bg-amber' : 'bg-primary'}
          caption={`${horariosUsados} de ${horariosPossiveis} horários possíveis`}
        />
        <KpiCard
          label="Índice de Público-Alvo"
          value={`${distribuicaoCategorias.indicePublicoAlvo}%`}
          chip={{ text: statusPublicoAlvo, tone: distribuicaoCategorias.cabeloEBarba === 0 ? 'neutral' : 'primary' }}
          barPercent={distribuicaoCategorias.indicePublicoAlvo}
          caption="Meta ideal: 60% dos atendidos"
        />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(330px,1fr))] gap-4 items-start">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-heading text-base font-bold">Ganhos por categoria</h2>
                <p className="text-[12.5px] text-muted-foreground mt-0.5">R$ {totalGanhos.toFixed(2)} no total</p>
              </div>
            </div>

            <div className="flex flex-col gap-5">
              <div>
                <div className="flex items-baseline justify-between gap-4 mb-2">
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm bg-primary" /><span className="text-sm font-bold">Cortes</span></div>
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold tabular-nums">R$ {faturamentoCortes.toFixed(2)}</span>
                    <span className="text-[11px] font-bold text-emerald-dark bg-emerald-tint px-2 py-1 rounded-md">comissão R$ {comissaoCortes.toFixed(2)}</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${percentualCortes}%` }} /></div>
                {detalheCortes.length > 0 && (
                  <div className="mt-2.5 flex flex-col gap-0.5 text-[13px] text-foreground/70">
                    {detalheCortes.map((item) => (
                      <div key={item.id} className="flex justify-between py-1"><span>{item.nome}</span><span className="tabular-nums">{item.quantidade}x · R$ {item.valor.toFixed(2)}</span></div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-baseline justify-between gap-4 mb-2">
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm bg-muted-foreground/40" /><span className="text-sm font-bold">Serviços extras</span></div>
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold tabular-nums text-muted-foreground">R$ {faturamentoExtras.toFixed(2)}</span>
                    <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2 py-1 rounded-md">comissão R$ {comissaoExtras.toFixed(2)}</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-amber" style={{ width: `${percentualExtras}%` }} /></div>
                {detalheExtras.length > 0 && (
                  <div className="mt-2.5 flex flex-col gap-0.5 text-[13px] text-foreground/70">
                    {detalheExtras.map((item) => (
                      <div key={item.id} className="flex justify-between py-1"><span>{item.nome}</span><span className="tabular-nums">{item.quantidade}x · R$ {item.valor.toFixed(2)}</span></div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-baseline justify-between gap-4 mb-2 flex-wrap">
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm bg-indigo" /><span className="text-sm font-bold">Produtos</span></div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <span className="text-[15px] font-bold tabular-nums">R$ {faturamentoProdutos.toFixed(2)}</span>
                    <span className="text-[11px] font-bold text-indigo bg-indigo-tint px-2 py-1 rounded-md">comissão R$ {comissaoProdutos.toFixed(2)}</span>
                    <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2 py-1 rounded-md">custo R$ {custoProdutos.toFixed(2)}</span>
                    <span className="text-[11px] font-bold text-emerald-dark bg-emerald-tint px-2 py-1 rounded-md">lucro R$ {lucroProdutos.toFixed(2)}</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-indigo" style={{ width: `${percentualProdutos}%` }} /></div>
                {detalheProdutos.length > 0 && (
                  <div className="mt-2.5 flex flex-col gap-0.5 text-[13px] text-foreground/70">
                    {detalheProdutos.map((item) => (
                      <div key={item.id} className="flex justify-between py-1"><span>{item.nome}</span><span className="tabular-nums">{item.quantidade}x · R$ {item.valor.toFixed(2)}</span></div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="p-6">
              <h2 className="font-heading text-base font-bold">Perfil dos clientes</h2>
              <p className="text-[12.5px] text-muted-foreground mt-0.5">{distribuicaoCategorias.totalClassificado} visitas classificadas no mês</p>
              <div className="flex items-center gap-5 mt-5">
                <DonutChart
                  segments={[
                    { value: distribuicaoCategorias.soCabelo, color: 'var(--color-amber)' },
                    { value: distribuicaoCategorias.soBarba, color: 'var(--color-indigo)' },
                    { value: distribuicaoCategorias.cabeloEBarba, color: 'var(--color-primary)' },
                  ]}
                  centerValue={String(distribuicaoCategorias.totalClassificado)}
                  centerLabel="visitas"
                />
                <div className="flex flex-col gap-3 flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm bg-amber" /><span className="text-[13.5px] font-semibold flex-1">Só Cabelo</span><span className="text-[13px] font-bold tabular-nums">{distribuicaoCategorias.soCabelo} · {percentualSoCabelo}%</span></div>
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm bg-indigo" /><span className="text-[13.5px] font-semibold flex-1">Só Barba</span><span className="text-[13px] font-bold tabular-nums">{distribuicaoCategorias.soBarba} · {percentualSoBarba}%</span></div>
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm bg-primary" /><span className="text-[13.5px] font-semibold flex-1">Cabelo + Barba</span><span className="text-[13px] font-bold tabular-nums">{distribuicaoCategorias.cabeloEBarba} · {percentualCabeloEBarba}%</span></div>
                </div>
              </div>
              {distribuicaoCategorias.cabeloEBarba < distribuicaoCategorias.totalClassificado && (
                <div className="mt-5 p-3.5 rounded-2xl bg-amber-tint text-[12.5px] text-amber-text leading-relaxed">
                  Todo cliente atendido é oportunidade de virar <strong>Cabelo + Barba</strong>.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="font-heading text-base font-bold mb-4.5">Prospecção do mês</h2>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3.5">
                <div className="p-3.5 rounded-2xl bg-muted"><div className="text-[22px] font-extrabold tracking-tight">{prospectados}</div><div className="text-[11.5px] text-muted-foreground mt-0.5">Prospectados</div></div>
                <div className="p-3.5 rounded-2xl bg-muted"><div className="text-[22px] font-extrabold tracking-tight text-emerald-dark">{convertidosProspeccao}</div><div className="text-[11.5px] text-muted-foreground mt-0.5">Convertidos</div></div>
                <div className="p-3.5 rounded-2xl bg-muted"><div className="text-[22px] font-extrabold tracking-tight">{naoConvertidosProspeccao}</div><div className="text-[11.5px] text-muted-foreground mt-0.5">Não convertidos</div></div>
                <div className="p-3.5 rounded-2xl bg-muted"><div className="text-[22px] font-extrabold tracking-tight">R$ {faturamentoProspeccao.toFixed(2)}</div><div className="text-[11.5px] text-muted-foreground mt-0.5">Faturamento gerado</div></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-baseline gap-3 flex-wrap mb-5">
            <h2 className="font-heading text-base font-bold">Recorrência e conversão</h2>
            <span className="text-[12.5px] text-muted-foreground">Histórico completo do cliente com você, não só o mês</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-3.5 mb-5">
            <div className="p-4.5 rounded-2xl bg-muted border border-border"><div className="text-2xl font-extrabold tracking-tight">{recorrenciaSoCabelo}%</div><div className="text-xs text-muted-foreground mt-1">Só Cabelo</div></div>
            <div className="p-4.5 rounded-2xl bg-muted border border-border"><div className="text-2xl font-extrabold tracking-tight">{recorrenciaSoBarba}%</div><div className="text-xs text-muted-foreground mt-1">Só Barba</div></div>
            <div className="p-4.5 rounded-2xl bg-muted border border-border"><div className="text-2xl font-extrabold tracking-tight">{recorrenciaCabeloBarba}%</div><div className="text-xs text-muted-foreground mt-1">Cabelo + Barba</div></div>
            <div className="p-4.5 rounded-2xl bg-emerald-tint border border-emerald-tint-border"><div className="text-2xl font-extrabold tracking-tight text-emerald-dark">{recorrenciaTotal}%</div><div className="text-xs text-emerald-dark/80 mt-1">Recorrência total</div></div>
          </div>
          <div className="h-px bg-border mb-5" />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-3.5 items-center">
            <div><div className="text-2xl font-extrabold tracking-tight">{conversaoCategoriaAlvo}%</div><div className="text-xs text-muted-foreground mt-1">Converteram p/ Cabelo + Barba</div></div>
            <div><div className="text-2xl font-extrabold tracking-tight">{clientesSoCabeloForaAlvo}</div><div className="text-xs text-muted-foreground mt-1">Fora do alvo — Só Cabelo</div></div>
            <div><div className="text-2xl font-extrabold tracking-tight">{clientesSoBarbaForaAlvo}</div><div className="text-xs text-muted-foreground mt-1">Fora do alvo — Só Barba</div></div>
            <div><div className="text-2xl font-extrabold tracking-tight text-emerald-dark">{potencialConversao}%</div><div className="text-xs text-muted-foreground mt-1">Potencial de conversão</div></div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(330px,1fr))] gap-4 items-start">
        <div className="bg-sidebar-bg text-sidebar-fg rounded-2xl p-6.5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="font-heading text-base font-bold">Tempo de cadeira</h2>
          </div>
          <div className="flex items-baseline gap-2.5 mt-5 mb-2.5">
            <span className="text-[40px] font-extrabold tracking-tight">{ociosidade.percentualOcupacao}%</span>
            <span className="text-[13px] text-sidebar-muted">da sua cadeira ocupada no mês</span>
          </div>
          <div className="h-2.5 rounded-full bg-white/[0.09] overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(ociosidade.percentualOcupacao, 100)}%` }} /></div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4 mt-6.5">
            <div><div className="font-mono text-[10px] tracking-[0.12em] uppercase text-sidebar-muted">Clientes atendidos</div><div className="text-[22px] font-extrabold mt-1.5">{realizados}</div></div>
            <div><div className="font-mono text-[10px] tracking-[0.12em] uppercase text-sidebar-muted">Ganho médio / hora</div><div className="text-[22px] font-extrabold mt-1.5">R$ {ociosidade.ganhoPorHoraOcupada.toFixed(2)}</div></div>
            <div><div className="font-mono text-[10px] tracking-[0.12em] uppercase text-sidebar-muted">Estimativa perdida</div><div className="text-[22px] font-extrabold mt-1.5 text-[#FF9D8A]">R$ {ociosidade.valorPerdidoEstimado.toFixed(2)}</div><div className="text-[11.5px] text-sidebar-muted mt-0.5">≈ {ociosidade.atendimentosPerdidosEstimado} atendimentos</div></div>
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            <h2 className="font-heading text-base font-bold">Indicadores de agendamento</h2>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">Mês · não somado ao financeiro acima</p>
            <div className="flex flex-col mt-4.5">
              <div className="flex items-center justify-between py-2.5 border-b border-muted"><span className="text-[13.5px] font-semibold">Total</span><span className="text-[15px] font-extrabold tabular-nums">{totalAgendamentos}</span></div>
              <div className="flex items-center justify-between py-2.5 border-b border-muted"><span className="text-[13.5px] font-semibold text-emerald-dark">Realizados</span><span className="text-[15px] font-extrabold text-emerald-dark tabular-nums">{realizados}</span></div>
              <div className="flex items-center justify-between py-2.5 border-b border-muted"><span className="text-[13.5px] font-semibold text-foreground/70">Não compareceram</span><span className="text-[15px] font-extrabold text-muted-foreground tabular-nums">{naoCompareceram}</span></div>
              <div className="flex items-center justify-between py-2.5 border-b border-muted"><span className="text-[13.5px] font-semibold text-foreground/70">Cancelados</span><span className="text-[15px] font-extrabold text-muted-foreground tabular-nums">{cancelados}</span></div>
              <div className="flex items-center justify-between py-2.5"><span className="text-[13.5px] font-semibold text-foreground/70">Remarcados</span><span className="text-[15px] font-extrabold text-muted-foreground tabular-nums">{remarcados}</span></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {sonhosComProgresso.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-center mb-5">
              <h2 className="font-heading text-base font-bold">Sonhos</h2>
              <Link href="/painel/sonhos" className="text-xs text-primary underline">Ver todos</Link>
            </div>
            {sonhosComProgresso.map(({ sonho, valorAcumulado }) => {
              const percentualProgresso = Math.min(Math.round((valorAcumulado / sonho.valor_alvo) * 100), 100)
              return (
                <div key={sonho.id} className="mb-4 last:mb-0">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm font-semibold text-foreground/80">{sonho.nome}</span>
                    <span className="text-xs text-muted-foreground">R$ {valorAcumulado.toFixed(2)} de R$ {Number(sonho.valor_alvo).toFixed(2)}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                    <div className="bg-primary h-full rounded-full" style={{ width: `${percentualProgresso}%` }} />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
