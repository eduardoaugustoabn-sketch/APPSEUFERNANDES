import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ProspeccaoStatusForm } from '@/components/prospeccao-status-form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TelefoneClienteBusca } from '@/components/telefone-cliente-busca'

async function novoContato(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()

  const nome = formData.get('nome') as string
  const telefone = formData.get('telefone') as string
  const bairro = (formData.get('bairro') as string) || null
  const cidade = (formData.get('cidade') as string) || null

  const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
    p_barbearia_id: membro!.barbearia_id, p_nome: nome, p_telefone: telefone,
    p_bairro: bairro, p_cidade: cidade,
  })
  if (clienteId.error) return

  await supabase.from('prospeccoes').insert({
    barbearia_id: membro!.barbearia_id,
    membro_id: membro!.id,
    nome,
    telefone,
    cliente_id: clienteId.data,
    canal: (formData.get('canal') as string) || null,
    oferta_corte_gratis: formData.get('oferta_corte_gratis') === 'on',
  })
  revalidatePath('/painel/prospeccao')
}

export default async function ProspeccaoPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id, meta_prospeccao_dia').eq('user_id', user!.id).single()

  const hoje = new Date().toISOString().slice(0, 10)
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

  const { data: contatosHoje } = await supabase.from('prospeccoes').select('id').eq('membro_id', membro!.id).eq('data', hoje)
  const { data: convertidosHoje } = await supabase.from('prospeccoes').select('id').eq('membro_id', membro!.id).gte('convertido_em', `${hoje}T00:00:00`)
  const { data: pendentes } = await supabase.from('prospeccoes').select('*').eq('membro_id', membro!.id).in('status', ['novo_lead', 'em_contato', 'interessado']).order('criado_em')
  const { data: contatosMes } = await supabase.from('prospeccoes').select('status').eq('membro_id', membro!.id).gte('data', inicioMes)

  const totalContatosHoje = contatosHoje?.length ?? 0
  const meta = membro!.meta_prospeccao_dia ?? 0
  const totalMes = contatosMes?.length ?? 0
  const convertidosMes = contatosMes?.filter((c) => c.status === 'convertido').length ?? 0
  const naoConvertidosMes = contatosMes?.filter((c) => c.status === 'nao_convertido').length ?? 0
  const finalizadosMes = convertidosMes + naoConvertidosMes
  const taxaMes = finalizadosMes > 0 ? Math.round((convertidosMes / finalizadosMes) * 100) : 0

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Prospecção</h1>

      {meta > 0 && (
        <>
          <p className="text-sm mb-1">Meta diária de contatos</p>
          <div className="w-full bg-muted rounded h-6 overflow-hidden">
            <div className="bg-primary h-full text-primary-foreground text-xs flex items-center justify-center" style={{ width: `${Math.min((totalContatosHoje / meta) * 100, 100)}%` }}>
              {totalContatosHoje} / {meta}
            </div>
          </div>
        </>
      )}

      <form action={novoContato} className="flex gap-2 items-center mt-4 flex-wrap">
        <TelefoneClienteBusca />
        <select name="canal" className="border rounded px-2 py-1 bg-input">
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
        <Button type="submit">+ Novo contato prospectado</Button>
      </form>

      <h2 className="font-heading text-lg font-semibold mt-6 mb-2">Pendentes de conversão ({pendentes?.length ?? 0})</h2>
      {pendentes?.map((p) => (
        <div key={p.id} className="flex justify-between items-center border-b py-2">
          <span>{p.nome} · {p.telefone} · {p.canal ?? 'sem canal'}{p.oferta_corte_gratis && ' · corte grátis'} · {new Date(p.criado_em).toLocaleDateString()}</span>
          <ProspeccaoStatusForm prospeccaoId={p.id} statusAtual={p.status} />
        </div>
      ))}

      <h2 className="font-heading text-lg font-semibold mt-6 mb-2">Conversão</h2>
      <p>Convertidos hoje: {convertidosHoje?.length ?? 0}</p>
      <p>Taxa de conversão deste mês: {taxaMes}% ({finalizadosMes} finalizados de {totalMes} prospectados — os que ainda não agendaram/compareceram não entram nessa conta)</p>
    </div>
  )
}
