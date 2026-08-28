import { redirect } from 'next/navigation'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { AdminSidebar } from '@/components/admin/sidebar'

const NAV_ITEMS = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/agenda', label: 'Agenda' },
  { href: '/admin/servicos', label: 'Serviços' },
  { href: '/admin/produtos', label: 'Produtos' },
  { href: '/admin/loja', label: 'Loja' },
  { href: '/admin/planos-carreira', label: 'Planos de carreira' },
  { href: '/admin/barbeiros', label: 'Barbeiros' },
  { href: '/admin/ranking', label: 'Ranking' },
  { href: '/admin/prospeccao', label: 'Prospecção' },
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
    <div className="flex min-h-screen items-stretch">
      <AdminSidebar navItems={NAV_ITEMS} nomeAdmin={membro.nome} />
      <div className="flex-1 min-w-0 p-6 md:p-8 lg:p-10">{children}</div>
    </div>
  )
}
