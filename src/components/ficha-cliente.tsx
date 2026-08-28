import { getServerSupabaseClient } from '@/lib/supabase/server'
import { EditarClienteForm } from '@/components/editar-cliente-form'
import { ReatribuirDonoForm } from '@/components/reatribuir-dono-form'
import { Card, CardContent } from '@/components/ui/card'

type Ranking = { item: string; tipo: string; quantidade: number; valor_total: number }
type AtendimentoHistorico = { data: string; preco: number; servicos: { nome: string } | null }
type VendaHistorico = { data: string; preco_unitario: number; quantidade: number; produtos: { nome: string } | null }
type ClienteComStatus = {
  id: string
  cadastrado_por_membro_id: string | null; cadastrado_por_nome: string | null
  prazo_retorno_dias: number; dias_sem_vir: number | null; status: string | null
  tem_agendamento_futuro: boolean
}

const LABEL_STATUS: Record<string, string> = { verde: 'Corte em dia', amarelo: 'Precisa reagendar', vermelho: 'Sumiu' }
const COR_STATUS: Record<string, string> = { verde: 'bg-primary', amarelo: 'bg-amber', vermelho: 'bg-destructive' }

export async function FichaCliente({ clienteId }: { clienteId: string }) {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: euMembro } = await supabase.from('membros').select('id, barbearia_id, papel').eq('user_id', user!.id).single()

  const { data: cliente } = await supabase.from('clientes').select('nome, telefone, criado_em, cpf, data_nascimento, bairro, cidade, observacao, categoria_origem, prazo_retorno_dias').eq('id', clienteId).single()
  // clientes_com_status não tem parâmetro de filtro por cliente_id (só por
  // barbearia_id/membro_id) — busca todos os clientes da barbearia e filtra
  // pelo id certo. Aceitável aqui: a ficha é uma página de baixo tráfego,
  // carregada uma de cada vez; não vale criar uma segunda RPC só por isso.
  const { data: statusRows } = await supabase.rpc('clientes_com_status', { p_barbearia_id: euMembro!.barbearia_id }) as { data: ClienteComStatus[] | null }
  const status = statusRows?.find((s) => s.id === clienteId) ?? null
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

  const souAdmin = euMembro!.papel === 'admin'
  const { data: barbeiros } = souAdmin
    ? await supabase.from('membros').select('id, nome').eq('barbearia_id', euMembro!.barbearia_id).eq('papel', 'barbeiro').eq('ativo', true).order('nome')
    : { data: null }

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

          {status?.status && (
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${COR_STATUS[status.status]}`} />
              <span className="text-sm font-semibold">{LABEL_STATUS[status.status]} — {status.dias_sem_vir} dias sem vir (prazo: {status.prazo_retorno_dias}d)</span>
            </div>
          )}
          {status?.tem_agendamento_futuro && (
            <p className="text-sm font-semibold text-primary mb-3">Já tem um agendamento futuro — não precisa recontatar.</p>
          )}
          {!souAdmin && status?.cadastrado_por_membro_id && status.cadastrado_por_membro_id !== euMembro!.id && (
            <p className="text-sm bg-amber-tint text-amber-text rounded-xl px-3 py-2 mb-3">
              Este cliente já é atendido por {status.cadastrado_por_nome}.
            </p>
          )}
          {souAdmin && (
            <div className="mb-4">
              <p className="text-xs text-muted-foreground mb-1.5">Dono do cadastro</p>
              <ReatribuirDonoForm clienteId={clienteId} barbeiros={barbeiros ?? []} donoAtualId={status?.cadastrado_por_membro_id ?? null} />
            </div>
          )}

          <EditarClienteForm
            clienteId={clienteId}
            cpfAtual={cliente?.cpf ?? null}
            bairroAtual={cliente?.bairro ?? null}
            cidadeAtual={cliente?.cidade ?? null}
            observacaoAtual={cliente?.observacao ?? null}
            categoriaOrigemAtual={cliente?.categoria_origem ?? null}
            prazoRetornoAtual={cliente?.prazo_retorno_dias ?? null}
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
