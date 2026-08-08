import { getServerSupabaseClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PublicBookingFlow } from '@/components/public-booking-flow'

export default async function PublicBookingPage({ params }: { params: Promise<{ barbeariaSlug: string }> }) {
  const { barbeariaSlug } = await params
  const supabase = await getServerSupabaseClient()

  const { data: barbearia } = await supabase.from('barbearias').select('id, nome').eq('slug', barbeariaSlug).single()
  if (!barbearia) notFound()

  const { data: servicos } = await supabase.from('servicos').select('*').eq('barbearia_id', barbearia.id).eq('ativo', true)
  const { data: barbeiros } = await supabase.from('membros').select('id, nome').eq('barbearia_id', barbearia.id).eq('papel', 'barbeiro').eq('ativo', true)

  return <PublicBookingFlow barbearia={barbearia} servicos={servicos ?? []} barbeiros={barbeiros ?? []} />
}
