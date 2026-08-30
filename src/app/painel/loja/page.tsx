import { getServerSupabaseClient } from '@/lib/supabase/server'
import { resolverPeriodo } from '@/lib/periodo'
import { VendaLojaForm } from '@/components/venda-loja-form'
import { VendasLojaLista } from '@/components/vendas-loja-lista'
import { PeriodoFiltro } from '@/components/periodo-filtro'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'

export default async function PainelLojaPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()

  const { preset, inicio, fim, label } = resolverPeriodo(await searchParams)

  const { data: produtos } = await supabase.from('produtos_loja').select('id, nome, categoria, preco_venda, quantidade_estoque, ativo').eq('barbearia_id', membro!.barbearia_id).eq('ativo', true).order('nome')
  const { data: categorias } = await supabase.from('categorias_origem').select('id, nome').eq('barbearia_id', membro!.barbearia_id).eq('ativo', true).order('nome')
  const { data: vendas } = await supabase
    .from('vendas_loja')
    .select('data, quantidade, preco_unitario, comissao_valor, clientes(nome), produtos_loja(nome)')
    .eq('membro_id', membro!.id)
    .gte('data', inicio)
    .lte('data', fim)
    .order('criado_em', { ascending: false }) as {
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
          <div className="flex items-center justify-between gap-4 flex-wrap mb-5">
            <h2 className="font-heading text-base font-bold">Minhas vendas — {label}</h2>
            <PeriodoFiltro preset={preset} inicio={inicio} fim={fim} />
          </div>
          <VendasLojaLista vendas={vendas ?? []} />
        </CardContent>
      </Card>
    </div>
  )
}
