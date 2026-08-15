import { getServerSupabaseClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'

export default async function AdminSonhosPage() {
  const supabase = await getServerSupabaseClient()

  const { data: barbeiros } = await supabase
    .from('membros')
    .select('id, nome')
    .eq('papel', 'barbeiro')
    .eq('ativo', true)

  const { data: sonhos } = await supabase
    .from('sonhos')
    .select('*')
    .order('criado_em')

  const nomesPorMembroId = new Map((barbeiros ?? []).map((b) => [b.id, b.nome]))

  const sonhosComProgresso = await Promise.all(
    (sonhos ?? [])
      .filter((sonho) => nomesPorMembroId.has(sonho.membro_id))
      .map(async (sonho) => {
        const { data: comissao } = await supabase.rpc('comissao_acumulada', {
          p_membro_id: sonho.membro_id,
          p_data_inicio: sonho.criado_em,
        })
        const valorAcumulado = Math.min(
          Number(comissao ?? 0) * (sonho.percentual_comissao / 100),
          sonho.valor_alvo
        )
        return { sonho, nomeBarbeiro: nomesPorMembroId.get(sonho.membro_id)!, valorAcumulado }
      })
  )

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Sonhos dos barbeiros</h1>

      {sonhosComProgresso.length === 0 && (
        <p className="text-muted-foreground">Nenhum sonho cadastrado ainda.</p>
      )}

      {sonhosComProgresso.map(({ sonho, nomeBarbeiro, valorAcumulado }) => {
        const percentualProgresso = Math.min(Math.round((valorAcumulado / sonho.valor_alvo) * 100), 100)
        const concluidoNaTela = sonho.concluido || valorAcumulado >= sonho.valor_alvo
        return (
          <Card key={sonho.id} className="mb-4">
            <CardContent className="p-6">
              <div className="flex justify-between items-center mb-2">
                <p className="font-heading text-base font-bold">
                  {nomeBarbeiro} — {sonho.nome}
                  {concluidoNaTela && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 text-xs font-bold">
                      Concluído
                    </span>
                  )}
                </p>
              </div>
              <div className="w-full bg-muted rounded-full h-6 overflow-hidden mb-2">
                <div className="bg-primary h-full text-primary-foreground text-xs flex items-center justify-center" style={{ width: `${percentualProgresso}%` }}>
                  {percentualProgresso}%
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                R$ {valorAcumulado.toFixed(2)} de R$ {Number(sonho.valor_alvo).toFixed(2)} · {sonho.percentual_comissao}% da comissão reservado
              </p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
