# Admin: Agenda de Todos os Barbeiros — Design Spec

## Contexto e objetivo

Hoje só o barbeiro vê sua própria agenda (`/painel/agenda`, componente `AgendaDia`) — o admin não tem nenhuma visão da agenda de ninguém. O admin precisa conseguir: (1) ver a agenda de um barbeiro específico com todas as ações de sempre (bloquear, atender, confirmar, cancelar, remarcar), e (2) ver a agenda de todos os barbeiros de uma vez, filtrando por dia, pra ter uma visão geral rápida.

Nova página `/admin/agenda`, com um seletor "Todos os barbeiros" / um barbeiro específico:

- **Barbeiro específico**: reaproveita o componente `AgendaDia` (`src/components/agenda-dia.tsx`) inteiro, sem nenhuma mudança de comportamento — mesma tela que o barbeiro já usa, com seu próprio seletor de data embutido e todas as ações.
- **Todos os barbeiros**: uma visão nova, só de leitura — uma data (seletor próprio desse modo, compartilhado entre todos os barbeiros exibidos) + uma grade com um `Card` por barbeiro, mostrando a lista de horários do dia (livre/agendado/bloqueado) no mesmo estilo visual da `AgendaDia`, sem cliques nem botões de ação. Pra agir em cima de um agendamento específico, o admin troca pro filtro de barbeiro específico.

## Decisões de escopo (validadas com o usuário)

- **Modo "Todos" é só leitura** — sem confirmar/cancelar/bloquear/remarcar/atender. Decisão explícita pra manter o escopo pequeno; a ação continua disponível trocando pro filtro de um barbeiro só.
- **Extrair `gerarSlots` e a lógica de `statusDoSlot`** (hoje só dentro de `agenda-dia.tsx`) pra um arquivo compartilhado `src/lib/agenda-slots.ts` — evita duplicar a mesma lógica de cálculo de horário/status na visão "Todos". `agenda-dia.tsx` passa a importar dali, sem nenhuma mudança de comportamento.
- **Nenhuma mudança de dados/regras de negócio** — as queries da visão "Todos" são as mesmas 3 já usadas por `AgendaDia` (`horarios_trabalho`, `bloqueios_agenda`, `agendamentos`), só filtradas por vários `membro_id` de uma vez em vez de um só, e todas continuam ignorando agendamentos `cancelado`.
- **Item "Agenda" novo na sidebar do admin** — hoje não existe, precisa ser adicionado ao `NAV_ITEMS` de `src/app/admin/layout.tsx` e ao mapa de ícones de `src/components/admin/sidebar.tsx` (reaproveitando o mesmo desenho de ícone já usado em `/painel/agenda`), logo depois de "Visão geral".

## `src/lib/agenda-slots.ts` (novo)

Extraído de `agenda-dia.tsx`, generalizado o suficiente pra funcionar tanto com o tipo de bloqueio/agendamento de `AgendaDia` (que tem `id`, usado pelo botão "desbloquear") quanto com o tipo mais enxuto da visão "Todos" (que também tem `membro_id`, usado só pra agrupar por barbeiro):

```ts
const PASSO_MINUTOS = 60

export function gerarSlots(horaInicio: string, horaFim: string): string[] {
  const slots: string[] = []
  let atual = horaInicio.slice(0, 5)
  const fim = horaFim.slice(0, 5)
  while (atual < fim) {
    slots.push(`${atual}:00`)
    const [h, m] = atual.split(':').map(Number)
    const totalMin = h * 60 + m + PASSO_MINUTOS
    atual = `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`
  }
  return slots
}

export function statusDoSlot<
  B extends { hora_inicio: string; hora_fim: string; motivo: string | null },
  A extends { hora_inicio: string; hora_fim: string },
>(slot: string, bloqueios: B[], agendamentos: A[]):
  | { tipo: 'bloqueado'; bloqueio: B }
  | { tipo: 'ocupado'; agendamentos: A[] }
  | { tipo: 'livre' } {
  const bloqueio = bloqueios.find((b) => b.hora_inicio.slice(0, 5) <= slot.slice(0, 5) && slot.slice(0, 5) < b.hora_fim.slice(0, 5))
  if (bloqueio) return { tipo: 'bloqueado', bloqueio }
  const doSlot = agendamentos.filter((a) => a.hora_inicio.slice(0, 5) <= slot.slice(0, 5) && slot.slice(0, 5) < a.hora_fim.slice(0, 5))
  if (doSlot.length > 0) return { tipo: 'ocupado', agendamentos: doSlot }
  return { tipo: 'livre' }
}
```

