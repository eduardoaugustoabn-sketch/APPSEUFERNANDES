import Link from 'next/link'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { calcularModulosOnboarding } from '@/lib/onboarding'

export default async function OnboardingPainelPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()

  const { data: processos } = await supabase.from('processos_onboarding').select('id, nome, descricao').eq('barbearia_id', membro!.barbearia_id).eq('ativo', true).order('ordem')
  const { data: tentativas } = await supabase.from('tentativas_onboarding').select('processo_id, nota_percentual, aprovado, respondido_em').eq('membro_id', membro!.id).order('respondido_em', { ascending: false })

  const modulos = calcularModulosOnboarding(processos ?? [], tentativas ?? [])

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Onboarding</h1>
      <Card>
        <CardContent className="p-6">
          {modulos.map((item, i) => (
            item.bloqueado ? (
              <div key={item.id} className="flex justify-between items-center border-b py-3 last:border-b-0 opacity-50">
                <div>
                  <p className="font-semibold text-sm">Módulo {i + 1} · {item.nome}</p>
                  {item.descricao && <p className="text-xs text-muted-foreground mt-0.5">{item.descricao}</p>}
                </div>
                <span className="text-sm text-right text-muted-foreground">Bloqueado</span>
              </div>
            ) : (
              <Link key={item.id} href={`/painel/onboarding/${item.id}`} className="flex justify-between items-center border-b py-3 last:border-b-0 hover:bg-muted/50">
                <div>
                  <p className="font-semibold text-sm">Módulo {i + 1} · {item.nome}</p>
                  {item.descricao && <p className="text-xs text-muted-foreground mt-0.5">{item.descricao}</p>}
                </div>
                <span className="text-sm text-right">
                  {item.status}{item.nota != null && ` · ${item.nota}%`}
                </span>
              </Link>
            )
          ))}
          {modulos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum processo de onboarding cadastrado ainda.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
