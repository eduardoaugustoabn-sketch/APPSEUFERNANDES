const PASSO_MINUTOS = 30

export function gerarSlots(horaInicio: string, horaFim: string): string[] {
  const slots: string[] = []
  let atual = horaInicio.slice(0, 5)
  const fim = horaFim.slice(0, 5)
  while (atual < fim) {
    slots.push(`${atual}:00`)
    const [h, m] = atual.split(':').map(Number)
    const totalMin = h * 60 + m + PASSO_MINUTOS
    atual = `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`
  }
  return slots
}

export function statusDoSlot<
  B extends { hora_inicio: string; hora_fim: string; motivo: string | null },
  A extends { hora_inicio: string; hora_fim: string },
  E extends { hora_inicio: string; hora_fim: string },
>(slot: string, bloqueios: B[], agendamentos: A[], expedientes: E[]):
  | { tipo: 'bloqueado'; bloqueio: B }
  | { tipo: 'ocupado'; agendamentos: A[] }
  | { tipo: 'fora_do_expediente' }
  | { tipo: 'livre' } {
  const bloqueio = bloqueios.find((b) => b.hora_inicio.slice(0, 5) <= slot.slice(0, 5) && slot.slice(0, 5) < b.hora_fim.slice(0, 5))
  if (bloqueio) return { tipo: 'bloqueado', bloqueio }
  const doSlot = agendamentos.filter((a) => a.hora_inicio.slice(0, 5) <= slot.slice(0, 5) && slot.slice(0, 5) < a.hora_fim.slice(0, 5))
  if (doSlot.length > 0) return { tipo: 'ocupado', agendamentos: doSlot }
  const dentroDoExpediente = expedientes.some((e) => e.hora_inicio.slice(0, 5) <= slot.slice(0, 5) && slot.slice(0, 5) < e.hora_fim.slice(0, 5))
  if (!dentroDoExpediente) return { tipo: 'fora_do_expediente' }
  return { tipo: 'livre' }
}
