import { getServerSupabaseClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { ProvaOnboardingForm } from '@/components/prova-onboarding-form'
import { calcularModulosOnboarding } from '@/lib/onboarding'

export default async function ProcessoOnboardingPainelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()

  const { data: processo } = await supabase.from('processos_onboarding').select('*').eq('id', id).eq('barbearia_id', membro!.barbearia_id).eq('ativo', true).single()
  if (!processo) notFound()

  const { data: processosAtivos } = await supabase.from('processos_onboarding').select('id, nome, descricao').eq('barbearia_id', membro!.barbearia_id).eq('ativo', true).order('ordem')
  const { data: tentativas } = await supabase.from('tentativas_onboarding').select('processo_id, nota_percentual, aprovado, respondido_em').eq('membro_id', membro!.id).order('respondido_em', { ascending: false })

  const modulos = calcularModulosOnboarding(processosAtivos ?? [], tentativas ?? [])
  const indice = modulos.findIndex((m) => m.id === id)
  const moduloAtual = modulos[indice]

  if (moduloAtual?.bloqueado) {
    const anterior = modulos[indice - 1]
    return (
      <div>
        <h1 className="font-heading text-2xl font-bold mb-4">{processo.nome}</h1>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Termine o módulo anterior{anterior && ` ("${anterior.nome}")`} antes de acessar este.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const ultimaTentativa = tentativas?.find((t) => t.processo_id === id) ?? null

  let fluxogramaUrl: string | null = null
  if (processo.fluxograma_path) {
    const { data: signed } = await supabase.storage.from('fluxogramas').createSignedUrl(processo.fluxograma_path, 3600)
    fluxogramaUrl = signed?.signedUrl ?? null
  }

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">{processo.nome}</h1>
      {processo.descricao && <p className="text-sm text-muted-foreground mb-4">{processo.descricao}</p>}

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Fluxograma</h2>
          {fluxogramaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fluxogramaUrl} alt={`Fluxograma de ${processo.nome}`} className="max-w-full rounded-lg border border-border" />
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum fluxograma cadastrado ainda para este processo.</p>
          )}
        </CardContent>
      </Card>

      <ProvaOnboardingForm processoId={processo.id} ultimaTentativa={ultimaTentativa} />
    </div>
  )
}
