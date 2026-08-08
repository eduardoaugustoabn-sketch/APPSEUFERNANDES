import { getServerSupabaseClient } from '@/lib/supabase/server'
import { ProspeccaoConverterForm } from '@/components/prospeccao-converter-form'

async function novoContato(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('prospeccoes').insert({
    barbearia_id: membro!.barbearia_id,
    membro_id: membro!.id,
    canal: (formData.get('canal') as string) || null,
    oferta_corte_gratis: formData.get('oferta_corte_gratis') === 'on',
  })
}

export default async function ProspeccaoPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id, meta_prospeccao_dia').eq('user_id', user!.id).single()

  const hoje = new Date().toISOString().slice(0, 10)
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

  const { data: contatosHoje } = await supabase.from('prospeccoes').select('id').eq('membro_id', membro!.id).eq('data', hoje)
  const { data: convertidosHoje } = await supabase.from('prospeccoes').select('id').eq('membro_id', membro!.id).gte('convertido_em', `${hoje}T00:00:00`)
  const { data: pendentes } = await supabase.from('prospeccoes').select('*').eq('membro_id', membro!.id).eq('status', 'contactado').order('criado_em')
  const { data: contatosMes } = await supabase.from('prospeccoes').select('status').eq('membro_id', membro!.id).gte('data', inicioMes)

  const totalContatosHoje = contatosHoje?.length ?? 0
  const meta = membro!.meta_prospeccao_dia ?? 0
  const totalMes = contatosMes?.length ?? 0
  const convertidosMes = contatosMes?.filter((c) => c.status === 'convertido').length ?? 0
  const taxaMes = totalMes > 0 ? Math.round((convertidosMes / totalMes) * 100) : 0

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Prospecção</h1>

      {meta > 0 && (
        <>
          <p className="text-sm mb-1">Meta diária de contatos</p>
          <div className="w-full bg-muted rounded h-6 overflow-hidden">
            <div className="bg-green-600 h-full text-white text-xs flex items-center justify-center" style={{ width: `${Math.min((totalContatosHoje / meta) * 100, 100)}%` }}>
              {totalContatosHoje} / {meta}
            </div>
          </div>
        </>
      )}

      <form action={novoContato} className="flex gap-2 items-center mt-4">
        <select name="canal" className="border rounded px-2 py-1">
          <option value="">Canal (opcional)</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="indicacao">Indicação</option>
          <option value="rua">Na rua</option>
          <option value="redes_sociais">Redes sociais</option>
          <option value="outro">Outro</option>
        </select>
        <label className="text-sm flex items-center gap-1">
          <input type="checkbox" name="oferta_corte_gratis" /> Ofereci corte grátis + consultoria
        </label>
        <button type="submit" className="border rounded px-3 py-1">+ Novo contato prospectado</button>
      </form>

      <h2 className="font-medium mt-6 mb-2">Pendentes de conversão ({pendentes?.length ?? 0})</h2>
      {pendentes?.map((p) => (
        <div key={p.id} className="flex justify-between items-center border-b py-2">
          <span>{p.canal ?? 'sem canal'} {p.oferta_corte_gratis && '· corte grátis'} · {new Date(p.criado_em).toLocaleDateString()}</span>
          <ProspeccaoConverterForm barbeariaId={membro!.barbearia_id} prospeccaoId={p.id} />
        </div>
      ))}

      <h2 className="font-medium mt-6 mb-2">Conversão</h2>
      <p>Convertidos hoje: {convertidosHoje?.length ?? 0}</p>
      <p>Taxa dos contatos deste mês: {taxaMes}% (contatos recentes ainda podem converter)</p>
    </div>
  )
}
