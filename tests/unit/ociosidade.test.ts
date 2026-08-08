import { describe, it, expect } from 'vitest'
import { calcularOciosidade } from '@/lib/ociosidade'

describe('calcularOciosidade', () => {
  it('calculates occupancy, hourly earnings, and estimated lost revenue', () => {
    const result = calcularOciosidade({
      minutosDisponiveis: 480, // 8h
      minutosOcupados: 336,    // 5h36 = 70%
      faturamentoServicos: 420,
    })
    expect(result.percentualOcupacao).toBe(70)
    expect(result.ganhoPorHoraOcupada).toBe(75)
    expect(result.valorPerdidoEstimado).toBe(180) // 2.4h ociosas * R$75/h
  })

  it('returns zeros when there is no available time', () => {
    const result = calcularOciosidade({ minutosDisponiveis: 0, minutosOcupados: 0, faturamentoServicos: 0 })
    expect(result).toEqual({ percentualOcupacao: 0, ganhoPorHoraOcupada: 0, valorPerdidoEstimado: 0 })
  })
})
