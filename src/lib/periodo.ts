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

const FORMATO_DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

// Valida que `data` está no formato YYYY-MM-DD E que representa um dia de
// calendário real (rejeita algo como "2026-02-30" — o Date do JS "rola" essa
// data para 2 de março, então reconvertemos para ISO e comparamos com a
// string original para pegar esse caso).
function ehDataIsoValida(data: string): boolean {
  if (!FORMATO_DATA_ISO.test(data)) return false
  const d = new Date(`${data}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return false
  return d.toISOString().slice(0, 10) === data
}

const MAX_DIAS_PERSONALIZADO = 366

function diasEntre(inicio: string, fim: string): number {
  const ms = new Date(`${fim}T00:00:00Z`).getTime() - new Date(`${inicio}T00:00:00Z`).getTime()
  return ms / (1000 * 60 * 60 * 24)
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
    if (
      inicio &&
      fim &&
      ehDataIsoValida(inicio) &&
      ehDataIsoValida(fim) &&
      inicio <= fim &&
      diasEntre(inicio, fim) <= MAX_DIAS_PERSONALIZADO
    ) {
      return { preset: 'personalizado', inicio, fim, label: `${paraBr(inicio)} a ${paraBr(fim)}` }
    }
  }

  return periodoEsteMes()
}
