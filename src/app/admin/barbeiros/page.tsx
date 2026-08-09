import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function vincularPlano(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const metaRaw = formData.get('meta_prospeccao_dia') as string
  const meta = metaRaw === '' ? null : Number(metaRaw)

  await supabase
    .from('membros')
    .update({
      plano_carreira_id: (formData.get('plano_carreira_id') as string) || null,
      meta_prospeccao_dia: meta,
    })
    .eq('id', formData.get('membro_id') as string)
  revalidatePath('/admin/barbeiros')
}

export default async function BarbeirosPage() {
  const supabase = await getServerSupabaseClient()
  const { data: barbeiros } = await supabase.from('membros').select('*').eq('papel', 'barbeiro').order('nome')
  const { data: planos } = await supabase.from('planos_carreira').select('*')

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Barbeiros</h1>
      {barbeiros?.map((b) => (
        <form
          key={`${b.id}-${b.plano_carreira_id ?? 'none'}-${b.meta_prospeccao_dia ?? 'none'}`}
          action={vincularPlano}
          className="flex gap-2 items-center mb-2"
        >
          <input type="hidden" name="membro_id" value={b.id} />
          <span className="w-32">{b.nome}</span>
          <select name="plano_carreira_id" defaultValue={b.plano_carreira_id ?? ''} className="border rounded px-2 py-1">
            <option value="">Sem plano</option>
            {planos?.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <input
            name="meta_prospeccao_dia"
            type="number"
            defaultValue={b.meta_prospeccao_dia ?? ''}
            placeholder="Meta diária de contatos"
            className="border rounded px-2 py-1 w-48"
          />
          <button type="submit" className="border rounded px-3 py-1">Salvar</button>
        </form>
      ))}
    </div>
  )
}
