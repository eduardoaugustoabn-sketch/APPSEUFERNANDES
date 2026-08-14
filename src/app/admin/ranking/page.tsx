import { getServerSupabaseClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'

export default async function RankingPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

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
    .from('atendimentos').select('membro_id, servico_id')
    .eq('barbearia_id', membro!.barbearia_id).gte('data', inicioMes)
  const { data: vendas } = await supabase
    .from('vendas_produtos').select('membro_id, produto_id, quantidade')
    .eq('barbearia_id', membro!.barbearia_id).gte('data', inicioMes)

  function rankingServico(servicoId: string) {
    return (barbeiros ?? [])
      .map((b) => ({
        nome: b.nome,
        quantidade: (atendimentos ?? []).filter((a) => a.servico_id === servicoId && a.membro_id === b.id).length,
      }))
      .sort((a, b) => b.quantidade - a.quantidade)
  }

  function rankingProduto(produtoId: string) {
    return (barbeiros ?? [])
      .map((b) => ({
        nome: b.nome,
        quantidade: (vendas ?? [])
          .filter((v) => v.produto_id === produtoId && v.membro_id === b.id)
          .reduce((s, v) => s + v.quantidade, 0),
      }))
      .sort((a, b) => b.quantidade - a.quantidade)
  }

  const cortes = (servicos ?? []).filter((s) => s.tipo === 'corte')
  const extras = (servicos ?? []).filter((s) => s.tipo === 'servico_extra')

  function Secao({ titulo, itens, ranking }: { titulo: string; itens: { id: string; nome: string }[]; ranking: (id: string) => { nome: string; quantidade: number }[] }) {
    return (
      <>
        <h2 className="font-heading text-lg font-semibold mb-3">{titulo}</h2>
        <div className="grid gap-4 mb-8 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
          {itens.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4">
                <p className="font-semibold mb-2">{item.nome}</p>
                <ol className="text-sm flex flex-col gap-1">
                  {ranking(item.id).map((r, i) => (
                    <li key={r.nome} className="flex justify-between">
                      <span>{i + 1}. {r.nome}</span>
                      <span className="font-medium">{r.quantidade}x</span>
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
      <h1 className="font-heading text-2xl font-bold mb-4">Ranking (mês)</h1>
      <Secao titulo="Cortes" itens={cortes} ranking={rankingServico} />
      <Secao titulo="Serviços extras" itens={extras} ranking={rankingServico} />
      <Secao titulo="Produtos" itens={produtos ?? []} ranking={rankingProduto} />
    </div>
  )
}
