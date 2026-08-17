import { getServerSupabaseClient } from '@/lib/supabase/server'
import { EditarClienteForm } from '@/components/editar-cliente-form'

type Ranking = { item: string; tipo: string; quantidade: number; valor_total: number }
type AtendimentoHistorico = { data: string; preco: number; servicos: { nome: string } | null }
type VendaHistorico = { data: string; preco_unitario: number; quantidade: number; produtos: { nome: string } | null }

export async function FichaCliente({ clienteId }: { clienteId: string }) {
  const supabase = await getServerSupabaseClient()

  const { data: cliente } = await supabase.from('clientes').select('nome, telefone, criado_em, data_nascimento, bairro, cidade, observacao, categoria_origem').eq('id', clienteId).single()
  const { data: ranking } = await supabase.rpc('ranking_cliente', { p_cliente_id: clienteId }) as { data: Ranking[] | null }
  const { data: atendimentos } = await supabase.from('atendimentos').select('data, preco, servicos(nome)').eq('cliente_id', clienteId).order('data', { ascending: false }) as { data: AtendimentoHistorico[] | null }
  const { data: vendas } = await supabase.from('vendas_produtos').select('data, preco_unitario, quantidade, produtos(nome)').eq('cliente_id', clienteId).order('data', { ascending: false }) as { data: VendaHistorico[] | null }

  const { data: agendamentosHistorico } = await supabase
    .from('agendamentos')
    .select('data, hora_inicio, status, servicos(nome)')
    .eq('cliente_id', clienteId)
    .order('data', { ascending: false }) as { data: { data: string; hora_inicio: string; status: string; servicos: { nome: string } | null }[] | null }

  const { data: prospeccaoHistorico } = await supabase
    .from('prospeccoes')
    .select('data, canal, status, convertido_em')
    .eq('cliente_id', clienteId)
    .order('criado_em', { ascending: false }) as { data: { data: string; canal: string | null; status: string; convertido_em: string | null }[] | null }

  const maiorQuantidade = Math.max(1, ...(ranking ?? []).map((r) => r.quantidade))

  const historico = [
    ...(atendimentos ?? []).map((a) => ({ data: a.data, texto: a.servicos?.nome ?? '—', valor: a.preco })),
    ...(vendas ?? []).map((v) => ({ data: v.data, texto: `${v.produtos?.nome ?? '—'} (produto)`, valor: v.preco_unitario * v.quantidade })),
  ].sort((a, b) => (a.data < b.data ? 1 : -1))

  return (
    <div>
      <p className="font-heading text-lg font-semibold">
        {cliente?.nome} · {cliente?.telefone}
        {cliente?.data_nascimento ? ` · nasc. ${new Date(cliente.data_nascimento).toLocaleDateString()}` : ''}
        {cliente?.bairro ? ` · ${cliente.bairro}` : ''}
        {cliente?.cidade ? ` · ${cliente.cidade}` : ''}
      </p>
      <p className="text-xs text-muted-foreground mb-4">Cliente desde {cliente?.criado_em ? new Date(cliente.criado_em).toLocaleDateString() : ''}</p>

      <EditarClienteForm
        clienteId={clienteId}
        bairroAtual={cliente?.bairro ?? null}
        cidadeAtual={cliente?.cidade ?? null}
        observacaoAtual={cliente?.observacao ?? null}
        categoriaOrigemAtual={cliente?.categoria_origem ?? null}
      />

      <h3 className="font-heading text-base font-semibold mt-4 mb-2">Mais usados por ele</h3>
      {ranking?.map((r) => (
        <div key={`${r.tipo}-${r.item}`} className="mb-2">
          <div className="flex justify-between text-sm">
            <span>{r.item}</span>
            <span>{r.quantidade}x · <strong>R$ {Number(r.valor_total).toFixed(2)}</strong></span>
          </div>
          <div className="w-full bg-muted rounded h-2 overflow-hidden">
            <div className="bg-primary h-full" style={{ width: `${(r.quantidade / maiorQuantidade) * 100}%` }} />
          </div>
        </div>
      ))}

      <h3 className="font-heading text-base font-semibold mt-4 mb-2">Histórico completo</h3>
      {historico.map((h, i) => (
        <div key={i} className="flex justify-between text-sm border-b py-1">
          <span>{new Date(h.data).toLocaleDateString()} — {h.texto}</span>
          <span>R$ {Number(h.valor).toFixed(2)}</span>
        </div>
      ))}

      <h3 className="font-heading text-base font-semibold mt-4 mb-2">Agendamentos</h3>
      {(agendamentosHistorico ?? []).map((a, i) => (
        <div key={i} className="flex justify-between text-sm border-b py-1">
          <span>{new Date(a.data).toLocaleDateString()} {a.hora_inicio.slice(0, 5)} — {a.servicos?.nome ?? '—'}</span>
          <span className="text-muted-foreground">{a.status}</span>
        </div>
      ))}

      {(prospeccaoHistorico ?? []).length > 0 && (
        <>
          <h3 className="font-heading text-base font-semibold mt-4 mb-2">Prospecção</h3>
          {prospeccaoHistorico!.map((p, i) => (
            <div key={i} className="flex justify-between text-sm border-b py-1">
              <span>{new Date(p.data).toLocaleDateString()} — {p.canal ?? 'sem canal'}</span>
              <span className="text-muted-foreground">{p.status}{p.convertido_em ? ` (${new Date(p.convertido_em).toLocaleDateString()})` : ''}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
