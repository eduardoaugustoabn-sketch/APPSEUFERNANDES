import { getServerSupabaseClient } from '@/lib/supabase/server'
import { ListaClientes } from '@/components/lista-clientes'

export default async function ClientesPainelPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()

  const { data: clientes } = await supabase.rpc('clientes_com_status', {
    p_barbearia_id: membro!.barbearia_id, p_membro_id: membro!.id,
  })

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Meus clientes</h1>
      <ListaClientes clientes={clientes ?? []} baseHref="/painel/clientes" />
    </div>
  )
}
