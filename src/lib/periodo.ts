export type PeriodoPreset = 'este_mes' | 'mes_passado' | 'personalizado'

export type Periodo = {
  preset: PeriodoPreset
  inicio: string
  fim: string
  label: string
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function periodoEsteMes(): Periodo {
  const hoje = new Date()
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10)
  const fim = hoje.toISOString().slice(0, 10)
  const label = capitalizar(hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))
  return { preset: 'este_mes', inicio, fim, label }
}

function periodoMesPassado(): Periodo {
  const hoje = new Date()
  const inicioDate = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
  const fimDate = new Date(hoje.getFullYear(), hoje.getMonth(), 0)
  const inicio = inicioDate.toISOString().slice(0, 10)
  const fim = fimDate.toISOString().slice(0, 10)
  const label = capitalizar(inicioDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))
  return { preset: 'mes_passado', inicio, fim, label }
}

function paraBr(dataIso: string): string {
  return dataIso.split('-').reverse().join('/')
}

export function resolverPeriodo(searchParams: { [key: string]: string | string[] | undefined }): Periodo {
  const presetRaw = searchParams.periodo
  const preset = typeof presetRaw === 'string' ? presetRaw : undefined

  if (preset === 'mes_passado') return periodoMesPassado()

  if (preset === 'personalizado') {
    const inicioRaw = searchParams.inicio
    const fimRaw = searchParams.fim
    const inicio = typeof inicioRaw === 'string' ? inicioRaw : undefined
    const fim = typeof fimRaw === 'string' ? fimRaw : undefined
    if (inicio && fim && inicio <= fim) {
      return { preset: 'personalizado', inicio, fim, label: `${paraBr(inicio)} a ${paraBr(fim)}` }
    }
  }

  return periodoEsteMes()
}
