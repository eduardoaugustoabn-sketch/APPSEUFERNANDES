import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ProdutoRow } from '@/components/produto-row'
import { Table, TableHeader, TableBody, TableRow, TableHead } from '@/components/ui/table'

async function criarProduto(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('produtos').insert({
    barbearia_id: membro!.barbearia_id,
    nome: formData.get('nome') as string,
    categoria: formData.get('categoria') as string,
    preco_custo: Number(formData.get('preco_custo')) || 0,
    preco_venda: Number(formData.get('preco_venda')),
    quantidade_estoque: Number(formData.get('quantidade_estoque')),
    estoque_minimo: Number(formData.get('estoque_minimo')),
  })
  revalidatePath('/admin/produtos')
}

export default async function ProdutosPage() {
  const supabase = await getServerSupabaseClient()
  const { data: produtos } = await supabase.from('produtos').select('*').order('nome')

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Produtos</h1>
      <form action={criarProduto} className="flex gap-2 mb-6 flex-wrap">
        <Input name="nome" placeholder="Nome" required />
        <Input name="categoria" placeholder="Categoria" />
        <Input name="preco_custo" type="number" step="0.01" placeholder="Preço de compra" />
        <Input name="preco_venda" type="number" step="0.01" placeholder="Preço de venda" required />
        <Input name="quantidade_estoque" type="number" placeholder="Estoque inicial" required />
        <Input name="estoque_minimo" type="number" placeholder="Estoque mínimo" required />
        <Button type="submit">Adicionar</Button>
      </form>
      <Table>
        <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Categoria</TableHead><TableHead>Custo</TableHead><TableHead>Preço</TableHead><TableHead>Estoque</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
        <TableBody>
          {produtos?.map((p) => <ProdutoRow key={p.id} produto={p} />)}
        </TableBody>
      </Table>
    </div>
  )
}
