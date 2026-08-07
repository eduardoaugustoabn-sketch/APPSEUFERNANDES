export function calcularOciosidade(input: {
  minutosDisponiveis: number
  minutosOcupados: number
  faturamentoServicos: number
}): { percentualOcupacao: number; ganhoPorHoraOcupada: number; valorPerdidoEstimado: number } {
  const { minutosDisponiveis, minutosOcupados, faturamentoServicos } = input

  if (minutosDisponiveis <= 0) {
    return { percentualOcupacao: 0, ganhoPorHoraOcupada: 0, valorPerdidoEstimado: 0 }
  }

  const percentualOcupacao = Math.min(minutosOcupados / minutosDisponiveis, 1) * 100
  const horasOcupadas = minutosOcupados / 60
  const ganhoPorHoraOcupada = horasOcupadas > 0 ? faturamentoServicos / horasOcupadas : 0
  const minutosOciosos = Math.max(minutosDisponiveis - minutosOcupados, 0)
  const valorPerdidoEstimado = (minutosOciosos / 60) * ganhoPorHoraOcupada

  return {
    percentualOcupacao: Math.round(percentualOcupacao * 10) / 10,
    ganhoPorHoraOcupada: Math.round(ganhoPorHoraOcupada * 100) / 100,
    valorPerdidoEstimado: Math.round(valorPerdidoEstimado * 100) / 100,
  }
}