## `src/components/agenda-dia.tsx` (modificado)

Remove a definição local de `gerarSlots` e a função `statusDoSlot` (que hoje é um closure sobre `bloqueios`/`agendamentos` do estado do componente), substituindo por:
- `import { gerarSlots, statusDoSlot } from '@/lib/agenda-slots'`
- Todo lugar que chamava `statusDoSlot(slot)` (sem argumentos, via closure) passa a chamar `statusDoSlot(slot, bloqueios, agendamentos)` explicitamente.

Nenhuma outra linha muda — o comportamento é idêntico, só a lógica de cálculo passou a vir de um módulo compartilhado.

## `src/components/agenda-todos-barbeiros.tsx` (novo)

Client Component. Recebe `barbeiros: { id: string; nome: string }[]`. Busca as 3 queries (horários de trabalho, bloqueios, agendamentos) pra todos os barbeiros de uma vez (`'in', barbeiroIds`), agrupa por `membro_id` no cliente, e renderiza um `Card` por barbeiro com a lista de horários — mesmo visual de `AgendaDia`, mas sem nenhum `onClick`/botão.

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { gerarSlots, statusDoSlot } from '@/lib/agenda-slots'

type Barbeiro = { id: string; nome: string }
type AgendamentoDia = {
  id: string
  membro_id: string
  hora_inicio: string
  hora_fim: string
  status: string
  clientes: { nome: string } | null
  servicos: { nome: string } | null
}
type Bloqueio = { id: string; membro_id: string; hora_inicio: string; hora_fim: string; motivo: string | null }
type Expediente = { membro_id: string; hora_inicio: string; hora_fim: string }

