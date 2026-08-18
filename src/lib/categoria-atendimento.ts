export type CategoriaServico = 'cabelo' | 'barba' | 'outro'

export type AtendimentoParaCategoria = {
  agendamentoId: string
  categoriaServico: CategoriaServico
}

export type DistribuicaoCategorias = {
  soCabelo: number
  soBarba: number
  cabeloEBarba: number
  totalClassificado: number
  indicePublicoAlvo: number
}

export function calcularDistribuicaoCategorias(atendimentos: AtendimentoParaCategoria[]): DistribuicaoCategorias {
  const categoriasPorVisita = new Map<string, Set<CategoriaServico>>()
  for (const { agendamentoId, categoriaServico } of atendimentos) {
    if (categoriaServico === 'outro') continue
    const categorias = categoriasPorVisita.get(agendamentoId) ?? new Set<CategoriaServico>()
    categorias.add(categoriaServico)
    categoriasPorVisita.set(agendamentoId, categorias)
  }

  let soCabelo = 0
  let soBarba = 0
  let cabeloEBarba = 0

  for (const categorias of categoriasPorVisita.values()) {
    const temCabelo = categorias.has('cabelo')
    const temBarba = categorias.has('barba')
    if (temCabelo && temBarba) cabeloEBarba++
    else if (temCabelo) soCabelo++
    else if (temBarba) soBarba++
  }

  const totalClassificado = soCabelo + soBarba + cabeloEBarba
  const indicePublicoAlvo = totalClassificado > 0 ? Math.round((cabeloEBarba / totalClassificado) * 100) : 0

  return { soCabelo, soBarba, cabeloEBarba, totalClassificado, indicePublicoAlvo }
}
