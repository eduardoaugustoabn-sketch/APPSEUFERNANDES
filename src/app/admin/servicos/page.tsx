import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ServicoRow } from '@/components/servico-row'
import { Table, TableHeader, TableBody, TableRow, TableHead } from '@/components/ui/table'

async function criarServico(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('servicos').insert({
    barbearia_id: membro!.barbearia_id,
    nome: formData.get('nome') as string,
    duracao_minutos: Number(formData.get('duracao_minutos')),
    preco: Number(formData.get('preco')),
    tipo: (formData.get('tipo') as string) || 'corte',
  })
  revalidatePath('/admin/servicos')
}

export default async function ServicosPage() {
  const supabase = await getServerSupabaseClient()
  const { data: servicos } = await supabase.from('servicos').select('*').order('nome')

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Serviços</h1>
      <form action={criarServico} className="flex gap-2 mb-6 flex-wrap">
        <Input name="nome" placeholder="Nome" required />
        <Input name="duracao_minutos" type="number" placeholder="Duração (min)" required />
        <Input name="preco" type="number" step="0.01" placeholder="Preço" required />
        <select name="tipo" defaultValue="corte" className="border rounded px-2 py-1 bg-input">
          <option value="corte">Corte</option>
          <option value="servico_extra">Serviço extra</option>
        </select>
        <Button type="submit">Adicionar</Button>
      </form>
      <Table>
        <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Duração</TableHead><TableHead>Preço</TableHead><TableHead>Tipo</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
        <TableBody>
          {servicos?.map((s) => <ServicoRow key={s.id} servico={s} />)}
        </TableBody>
      </Table>
    </div>
  )
}
