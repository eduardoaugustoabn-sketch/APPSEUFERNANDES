import { redirect } from 'next/navigation'
import { getServerSupabaseClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membro } = await supabase.from('membros').select('papel').eq('user_id', user.id).single()
  redirect(membro?.papel === 'admin' ? '/admin' : '/painel')
}
