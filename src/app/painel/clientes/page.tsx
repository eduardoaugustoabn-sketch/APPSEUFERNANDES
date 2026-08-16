import { getServerSupabaseClient } from '@/lib/supabase/server'
import { ListaClientes } from '@/components/lista-clientes'

export default async function ClientesPainelPage() {
  const supabase = await getServerSupabaseClient()
  const { data: clientes } = await supabase.from('clientes').select('id, nome, telefone, cidade').order('nome')

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Clientes</h1>
      <ListaClientes clientes={clientes ?? []} baseHref="/painel/clientes" />
    </div>
  )
}
