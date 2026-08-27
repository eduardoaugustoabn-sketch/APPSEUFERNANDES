# Admin: Agenda de Todos os Barbeiros Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao admin uma página `/admin/agenda` pra ver a agenda de um barbeiro específico (reaproveitando `AgendaDia` inteiro, com todas as ações) ou de todos os barbeiros de uma vez, filtrando por dia (visão só de leitura, nova).

**Architecture:** `gerarSlots`/`statusDoSlot` saem de dentro de `agenda-dia.tsx` pra um módulo compartilhado (`src/lib/agenda-slots.ts`), usado tanto por `AgendaDia` (sem mudança de comportamento) quanto por um componente novo (`AgendaTodosBarbeiros`) que busca as mesmas 3 queries pra vários barbeiros de uma vez. Um componente pequeno (`AdminAgenda`) alterna entre os dois conforme o barbeiro selecionado num `Select`. Uma página nova (`/admin/agenda`) busca os dados e monta tudo, e ganha uma entrada na sidebar do admin.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui, Supabase.

**Spec:** `docs/superpowers/specs/2026-08-27-admin-agenda-todos-barbeiros-design.md`

## Global Constraints

- **`AgendaDia` não muda de comportamento** — só a origem de `gerarSlots`/`statusDoSlot` (de closure/local pra importado). Todo o resto do arquivo é preservado.
- **Modo "Todos os barbeiros" é só leitura** — sem confirmar/cancelar/bloquear/remarcar/atender.
- **Nenhuma mudança de dados/regras de negócio** — mesmas 3 queries de sempre, só filtradas por vários `membro_id`.
- **`statusDoSlot` genérico** — recebe `bloqueios`/`agendamentos` como parâmetros (não é mais um closure), tipado com generics pra funcionar tanto com o tipo de `AgendaDia` (que tem `id`, usado pelo botão "desbloquear") quanto com o tipo mais enxuto de `AgendaTodosBarbeiros` (que também tem `membro_id`).

---

### Task 1: Extrair `gerarSlots`/`statusDoSlot` pra `src/lib/agenda-slots.ts`

**Files:**
- Create: `src/lib/agenda-slots.ts`
- Modify: `src/components/agenda-dia.tsx`

**Interfaces:**
- Produces: `gerarSlots(horaInicio: string, horaFim: string): string[]`; `statusDoSlot<B extends { hora_inicio: string; hora_fim: string; motivo: string | null }, A extends { hora_inicio: string; hora_fim: string }>(slot: string, bloqueios: B[], agendamentos: A[])` — retorna `{ tipo: 'bloqueado'; bloqueio: B } | { tipo: 'ocupado'; agendamentos: A[] } | { tipo: 'livre' }`. Usado por `AgendaDia` (Task 1) e por `AgendaTodosBarbeiros` (Task 2).

- [ ] **Step 1: Criar `src/lib/agenda-slots.ts`**

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

- [ ] **Step 2: Reescrever `src/components/agenda-dia.tsx`**

Substituir o arquivo inteiro por (idêntico ao original, exceto: `gerarSlots`/`statusDoSlot` locais removidos e importados de `@/lib/agenda-slots`, e as 5 chamadas de `statusDoSlot(slot)` viram `statusDoSlot(slot, bloqueios, agendamentos)`):

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { LancamentoForm, type ModoAgenda } from './lancamento-form'
import { AgendarSlotForm } from './agendar-slot-form'
import { RemarcarForm } from './remarcar-form'
import { AtenderAgoraForm } from './atender-agora-form'
import { BloqueioForm } from './bloqueio-form'
import { gerarSlots, statusDoSlot } from '@/lib/agenda-slots'

type Servico = { id: string; nome: string; preco: number; duracao_minutos: number; ativo: boolean }
type Produto = { id: string; nome: string; preco_venda: number; quantidade_estoque: number; ativo: boolean }

type AgendamentoDia = {
  id: string
  hora_inicio: string
  hora_fim: string
  status: string
  origem: string
  clientes: { nome: string; telefone: string } | null
  servicos: { id: string; nome: string; preco: number } | null
}

type Bloqueio = { id: string; hora_inicio: string; hora_fim: string; motivo: string | null }
type Expediente = { hora_inicio: string; hora_fim: string }

