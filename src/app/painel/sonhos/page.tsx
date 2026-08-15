import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SonhoRow } from '@/components/sonho-row'

async function criarSonho(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('sonhos').insert({
    barbearia_id: membro!.barbearia_id,
    membro_id: membro!.id,
    nome: formData.get('nome') as string,
    valor_alvo: Number(formData.get('valor_alvo')),
    percentual_comissao: Number(formData.get('percentual_comissao')),
  })
  revalidatePath('/painel/sonhos')
}

export default async function SonhosPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id').eq('user_id', user!.id).single()

  const { data: sonhos } = await supabase
    .from('sonhos')
    .select('*')
    .eq('membro_id', membro!.id)
    .order('concluido')
    .order('criado_em')

  const sonhosComProgresso = await Promise.all(
    (sonhos ?? []).map(async (sonho) => {
      const { data: comissao } = await supabase.rpc('comissao_acumulada', {
        p_membro_id: membro!.id,
        p_data_inicio: sonho.criado_em,
      })
      const valorAcumulado = Math.min(
        Number(comissao ?? 0) * (sonho.percentual_comissao / 100),
        sonho.valor_alvo
      )
      if (!sonho.concluido && valorAcumulado >= sonho.valor_alvo) {
        await supabase.from('sonhos').update({ concluido: true }).eq('id', sonho.id)
        sonho.concluido = true
      }
      return { sonho, valorAcumulado }
    })
  )

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Sonhos</h1>

      <form action={criarSonho} className="flex gap-2 mb-6 flex-wrap items-center">
        <Input name="nome" placeholder="Nome do sonho" className="w-40" required />
        <Input name="valor_alvo" type="number" step="0.01" min="0.01" placeholder="Valor-alvo" className="w-32" required />
        <Input name="percentual_comissao" type="number" step="0.01" min="0.01" max="100" placeholder="% da comissão" className="w-32" required />
        <Button type="submit">+ Novo sonho</Button>
      </form>

      {sonhosComProgresso.map(({ sonho, valorAcumulado }) => (
        <SonhoRow key={sonho.id} sonho={sonho} valorAcumulado={valorAcumulado} />
      ))}
    </div>
  )
}
