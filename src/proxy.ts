import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PROTECTED_PREFIXES = ['/admin', '/painel']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  if (!isProtected) return NextResponse.next()

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
