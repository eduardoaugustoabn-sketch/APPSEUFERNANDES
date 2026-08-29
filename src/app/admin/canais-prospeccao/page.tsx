import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CanalProspeccaoRow } from '@/components/canal-prospeccao-row'
import { Table, TableHeader, TableBody, TableRow, TableHead } from '@/components/ui/table'

async function criarCanal(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('canais_prospeccao').insert({
    barbearia_id: membro!.barbearia_id,
    nome: (formData.get('nome') as string).trim(),
  })
  revalidatePath('/admin/canais-prospeccao')
}

export default async function CanaisProspeccaoPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const { data: canais } = await supabase.from('canais_prospeccao').select('*').eq('barbearia_id', membro!.barbearia_id).order('nome')

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Canais de prospecção</h1>

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Adicionar canal</h2>
          <form action={criarCanal} className="flex gap-2 flex-wrap">
            <Input name="nome" placeholder="Nome (ex: Amigo do amigo)" required className="w-56" />
            <Button type="submit">Adicionar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Canais cadastrados</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {canais?.map((c) => <CanalProspeccaoRow key={c.id} canal={c} />)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
