'use client'

import { useState } from 'react'

export function MobileSidebarShell({
  titulo, sidebar, children,
}: {
  titulo: string
  sidebar: React.ReactNode
  children: React.ReactNode
}) {
  const [aberto, setAberto] = useState(false)

  return (
    <div className="flex min-h-screen items-stretch">
      {aberto && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setAberto(false)}
          aria-hidden="true"
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-50 transition-transform duration-200 md:static md:translate-x-0 ${aberto ? 'translate-x-0' : '-translate-x-full'}`}
        onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setAberto(false) }}
      >
        {sidebar}
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 bg-sidebar-bg text-sidebar-fg px-4 py-3.5">
          <button type="button" onClick={() => setAberto(true)} aria-label="Abrir menu" className="p-1 -m-1">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm font-bold">{titulo}</span>
        </div>
        <div className="p-6 md:p-8 lg:p-10">{children}</div>
      </div>
    </div>
  )
}
