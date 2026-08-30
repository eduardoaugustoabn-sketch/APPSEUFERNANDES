'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { TableRow, TableCell } from '@/components/ui/table'

type Processo = { id: string; nome: string; descricao: string | null; ativo: boolean }

export function ProcessoOnboardingRow({ processo }: { processo: Processo }) {
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

  return (
    <TableRow className={processo.ativo ? '' : 'opacity-50'}>
      <TableCell><Link href={`/admin/onboarding/${processo.id}`} className="text-primary underline">{processo.nome}</Link></TableCell>
      <TableCell>{processo.descricao ?? '—'}</TableCell>
      <TableCell>
        <button type="button" onClick={alternarAtivo} className="text-xs text-destructive underline">{processo.ativo ? 'Desativar' : 'Reativar'}</button>
      </TableCell>
    </TableRow>
  )
}
