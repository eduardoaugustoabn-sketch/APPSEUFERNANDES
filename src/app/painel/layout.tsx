import { redirect } from 'next/navigation'
import { getServerSupabaseClient } from '@/lib/supabase/server'

export default async function BarbeiroLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membro } = await supabase
    .from('membros')
    .select('papel')
    .eq('user_id', user.id)
    .single()

  if (membro?.papel !== 'barbeiro') redirect('/')

  return <div className="p-6">{children}</div>
}
