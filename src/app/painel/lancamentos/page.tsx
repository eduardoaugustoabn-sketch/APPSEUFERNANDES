import { getServerSupabaseClient } from '@/lib/supabase/server'
import { LancamentoServicoForm } from '@/components/lancamento-servico-form'
import { LancamentoProdutoForm } from '@/components/lancamento-produto-form'

export default async function LancamentosPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()
  const { data: servicos } = await supabase.from('servicos').select('id, nome, preco').eq('barbearia_id', membro!.barbearia_id)
  const { data: produtos } = await supabase.from('produtos').select('id, nome, preco_venda, quantidade_estoque').eq('barbearia_id', membro!.barbearia_id)

  return (
    <div className="flex gap-4 flex-wrap">
      <LancamentoServicoForm barbeariaId={membro!.barbearia_id} membroId={membro!.id} servicos={servicos ?? []} />
      <LancamentoProdutoForm barbeariaId={membro!.barbearia_id} membroId={membro!.id} produtos={produtos ?? []} />
    </div>
  )
}
