import { getServerSupabaseClient } from '@/lib/supabase/server'
import { resolverPeriodo } from '@/lib/periodo'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { PeriodoFiltro } from '@/components/periodo-filtro'

export default async function RankingPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const { preset, inicio, fim, label } = resolverPeriodo(await searchParams)

  const { data: barbeiros } = await supabase
    .from('membros').select('id, nome')
    .eq('barbearia_id', membro!.barbearia_id).eq('papel', 'barbeiro').eq('ativo', true)
    .order('nome')
  const { data: servicos } = await supabase
    .from('servicos').select('id, nome, tipo')
    .eq('barbearia_id', membro!.barbearia_id).eq('ativo', true)
    .order('nome')
  const { data: produtos } = await supabase
    .from('produtos').select('id, nome')
    .eq('barbearia_id', membro!.barbearia_id).eq('ativo', true)
    .order('nome')

  const { data: atendimentos } = await supabase
    .from('atendimentos').select('membro_id, servico_id, preco')
    .eq('barbearia_id', membro!.barbearia_id).gte('data', inicio).lte('data', fim)
  const { data: vendas } = await supabase
    .from('vendas_produtos').select('membro_id, produto_id, quantidade, preco_unitario')
    .eq('barbearia_id', membro!.barbearia_id).gte('data', inicio).lte('data', fim)

  const { data: clientesStatus } = await supabase.rpc('clientes_com_status', { p_barbearia_id: membro!.barbearia_id }) as {
    data: { cadastrado_por_membro_id: string | null; status: string | null }[] | null
  }

  const rankingClientesAtivos = (barbeiros ?? [])
    .map((b) => {
      const doBarbeiro = (clientesStatus ?? []).filter((c) => c.cadastrado_por_membro_id === b.id)
      return {
        nome: b.nome,
        verde: doBarbeiro.filter((c) => c.status === 'verde').length,
        amarelo: doBarbeiro.filter((c) => c.status === 'amarelo').length,
        vermelho: doBarbeiro.filter((c) => c.status === 'vermelho').length,
      }
    })
    .sort((a, b) => b.verde - a.verde)

  function rankingServico(servicoId: string) {
    return (barbeiros ?? [])
      .map((b) => {
        const linhas = (atendimentos ?? []).filter((a) => a.servico_id === servicoId && a.membro_id === b.id)
        return {
          nome: b.nome,
          quantidade: linhas.length,
          valor: linhas.reduce((s, a) => s + Number(a.preco), 0),
        }
      })
      .sort((a, b) => b.quantidade - a.quantidade)
  }

  function rankingProduto(produtoId: string) {
    return (barbeiros ?? [])
      .map((b) => {
        const linhas = (vendas ?? []).filter((v) => v.produto_id === produtoId && v.membro_id === b.id)
        return {
          nome: b.nome,
          quantidade: linhas.reduce((s, v) => s + v.quantidade, 0),
          valor: linhas.reduce((s, v) => s + Number(v.preco_unitario) * v.quantidade, 0),
        }
      })
      .sort((a, b) => b.quantidade - a.quantidade)
  }

  const cortes = (servicos ?? []).filter((s) => s.tipo === 'corte')
  const extras = (servicos ?? []).filter((s) => s.tipo === 'servico_extra')

  function Secao({ titulo, itens, ranking }: { titulo: string; itens: { id: string; nome: string }[]; ranking: (id: string) => { nome: string; quantidade: number; valor: number }[] }) {
    return (
      <>
        <h2 className="font-heading text-lg font-semibold mb-3">{titulo}</h2>
        <div className="grid gap-4 mb-8 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
          {itens.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-6">
                <p className="font-semibold mb-3">{item.nome}</p>
                <ol className="text-sm flex flex-col gap-1">
                  {ranking(item.id).map((r, i) => (
                    <li key={r.nome} className={`flex justify-between gap-2 ${i === 0 && r.quantidade > 0 ? 'text-primary font-bold' : ''}`}>
                      <span>{i + 1}. {r.nome}</span>
                      <span className={`text-right ${i === 0 && r.quantidade > 0 ? 'font-bold' : 'font-medium'}`}>{r.quantidade}x — R$ {r.valor.toFixed(2)}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
          {itens.length === 0 && <p className="text-sm text-muted-foreground">Nada cadastrado nessa categoria.</p>}
        </div>
      </>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <h1 className="font-heading text-2xl font-bold">Ranking — {label}</h1>
        <PeriodoFiltro preset={preset} inicio={inicio} fim={fim} />
      </div>

      <h2 className="font-heading text-lg font-semibold mb-3">Clientes ativos</h2>
      <Card className="mb-8">
        <CardContent className="p-6">
          <Table>
            <TableHeader><TableRow><TableHead>Barbeiro</TableHead><TableHead>Verde</TableHead><TableHead>Amarelo</TableHead><TableHead>Vermelho</TableHead></TableRow></TableHeader>
            <TableBody>
              {rankingClientesAtivos.map((r) => (
                <TableRow key={r.nome}>
                  <TableCell>{r.nome}</TableCell>
                  <TableCell className="font-bold text-primary">{r.verde}</TableCell>
                  <TableCell className="text-amber-text">{r.amarelo}</TableCell>
                  <TableCell className="text-destructive">{r.vermelho}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rankingClientesAtivos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum barbeiro ativo cadastrado.</p>}
        </CardContent>
      </Card>

      <Secao titulo="Cortes" itens={cortes} ranking={rankingServico} />
      <Secao titulo="Serviços extras" itens={extras} ranking={rankingServico} />
      <Secao titulo="Produtos" itens={produtos ?? []} ranking={rankingProduto} />
    </div>
  )
}
