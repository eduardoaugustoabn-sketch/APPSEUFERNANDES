import { describe, it, expect } from 'vitest'
import { calcularOciosidade } from '@/lib/ociosidade'

describe('calcularOciosidade', () => {
  it('calculates occupancy, hourly earnings, and estimated lost revenue', () => {
    const result = calcularOciosidade({
      minutosDisponiveis: 480, // 8h
      minutosOcupados: 336,    // 5h36 = 70%
      faturamentoServicos: 420,
      quantidadeAtendimentos: 8, // média de 42min por atendimento
    })
    expect(result.percentualOcupacao).toBe(70)
    expect(result.ganhoPorHoraOcupada).toBe(75)
    expect(result.valorPerdidoEstimado).toBe(180) // 2.4h ociosas * R$75/h
    expect(result.atendimentosPerdidosEstimado).toBe(3) // 144min ociosos / 42min ≈ 3.43 → 3
  })

  it('returns zeros when there is no available time', () => {
    const result = calcularOciosidade({ minutosDisponiveis: 0, minutosOcupados: 0, faturamentoServicos: 0, quantidadeAtendimentos: 0 })
    expect(result).toEqual({ percentualOcupacao: 0, ganhoPorHoraOcupada: 0, valorPerdidoEstimado: 0, atendimentosPerdidosEstimado: 0 })
  })

  it('returns zero atendimentos perdidos when there were no atendimentos to average duration from', () => {
    const result = calcularOciosidade({ minutosDisponiveis: 480, minutosOcupados: 0, faturamentoServicos: 0, quantidadeAtendimentos: 0 })
    expect(result.atendimentosPerdidosEstimado).toBe(0)
  })
})
