import { getServerSupabaseClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { FluxogramaUploadForm } from '@/components/fluxograma-upload-form'
import { PerguntasOnboardingAdmin } from '@/components/perguntas-onboarding-admin'

type Alternativa = { id: string; texto: string; correta: boolean; ordem: number }
type Pergunta = { id: string; enunciado: string; ordem: number; alternativas_onboarding: Alternativa[] }
type Tentativa = { membro_id: string; nota_percentual: number; aprovado: boolean; respondido_em: string }

export default async function ProcessoOnboardingAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const { data: processo } = await supabase.from('processos_onboarding').select('*').eq('id', id).eq('barbearia_id', membro!.barbearia_id).single()
  if (!processo) notFound()

  const { data: perguntas } = await supabase.from('perguntas_onboarding').select('*, alternativas_onboarding(*)').eq('processo_id', id).order('ordem') as { data: Pergunta[] | null }
  const { data: barbeiros } = await supabase.from('membros').select('id, nome').eq('barbearia_id', membro!.barbearia_id).eq('papel', 'barbeiro').eq('ativo', true).order('nome')
  const { data: tentativas } = await supabase.from('tentativas_onboarding').select('membro_id, nota_percentual, aprovado, respondido_em').eq('processo_id', id).order('respondido_em', { ascending: false }) as { data: Tentativa[] | null }

  let fluxogramaUrl: string | null = null
  if (processo.fluxograma_path) {
    const { data: signed } = await supabase.storage.from('fluxogramas').createSignedUrl(processo.fluxograma_path, 3600)
    fluxogramaUrl = signed?.signedUrl ?? null
  }

  const resultados = (barbeiros ?? []).map((b) => {
    const ultima = (tentativas ?? []).find((t) => t.membro_id === b.id)
    return { nome: b.nome, status: ultima ? (ultima.aprovado ? 'Aprovado' : 'Reprovado') : 'Não iniciado', nota: ultima?.nota_percentual ?? null }
  })

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">{processo.nome}</h1>

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Fluxograma</h2>
          <FluxogramaUploadForm processoId={processo.id} barbeariaId={membro!.barbearia_id} fluxogramaUrlAtual={fluxogramaUrl} />
        </CardContent>
      </Card>

      <div className="mb-6">
        <PerguntasOnboardingAdmin processoId={processo.id} perguntas={perguntas ?? []} />
      </div>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Resultados</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Barbeiro</TableHead><TableHead>Status</TableHead><TableHead>Nota</TableHead></TableRow></TableHeader>
            <TableBody>
              {resultados.map((r) => (
                <TableRow key={r.nome}>
                  <TableCell>{r.nome}</TableCell>
                  <TableCell>{r.status}</TableCell>
                  <TableCell>{r.nota != null ? `${r.nota}%` : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {resultados.length === 0 && <p className="text-sm text-muted-foreground mt-4">Nenhum barbeiro ativo cadastrado.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
