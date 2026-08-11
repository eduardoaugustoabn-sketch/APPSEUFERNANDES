'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname()
  // The active item is the longest href that matches — otherwise a
  // section root like /admin would light up alongside /admin/servicos
  // on every one of its own subpages.
  const ativoHref = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  return (
    <div className="flex gap-4">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`text-sm hover:underline ${item.href === ativoHref ? 'text-primary font-medium' : 'text-muted-foreground'}`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  )
}
