import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { PlanoCarreiraRow } from '@/components/plano-carreira-row'
import { Table, TableHeader, TableBody, TableRow, TableHead } from '@/components/ui/table'

async function criarPlano(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('planos_carreira').insert({
    barbearia_id: membro!.barbearia_id,
    nome: formData.get('nome') as string,
    percentual_produto: Number(formData.get('percentual_produto')),
    percentual_servico: Number(formData.get('percentual_servico')),
  })
  revalidatePath('/admin/planos-carreira')
}

export default async function PlanosCarreiraPage() {
  const supabase = await getServerSupabaseClient()
  const { data: planos } = await supabase.from('planos_carreira').select('*').order('nome')

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Planos de carreira</h1>

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Adicionar plano</h2>
          <form action={criarPlano} className="flex gap-2 flex-wrap">
            <Input name="nome" placeholder="Nome (ex: Sênior)" required className="w-40" />
            <Input name="percentual_produto" type="number" step="0.01" placeholder="% produto" required className="w-28" />
            <Input name="percentual_servico" type="number" step="0.01" placeholder="% serviço" required className="w-28" />
            <Button type="submit">Adicionar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Planos cadastrados</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>% produto</TableHead><TableHead>% serviço</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {planos?.map((p) => <PlanoCarreiraRow key={p.id} plano={p} />)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
