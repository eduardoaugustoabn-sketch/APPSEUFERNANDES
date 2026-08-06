'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

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
    <form onSubmit={handleSubmit} className="max-w-sm mx-auto mt-20 flex flex-col gap-3">
      <h1 className="text-xl font-semibold">Entrar</h1>
      <Input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <Input type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit">Entrar</Button>
    </form>
  )
}
