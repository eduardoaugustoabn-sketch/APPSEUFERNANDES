export type ModuloOnboardingStatus = {
  id: string
  nome: string
  descricao: string | null
  status: 'Não iniciado' | 'Aprovado' | 'Reprovado'
  nota: number | null
  bloqueado: boolean
}

type ProcessoBase = { id: string; nome: string; descricao: string | null }
type TentativaBase = { processo_id: string; nota_percentual: number; aprovado: boolean }

/**
 * `processos` deve vir ordenado por `ordem` (módulo 1, 2, 3...) e
 * `tentativas` ordenado por mais recente primeiro, para que o `.find`
 * abaixo pegue a última tentativa de cada processo.
 */
export function calcularModulosOnboarding(processos: ProcessoBase[], tentativas: TentativaBase[]): ModuloOnboardingStatus[] {
  let anteriorAprovado = true
  return processos.map((p) => {
    const ultima = tentativas.find((t) => t.processo_id === p.id)
    const status = ultima ? (ultima.aprovado ? 'Aprovado' : 'Reprovado') : 'Não iniciado'
    const bloqueado = !anteriorAprovado
    anteriorAprovado = status === 'Aprovado'
    return { id: p.id, nome: p.nome, descricao: p.descricao, status, nota: ultima?.nota_percentual ?? null, bloqueado }
  })
}
