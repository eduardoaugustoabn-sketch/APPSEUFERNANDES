import { redirect } from 'next/navigation'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/sign-out-button'
import { NavLinks } from '@/components/nav-links'

const NAV_ITEMS = [
  { href: '/painel', label: 'Dashboard' },
  { href: '/painel/agenda', label: 'Agenda' },
  { href: '/painel/prospeccao', label: 'Prospecção' },
]

export default async function BarbeiroLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membro } = await supabase
    .from('membros')
    .select('papel')
    .eq('user_id', user.id)
    .single()

  if (!membro) {
    await supabase.auth.signOut()
    redirect('/login')
  }

  if (membro.papel !== 'barbeiro') redirect('/')

  return (
    <div>
      <nav className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-8">
          <span className="font-heading text-lg font-bold tracking-wide">SEU FERNANDES</span>
          <NavLinks items={NAV_ITEMS} />
        </div>
        <SignOutButton />
      </nav>
      <div className="p-6">{children}</div>
    </div>
  )
}
