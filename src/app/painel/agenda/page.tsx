import { getServerSupabaseClient } from '@/lib/supabase/server'
import { AgendaDia } from '@/components/agenda-dia'

export default async function AgendaPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()
  const { data: servicos } = await supabase.from('servicos').select('id, nome, preco, duracao_minutos, ativo').eq('barbearia_id', membro!.barbearia_id)
  const { data: produtos } = await supabase.from('produtos').select('id, nome, preco_venda, quantidade_estoque, ativo').eq('barbearia_id', membro!.barbearia_id)
  const { data: categorias } = await supabase.from('categorias_origem').select('id, nome').eq('barbearia_id', membro!.barbearia_id).eq('ativo', true).order('nome')

  const dataHoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const dataHojeCapitalizada = dataHoje.charAt(0).toUpperCase() + dataHoje.slice(1)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-muted-foreground mb-1.5">{dataHojeCapitalizada}</div>
        <h1 className="text-[31px] font-extrabold tracking-tight">Agenda</h1>
      </div>

      <AgendaDia
        barbeariaId={membro!.barbearia_id}
        membroId={membro!.id}
        servicos={servicos ?? []}
        produtos={produtos ?? []}
        categorias={categorias ?? []}
      />
    </div>
  )
}
