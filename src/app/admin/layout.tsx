import { redirect } from 'next/navigation'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/sign-out-button'
import { NavLinks } from '@/components/nav-links'

const NAV_ITEMS = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/servicos', label: 'Serviços' },
  { href: '/admin/produtos', label: 'Produtos' },
  { href: '/admin/planos-carreira', label: 'Planos de carreira' },
  { href: '/admin/barbeiros', label: 'Barbeiros' },
  { href: '/admin/prospeccao', label: 'Prospecção' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membro } = await supabase
    .from('membros')
    .select('papel')
    .eq('user_id', user.id)
    .single()

  if (membro?.papel !== 'admin') redirect('/')

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
