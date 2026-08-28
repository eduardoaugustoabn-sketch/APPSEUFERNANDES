import { getServerSupabaseClient } from '@/lib/supabase/server'
import { AdminAgenda } from '@/components/admin-agenda'

export default async function AdminAgendaPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const { data: barbeiros } = await supabase
    .from('membros').select('id, nome')
    .eq('barbearia_id', membro!.barbearia_id).eq('papel', 'barbeiro').eq('ativo', true)
    .order('nome')
  const { data: servicos } = await supabase.from('servicos').select('id, nome, preco, duracao_minutos, ativo').eq('barbearia_id', membro!.barbearia_id)
  const { data: produtos } = await supabase.from('produtos').select('id, nome, preco_venda, quantidade_estoque, ativo').eq('barbearia_id', membro!.barbearia_id)
  const { data: categorias } = await supabase.from('categorias_origem').select('id, nome').eq('barbearia_id', membro!.barbearia_id).eq('ativo', true).order('nome')

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Agenda</h1>
      <AdminAgenda
        barbeariaId={membro!.barbearia_id}
        barbeiros={barbeiros ?? []}
        servicos={servicos ?? []}
        produtos={produtos ?? []}
        categorias={categorias ?? []}
      />
    </div>
  )
}