export function AgendaDia({
  barbeariaId, membroId, servicos, produtos,
}: { barbeariaId: string; membroId: string; servicos: Servico[]; produtos: Produto[] }) {
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [expedientes, setExpedientes] = useState<Expediente[]>([])
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([])
  const [agendamentos, setAgendamentos] = useState<AgendamentoDia[]>([])
  const [carregando, setCarregando] = useState(false)
  const [modoAgenda, setModoAgenda] = useState<ModoAgenda | null>(null)
  const [slotParaAgendar, setSlotParaAgendar] = useState<string | null>(null)
  const [remarcando, setRemarcando] = useState<{ id: string; servicoId: string; clienteNome: string } | null>(null)
  const [atendendoAgora, setAtendendoAgora] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const supabase = getBrowserSupabaseClient()
    const diaSemana = new Date(`${data}T00:00:00`).getDay()

    const [expedienteRes, bloqueioRes, agendamentoRes] = await Promise.all([
      supabase.from('horarios_trabalho').select('hora_inicio, hora_fim').eq('membro_id', membroId).eq('dia_semana', diaSemana),
      supabase.from('bloqueios_agenda').select('id, hora_inicio, hora_fim, motivo').eq('membro_id', membroId).eq('data', data),
      supabase.from('agendamentos')
        .select('id, hora_inicio, hora_fim, status, origem, clientes(nome, telefone), servicos(id, nome, preco)')
        .eq('membro_id', membroId).eq('data', data).neq('status', 'cancelado')
        .order('hora_inicio'),
    ])

    setExpedientes(expedienteRes.data ?? [])
    setBloqueios(bloqueioRes.data ?? [])
    setAgendamentos((agendamentoRes.data ?? []) as unknown as AgendamentoDia[])
    setCarregando(false)
  }, [data, membroId])

  useEffect(() => { carregar() }, [carregar])

  const slots = expedientes.flatMap((e) => gerarSlots(e.hora_inicio, e.hora_fim))
  const slotsUnicos = Array.from(new Set(slots)).sort()

  const livresCount = slotsUnicos.filter((s) => statusDoSlot(s, bloqueios, agendamentos).tipo === 'livre').length
  const agendadosCount = slotsUnicos.filter((s) => statusDoSlot(s, bloqueios, agendamentos).tipo === 'ocupado').length
  const bloqueadosCount = slotsUnicos.filter((s) => statusDoSlot(s, bloqueios, agendamentos).tipo === 'bloqueado').length
  const previstoNoDia = agendamentos.reduce((s, a) => s + (a.servicos?.preco ?? 0), 0)

  function fecharPaineis() {
    setModoAgenda(null)
    setSlotParaAgendar(null)
    setRemarcando(null)
    setAtendendoAgora(false)
  }

  function clicarSlot(slot: string) {
    const info = statusDoSlot(slot, bloqueios, agendamentos)
    if (info.tipo === 'bloqueado') return
    fecharPaineis()
    setSlotParaAgendar(slot)
  }

  function atenderAgendamento(agendamento: AgendamentoDia) {
    if (agendamento.status !== 'confirmado' || !agendamento.servicos) return
    fecharPaineis()
    setModoAgenda({
      agendamentoId: agendamento.id,
      clienteNome: agendamento.clientes?.nome ?? '',
      clienteTelefone: agendamento.clientes?.telefone ?? '',
      servicoId: agendamento.servicos.id,
      horaInicio: agendamento.hora_inicio,
    })
  }

  async function cancelar(id: string) {
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase.from('agendamentos').update({ status: 'cancelado' }).eq('id', id)
    if (!error) carregar()
  }

  async function confirmarAgendamento(id: string) {
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase.from('agendamentos').update({ status: 'confirmado' }).eq('id', id)
    if (!error) carregar()
  }

  async function marcarNaoCompareceu(id: string) {
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase.from('agendamentos').update({ status: 'nao_compareceu' }).eq('id', id)
    if (!error) carregar()
  }

  async function desbloquear(id: string) {
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase.from('bloqueios_agenda').delete().eq('id', id)
    if (!error) carregar()
  }

  const painelAberto = modoAgenda || slotParaAgendar || remarcando || atendendoAgora

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Input type="date" value={data} onChange={(e) => { setData(e.target.value); fecharPaineis() }} className="w-auto" />
        <button type="button" onClick={() => { fecharPaineis(); setAtendendoAgora(true) }} className="text-sm font-bold text-primary hover:underline">
          Atender agora
        </button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="font-mono text-[10px] tracking-[0.13em] uppercase text-muted-foreground">Horários livres</p>
            <p className="text-2xl font-extrabold tracking-tight mt-2">{livresCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="font-mono text-[10px] tracking-[0.13em] uppercase text-muted-foreground">Agendados</p>
            <p className="text-2xl font-extrabold tracking-tight mt-2 text-emerald-dark">{agendadosCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="font-mono text-[10px] tracking-[0.13em] uppercase text-muted-foreground">Bloqueados</p>
            <p className="text-2xl font-extrabold tracking-tight mt-2 text-amber-text">{bloqueadosCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="font-mono text-[10px] tracking-[0.13em] uppercase text-muted-foreground">Previsto no dia</p>
            <p className="text-2xl font-extrabold tracking-tight mt-2">R$ {previstoNoDia.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(330px,1fr))] gap-4 items-start">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="font-heading text-base font-bold">Horários do dia</h2>
              <div className="flex gap-3.5 text-[11.5px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-primary" />Agendado</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber" />Bloqueado</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-muted-foreground/30" />Livre</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {carregando && <p className="text-sm text-muted-foreground">Carregando...</p>}
              {!carregando && slotsUnicos.length === 0 && <p className="text-sm text-muted-foreground">Sem expediente cadastrado para este dia.</p>}

              {!carregando && slotsUnicos.map((slot) => {
                const info = statusDoSlot(slot, bloqueios, agendamentos)
                const rotulo = slot.slice(0, 5)

                if (info.tipo === 'bloqueado') {
                  return (
                    <div key={slot} className="flex items-center gap-4 px-4 py-3 rounded-2xl border border-border bg-muted/50 opacity-70">
                      <span className="font-mono text-[13px] text-foreground/70 w-11 shrink-0">{rotulo}</span>
                      <span className="w-2 h-2 rounded-sm bg-amber shrink-0" />
                      <span className="flex-1 text-[13.5px] font-semibold">bloqueado{info.bloqueio.motivo ? ` — ${info.bloqueio.motivo}` : ''}</span>
                      <button type="button" onClick={() => desbloquear(info.bloqueio.id)} className="text-destructive text-xs font-bold underline shrink-0">desbloquear</button>
                    </div>
                  )
                }

                if (info.tipo === 'ocupado') {
                  return (
                    <div key={slot} className="rounded-2xl bg-muted px-4 py-3">
                      <span className="font-mono text-[13px] font-semibold block mb-2">{rotulo}</span>
                      {info.agendamentos.map((agendamento) => {
                        const jaPassou = new Date(`${data}T${agendamento.hora_inicio}`) < new Date()
                        const concluido = agendamento.status === 'realizado' || agendamento.status === 'nao_compareceu'
                        const eDesteSlot = agendamento.hora_inicio.slice(0, 5) === slot.slice(0, 5)
                        const dotColor = agendamento.status === 'realizado' ? 'bg-primary' : agendamento.status === 'nao_compareceu' ? 'bg-muted-foreground/30' : 'bg-amber'
                        return (
                          <div key={agendamento.id} className={`flex items-center gap-3 py-1.5 ${concluido ? 'opacity-60' : ''}`}>
                            <span className={`w-2 h-2 rounded-sm shrink-0 ${dotColor}`} />
                            <button
                              type="button"
                              onClick={() => atenderAgendamento(agendamento)}
                              disabled={concluido}
                              className="text-left flex-1 min-w-0 text-[13.5px] font-semibold disabled:cursor-default"
                            >
                              {eDesteSlot
                                ? `${agendamento.clientes?.nome ?? 'cliente'} · ${agendamento.servicos?.nome ?? ''}${agendamento.status === 'realizado' ? ' · realizado' : ''}${agendamento.status === 'nao_compareceu' ? ' · não compareceu' : ''}`
                                : '↳ continua'}
                            </button>
                            {eDesteSlot && agendamento.status === 'agendado' && (
                              <span className="flex gap-3 shrink-0">
                                <button type="button" onClick={() => confirmarAgendamento(agendamento.id)} className="text-xs font-bold text-primary underline">confirmar</button>
                                <button type="button" onClick={() => cancelar(agendamento.id)} className="text-xs font-bold text-destructive underline">cancelar</button>
                              </span>
                            )}
                            {eDesteSlot && agendamento.status === 'confirmado' && (
                              <span className="flex gap-3 shrink-0">
                                <button type="button" onClick={() => atenderAgendamento(agendamento)} className="text-xs font-bold text-primary underline">atendimento</button>
                                <button
                                  type="button"
                                  onClick={() => { fecharPaineis(); setRemarcando({ id: agendamento.id, servicoId: agendamento.servicos?.id ?? '', clienteNome: agendamento.clientes?.nome ?? '' }) }}
                                  className="text-xs font-bold underline"
                                >
                                  remarcar
                                </button>
                                <button type="button" onClick={() => cancelar(agendamento.id)} className="text-xs font-bold text-destructive underline">cancelar</button>
                                {jaPassou && (
                                  <button type="button" onClick={() => marcarNaoCompareceu(agendamento.id)} className="text-xs font-bold text-amber-text underline">não compareceu</button>
                                )}
                              </span>
                            )}
                          </div>
                        )
                      })}
                      <button type="button" onClick={() => clicarSlot(slot)} className="text-xs font-bold text-primary underline mt-1.5">+ agendar outro aqui</button>
                    </div>
                  )
                }

                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => clicarSlot(slot)}
                    className="w-full flex items-center gap-4 px-4 py-3 rounded-2xl border border-transparent hover:border-border hover:bg-muted/50 text-left"
                  >
                    <span className="font-mono text-[13px] text-muted-foreground w-11 shrink-0">{rotulo}</span>
                    <span className="w-2 h-2 rounded-sm bg-muted-foreground/30 shrink-0" />
                    <span className="text-[13.5px] text-muted-foreground">Livre</span>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          {!painelAberto && (
            <Card>
              <CardContent className="p-6">
                <h2 className="font-heading text-base font-bold">Bloquear horário</h2>
                <p className="text-[12.5px] text-muted-foreground mt-0.5 mb-5">Almoço, ausência ou compromisso pessoal</p>
                <BloqueioForm membroId={membroId} onBloqueado={carregar} />
                <div className="mt-5 p-4 rounded-2xl bg-muted text-[12.5px] text-foreground/70 leading-relaxed">
                  Cada hora vazia é uma oportunidade perdida — bloqueie só o necessário e ofereça os horários livres na prospecção.
                </div>
              </CardContent>
            </Card>
          )}

          {modoAgenda && (
            <LancamentoForm
              barbeariaId={barbeariaId}
              membroId={membroId}
              servicos={servicos}
              produtos={produtos}
              modoAgenda={modoAgenda}
              onSalvo={() => { fecharPaineis(); carregar() }}
            />
          )}
          {slotParaAgendar && (
            <AgendarSlotForm
              barbeariaId={barbeariaId}
              membroId={membroId}
              servicos={servicos}
              data={data}
              horaInicio={slotParaAgendar}
              agendamentosExistentes={agendamentos}
              onAgendado={() => { fecharPaineis(); carregar() }}
            />
          )}
          {remarcando && (
            <RemarcarForm
              barbeariaId={barbeariaId}
              membroId={membroId}
              servicoId={remarcando.servicoId}
              agendamentoId={remarcando.id}
              clienteNome={remarcando.clienteNome}
              onRemarcado={() => { fecharPaineis(); carregar() }}
              onCancelar={fecharPaineis}
            />
          )}
          {atendendoAgora && (
            <AtenderAgoraForm
              barbeariaId={barbeariaId}
              membroId={membroId}
              servicos={servicos}
              onCriado={(modo) => { fecharPaineis(); setModoAgenda(modo) }}
              onCancelar={fecharPaineis}
            />
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 4: Verificação visual manual**

Login como barbeiro, abrir `/painel/agenda`. Confirmar que tudo continua funcionando exatamente como antes: horários livres/agendados/bloqueados aparecem certos, "Atender agora", bloquear um horário, confirmar/cancelar/remarcar um agendamento, "+ agendar outro aqui" num slot ocupado. Nenhuma diferença de comportamento deve aparecer — essa task é só um refactor interno.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agenda-slots.ts src/components/agenda-dia.tsx
git commit -m "refactor: extract slot status logic from AgendaDia into a shared module"
```

---

### Task 2: `AgendaTodosBarbeiros` (visão de leitura, todos os barbeiros)

**Files:**
- Create: `src/components/agenda-todos-barbeiros.tsx`

**Interfaces:**
- Consumes: `gerarSlots`/`statusDoSlot` (`src/lib/agenda-slots.ts`, Task 1).
- Produces: `AgendaTodosBarbeiros({ barbeiros: { id: string; nome: string }[] })` — usado por `AdminAgenda` (Task 3).

- [ ] **Step 1: Criar `src/components/agenda-todos-barbeiros.tsx`**

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

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 3: Commit**

```bash
git add src/components/agenda-todos-barbeiros.tsx
git commit -m "feat: add read-only all-barbeiros agenda view"
```

---

### Task 3: Página `/admin/agenda` + navegação

**Files:**
- Create: `src/components/admin-agenda.tsx`
- Create: `src/app/admin/agenda/page.tsx`
- Modify: `src/app/admin/layout.tsx`
- Modify: `src/components/admin/sidebar.tsx`

**Interfaces:**
- Consumes: `AgendaDia` (`src/components/agenda-dia.tsx`, Task 1, sem mudança de interface), `AgendaTodosBarbeiros` (Task 2), `Select` (`src/components/ui/select.tsx`, já existente).

- [ ] **Step 1: Criar `src/components/admin-agenda.tsx`**

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

- [ ] **Step 2: Criar `src/app/admin/agenda/page.tsx`**

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

- [ ] **Step 3: Adicionar "Agenda" ao `NAV_ITEMS` de `src/app/admin/layout.tsx`**

Encontrar:
```ts
const NAV_ITEMS = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/servicos', label: 'Serviços' },
```
Substituir por:
```ts
const NAV_ITEMS = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/agenda', label: 'Agenda' },
  { href: '/admin/servicos', label: 'Serviços' },
```

- [ ] **Step 4: Adicionar o ícone de "Agenda" ao `ICON_PATHS` de `src/components/admin/sidebar.tsx`**

Encontrar:
```tsx
const ICON_PATHS: Record<string, React.ReactNode> = {
  '/admin': (
    <>
      <rect x="3" y="3" width="7" height="8" rx="2" />
      <rect x="14" y="3" width="7" height="5" rx="2" />
      <rect x="3" y="15" width="7" height="6" rx="2" />
      <rect x="14" y="11" width="7" height="10" rx="2" />
    </>
  ),
  '/admin/servicos': (
```
Substituir por:
```tsx
const ICON_PATHS: Record<string, React.ReactNode> = {
  '/admin': (
    <>
      <rect x="3" y="3" width="7" height="8" rx="2" />
      <rect x="14" y="3" width="7" height="5" rx="2" />
      <rect x="3" y="15" width="7" height="6" rx="2" />
      <rect x="14" y="11" width="7" height="10" rx="2" />
    </>
  ),
  '/admin/agenda': (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  '/admin/servicos': (
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 6: Verificação visual manual**

Login como admin. Confirmar o novo item "Agenda" na sidebar, com ícone, logo depois de "Visão geral". Abrir `/admin/agenda`: no modo padrão ("Todos os barbeiros"), confirmar um `Card` por barbeiro ativo com os horários certos pro dia atual, trocar a data e confirmar que atualiza pra todos de uma vez. Selecionar um barbeiro específico no `Select` e confirmar que a `AgendaDia` completa aparece (seu próprio seletor de data, KPIs, "Atender agora", bloquear horário, confirmar/cancelar/remarcar/atender um agendamento) — tudo funcionando igual à tela que o barbeiro usa em `/painel/agenda`. Voltar pra "Todos os barbeiros" e confirmar que volta pra visão de leitura.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin-agenda.tsx src/app/admin/agenda/page.tsx src/app/admin/layout.tsx src/components/admin/sidebar.tsx
git commit -m "feat: add admin agenda page with per-barbeiro and all-barbeiros views"
```
