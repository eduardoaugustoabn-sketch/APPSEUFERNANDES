'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('E-mail ou senha inválidos.')
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-4">
      <div className="flex flex-col items-center gap-3">
        <div className="w-[46px] h-[46px] rounded-[14px] bg-primary flex items-center justify-center font-extrabold text-lg text-primary-foreground">SF</div>
        <div className="flex flex-col items-center leading-tight">
          <span className="text-lg font-bold tracking-tight">Seu Fernandes</span>
          <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground">Barbearia</span>
        </div>
      </div>

      <Card className="w-full max-w-sm">
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-xs font-semibold text-muted-foreground">E-mail</label>
              <Input id="email" type="email" placeholder="voce@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-xs font-semibold text-muted-foreground">Senha</label>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" size="lg" className="mt-1">Entrar</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
