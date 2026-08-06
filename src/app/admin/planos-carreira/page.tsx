import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

async function criarPlano(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('planos_carreira').insert({
    barbearia_id: membro!.barbearia_id,
    nome: formData.get('nome') as string,
    percentual_produto: Number(formData.get('percentual_produto')),
    percentual_servico: Number(formData.get('percentual_servico')),
  })
  revalidatePath('/admin/planos-carreira')
}

export default async function PlanosCarreiraPage() {
  const supabase = await getServerSupabaseClient()
  const { data: planos } = await supabase.from('planos_carreira').select('*').order('nome')

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Planos de carreira</h1>
      <form action={criarPlano} className="flex gap-2 mb-6">
        <Input name="nome" placeholder="Nome (ex: Sênior)" required />
        <Input name="percentual_produto" type="number" step="0.01" placeholder="% produto" required />
        <Input name="percentual_servico" type="number" step="0.01" placeholder="% serviço" required />
        <Button type="submit">Adicionar</Button>
      </form>
      <table className="w-full text-left">
        <thead><tr><th>Nome</th><th>% produto</th><th>% serviço</th></tr></thead>
        <tbody>
          {planos?.map((p) => (
            <tr key={p.id}><td>{p.nome}</td><td>{p.percentual_produto}%</td><td>{p.percentual_servico}%</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
