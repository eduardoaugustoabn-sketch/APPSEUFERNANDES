import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ProcessoOnboardingRow } from '@/components/processo-onboarding-row'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { calcularModulosOnboarding } from '@/lib/onboarding'

async function criarProcesso(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const { data: ultimo } = await supabase.from('processos_onboarding').select('ordem').eq('barbearia_id', membro!.barbearia_id).order('ordem', { ascending: false }).limit(1).maybeSingle()

  const { error } = await supabase.from('processos_onboarding').insert({
    barbearia_id: membro!.barbearia_id,
    nome: formData.get('nome') as string,
    descricao: (formData.get('descricao') as string) || null,
    ordem: (ultimo?.ordem ?? 0) + 1,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/onboarding')
}

export default async function OnboardingPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const { data: processos } = await supabase.from('processos_onboarding').select('*').eq('barbearia_id', membro!.barbearia_id).order('ordem')
  const processosAtivos = (processos ?? []).filter((p) => p.ativo)

  const { data: barbeiros } = await supabase.from('membros').select('id, nome, ativo').eq('barbearia_id', membro!.barbearia_id).eq('papel', 'barbeiro').order('nome')
  const processoIds = processosAtivos.map((p) => p.id)
  const { data: tentativas } = processoIds.length > 0
    ? await supabase.from('tentativas_onboarding').select('processo_id, membro_id, nota_percentual, aprovado, respondido_em').in('processo_id', processoIds).order('respondido_em', { ascending: false })
    : { data: [] }

  const progresso = (barbeiros ?? []).map((b) => ({
    barbeiro: b,
    modulos: calcularModulosOnboarding(processosAtivos, (tentativas ?? []).filter((t) => t.membro_id === b.id)),
  }))

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Onboarding</h1>

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Adicionar processo</h2>
          <form action={criarProcesso} className="flex gap-2 flex-wrap">
            <Input name="nome" placeholder="Nome (ex: Atendimento ao cliente)" required className="w-56" />
            <Input name="descricao" placeholder="Descrição (opcional)" className="w-72" />
            <Button type="submit">Adicionar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Processos cadastrados</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Módulo</TableHead><TableHead>Nome</TableHead><TableHead>Descrição</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {processos?.map((p, i) => (
                <ProcessoOnboardingRow
                  key={p.id}
                  processo={p}
                  numero={i + 1}
                  anterior={i > 0 ? { id: processos[i - 1].id, ordem: processos[i - 1].ordem } : null}
                  proximo={i < processos.length - 1 ? { id: processos[i + 1].id, ordem: processos[i + 1].ordem } : null}
                />
              ))}
            </TableBody>
          </Table>
          {(processos ?? []).length === 0 && <p className="text-sm text-muted-foreground mt-4">Nenhum processo cadastrado ainda.</p>}
        </CardContent>
      </Card>

      {processosAtivos.length > 0 && (
        <Card className="mt-6">
          <CardContent className="p-6 overflow-x-auto">
            <h2 className="font-heading text-base font-bold mb-5">Progresso dos barbeiros</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Barbeiro</TableHead>
                  {processosAtivos.map((p, i) => <TableHead key={p.id}>Módulo {i + 1}<br /><span className="font-normal text-muted-foreground">{p.nome}</span></TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {progresso.map(({ barbeiro, modulos }) => (
                  <TableRow key={barbeiro.id} className={barbeiro.ativo ? '' : 'opacity-50'}>
                    <TableCell className="font-semibold">{barbeiro.nome}</TableCell>
                    {modulos.map((m) => (
                      <TableCell key={m.id}>
                        {m.bloqueado ? (
                          <span className="text-muted-foreground">Bloqueado</span>
                        ) : m.status === 'Aprovado' ? (
                          <span className="text-primary font-semibold">{m.status} · {m.nota}%</span>
                        ) : m.status === 'Reprovado' ? (
                          <span className="text-destructive font-semibold">{m.status} · {m.nota}%</span>
                        ) : (
                          <span className="text-muted-foreground">Não iniciado</span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {(barbeiros ?? []).length === 0 && <p className="text-sm text-muted-foreground mt-4">Nenhum barbeiro cadastrado ainda.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
