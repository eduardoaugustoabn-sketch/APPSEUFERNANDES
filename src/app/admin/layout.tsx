import { redirect } from 'next/navigation'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { AdminSidebar } from '@/components/admin/sidebar'
import { MobileSidebarShell } from '@/components/mobile-sidebar-shell'

const NAV_ITEMS = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/agenda', label: 'Agenda' },
  { href: '/admin/servicos', label: 'Serviços' },
  { href: '/admin/produtos', label: 'Produtos' },
  { href: '/admin/loja', label: 'Loja' },
  { href: '/admin/planos-carreira', label: 'Planos de carreira' },
  { href: '/admin/barbeiros', label: 'Barbeiros' },
  { href: '/admin/onboarding', label: 'Onboarding' },
  { href: '/admin/ranking', label: 'Ranking' },
  { href: '/admin/prospeccao', label: 'Prospecção' },
  { href: '/admin/canais-prospeccao', label: 'Canais de prospecção' },
  { href: '/admin/clientes', label: 'Clientes' },
  { href: '/admin/categorias-origem', label: 'Categorias de origem' },
  { href: '/admin/sonhos', label: 'Sonhos' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membro } = await supabase
    .from('membros')
    .select('nome, papel')
    .eq('user_id', user.id)
    .single()

  if (membro?.papel !== 'admin') redirect('/')

  return (
    <MobileSidebarShell titulo="Seu Fernandes" sidebar={<AdminSidebar navItems={NAV_ITEMS} nomeAdmin={membro.nome} />}>
      {children}
    </MobileSidebarShell>
  )
}
