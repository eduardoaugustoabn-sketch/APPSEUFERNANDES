import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

async function criarServico(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('servicos').insert({
    barbearia_id: membro!.barbearia_id,
    nome: formData.get('nome') as string,
    duracao_minutos: Number(formData.get('duracao_minutos')),
    preco: Number(formData.get('preco')),
  })
  revalidatePath('/servicos')
}

export default async function ServicosPage() {
  const supabase = await getServerSupabaseClient()
  const { data: servicos } = await supabase.from('servicos').select('*').order('nome')

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Serviços</h1>
      <form action={criarServico} className="flex gap-2 mb-6">
        <Input name="nome" placeholder="Nome" required />
        <Input name="duracao_minutos" type="number" placeholder="Duração (min)" required />
        <Input name="preco" type="number" step="0.01" placeholder="Preço" required />
        <Button type="submit">Adicionar</Button>
      </form>
      <table className="w-full text-left">
        <thead><tr><th>Nome</th><th>Duração</th><th>Preço</th></tr></thead>
        <tbody>
          {servicos?.map((s) => (
            <tr key={s.id}><td>{s.nome}</td><td>{s.duracao_minutos}min</td><td>R$ {s.preco}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
