import { getServerSupabaseClient } from '@/lib/supabase/server'

type Linha = {
  nome: string
  telefone: string
  data: string
  convertido_em: string | null
  status: string
  agendamento_id: string | null
  membros: { nome: string } | null
}
type ItemAtendimento = { agendamento_id: string | null; preco: number; servicos: { nome: string } | null }
type ItemVenda = { agendamento_id: string | null; preco_unitario: number; quantidade: number; produtos: { nome: string } | null }

export default async function AdminProspeccaoPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const { data: convertidos } = await supabase
    .from('prospeccoes')
    .select('nome, telefone, data, convertido_em, status, agendamento_id, membros(nome)')
    .eq('barbearia_id', membro!.barbearia_id)
    .eq('status', 'convertido')
    .order('convertido_em', { ascending: false }) as { data: Linha[] | null }

  const agendamentoIds = (convertidos ?? []).map((c) => c.agendamento_id).filter((id): id is string => id !== null)

  const { data: atendimentosPorAgendamento } = await supabase
    .from('atendimentos')
    .select('agendamento_id, preco, servicos(nome)')
    .in('agendamento_id', agendamentoIds.length > 0 ? agendamentoIds : ['00000000-0000-0000-0000-000000000000']) as { data: ItemAtendimento[] | null }

  const { data: vendasPorAgendamento } = await supabase
    .from('vendas_produtos')
    .select('agendamento_id, preco_unitario, quantidade, produtos(nome)')
    .eq('barbearia_id', membro!.barbearia_id) as { data: ItemVenda[] | null }

  const linhas = (convertidos ?? []).map((c) => {
    const servicos = (atendimentosPorAgendamento ?? []).filter((a) => a.agendamento_id === c.agendamento_id)
    const produtos = (vendasPorAgendamento ?? []).filter((v) => v.agendamento_id === c.agendamento_id)
    const valorServicos = servicos.reduce((s, a) => s + Number(a.preco), 0)
    const valorProdutos = produtos.reduce((s, v) => s + Number(v.preco_unitario) * v.quantidade, 0)
    return {
      ...c,
      servicosTexto: servicos.map((s) => s.servicos?.nome ?? '—').join(', ') || '—',
      produtosTexto: produtos.map((p) => `${p.quantidade}x ${p.produtos?.nome ?? '—'}`).join(', ') || '—',
      valorTotal: valorServicos + valorProdutos,
    }
  })

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Conversão de prospecção</h1>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th>Nome</th><th>Telefone</th><th>Prospecção</th><th>Atendimento</th>
            <th>Serviços</th><th>Produtos</th><th>Total</th><th>Profissional</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-t">
              <td>{l.nome}</td>
              <td>{l.telefone}</td>
              <td>{new Date(l.data).toLocaleDateString()}</td>
              <td>{l.convertido_em ? new Date(l.convertido_em).toLocaleDateString() : '—'}</td>
              <td>{l.servicosTexto}</td>
              <td>{l.produtosTexto}</td>
              <td>R$ {l.valorTotal.toFixed(2)}</td>
              <td>{l.membros?.nome ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
