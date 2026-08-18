import { describe, it, expect } from 'vitest'
import { calcularDistribuicaoCategorias } from '@/lib/categoria-atendimento'

describe('calcularDistribuicaoCategorias', () => {
  it('classifies a visit with only cabelo services as Só Cabelo', () => {
    const result = calcularDistribuicaoCategorias([
      { agendamentoId: 'a1', categoriaServico: 'cabelo' },
    ])
    expect(result).toEqual({ soCabelo: 1, soBarba: 0, cabeloEBarba: 0, totalClassificado: 1, indicePublicoAlvo: 0 })
  })

  it('classifies a visit with only barba services as Só Barba', () => {
    const result = calcularDistribuicaoCategorias([
      { agendamentoId: 'a1', categoriaServico: 'barba' },
    ])
    expect(result).toEqual({ soCabelo: 0, soBarba: 1, cabeloEBarba: 0, totalClassificado: 1, indicePublicoAlvo: 0 })
  })

  it('classifies a visit with both cabelo and barba services as Cabelo + Barba', () => {
    const result = calcularDistribuicaoCategorias([
      { agendamentoId: 'a1', categoriaServico: 'cabelo' },
      { agendamentoId: 'a1', categoriaServico: 'barba' },
    ])
    expect(result).toEqual({ soCabelo: 0, soBarba: 0, cabeloEBarba: 1, totalClassificado: 1, indicePublicoAlvo: 100 })
  })

  it('ignores outro services when deciding a visit that also has cabelo/barba', () => {
    const result = calcularDistribuicaoCategorias([
      { agendamentoId: 'a1', categoriaServico: 'cabelo' },
      { agendamentoId: 'a1', categoriaServico: 'outro' },
    ])
    expect(result).toEqual({ soCabelo: 1, soBarba: 0, cabeloEBarba: 0, totalClassificado: 1, indicePublicoAlvo: 0 })
  })

  it('excludes a visit with only outro services from the total', () => {
    const result = calcularDistribuicaoCategorias([
      { agendamentoId: 'a1', categoriaServico: 'outro' },
    ])
    expect(result).toEqual({ soCabelo: 0, soBarba: 0, cabeloEBarba: 0, totalClassificado: 0, indicePublicoAlvo: 0 })
  })

  it('aggregates multiple visits and computes the índice de público-alvo', () => {
    const result = calcularDistribuicaoCategorias([
      { agendamentoId: 'a1', categoriaServico: 'cabelo' },
      { agendamentoId: 'a2', categoriaServico: 'barba' },
      { agendamentoId: 'a3', categoriaServico: 'cabelo' },
      { agendamentoId: 'a3', categoriaServico: 'barba' },
      { agendamentoId: 'a4', categoriaServico: 'cabelo' },
      { agendamentoId: 'a4', categoriaServico: 'barba' },
    ])
    expect(result).toEqual({ soCabelo: 1, soBarba: 1, cabeloEBarba: 2, totalClassificado: 4, indicePublicoAlvo: 50 })
  })

  it('returns all zeros for an empty list, with no division by zero', () => {
    const result = calcularDistribuicaoCategorias([])
    expect(result).toEqual({ soCabelo: 0, soBarba: 0, cabeloEBarba: 0, totalClassificado: 0, indicePublicoAlvo: 0 })
  })

  it('is robust to out-of-order/interleaved entries across visits', () => {
    const result = calcularDistribuicaoCategorias([
      { agendamentoId: 'a1', categoriaServico: 'cabelo' },
      { agendamentoId: 'a2', categoriaServico: 'barba' },
      { agendamentoId: 'a1', categoriaServico: 'barba' },
      { agendamentoId: 'a2', categoriaServico: 'cabelo' },
    ])
    expect(result).toEqual({ soCabelo: 0, soBarba: 0, cabeloEBarba: 2, totalClassificado: 2, indicePublicoAlvo: 100 })
  })

  it('excludes an outro-only visit from totalClassificado even alongside classifiable visits', () => {
    const result = calcularDistribuicaoCategorias([
      { agendamentoId: 'a1', categoriaServico: 'outro' },
      { agendamentoId: 'a2', categoriaServico: 'cabelo' },
      { agendamentoId: 'a3', categoriaServico: 'cabelo' },
      { agendamentoId: 'a3', categoriaServico: 'barba' },
    ])
    expect(result).toEqual({ soCabelo: 1, soBarba: 0, cabeloEBarba: 1, totalClassificado: 2, indicePublicoAlvo: 50 })
  })

  it('rounds a non-round percentage (1 of 3 classified visits is Cabelo + Barba)', () => {
    const result = calcularDistribuicaoCategorias([
      { agendamentoId: 'a1', categoriaServico: 'cabelo' },
      { agendamentoId: 'a1', categoriaServico: 'barba' },
      { agendamentoId: 'a2', categoriaServico: 'cabelo' },
      { agendamentoId: 'a3', categoriaServico: 'barba' },
    ])
    expect(result).toEqual({ soCabelo: 1, soBarba: 1, cabeloEBarba: 1, totalClassificado: 3, indicePublicoAlvo: 33 })
  })
})
