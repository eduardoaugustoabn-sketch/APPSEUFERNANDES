import { getServerSupabaseClient } from '@/lib/supabase/server'
import { BloqueioForm } from '@/components/bloqueio-form'
import { AgendaDia } from '@/components/agenda-dia'

export default async function AgendaPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()
  const { data: servicos } = await supabase.from('servicos').select('id, nome, preco, duracao_minutos, ativo').eq('barbearia_id', membro!.barbearia_id)
  const { data: produtos } = await supabase.from('produtos').select('id, nome, preco_venda, quantidade_estoque, ativo').eq('barbearia_id', membro!.barbearia_id)

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Agenda</h1>

      <AgendaDia
        barbeariaId={membro!.barbearia_id}
        membroId={membro!.id}
        servicos={servicos ?? []}
        produtos={produtos ?? []}
      />

      <h2 className="font-heading text-lg font-semibold mt-8 mb-2">Bloquear horário</h2>
      <BloqueioForm membroId={membro!.id} />
    </div>
  )
}
