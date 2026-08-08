'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function ProspeccaoConverterForm({ barbeariaId, prospeccaoId }: { barbeariaId: string; prospeccaoId: string }) {
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')

  async function converter() {
    const supabase = getBrowserSupabaseClient()
    const clienteId = await supabase.rpc('criar_ou_obter_cliente', { p_barbearia_id: barbeariaId, p_nome: nome, p_telefone: telefone })
    if (clienteId.error) return
    await supabase.from('prospeccoes').update({ status: 'convertido', cliente_id: clienteId.data, convertido_em: new Date().toISOString() }).eq('id', prospeccaoId)
    window.location.reload()
  }

  if (!aberto) return <Button type="button" onClick={() => setAberto(true)}>Converteu</Button>

  return (
    <div className="flex gap-2 items-center">
      <Input placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} className="w-32" />
      <Input placeholder="Telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} className="w-32" />
      <Button type="button" onClick={converter}>Confirmar</Button>
    </div>
  )
}
