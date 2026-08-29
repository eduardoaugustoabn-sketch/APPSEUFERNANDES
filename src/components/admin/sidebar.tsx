'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SignOutButton } from '@/components/sign-out-button'

const ICON_PATHS: Record<string, React.ReactNode> = {
  '/admin': (
    <>
      <rect x="3" y="3" width="7" height="8" rx="2" />
      <rect x="14" y="3" width="7" height="5" rx="2" />
      <rect x="3" y="15" width="7" height="6" rx="2" />
      <rect x="14" y="11" width="7" height="10" rx="2" />
    </>
  ),
  '/admin/agenda': (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  '/admin/servicos': (
    <>
      <circle cx="6" cy="6" r="2.6" />
      <circle cx="6" cy="18" r="2.6" />
      <path d="M20 4L8.3 15.7M8.3 8.3L20 20" />
    </>
  ),
  '/admin/produtos': (
    <>
      <path d="M3 7.5l9-4.5 9 4.5-9 4.5-9-4.5z" />
      <path d="M3 7.5v9l9 4.5 9-4.5v-9" />
      <path d="M12 12v9" />
    </>
  ),
  '/admin/loja': (
    <>
      <path d="M6 8h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  '/admin/planos-carreira': (
    <>
      <path d="M3 17l5-5 4 4 8-9" />
      <path d="M14 7h6v6" />
    </>
  ),
  '/admin/barbeiros': (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c0-4.14 3.36-7.5 7.5-7.5s7.5 3.36 7.5 7.5" />
    </>
  ),
  '/admin/ranking': (
    <path d="M4 20V13M12 20V6M20 20v-9" />
  ),
  '/admin/prospeccao': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
    </>
  ),
  '/admin/clientes': (
    <>
      <circle cx="9" cy="8" r="3.6" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5.5a3.5 3.5 0 0 1 0 7M17.5 14.4c2.1.8 3.5 2.6 3.5 5.6" />
    </>
  ),
  '/admin/canais-prospeccao': (
    <>
      <path d="M4 6h16M4 12h10M4 18h6" />
    </>
  ),
  '/admin/categorias-origem': (
    <>
      <path d="M4 6h16M4 12h10M4 18h6" />
    </>
  ),
  '/admin/sonhos': (
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

export function AdminSidebar({
  navItems, nomeAdmin,
}: {
  navItems: { href: string; label: string }[]
  nomeAdmin: string
}) {
  const pathname = usePathname()
  // Mesmo critério de rota ativa (href mais longo que casa) de
  // painel/sidebar.tsx — duplicado deliberadamente em vez de compartilhado,
  // ver decisão na spec da fase 3.
  const ativoHref = navItems
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  const iniciais = nomeAdmin.trim().split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase()

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

      <div className="mt-auto flex items-center gap-[11px] px-2 py-1.5">
        <div className="w-[34px] h-[34px] rounded-[11px] bg-[#25352D] flex items-center justify-center text-[13px] font-bold text-sidebar-icon shrink-0">{iniciais}</div>
        <div className="flex flex-col leading-tight flex-1 min-w-0">
          <span className="text-[13px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis">{nomeAdmin}</span>
          <span className="text-[11px] text-sidebar-muted">Admin</span>
        </div>
        <SignOutButton className="text-sidebar-muted hover:text-sidebar-fg text-xs font-semibold no-underline shrink-0" />
      </div>
    </aside>
  )
}
