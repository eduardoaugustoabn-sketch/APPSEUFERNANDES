import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ProdutoLojaRow } from '@/components/produto-loja-row'
import { AdminVendaLoja } from '@/components/admin-venda-loja'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'

async function criarProdutoLoja(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('produtos_loja').insert({
    barbearia_id: membro!.barbearia_id,
    nome: formData.get('nome') as string,
    categoria: formData.get('categoria') as string,
    preco_custo: Number(formData.get('preco_custo')) || 0,
    preco_venda: Number(formData.get('preco_venda')),
    quantidade_estoque: Number(formData.get('quantidade_estoque')),
    estoque_minimo: Number(formData.get('estoque_minimo')),
  })
  revalidatePath('/admin/loja')
}

export default async function LojaPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const { data: produtos } = await supabase.from('produtos_loja').select('*').eq('barbearia_id', membro!.barbearia_id).order('nome')
  const { data: barbeiros } = await supabase
    .from('membros').select('id, nome')
    .eq('barbearia_id', membro!.barbearia_id).eq('papel', 'barbeiro').eq('ativo', true)
    .order('nome')
  const { data: categorias } = await supabase.from('categorias_origem').select('id, nome').eq('barbearia_id', membro!.barbearia_id).eq('ativo', true).order('nome')
  const { data: vendas } = await supabase
    .from('vendas_loja')
    .select('data, quantidade, preco_unitario, comissao_valor, clientes(nome), produtos_loja(nome), membros(nome)')
    .eq('barbearia_id', membro!.barbearia_id)
    .order('criado_em', { ascending: false })
    .limit(50) as {
      data: { data: string; quantidade: number; preco_unitario: number; comissao_valor: number; clientes: { nome: string } | null; produtos_loja: { nome: string } | null; membros: { nome: string } | null }[] | null
    }

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Loja</h1>

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Adicionar produto</h2>
          <form action={criarProdutoLoja} className="flex gap-2 flex-wrap">
            <Input name="nome" placeholder="Nome" required className="w-40" />
            <Input name="categoria" placeholder="Categoria" className="w-32" />
            <Input name="preco_custo" type="number" step="0.01" placeholder="Preço de compra" className="w-28" />
            <Input name="preco_venda" type="number" step="0.01" placeholder="Preço de venda" required className="w-28" />
            <Input name="quantidade_estoque" type="number" placeholder="Estoque inicial" required className="w-28" />
            <Input name="estoque_minimo" type="number" placeholder="Estoque mínimo" required className="w-28" />
            <Button type="submit">Adicionar</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Produtos cadastrados</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Categoria</TableHead><TableHead>Custo</TableHead><TableHead>Preço</TableHead><TableHead>Estoque</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {produtos?.map((p) => <ProdutoLojaRow key={p.id} produto={p} />)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="mb-6">
        <AdminVendaLoja barbeariaId={membro!.barbearia_id} barbeiros={barbeiros ?? []} produtos={(produtos ?? []).filter((p) => p.ativo)} categorias={categorias ?? []} />
      </div>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Vendas recentes</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Produto</TableHead><TableHead>Qtd</TableHead><TableHead>Valor</TableHead><TableHead>Comissão</TableHead><TableHead>Barbeiro</TableHead></TableRow></TableHeader>
            <TableBody>
              {(vendas ?? []).map((v, i) => (
                <TableRow key={i}>
                  <TableCell>{new Date(v.data).toLocaleDateString()}</TableCell>
                  <TableCell>{v.clientes?.nome ?? '—'}</TableCell>
                  <TableCell>{v.produtos_loja?.nome ?? '—'}</TableCell>
                  <TableCell>{v.quantidade}</TableCell>
                  <TableCell>R$ {(v.preco_unitario * v.quantidade).toFixed(2)}</TableCell>
                  <TableCell>R$ {Number(v.comissao_valor).toFixed(2)}</TableCell>
                  <TableCell>{v.membros?.nome ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {(vendas ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma venda registrada ainda.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
