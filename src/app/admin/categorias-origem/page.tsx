import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CategoriaOrigemRow } from '@/components/categoria-origem-row'
import { Table, TableHeader, TableBody, TableRow, TableHead } from '@/components/ui/table'

async function criarCategoria(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('categorias_origem').insert({
    barbearia_id: membro!.barbearia_id,
    nome: formData.get('nome') as string,
  })
  revalidatePath('/admin/categorias-origem')
}

export default async function CategoriasOrigemPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const { data: categorias } = await supabase.from('categorias_origem').select('*').eq('barbearia_id', membro!.barbearia_id).order('nome')

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Categorias de origem</h1>

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Adicionar categoria</h2>
          <form action={criarCategoria} className="flex gap-2 flex-wrap">
            <Input name="nome" placeholder="Nome (ex: Instagram Ads)" required className="w-56" />
            <Button type="submit">Adicionar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Categorias cadastradas</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {categorias?.map((c) => <CategoriaOrigemRow key={c.id} categoria={c} />)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
