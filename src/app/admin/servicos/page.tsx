import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
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
    categoria_servico: (formData.get('categoria_servico') as string) || 'outro',
  })
  revalidatePath('/admin/servicos')
}

export default async function ServicosPage() {
  const supabase = await getServerSupabaseClient()
  const { data: servicos } = await supabase.from('servicos').select('*').order('nome')

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Serviços</h1>

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Adicionar serviço</h2>
          <form action={criarServico} className="flex gap-2 flex-wrap">
            <Input name="nome" placeholder="Nome" required />
            <Input name="duracao_minutos" type="number" placeholder="Duração (min)" required />
            <Input name="preco" type="number" step="0.01" placeholder="Preço" required />
            <Select name="tipo" defaultValue="corte">
              <option value="corte">Corte</option>
              <option value="servico_extra">Serviço extra</option>
            </Select>
            <Select name="categoria_servico" defaultValue="outro">
              <option value="cabelo">Cabelo</option>
              <option value="barba">Barba</option>
              <option value="outro">Outro</option>
            </Select>
            <Button type="submit">Adicionar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Serviços cadastrados</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Duração</TableHead><TableHead>Preço</TableHead><TableHead>Tipo</TableHead><TableHead>Categoria</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {servicos?.map((s) => <ServicoRow key={s.id} servico={s} />)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
