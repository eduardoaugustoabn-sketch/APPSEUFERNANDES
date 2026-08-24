'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SignOutButton } from '@/components/sign-out-button'

const ICON_PATHS: Record<string, React.ReactNode> = {
  '/painel': (
    <>
      <rect x="3" y="3" width="7" height="8" rx="2" />
      <rect x="14" y="3" width="7" height="5" rx="2" />
      <rect x="3" y="15" width="7" height="6" rx="2" />
      <rect x="14" y="11" width="7" height="10" rx="2" />
    </>
  ),
  '/painel/agenda': (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  '/painel/prospeccao': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
    </>
  ),
  '/painel/clientes': (
    <>
      <circle cx="9" cy="8" r="3.6" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5.5a3.5 3.5 0 0 1 0 7M17.5 14.4c2.1.8 3.5 2.6 3.5 5.6" />
    </>
  ),
  '/painel/sonhos': (
    <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9L3.5 9.7l5.9-.8z" />
  ),
}

function NavIcon({ href }: { href: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--color-sidebar-icon)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      {ICON_PATHS[href]}
    </svg>
  )
}

export function PainelSidebar({
  navItems, nomeMembro, faturamentoMes, metaFaturamentoMes,
}: {
  navItems: { href: string; label: string }[]
  nomeMembro: string
  faturamentoMes: number
  metaFaturamentoMes: number | null
}) {
  const pathname = usePathname()
  // Mesmo critério de rota ativa (href mais longo que casa) de
  // admin/sidebar.tsx — duplicado deliberadamente em vez de compartilhado,
  // sidebars visualmente diferentes o bastante pra não valer abstração agora.
  const ativoHref = navItems
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  const iniciais = nomeMembro.trim().split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase()

  return (
    <aside className="w-[250px] shrink-0 bg-sidebar-bg text-sidebar-fg px-[18px] py-[26px] flex flex-col gap-[30px] sticky top-0 h-screen overflow-y-auto">
      <div className="flex items-center gap-[11px] px-2">
        <div className="w-[38px] h-[38px] rounded-[12px] bg-primary flex items-center justify-center font-extrabold text-[15px] text-primary-foreground shrink-0">SF</div>
        <div className="flex flex-col leading-[1.15]">
          <span className="text-sm font-bold tracking-tight">Seu Fernandes</span>
          <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-sidebar-muted">Barbearia</span>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {navItems.map((item) => {
          const ativo = item.href === ativoHref
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center gap-3 px-3 py-[11px] rounded-xl text-sm font-semibold text-sidebar-fg hover:bg-white/[0.06] ${ativo ? 'bg-primary/[0.18] shadow-[inset_2px_0_0_var(--color-primary)]' : ''}`}
            >
              <NavIcon href={item.href} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3.5">
        {metaFaturamentoMes != null && metaFaturamentoMes > 0 && (
          <div className="rounded-2xl bg-white/5 border border-white/[0.07] p-4">
            <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-sidebar-muted mb-2">Meta do mês</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold tracking-tight">R$ {faturamentoMes.toFixed(0)}</span>
              <span className="text-xs text-sidebar-muted">/ R$ {metaFaturamentoMes.toFixed(0)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 mt-2.5 overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min((faturamentoMes / metaFaturamentoMes) * 100, 100)}%` }} />
            </div>
          </div>
        )}
        <div className="flex items-center gap-[11px] px-2 py-1.5">
          <div className="w-[34px] h-[34px] rounded-[11px] bg-[#25352D] flex items-center justify-center text-[13px] font-bold text-sidebar-icon shrink-0">{iniciais}</div>
          <div className="flex flex-col leading-tight flex-1 min-w-0">
            <span className="text-[13px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis">{nomeMembro}</span>
            <span className="text-[11px] text-sidebar-muted">Barbeiro</span>
          </div>
          <SignOutButton className="text-sidebar-muted hover:text-sidebar-fg text-xs font-semibold no-underline shrink-0" />
        </div>
      </div>
    </aside>
  )
}
