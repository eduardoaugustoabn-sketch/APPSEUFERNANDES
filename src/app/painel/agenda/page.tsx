import { getServerSupabaseClient } from '@/lib/supabase/server'
import { InternalBookingForm } from '@/components/internal-booking-form'
import { BloqueioForm } from '@/components/bloqueio-form'
import { AgendaLista } from '@/components/agenda-lista'

export default async function AgendaPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()
  const { data: servicos } = await supabase.from('servicos').select('id, nome, duracao_minutos').eq('barbearia_id', membro!.barbearia_id)

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Agenda</h1>

      <h2 className="text-lg font-medium mb-2">Horários marcados</h2>
      <AgendaLista membroId={membro!.id} />

      <h2 className="text-lg font-medium mt-8 mb-2">Novo agendamento</h2>
      <InternalBookingForm barbeariaId={membro!.barbearia_id} membroId={membro!.id} servicos={servicos ?? []} />

      <h2 className="text-lg font-medium mt-8 mb-2">Bloquear horário</h2>
      <BloqueioForm membroId={membro!.id} />
    </div>
  )
}
