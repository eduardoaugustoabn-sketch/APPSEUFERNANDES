import Link from 'next/link'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { calcularOciosidade } from '@/lib/ociosidade'
import { calcularDistribuicaoCategorias } from '@/lib/categoria-atendimento'
import { Card, CardContent } from '@/components/ui/card'

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
  comissao_valor: string | null
  produto_id: string
  produtos: { nome: string } | null
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
    .select('quantidade, preco_unitario, comissao_valor, produto_id, produtos(nome)')
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

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Olá, {membro!.nome}</h1>

      <div className="flex gap-4 flex-wrap mb-6">
        <Card className="flex-1 min-w-[160px]">
          <CardContent>
            <p className="text-xs uppercase text-muted-foreground">Faturamento do mês</p>
            <p className="text-2xl font-bold text-primary">R$ {totalGanhos.toFixed(2)}</p>
            {membro!.meta_faturamento_mes != null && membro!.meta_faturamento_mes > 0 && (
              <div className="mt-2">
                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden mb-1">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min((totalGanhos / membro!.meta_faturamento_mes) * 100, 100)}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {totalGanhos >= membro!.meta_faturamento_mes
                    ? 'Meta batida!'
                    : `R$ ${totalGanhos.toFixed(2)} de R$ ${membro!.meta_faturamento_mes.toFixed(2)} — faltam R$ ${(membro!.meta_faturamento_mes - totalGanhos).toFixed(2)}`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[160px]">
          <CardContent>
            <p className="text-xs uppercase text-muted-foreground">Comissão do mês</p>
            <p className="text-2xl font-bold text-primary">R$ {(comissaoCortes + comissaoExtras + comissaoProdutos).toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[160px]">
          <CardContent>
            <p className="text-xs uppercase text-muted-foreground">Ocupação da agenda</p>
            <p className="text-2xl font-bold text-primary">{ociosidade.percentualOcupacao}%</p>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[160px]">
          <CardContent>
            <p className="text-xs uppercase text-muted-foreground">Índice de Público-Alvo</p>
            <p className="text-2xl font-bold text-primary">{distribuicaoCategorias.indicePublicoAlvo}%</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-5">
        <CardContent className="p-6">
          <p className="font-heading text-base font-bold mb-5">Ganhos por categoria</p>

          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-foreground/80">Cortes</span>
              <span className="flex items-center gap-2">
                <span className="text-base font-bold">R$ {faturamentoCortes.toFixed(2)}</span>
                <span className="inline-flex items-baseline gap-1 rounded-full bg-primary/10 text-primary border border-primary/30 px-3 py-1 text-xs font-bold">
                  <span className="text-[10px] font-semibold uppercase tracking-wide opacity-75">comissão</span> R$ {comissaoCortes.toFixed(2)}
                </span>
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden mb-3">
              <div className="h-full rounded-full bg-primary" style={{ width: `${percentualCortes}%` }} />
            </div>
            {detalheCortes.length > 0 && (
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                {detalheCortes.map((item) => (
                  <div key={item.id} className="flex justify-between">
                    <span>{item.nome}</span>
                    <span>{item.quantidade}x — R$ {item.valor.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-foreground/80">Serviços extras</span>
              <span className="flex items-center gap-2">
                <span className="text-base font-bold">R$ {faturamentoExtras.toFixed(2)}</span>
                <span className="inline-flex items-baseline gap-1 rounded-full bg-primary/10 text-primary border border-primary/30 px-3 py-1 text-xs font-bold">
                  <span className="text-[10px] font-semibold uppercase tracking-wide opacity-75">comissão</span> R$ {comissaoExtras.toFixed(2)}
                </span>
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden mb-3">
              <div className="h-full rounded-full bg-amber-500" style={{ width: `${percentualExtras}%` }} />
            </div>
            {detalheExtras.length > 0 && (
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                {detalheExtras.map((item) => (
                  <div key={item.id} className="flex justify-between">
                    <span>{item.nome}</span>
                    <span>{item.quantidade}x — R$ {item.valor.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-foreground/80">Produtos</span>
              <span className="flex items-center gap-2">
                <span className="text-base font-bold">R$ {faturamentoProdutos.toFixed(2)}</span>
                <span className="inline-flex items-baseline gap-1 rounded-full bg-primary/10 text-primary border border-primary/30 px-3 py-1 text-xs font-bold">
                  <span className="text-[10px] font-semibold uppercase tracking-wide opacity-75">comissão</span> R$ {comissaoProdutos.toFixed(2)}
                </span>
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden mb-3">
              <div className="h-full rounded-full bg-indigo-500" style={{ width: `${percentualProdutos}%` }} />
            </div>
            {detalheProdutos.length > 0 && (
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                {detalheProdutos.map((item) => (
                  <div key={item.id} className="flex justify-between">
                    <span>{item.nome}</span>
                    <span>{item.quantidade}x — R$ {item.valor.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-6">
          <p className="font-heading text-base font-bold">Perfil dos clientes atendidos (mês)</p>
          <p className="text-xs text-muted-foreground mb-5">{distribuicaoCategorias.totalClassificado} visitas classificadas</p>

          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-foreground/80">Só Cabelo</span>
              <span className="text-base font-bold">{distribuicaoCategorias.soCabelo} <span className="text-muted-foreground font-semibold">({percentualSoCabelo}%)</span></span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div className="h-full rounded-full bg-amber-500" style={{ width: `${percentualSoCabelo}%` }} />
            </div>
          </div>

          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-foreground/80">Só Barba</span>
              <span className="text-base font-bold">{distribuicaoCategorias.soBarba} <span className="text-muted-foreground font-semibold">({percentualSoBarba}%)</span></span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div className="h-full rounded-full bg-indigo-500" style={{ width: `${percentualSoBarba}%` }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-foreground/80">Cabelo + Barba</span>
              <span className="text-base font-bold">{distribuicaoCategorias.cabeloEBarba} <span className="text-muted-foreground font-semibold">({percentualCabeloEBarba}%)</span></span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${percentualCabeloEBarba}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-6">
          <p className="font-heading text-base font-bold mb-5">Tempo de cadeira (mês)</p>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-3xl font-bold text-primary">{ociosidade.percentualOcupacao}%</span>
            <span className="text-sm text-muted-foreground">ocupado no mês</span>
          </div>
          <div className="w-full bg-muted rounded-full h-7 overflow-hidden mb-5">
            <div className="bg-primary h-full rounded-full flex items-center justify-end pr-3" style={{ width: `${ociosidade.percentualOcupacao}%` }}>
              <span className="text-primary-foreground text-xs font-bold">{ociosidade.percentualOcupacao}%</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Clientes atendidos</p>
              <p className="text-lg font-bold">{realizados}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Ganho médio / hora ocupada</p>
              <p className="text-lg font-bold">R$ {ociosidade.ganhoPorHoraOcupada.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Estimativa perdida no mês</p>
              <p className="text-lg font-bold">
                R$ {ociosidade.valorPerdidoEstimado.toFixed(2)}
                <span className="block text-xs font-semibold text-destructive mt-0.5">≈ {ociosidade.atendimentosPerdidosEstimado} atendimentos</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-6">
          <p className="font-heading text-base font-bold mb-5">Indicadores de agendamento (mês) <span className="font-normal text-muted-foreground text-sm">— não somado ao financeiro acima</span></p>
          <div className="grid grid-cols-5 gap-5 text-center">
            <div><p className="text-2xl font-bold">{totalAgendamentos}</p><p className="text-xs text-muted-foreground mt-1">Total</p></div>
            <div><p className="text-2xl font-bold text-primary">{realizados}</p><p className="text-xs text-muted-foreground mt-1">Realizados</p></div>
            <div><p className="text-2xl font-bold">{naoCompareceram}</p><p className="text-xs text-muted-foreground mt-1">Não compareceram</p></div>
            <div><p className="text-2xl font-bold">{cancelados}</p><p className="text-xs text-muted-foreground mt-1">Cancelados</p></div>
            <div><p className="text-2xl font-bold">{remarcados}</p><p className="text-xs text-muted-foreground mt-1">Remarcados</p></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <p className="font-heading text-base font-bold mb-5">Prospecção (mês)</p>
          <div className="grid grid-cols-4 gap-5 text-center">
            <div><p className="text-2xl font-bold">{prospectados}</p><p className="text-xs text-muted-foreground mt-1">Prospectados</p></div>
            <div><p className="text-2xl font-bold text-primary">{convertidosProspeccao}</p><p className="text-xs text-muted-foreground mt-1">Convertidos</p></div>
            <div><p className="text-2xl font-bold">{naoConvertidosProspeccao}</p><p className="text-xs text-muted-foreground mt-1">Não convertidos</p></div>
            <div><p className="text-2xl font-bold">R$ {faturamentoProspeccao.toFixed(2)}</p><p className="text-xs text-muted-foreground mt-1">Faturamento gerado</p></div>
          </div>
        </CardContent>
      </Card>

      {sonhosComProgresso.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-center mb-5">
              <p className="font-heading text-base font-bold">Sonhos</p>
              <Link href="/painel/sonhos" className="text-xs text-primary underline">Ver todos</Link>
            </div>
            {sonhosComProgresso.map(({ sonho, valorAcumulado }) => {
              const percentualProgresso = Math.min(Math.round((valorAcumulado / sonho.valor_alvo) * 100), 100)
              return (
                <div key={sonho.id} className="mb-4 last:mb-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-semibold text-foreground/80">{sonho.nome}</span>
                    <span className="text-xs text-muted-foreground">
                      R$ {valorAcumulado.toFixed(2)} de R$ {Number(sonho.valor_alvo).toFixed(2)}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
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
