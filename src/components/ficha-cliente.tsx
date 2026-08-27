import { getServerSupabaseClient } from '@/lib/supabase/server'
import { EditarClienteForm } from '@/components/editar-cliente-form'
import { Card, CardContent } from '@/components/ui/card'

type Ranking = { item: string; tipo: string; quantidade: number; valor_total: number }
type AtendimentoHistorico = { data: string; preco: number; servicos: { nome: string } | null }
type VendaHistorico = { data: string; preco_unitario: number; quantidade: number; produtos: { nome: string } | null }

export async function FichaCliente({ clienteId }: { clienteId: string }) {
  const supabase = await getServerSupabaseClient()

  const { data: cliente } = await supabase.from('clientes').select('nome, telefone, criado_em, cpf, data_nascimento, bairro, cidade, observacao, categoria_origem').eq('id', clienteId).single()
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
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-1">Dados do cliente</h2>
          <p className="font-heading text-lg font-semibold mt-3">
            {cliente?.nome} · {cliente?.telefone}
            {cliente?.data_nascimento ? ` · nasc. ${new Date(cliente.data_nascimento).toLocaleDateString()}` : ''}
            {cliente?.cpf ? ` · CPF ${cliente.cpf}` : ''}
            {cliente?.bairro ? ` · ${cliente.bairro}` : ''}
            {cliente?.cidade ? ` · ${cliente.cidade}` : ''}
          </p>
          <p className="text-xs text-muted-foreground mb-4">Cliente desde {cliente?.criado_em ? new Date(cliente.criado_em).toLocaleDateString() : ''}</p>

          <EditarClienteForm
            clienteId={clienteId}
            cpfAtual={cliente?.cpf ?? null}
            bairroAtual={cliente?.bairro ?? null}
            cidadeAtual={cliente?.cidade ?? null}
            observacaoAtual={cliente?.observacao ?? null}
            categoriaOrigemAtual={cliente?.categoria_origem ?? null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Mais usados por ele</h2>
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
          {(ranking ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum item registrado ainda.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Histórico completo</h2>
          {historico.map((h, i) => (
            <div key={i} className="flex justify-between text-sm border-b py-1 last:border-b-0">
              <span>{new Date(h.data).toLocaleDateString()} — {h.texto}</span>
              <span>R$ {Number(h.valor).toFixed(2)}</span>
            </div>
          ))}
          {historico.length === 0 && <p className="text-sm text-muted-foreground">Nenhum atendimento ou venda ainda.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Agendamentos</h2>
          {(agendamentosHistorico ?? []).map((a, i) => (
            <div key={i} className="flex justify-between text-sm border-b py-1 last:border-b-0">
              <span>{new Date(a.data).toLocaleDateString()} {a.hora_inicio.slice(0, 5)} — {a.servicos?.nome ?? '—'}</span>
              <span className="text-muted-foreground">{a.status}</span>
            </div>
          ))}
          {(agendamentosHistorico ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum agendamento ainda.</p>}
        </CardContent>
      </Card>

      {(prospeccaoHistorico ?? []).length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h2 className="font-heading text-base font-bold mb-5">Prospecção</h2>
            {prospeccaoHistorico!.map((p, i) => (
              <div key={i} className="flex justify-between text-sm border-b py-1 last:border-b-0">
                <span>{new Date(p.data).toLocaleDateString()} — {p.canal ?? 'sem canal'}</span>
                <span className="text-muted-foreground">{p.status}{p.convertido_em ? ` (${new Date(p.convertido_em).toLocaleDateString()})` : ''}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
