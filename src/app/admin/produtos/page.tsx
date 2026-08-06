import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

async function criarProduto(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('produtos').insert({
    barbearia_id: membro!.barbearia_id,
    nome: formData.get('nome') as string,
    categoria: formData.get('categoria') as string,
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
      <h1 className="text-xl font-semibold mb-4">Produtos</h1>
      <form action={criarProduto} className="flex gap-2 mb-6 flex-wrap">
        <Input name="nome" placeholder="Nome" required />
        <Input name="categoria" placeholder="Categoria" />
        <Input name="preco_venda" type="number" step="0.01" placeholder="Preço de venda" required />
        <Input name="quantidade_estoque" type="number" placeholder="Estoque inicial" required />
        <Input name="estoque_minimo" type="number" placeholder="Estoque mínimo" required />
        <Button type="submit">Adicionar</Button>
      </form>
      <table className="w-full text-left">
        <thead><tr><th>Nome</th><th>Categoria</th><th>Preço</th><th>Estoque</th></tr></thead>
        <tbody>
          {produtos?.map((p) => (
            <tr key={p.id} className={p.quantidade_estoque <= p.estoque_minimo ? 'text-red-600' : ''}>
              <td>{p.nome}</td><td>{p.categoria}</td><td>R$ {p.preco_venda}</td><td>{p.quantidade_estoque}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
