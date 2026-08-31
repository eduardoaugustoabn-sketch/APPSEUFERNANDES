'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { TableRow, TableCell } from '@/components/ui/table'

type Processo = { id: string; nome: string; descricao: string | null; ativo: boolean; ordem: number }
type Vizinho = { id: string; ordem: number } | null

export function ProcessoOnboardingRow({ processo, numero, anterior, proximo }: { processo: Processo; numero: number; anterior: Vizinho; proximo: Vizinho }) {
  const router = useRouter()

  async function alternarAtivo() {
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase.from('processos_onboarding').update({ ativo: !processo.ativo }).eq('id', processo.id)
    if (error) {
      alert(error.message)
      return
    }
    router.refresh()
  }

  async function mover(vizinho: Vizinho) {
    if (!vizinho) return
    const supabase = getBrowserSupabaseClient()
    const { error: erroAtual } = await supabase.from('processos_onboarding').update({ ordem: vizinho.ordem }).eq('id', processo.id)
    if (erroAtual) {
      alert(erroAtual.message)
      return
    }
    const { error: erroVizinho } = await supabase.from('processos_onboarding').update({ ordem: processo.ordem }).eq('id', vizinho.id)
    if (erroVizinho) {
      alert(erroVizinho.message)
      return
    }
    router.refresh()
  }

  return (
    <TableRow className={processo.ativo ? '' : 'opacity-50'}>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground w-4">{numero}</span>
          <Button type="button" variant="outline" size="icon-sm" onClick={() => mover(anterior)} disabled={!anterior} aria-label="Mover para cima">↑</Button>
          <Button type="button" variant="outline" size="icon-sm" onClick={() => mover(proximo)} disabled={!proximo} aria-label="Mover para baixo">↓</Button>
        </div>
      </TableCell>
      <TableCell><Link href={`/admin/onboarding/${processo.id}`} className="text-primary underline">{processo.nome}</Link></TableCell>
      <TableCell>{processo.descricao ?? '—'}</TableCell>
      <TableCell>
        <button type="button" onClick={alternarAtivo} className="text-xs text-destructive underline">{processo.ativo ? 'Desativar' : 'Reativar'}</button>
      </TableCell>
    </TableRow>
  )
}
