export type TipoDiagnostico = 'ocupacao_alta_alvo_baixo' | 'ticket_baixo_so_cabelo' | 'ticket_baixo_so_barba' | 'positivo' | 'neutro'

export type Diagnostico = {
  tipo: TipoDiagnostico
  mensagem: string
}

const MENSAGENS: Record<TipoDiagnostico, string> = {
  ocupacao_alta_alvo_baixo: 'Sua agenda apresenta alta ocupação, porém a participação de clientes Cabelo + Barba está abaixo do esperado. Avalie estratégias para converter clientes de Só Cabelo e Só Barba para o serviço completo.',
  ticket_baixo_so_cabelo: 'Seu ticket médio está abaixo da média da barbearia. Uma das oportunidades identificadas é aumentar a conversão de clientes Só Cabelo para Cabelo + Barba.',
  ticket_baixo_so_barba: 'Seu ticket médio está abaixo da média da barbearia e existe alta concentração de clientes que realizam apenas barba. Trabalhe oportunidades de conversão para Cabelo + Barba.',
  positivo: 'Excelente desempenho. Sua ocupação está acompanhada de uma boa concentração no público-alvo e isso está contribuindo para seu ticket e faturamento.',
  neutro: 'Nenhum ponto de atenção identificado no momento. Continue acompanhando seus indicadores ao longo do mês.',
}

export function calcularDiagnostico(input: {
  percentualOcupacao: number
  indicePublicoAlvo: number
  ticketMedio: number
  mediaTicketBarbearia: number | null
  percentualSoCabelo: number
  percentualSoBarba: number
}): Diagnostico {
  const { percentualOcupacao, indicePublicoAlvo, ticketMedio, mediaTicketBarbearia, percentualSoCabelo, percentualSoBarba } = input
  const ticketAbaixoDaMedia = mediaTicketBarbearia !== null && ticketMedio < mediaTicketBarbearia

  let tipo: TipoDiagnostico
  if (percentualOcupacao >= 80 && indicePublicoAlvo < 40) {
    tipo = 'ocupacao_alta_alvo_baixo'
  } else if (ticketAbaixoDaMedia && percentualSoCabelo >= 50) {
    tipo = 'ticket_baixo_so_cabelo'
  } else if (ticketAbaixoDaMedia && percentualSoBarba >= 50) {
    tipo = 'ticket_baixo_so_barba'
  } else if (percentualOcupacao >= 80 && indicePublicoAlvo >= 60) {
    tipo = 'positivo'
  } else {
    tipo = 'neutro'
  }

  return { tipo, mensagem: MENSAGENS[tipo] }
}
