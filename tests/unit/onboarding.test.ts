import { describe, it, expect } from 'vitest'
import { calcularModulosOnboarding } from '@/lib/onboarding'

describe('calcularModulosOnboarding', () => {
  it('never blocks the first module', () => {
    const modulos = calcularModulosOnboarding([{ id: '1', nome: 'Módulo A', descricao: null }], [])
    expect(modulos[0]).toMatchObject({ status: 'Não iniciado', bloqueado: false })
  })

  it('blocks the next module until the previous one is aprovado', () => {
    const processos = [
      { id: '1', nome: 'Módulo A', descricao: null },
      { id: '2', nome: 'Módulo B', descricao: null },
    ]
    const modulos = calcularModulosOnboarding(processos, [])
    expect(modulos[0].bloqueado).toBe(false)
    expect(modulos[1].bloqueado).toBe(true)
  })

  it('unlocks the next module once the previous one is aprovado', () => {
    const processos = [
      { id: '1', nome: 'Módulo A', descricao: null },
      { id: '2', nome: 'Módulo B', descricao: null },
    ]
    const tentativas = [{ processo_id: '1', nota_percentual: 80, aprovado: true }]
    const modulos = calcularModulosOnboarding(processos, tentativas)
    expect(modulos[0].status).toBe('Aprovado')
    expect(modulos[1].bloqueado).toBe(false)
  })

  it('keeps the next module blocked when the previous one was reprovado', () => {
    const processos = [
      { id: '1', nome: 'Módulo A', descricao: null },
      { id: '2', nome: 'Módulo B', descricao: null },
    ]
    const tentativas = [{ processo_id: '1', nota_percentual: 40, aprovado: false }]
    const modulos = calcularModulosOnboarding(processos, tentativas)
    expect(modulos[0].status).toBe('Reprovado')
    expect(modulos[1].bloqueado).toBe(true)
  })

  it('uses the most recent tentativa when more than one exists for a module', () => {
    const processos = [{ id: '1', nome: 'Módulo A', descricao: null }]
    // tentativas chega ordenada mais recente primeiro, como na query real
    const tentativas = [
      { processo_id: '1', nota_percentual: 90, aprovado: true },
      { processo_id: '1', nota_percentual: 40, aprovado: false },
    ]
    const modulos = calcularModulosOnboarding(processos, tentativas)
    expect(modulos[0]).toMatchObject({ status: 'Aprovado', nota: 90 })
  })

  it('propagates blocking across three sequential modules', () => {
    const processos = [
      { id: '1', nome: 'A', descricao: null },
      { id: '2', nome: 'B', descricao: null },
      { id: '3', nome: 'C', descricao: null },
    ]
    const tentativas = [{ processo_id: '1', nota_percentual: 100, aprovado: true }]
    const modulos = calcularModulosOnboarding(processos, tentativas)
    expect(modulos.map((m) => m.bloqueado)).toEqual([false, false, true])
  })
})
