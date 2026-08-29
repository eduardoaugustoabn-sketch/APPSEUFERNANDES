import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ProspeccaoStatusForm } from '@/components/prospeccao-status-form'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
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
  const categoriaOrigem = (formData.get('categoria_origem') as string) || null
  const canal = (formData.get('canal') as string) || null

  if (canal) {
    const { data: canalValido } = await supabase.from('canais_prospeccao').select('id').eq('barbearia_id', membro!.barbearia_id).eq('nome', canal).eq('ativo', true).maybeSingle()
    if (!canalValido) throw new Error('Canal inválido.')
  }

  const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
    p_barbearia_id: membro!.barbearia_id, p_nome: nome, p_telefone: telefone,
    p_bairro: bairro, p_cidade: cidade, p_categoria_origem: categoriaOrigem,
    p_membro_id: membro!.id,
  })
  if (clienteId.error) throw new Error(clienteId.error.message)

  await supabase.from('prospeccoes').insert({
    barbearia_id: membro!.barbearia_id,
    membro_id: membro!.id,
    nome,
    telefone,
    cliente_id: clienteId.data,
    canal,
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

  const { data: categorias } = await supabase.from('categorias_origem').select('id, nome').eq('barbearia_id', membro!.barbearia_id).eq('ativo', true).order('nome')
  const { data: canais } = await supabase.from('canais_prospeccao').select('id, nome').eq('barbearia_id', membro!.barbearia_id).eq('ativo', true).order('nome')

  const hoje = new Date().toISOString().slice(0, 10)
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

  const agora = new Date()
  const diaSemanaAtual = agora.getDay() // 0 = domingo, 1 = segunda, ...
  const diasDesdeSegunda = diaSemanaAtual === 0 ? 6 : diaSemanaAtual - 1
  const inicioSemana = new Date(agora)
  inicioSemana.setDate(agora.getDate() - diasDesdeSegunda)
  const inicioSemanaStr = inicioSemana.toISOString().slice(0, 10)

  const { data: agendadosHoje } = await supabase.from('prospeccoes').select('id').eq('membro_id', membro!.id).gte('agendado_em', `${hoje}T00:00:00`)
  const { data: agendadosSemana } = await supabase.from('prospeccoes').select('id').eq('membro_id', membro!.id).gte('agendado_em', `${inicioSemanaStr}T00:00:00`)
  const { data: convertidosHoje } = await supabase.from('prospeccoes').select('id').eq('membro_id', membro!.id).gte('convertido_em', `${hoje}T00:00:00`)
  const { data: pendentes } = await supabase.from('prospeccoes').select('*').eq('membro_id', membro!.id).in('status', ['novo_lead', 'em_contato', 'interessado']).order('criado_em')
  const { data: contatosMes } = await supabase.from('prospeccoes').select('status').eq('membro_id', membro!.id).gte('data', inicioMes)

  const totalAgendadosHoje = agendadosHoje?.length ?? 0
  const metaDia = membro!.meta_prospeccao_dia ?? 0
  const totalAgendadosSemana = agendadosSemana?.length ?? 0
  const metaSemana = membro!.meta_prospeccao_semana ?? 0
  const totalMes = contatosMes?.length ?? 0
  const convertidosMes = contatosMes?.filter((c) => c.status === 'convertido').length ?? 0
  const naoConvertidosMes = contatosMes?.filter((c) => c.status === 'nao_convertido').length ?? 0
  const finalizadosMes = convertidosMes + naoConvertidosMes
  const taxaMes = finalizadosMes > 0 ? Math.round((convertidosMes / finalizadosMes) * 100) : 0

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Prospecção</h1>

      {(metaDia > 0 || metaSemana > 0) && (
        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="font-heading text-base font-bold mb-5">Metas de prospecção</h2>
            {metaDia > 0 && (
              <div className="mb-4">
                <p className="text-sm mb-1">Meta diária de agendados</p>
                <div className="w-full bg-muted rounded-full h-6 overflow-hidden mb-1">
                  <div className="bg-primary h-full text-primary-foreground text-xs flex items-center justify-center" style={{ width: `${Math.min((totalAgendadosHoje / metaDia) * 100, 100)}%` }}>
                    {totalAgendadosHoje} / {metaDia}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {totalAgendadosHoje >= metaDia ? 'Meta batida!' : `${totalAgendadosHoje} de ${metaDia} — faltam ${metaDia - totalAgendadosHoje}`}
                </p>
              </div>
            )}

            {metaSemana > 0 && (
              <div>
                <p className="text-sm mb-1">Meta semanal de agendados</p>
                <div className="w-full bg-muted rounded-full h-6 overflow-hidden mb-1">
                  <div className="bg-primary h-full text-primary-foreground text-xs flex items-center justify-center" style={{ width: `${Math.min((totalAgendadosSemana / metaSemana) * 100, 100)}%` }}>
                    {totalAgendadosSemana} / {metaSemana}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {totalAgendadosSemana >= metaSemana ? 'Meta batida!' : `${totalAgendadosSemana} de ${metaSemana} — faltam ${metaSemana - totalAgendadosSemana}`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mb-6 overflow-visible">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Novo contato prospectado</h2>
          <form action={novoContato} className="flex gap-2 items-center flex-wrap">
            <TelefoneClienteBusca meuMembroId={membro!.id} categorias={categorias ?? []} />
            <Select name="canal" aria-label="Canal" className="w-40" defaultValue="">
              <option value="">Canal (opcional)</option>
              {canais?.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
            </Select>
            <label className="text-sm flex items-center gap-1">
              <input type="checkbox" name="oferta_corte_gratis" /> Ofereci corte grátis + consultoria
            </label>
            <Button type="submit">+ Novo contato prospectado</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Pendentes de conversão ({pendentes?.length ?? 0})</h2>
          {pendentes?.map((p) => (
            <div key={p.id} className="flex justify-between items-center border-b py-2 last:border-b-0">
              <span>{p.nome} · {p.telefone} · {p.canal ?? 'sem canal'}{p.oferta_corte_gratis && ' · corte grátis'} · {new Date(p.criado_em).toLocaleDateString()}</span>
              <ProspeccaoStatusForm prospeccaoId={p.id} statusAtual={p.status} />
            </div>
          ))}
          {(pendentes?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">Nenhuma prospecção pendente.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Conversão de prospecção (mês)</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4 mb-4">
            <div>
              <p className="font-mono text-[10px] tracking-[0.13em] uppercase text-muted-foreground">Contatos feitos</p>
              <p className="text-2xl font-extrabold tracking-tight mt-1">{totalMes}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] tracking-[0.13em] uppercase text-muted-foreground">Viraram atendimento</p>
              <p className="text-2xl font-extrabold tracking-tight mt-1 text-primary">{convertidosMes}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] tracking-[0.13em] uppercase text-muted-foreground">Taxa de conversão</p>
              <p className="text-2xl font-extrabold tracking-tight mt-1">{taxaMes}%</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            De {finalizadosMes} contatos já finalizados este mês (que agendaram e compareceram, ou não), {convertidosMes} viraram atendimento — os que ainda não agendaram/compareceram não entram nessa conta.
          </p>
          <p className="text-sm mt-3">Convertidos hoje: {convertidosHoje?.length ?? 0}</p>
        </CardContent>
      </Card>
    </div>
  )
}