export function AgendaTodosBarbeiros({ barbeiros }: { barbeiros: Barbeiro[] }) {
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [expedientes, setExpedientes] = useState<Expediente[]>([])
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([])
  const [agendamentos, setAgendamentos] = useState<AgendamentoDia[]>([])
  const [carregando, setCarregando] = useState(false)

  const carregar = useCallback(async () => {
    const barbeiroIds = barbeiros.map((b) => b.id)
    if (barbeiroIds.length === 0) return
    setCarregando(true)
    const supabase = getBrowserSupabaseClient()
    const diaSemana = new Date(`${data}T00:00:00`).getDay()

    const [expedienteRes, bloqueioRes, agendamentoRes] = await Promise.all([
      supabase.from('horarios_trabalho').select('membro_id, hora_inicio, hora_fim').in('membro_id', barbeiroIds).eq('dia_semana', diaSemana),
      supabase.from('bloqueios_agenda').select('id, membro_id, hora_inicio, hora_fim, motivo').in('membro_id', barbeiroIds).eq('data', data),
      supabase.from('agendamentos')
        .select('id, membro_id, hora_inicio, hora_fim, status, clientes(nome), servicos(nome)')
        .in('membro_id', barbeiroIds).eq('data', data).neq('status', 'cancelado')
        .order('hora_inicio'),
    ])

    setExpedientes(expedienteRes.data ?? [])
    setBloqueios(bloqueioRes.data ?? [])
    setAgendamentos((agendamentoRes.data ?? []) as unknown as AgendamentoDia[])
    setCarregando(false)
  }, [data, barbeiros])

  useEffect(() => { carregar() }, [carregar])

  return (
    <div className="flex flex-col gap-5">
      <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-auto" />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4 items-start">
        {barbeiros.map((barbeiro) => {
          const expedienteBarbeiro = expedientes.filter((e) => e.membro_id === barbeiro.id)
          const bloqueiosBarbeiro = bloqueios.filter((b) => b.membro_id === barbeiro.id)
          const agendamentosBarbeiro = agendamentos.filter((a) => a.membro_id === barbeiro.id)
          const slots = Array.from(new Set(expedienteBarbeiro.flatMap((e) => gerarSlots(e.hora_inicio, e.hora_fim)))).sort()

          return (
            <Card key={barbeiro.id}>
              <CardContent className="p-6">
                <h2 className="font-heading text-base font-bold mb-4">{barbeiro.nome}</h2>
                <div className="flex flex-col gap-2">
                  {carregando && <p className="text-sm text-muted-foreground">Carregando...</p>}
                  {!carregando && slots.length === 0 && <p className="text-sm text-muted-foreground">Sem expediente cadastrado para este dia.</p>}
                  {!carregando && slots.map((slot) => {
                    const info = statusDoSlot(slot, bloqueiosBarbeiro, agendamentosBarbeiro)
                    const rotulo = slot.slice(0, 5)

                    if (info.tipo === 'bloqueado') {
                      return (
                        <div key={slot} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-border bg-muted/50 opacity-70">
                          <span className="font-mono text-[12px] text-foreground/70 w-10 shrink-0">{rotulo}</span>
                          <span className="w-2 h-2 rounded-sm bg-amber shrink-0" />
                          <span className="flex-1 text-[13px] font-medium">bloqueado{info.bloqueio.motivo ? ` — ${info.bloqueio.motivo}` : ''}</span>
                        </div>
                      )
                    }

                    if (info.tipo === 'ocupado') {
                      return (
                        <div key={slot} className="rounded-xl bg-muted px-3 py-2">
                          <span className="font-mono text-[12px] font-semibold block mb-1">{rotulo}</span>
                          {info.agendamentos.map((a) => (
                            <div key={a.id} className="flex items-center gap-2 py-1">
                              <span className={`w-2 h-2 rounded-sm shrink-0 ${a.status === 'realizado' ? 'bg-primary' : a.status === 'nao_compareceu' ? 'bg-muted-foreground/30' : 'bg-amber'}`} />
                              <span className="text-[13px] font-medium">{a.clientes?.nome ?? 'cliente'} · {a.servicos?.nome ?? ''}</span>
                            </div>
                          ))}
                        </div>
                      )
                    }

                    return (
                      <div key={slot} className="flex items-center gap-3 px-3 py-2">
                        <span className="font-mono text-[12px] text-muted-foreground w-10 shrink-0">{rotulo}</span>
                        <span className="w-2 h-2 rounded-sm bg-muted-foreground/30 shrink-0" />
                        <span className="text-[13px] text-muted-foreground">Livre</span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })}
        {barbeiros.length === 0 && <p className="text-sm text-muted-foreground">Nenhum barbeiro ativo cadastrado.</p>}
      </div>
    </div>
  )
}
```

A cor de cada ponto de status (`bg-primary`/`bg-muted-foreground/30`/`bg-amber`) reproduz exatamente a mesma regra usada dentro de `AgendaDia` pro agendamento "de referência" do slot.

## `src/components/admin-agenda.tsx` (novo)

Client Component pequeno, só o seletor de barbeiro + a escolha entre `AgendaDia` e `AgendaTodosBarbeiros`:

```tsx
'use client'

import { useState } from 'react'
import { Select } from '@/components/ui/select'
import { AgendaDia } from './agenda-dia'
import { AgendaTodosBarbeiros } from './agenda-todos-barbeiros'

type Barbeiro = { id: string; nome: string }
type Servico = { id: string; nome: string; preco: number; duracao_minutos: number; ativo: boolean }
type Produto = { id: string; nome: string; preco_venda: number; quantidade_estoque: number; ativo: boolean }

export function AdminAgenda({
  barbeariaId, barbeiros, servicos, produtos,
}: { barbeariaId: string; barbeiros: Barbeiro[]; servicos: Servico[]; produtos: Produto[] }) {
  const [barbeiroId, setBarbeiroId] = useState('')

  return (
    <div className="flex flex-col gap-5">
      <Select value={barbeiroId} onChange={(e) => setBarbeiroId(e.target.value)} aria-label="Barbeiro" className="w-56">
        <option value="">Todos os barbeiros</option>
        {barbeiros.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
      </Select>

      {barbeiroId ? (
        <AgendaDia barbeariaId={barbeariaId} membroId={barbeiroId} servicos={servicos} produtos={produtos} />
      ) : (
        <AgendaTodosBarbeiros barbeiros={barbeiros} />
      )}
    </div>
  )
}
```

## `src/app/admin/agenda/page.tsx` (novo)

Server Component fino, no mesmo padrão de `src/app/painel/agenda/page.tsx`:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { AdminAgenda } from '@/components/admin-agenda'

export default async function AdminAgendaPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const { data: barbeiros } = await supabase
    .from('membros').select('id, nome')
    .eq('barbearia_id', membro!.barbearia_id).eq('papel', 'barbeiro').eq('ativo', true)
    .order('nome')
  const { data: servicos } = await supabase.from('servicos').select('id, nome, preco, duracao_minutos, ativo').eq('barbearia_id', membro!.barbearia_id)
  const { data: produtos } = await supabase.from('produtos').select('id, nome, preco_venda, quantidade_estoque, ativo').eq('barbearia_id', membro!.barbearia_id)

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Agenda</h1>
      <AdminAgenda
        barbeariaId={membro!.barbearia_id}
        barbeiros={barbeiros ?? []}
        servicos={servicos ?? []}
        produtos={produtos ?? []}
      />
    </div>
  )
}
```

## Sidebar do admin (`src/app/admin/layout.tsx` + `src/components/admin/sidebar.tsx`)

`NAV_ITEMS` de `src/app/admin/layout.tsx` ganha uma entrada nova logo após "Visão geral":

```ts
{ href: '/admin/agenda', label: 'Agenda' },
```

`ICON_PATHS` de `src/components/admin/sidebar.tsx` ganha o mesmo ícone já usado em `/painel/agenda`:

```tsx
'/admin/agenda': (
  <>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </>
),
```

## Fora de escopo (explicitamente adiado)

- Qualquer ação (confirmar/cancelar/bloquear/remarcar/atender) no modo "Todos" — fica só no modo de barbeiro específico, que já reaproveita `AgendaDia` inteiro.
- Filtro por período (semana/mês) — só um dia por vez, como `AgendaDia` já faz.
- Qualquer mudança em `AgendaDia` além da extração de `gerarSlots`/`statusDoSlot` — nenhuma mudança visual ou de comportamento nela.

## Testes

- **Build**: `npm run build` sem erros de tipo.
- **Manual (navegador)**: login como admin, abrir `/admin/agenda` (novo item na sidebar). No modo "Todos os barbeiros", confirmar um `Card` por barbeiro ativo, com os horários certos pro dia selecionado (livre/agendado/bloqueado), trocar a data e confirmar que atualiza pra todos os barbeiros de uma vez. Trocar o seletor pra um barbeiro específico e confirmar que a `AgendaDia` completa aparece, com todas as ações funcionando normalmente (a mesma tela que o barbeiro já usa). Confirmar que `/painel/agenda` continua funcionando exatamente como antes (a extração de `gerarSlots`/`statusDoSlot` não deve mudar nada lá).
- Sem testes de unidade novos para os componentes de UI. Se `src/lib/agenda-slots.ts` for considerado lógica pura o suficiente pra valer um teste de unidade rápido (ex.: `statusDoSlot` classificando corretamente um slot livre/ocupado/bloqueado), isso pode ser adicionado durante a implementação — mas não é obrigatório, já que o comportamento já é coberto indiretamente pelo uso real em `AgendaDia`.
