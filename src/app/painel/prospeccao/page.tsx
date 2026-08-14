import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ProspeccaoStatusForm } from '@/components/prospeccao-status-form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

async function novoContato(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()

  const nome = formData.get('nome') as string
  const telefone = formData.get('telefone') as string

  const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
    p_barbearia_id: membro!.barbearia_id, p_nome: nome, p_telefone: telefone,
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
  const { data: membro } = await supabase
    .from('membros')
    .select('id, barbearia_id, meta_prospeccao_dia, meta_prospeccao_semana')
    .eq('user_id', user!.id)
    .single()

  const hoje = new Date().toISOString().slice(0, 10)
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

  const agora = new Date()
  const diaSemanaAtual = agora.getDay() // 0 = domingo, 1 = segunda, ...
  const diasDesdeSegunda = diaSemanaAtual === 0 ? 6 : diaSemanaAtual - 1
  const inicioSemana = new Date(agora)
  inicioSemana.setDate(agora.getDate() - diasDesdeSegunda)
  const inicioSemanaStr = inicioSemana.toISOString().slice(0, 10)

  const { data: contatosHoje } = await supabase.from('prospeccoes').select('id').eq('membro_id', membro!.id).eq('data', hoje)
  const { data: contatosSemana } = await supabase.from('prospeccoes').select('id').eq('membro_id', membro!.id).gte('data', inicioSemanaStr)
  const { data: convertidosHoje } = await supabase.from('prospeccoes').select('id').eq('membro_id', membro!.id).gte('convertido_em', `${hoje}T00:00:00`)
  const { data: pendentes } = await supabase.from('prospeccoes').select('*').eq('membro_id', membro!.id).in('status', ['novo_lead', 'em_contato', 'interessado']).order('criado_em')
  const { data: contatosMes } = await supabase.from('prospeccoes').select('status').eq('membro_id', membro!.id).gte('data', inicioMes)

  const totalContatosHoje = contatosHoje?.length ?? 0
  const metaDia = membro!.meta_prospeccao_dia ?? 0
  const totalContatosSemana = contatosSemana?.length ?? 0
  const metaSemana = membro!.meta_prospeccao_semana ?? 0
  const totalMes = contatosMes?.length ?? 0
  const convertidosMes = contatosMes?.filter((c) => c.status === 'convertido').length ?? 0
  const naoConvertidosMes = contatosMes?.filter((c) => c.status === 'nao_convertido').length ?? 0
  const finalizadosMes = convertidosMes + naoConvertidosMes
  const taxaMes = finalizadosMes > 0 ? Math.round((convertidosMes / finalizadosMes) * 100) : 0

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Prospecção</h1>

      {metaDia > 0 && (
        <div className="mb-4">
          <p className="text-sm mb-1">Meta diária de contatos</p>
          <div className="w-full bg-muted rounded h-6 overflow-hidden mb-1">
            <div className="bg-primary h-full text-primary-foreground text-xs flex items-center justify-center" style={{ width: `${Math.min((totalContatosHoje / metaDia) * 100, 100)}%` }}>
              {totalContatosHoje} / {metaDia}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {totalContatosHoje >= metaDia ? 'Meta batida!' : `${totalContatosHoje} de ${metaDia} — faltam ${metaDia - totalContatosHoje}`}
          </p>
        </div>
      )}

      {metaSemana > 0 && (
        <div className="mb-4">
          <p className="text-sm mb-1">Meta semanal de contatos</p>
          <div className="w-full bg-muted rounded h-6 overflow-hidden mb-1">
            <div className="bg-primary h-full text-primary-foreground text-xs flex items-center justify-center" style={{ width: `${Math.min((totalContatosSemana / metaSemana) * 100, 100)}%` }}>
              {totalContatosSemana} / {metaSemana}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {totalContatosSemana >= metaSemana ? 'Meta batida!' : `${totalContatosSemana} de ${metaSemana} — faltam ${metaSemana - totalContatosSemana}`}
          </p>
        </div>
      )}

      <form action={novoContato} className="flex gap-2 items-center mt-4 flex-wrap">
        <Input name="nome" placeholder="Nome" required />
        <Input name="telefone" placeholder="Telefone" required />
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
