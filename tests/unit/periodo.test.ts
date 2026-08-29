import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolverPeriodo } from '@/lib/periodo'

describe('resolverPeriodo', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('defaults to este_mes when periodo is absent', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 15)) // 15 de agosto de 2026
    const resultado = resolverPeriodo({})
    expect(resultado).toEqual({
      preset: 'este_mes',
      inicio: '2026-08-01',
      fim: '2026-08-15',
      label: 'Agosto de 2026',
    })
  })

  it('resolves mes_passado crossing a year boundary (janeiro -> dezembro do ano anterior)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 10)) // 10 de janeiro de 2026
    const resultado = resolverPeriodo({ periodo: 'mes_passado' })
    expect(resultado).toEqual({
      preset: 'mes_passado',
      inicio: '2025-12-01',
      fim: '2025-12-31',
      label: 'Dezembro de 2025',
    })
  })

  it('resolves mes_passado across months with different day counts (março -> fevereiro)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 5)) // 5 de março de 2026 (2026 não é bissexto)
    const resultado = resolverPeriodo({ periodo: 'mes_passado' })
    expect(resultado).toEqual({
      preset: 'mes_passado',
      inicio: '2026-02-01',
      fim: '2026-02-28',
      label: 'Fevereiro de 2026',
    })
  })

  it('accepts a valid personalizado range', () => {
    const resultado = resolverPeriodo({ periodo: 'personalizado', inicio: '2026-05-10', fim: '2026-05-20' })
    expect(resultado).toEqual({
      preset: 'personalizado',
      inicio: '2026-05-10',
      fim: '2026-05-20',
      label: '10/05/2026 a 20/05/2026',
    })
  })

  it('falls back to este_mes when personalizado has inicio after fim', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 15))
    const resultado = resolverPeriodo({ periodo: 'personalizado', inicio: '2026-05-20', fim: '2026-05-10' })
    expect(resultado.preset).toBe('este_mes')
  })

  it('falls back to este_mes when personalizado is missing inicio/fim', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 15))
    const resultado = resolverPeriodo({ periodo: 'personalizado' })
    expect(resultado.preset).toBe('este_mes')
  })

  it('falls back to este_mes for an unknown periodo value', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 15))
    const resultado = resolverPeriodo({ periodo: 'bagunca' })
    expect(resultado.preset).toBe('este_mes')
  })

  it('falls back to este_mes when personalizado inicio has an invalid format', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 15))
    const resultado = resolverPeriodo({ periodo: 'personalizado', inicio: 'abc', fim: '2026-05-20' })
    expect(resultado.preset).toBe('este_mes')
  })

  it('falls back to este_mes when personalizado has a non-existent calendar date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 15))
    // 2026-02-30 não existe (fevereiro de 2026 tem 28 dias) — o Date do JS
    // "rolaria" isso para 2 de março, então precisa ser rejeitado
    // explicitamente em vez de aceito silenciosamente com a data errada.
    const resultado = resolverPeriodo({ periodo: 'personalizado', inicio: '2026-02-30', fim: '2026-05-20' })
    expect(resultado.preset).toBe('este_mes')
  })

  it('falls back to este_mes when personalizado range exceeds 366 days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 15))
    const resultado = resolverPeriodo({ periodo: 'personalizado', inicio: '2020-01-01', fim: '2026-05-20' })
    expect(resultado.preset).toBe('este_mes')
  })
})
