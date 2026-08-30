import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ProcessoOnboardingRow } from '@/components/processo-onboarding-row'
import { Table, TableHeader, TableBody, TableRow, TableHead } from '@/components/ui/table'

async function criarProcesso(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('processos_onboarding').insert({
    barbearia_id: membro!.barbearia_id,
    nome: formData.get('nome') as string,
    descricao: (formData.get('descricao') as string) || null,
  })
  revalidatePath('/admin/onboarding')
}

export default async function OnboardingPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const { data: processos } = await supabase.from('processos_onboarding').select('*').eq('barbearia_id', membro!.barbearia_id).order('nome')

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
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Descrição</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {processos?.map((p) => <ProcessoOnboardingRow key={p.id} processo={p} />)}
            </TableBody>
          </Table>
          {(processos ?? []).length === 0 && <p className="text-sm text-muted-foreground mt-4">Nenhum processo cadastrado ainda.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
