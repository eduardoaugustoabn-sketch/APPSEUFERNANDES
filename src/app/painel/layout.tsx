import { redirect } from 'next/navigation'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { PainelSidebar } from '@/components/painel/sidebar'
import { MobileSidebarShell } from '@/components/mobile-sidebar-shell'

const NAV_ITEMS = [
  { href: '/painel', label: 'Dashboard' },
  { href: '/painel/agenda', label: 'Agenda' },
  { href: '/painel/prospeccao', label: 'Prospecção' },
  { href: '/painel/clientes', label: 'Clientes' },
  { href: '/painel/onboarding', label: 'Onboarding' },
  { href: '/painel/loja', label: 'Loja' },
  { href: '/painel/sonhos', label: 'Sonhos' },
]

export default async function BarbeiroLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membro } = await supabase
    .from('membros')
    .select('id, nome, papel, meta_faturamento_mes')
    .eq('user_id', user.id)
    .single()

  if (!membro) {
    await supabase.auth.signOut()
    redirect('/login')
  }

  if (membro.papel !== 'barbeiro') redirect('/')

  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

  const { data: atendimentosMes } = await supabase
    .from('atendimentos')
    .select('preco')
    .eq('membro_id', membro.id)
    .gte('data', inicioMes)
  const { data: vendasMes } = await supabase
    .from('vendas_produtos')
    .select('preco_unitario, quantidade')
    .eq('membro_id', membro.id)
    .gte('data', inicioMes)

  const faturamentoMes =
    (atendimentosMes ?? []).reduce((s, a) => s + Number(a.preco), 0) +
    (vendasMes ?? []).reduce((s, v) => s + Number(v.preco_unitario) * v.quantidade, 0)

  return (
    <MobileSidebarShell
      titulo="Seu Fernandes"
      sidebar={
        <PainelSidebar
          navItems={NAV_ITEMS}
          nomeMembro={membro.nome}
          faturamentoMes={faturamentoMes}
          metaFaturamentoMes={membro.meta_faturamento_mes}
        />
      }
    >
      {children}
    </MobileSidebarShell>
  )
}
