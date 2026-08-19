import { describe, it, expect } from 'vitest'
import { calcularDiagnostico } from '@/lib/diagnostico'

describe('calcularDiagnostico', () => {
  it('flags ocupacao_alta_alvo_baixo when occupancy is high but público-alvo is low', () => {
    const result = calcularDiagnostico({
      percentualOcupacao: 85,
      indicePublicoAlvo: 30,
      ticketMedio: 100,
      mediaTicketBarbearia: 150,
      percentualSoCabelo: 10,
      percentualSoBarba: 10,
    })
    expect(result).toEqual({
      tipo: 'ocupacao_alta_alvo_baixo',
      mensagem: 'Sua agenda apresenta alta ocupação, porém a participação de clientes Cabelo + Barba está abaixo do esperado. Avalie estratégias para converter clientes de Só Cabelo e Só Barba para o serviço completo.',
    })
  })

  it('flags ticket_baixo_so_cabelo when ticket is below the barbearia average and só-cabelo dominates', () => {
    const result = calcularDiagnostico({
      percentualOcupacao: 50,
      indicePublicoAlvo: 50,
      ticketMedio: 80,
      mediaTicketBarbearia: 100,
      percentualSoCabelo: 60,
      percentualSoBarba: 10,
    })
    expect(result).toEqual({
      tipo: 'ticket_baixo_so_cabelo',
      mensagem: 'Seu ticket médio está abaixo da média da barbearia. Uma das oportunidades identificadas é aumentar a conversão de clientes Só Cabelo para Cabelo + Barba.',
    })
  })

  it('flags ticket_baixo_so_barba when ticket is below the barbearia average and só-barba dominates', () => {
    const result = calcularDiagnostico({
      percentualOcupacao: 50,
      indicePublicoAlvo: 50,
      ticketMedio: 80,
      mediaTicketBarbearia: 100,
      percentualSoCabelo: 10,
      percentualSoBarba: 60,
    })
    expect(result).toEqual({
      tipo: 'ticket_baixo_so_barba',
      mensagem: 'Seu ticket médio está abaixo da média da barbearia e existe alta concentração de clientes que realizam apenas barba. Trabalhe oportunidades de conversão para Cabelo + Barba.',
    })
  })

  it('flags positivo when occupancy is high and público-alvo is high', () => {
    const result = calcularDiagnostico({
      percentualOcupacao: 90,
      indicePublicoAlvo: 70,
      ticketMedio: 200,
      mediaTicketBarbearia: 100,
      percentualSoCabelo: 0,
      percentualSoBarba: 0,
    })
    expect(result).toEqual({
      tipo: 'positivo',
      mensagem: 'Excelente desempenho. Sua ocupação está acompanhada de uma boa concentração no público-alvo e isso está contribuindo para seu ticket e faturamento.',
    })
  })

  it('falls back to neutro when no condition matches', () => {
    const result = calcularDiagnostico({
      percentualOcupacao: 50,
      indicePublicoAlvo: 50,
      ticketMedio: 100,
      mediaTicketBarbearia: 100,
      percentualSoCabelo: 0,
      percentualSoBarba: 0,
    })
    expect(result).toEqual({
      tipo: 'neutro',
      mensagem: 'Nenhum ponto de atenção identificado no momento. Continue acompanhando seus indicadores ao longo do mês.',
    })
  })

  it('prioritizes ocupacao_alta_alvo_baixo over ticket_baixo_so_cabelo when both would match', () => {
    const result = calcularDiagnostico({
      percentualOcupacao: 85,
      indicePublicoAlvo: 30,
      ticketMedio: 50,
      mediaTicketBarbearia: 100,
      percentualSoCabelo: 80,
      percentualSoBarba: 0,
    })
    expect(result.tipo).toBe('ocupacao_alta_alvo_baixo')
  })

  it('never triggers ticket-baixo conditions when mediaTicketBarbearia is null, even with high percentuais', () => {
    const result = calcularDiagnostico({
      percentualOcupacao: 50,
      indicePublicoAlvo: 50,
      ticketMedio: 10,
      mediaTicketBarbearia: null,
      percentualSoCabelo: 90,
      percentualSoBarba: 90,
    })
    expect(result.tipo).toBe('neutro')
  })
})
