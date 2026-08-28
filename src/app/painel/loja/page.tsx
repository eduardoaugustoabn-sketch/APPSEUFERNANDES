import { getServerSupabaseClient } from '@/lib/supabase/server'
import { VendaLojaForm } from '@/components/venda-loja-form'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'

export default async function PainelLojaPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()

  const { data: produtos } = await supabase.from('produtos_loja').select('id, nome, categoria, preco_venda, quantidade_estoque, ativo').eq('barbearia_id', membro!.barbearia_id).eq('ativo', true).order('nome')
  const { data: categorias } = await supabase.from('categorias_origem').select('id, nome').eq('barbearia_id', membro!.barbearia_id).eq('ativo', true).order('nome')
  const { data: vendas } = await supabase
    .from('vendas_loja')
    .select('data, quantidade, preco_unitario, comissao_valor, clientes(nome), produtos_loja(nome)')
    .eq('membro_id', membro!.id)
    .order('criado_em', { ascending: false })
    .limit(50) as {
      data: { data: string; quantidade: number; preco_unitario: number; comissao_valor: number; clientes: { nome: string } | null; produtos_loja: { nome: string } | null }[] | null
    }

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Loja</h1>

      <div className="mb-6">
        <VendaLojaForm barbeariaId={membro!.barbearia_id} membroId={membro!.id} produtos={produtos ?? []} categorias={categorias ?? []} />
      </div>

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Catálogo</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Categoria</TableHead><TableHead>Preço</TableHead><TableHead>Estoque</TableHead></TableRow></TableHeader>
            <TableBody>
              {(produtos ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.nome}</TableCell>
                  <TableCell>{p.categoria}</TableCell>
                  <TableCell>R$ {p.preco_venda}</TableCell>
                  <TableCell>{p.quantidade_estoque}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Minhas vendas recentes</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Produto</TableHead><TableHead>Qtd</TableHead><TableHead>Valor</TableHead><TableHead>Comissão</TableHead></TableRow></TableHeader>
            <TableBody>
              {(vendas ?? []).map((v, i) => (
                <TableRow key={i}>
                  <TableCell>{new Date(v.data).toLocaleDateString()}</TableCell>
                  <TableCell>{v.clientes?.nome ?? '—'}</TableCell>
                  <TableCell>{v.produtos_loja?.nome ?? '—'}</TableCell>
                  <TableCell>{v.quantidade}</TableCell>
                  <TableCell>R$ {(v.preco_unitario * v.quantidade).toFixed(2)}</TableCell>
                  <TableCell>R$ {Number(v.comissao_valor).toFixed(2)}</TableCell>
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
