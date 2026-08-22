# Redesign Visual — Agenda (Fase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/painel/agenda` (header, KPI strip, grade de horários, e os 5 painéis de formulário — `BloqueioForm` mockado, mais `AtenderAgoraForm`/`LancamentoForm`/`AgendarSlotForm`/`RemarcarForm`/`ClienteAutocomplete` sem mockup, reestilizados por extrapolação) para bater com a identidade visual "SF" entregue na Fase 1 — sem mudar nenhuma regra de negócio, query ou condição já existente.

**Architecture:** Dois ajustes de base compartilhados primeiro (novo componente `Select`, e o `Input` ganhando um fundo levemente off-white) — mesma lógica da Fase 1 de "tokens/componentes primeiro, telas depois". Depois `agenda-dia.tsx` (a peça central: state, fetch, e toda a lógica de slots/agendamentos) tem sua árvore JSX reescrita mantendo cada função de lógica intacta, e os 5 componentes de formulário trocam seus wrappers/inputs pelos componentes compartilhados sem tocar em nenhuma função de submit/validação/fetch.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui, Supabase.

**Spec:** `docs/superpowers/specs/2026-08-22-redesign-visual-agenda-fase2-design.md`

## Global Constraints

- **Nenhuma regra de negócio muda** — toda função de fetch/validação/submit em `agenda-dia.tsx` e nos 5 formulários continua fazendo exatamente o que já faz hoje. As únicas exceções pontuais e explícitas: (1) `agenda-dia.tsx` passa a selecionar `preco` dentro de `servicos(...)` na query de agendamentos (só para o KPI "Previsto no dia" — zero query nova, é um campo a mais no select já existente); (2) os cliques/handlers continuam ligados exatamente às mesmas funções.
- **`Input` ganha fundo `#FCFCFB`** globalmente (novo token `--input-bg`) — efeito esperado em todo o app, não só Agenda.
- **Novo componente `Select`** (`src/components/ui/select.tsx`) usado pelos 5 arquivos que hoje têm `<select className="border rounded px-2 py-1">` solto.
- **Múltiplos agendamentos empilhados no mesmo horário continuam funcionando exatamente como hoje** — é o comportamento mais fácil de quebrar sem perceber numa reestilização; o Global Constraint aqui é: se um passo pedir "substituir X por Y" e X incluir lógica condicional (`.map`, `if (agendamento.status === ...)`), a condição em si nunca muda, só as classes CSS ao redor dela.

---

### Task 1: `Select` compartilhado + fundo do `Input`

**Files:**
- Create: `src/components/ui/select.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/components/ui/input.tsx`

**Interfaces:**
- Produces: `Select` — mesmo formato de props que um `<select>` nativo (`React.ComponentProps<"select">`), usado pela Task 3. O novo token `--input-bg` é consumido indiretamente (via `Input`) pelas Tasks 2 e 3.

- [ ] **Step 1: Novo token `--input-bg` em `globals.css`**

Em `src/app/globals.css`, dentro do bloco `@theme inline`, adicionar (junto das outras `--color-*` já lá, ordem não importa):

```css
  --color-input-bg: var(--input-bg);
```

E dentro do bloco `:root`, adicionar (junto dos outros tokens novos da Fase 1):

```css
  --input-bg: #FCFCFB;
```

- [ ] **Step 2: `Input` usa o novo fundo**

Em `src/components/ui/input.tsx`, na string de classes dentro de `cn(...)`, trocar a substring:

```
border border-input bg-transparent px-2.5
```

por:

```
border border-input bg-input-bg px-2.5
```

(Não mexer em `file:bg-transparent`, que é uma classe diferente, para o pseudo-elemento de input de arquivo — não usado nesta tela, mas sem motivo pra tocar.)

- [ ] **Step 3: Criar `src/components/ui/select.tsx`**

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-input-bg px-2.5 py-1 text-base text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export { Select }
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 5: Verificação visual manual**

Se um navegador estiver disponível: abrir `/login` e qualquer formulário existente (ex.: `/admin/servicos`) e confirmar que os inputs continuam legíveis com o fundo levemente off-white — não deve haver nenhuma quebra de contraste em nenhuma tela.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/components/ui/input.tsx src/components/ui/select.tsx
git commit -m "feat: add shared Select component and Input background token"
```

---

### Task 2: `AgendaDia` + `BloqueioForm`

**Files:**
- Modify: `src/app/painel/agenda/page.tsx`
- Modify: `src/components/agenda-dia.tsx`
- Modify: `src/components/bloqueio-form.tsx`

**Interfaces:**
- Consumes: `--input-bg` da Task 1 (via `Input`) — não usa `Select` diretamente (nenhum `<select>` em `agenda-dia.tsx`/`bloqueio-form.tsx`).
- Produces: nada consumido pela Task 3 (arquivos independentes).

- [ ] **Step 1: Header de `src/app/painel/agenda/page.tsx`**

Substituir o arquivo inteiro por:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { AgendaDia } from '@/components/agenda-dia'

export default async function AgendaPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()
  const { data: servicos } = await supabase.from('servicos').select('id, nome, preco, duracao_minutos, ativo').eq('barbearia_id', membro!.barbearia_id)
  const { data: produtos } = await supabase.from('produtos').select('id, nome, preco_venda, quantidade_estoque, ativo').eq('barbearia_id', membro!.barbearia_id)

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
      />
    </div>
  )
}
```

- [ ] **Step 2: Reescrever `src/components/agenda-dia.tsx`**

Substituir o arquivo inteiro por:

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

const PASSO_MINUTOS = 60

function gerarSlots(horaInicio: string, horaFim: string): string[] {
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

  function statusDoSlot(slot: string) {
    const bloqueio = bloqueios.find((b) => b.hora_inicio.slice(0, 5) <= slot.slice(0, 5) && slot.slice(0, 5) < b.hora_fim.slice(0, 5))
    if (bloqueio) return { tipo: 'bloqueado' as const, bloqueio }
    const doSlot = agendamentos.filter((a) => a.hora_inicio.slice(0, 5) <= slot.slice(0, 5) && slot.slice(0, 5) < a.hora_fim.slice(0, 5))
    if (doSlot.length > 0) return { tipo: 'ocupado' as const, agendamentos: doSlot }
    return { tipo: 'livre' as const }
  }

  const livresCount = slotsUnicos.filter((s) => statusDoSlot(s).tipo === 'livre').length
  const agendadosCount = slotsUnicos.filter((s) => statusDoSlot(s).tipo === 'ocupado').length
  const bloqueadosCount = slotsUnicos.filter((s) => statusDoSlot(s).tipo === 'bloqueado').length
  const previstoNoDia = agendamentos.reduce((s, a) => s + (a.servicos?.preco ?? 0), 0)

  function fecharPaineis() {
    setModoAgenda(null)
    setSlotParaAgendar(null)
    setRemarcando(null)
    setAtendendoAgora(false)
  }

  function clicarSlot(slot: string) {
    const info = statusDoSlot(slot)
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
                const info = statusDoSlot(slot)
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

- [ ] **Step 3: Reescrever `src/components/bloqueio-form.tsx`**

Substituir o arquivo inteiro por:

```tsx
'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function BloqueioForm({ membroId, onBloqueado }: { membroId: string; onBloqueado?: () => void }) {
  const [data, setData] = useState('')
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFim, setHoraFim] = useState('')
  const [motivo, setMotivo] = useState('')
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (!data || !horaInicio || !horaFim) { setMensagem('Preencha data, início e fim.'); return }
    if (horaFim <= horaInicio) { setMensagem('O fim precisa ser depois do início.'); return }

    setSalvando(true)
    setMensagem(null)
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase.from('bloqueios_agenda').insert({ membro_id: membroId, data, hora_inicio: horaInicio, hora_fim: horaFim, motivo: motivo || null })
    setSalvando(false)
    if (error) { setMensagem(error.message); return }

    setMensagem('Horário bloqueado.')
    setData('')
    setHoraInicio('')
    setHoraFim('')
    setMotivo('')
    onBloqueado?.()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3">
        <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
        <Input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
      </div>
      <Input placeholder="Motivo (almoço, ausência...)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      <Button type="button" onClick={salvar} disabled={salvando} className="w-full">Bloquear</Button>
      {mensagem && <p className="text-sm text-muted-foreground">{mensagem}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 5: Verificação visual manual**

Como barbeiro, abrir `/painel/agenda`. Confirmar: header com data mono + "Agenda"; 4 KPIs no topo; card "Horários do dia" com legenda e a grade de slots (livre/bloqueado/ocupado, incluindo pelo menos um caso com 2+ agendamentos no mesmo horário se houver dado de teste pra isso); card "Bloquear horário" à direita quando nenhum painel de ação está aberto; clicar num horário livre abre o painel de agendar no lugar do card de bloquear; bloquear um horário funciona e o horário aparece bloqueado após recarregar.

- [ ] **Step 6: Commit**

```bash
git add src/app/painel/agenda/page.tsx src/components/agenda-dia.tsx src/components/bloqueio-form.tsx
git commit -m "feat: redesign agenda grid and bloqueio form to match SF visual identity"
```

---

### Task 3: Formulários sem mockup (`AtenderAgoraForm`, `LancamentoForm`, `AgendarSlotForm`, `RemarcarForm`, `ClienteAutocomplete`)

**Files:**
- Modify: `src/components/atender-agora-form.tsx`
- Modify: `src/components/lancamento-form.tsx`
- Modify: `src/components/agendar-slot-form.tsx`
- Modify: `src/components/remarcar-form.tsx`
- Modify: `src/components/cliente-autocomplete.tsx`

**Interfaces:**
- Consumes: `Select` da Task 1; `Card`/`CardContent` (já existentes, sem mudança de interface).

- [ ] **Step 1: `src/components/atender-agora-form.tsx`**

Manter as linhas 1–71 (imports, tipos, e toda a função `criar`) exatamente como estão, adicionando aos imports:

```tsx
import { Select } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
```

Substituir só o `return (...)` final por:

```tsx
  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="font-heading text-base font-bold mb-4">Atender agora</h3>
        <div className="flex flex-col gap-3">
          <ClienteAutocomplete onResolved={setCliente} />
          <Select value={servicoId} onChange={(e) => setServicoId(e.target.value)}>
            <option value="">Serviço</option>
            {servicos.filter((s) => s.ativo).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </Select>
        </div>
        <div className="flex gap-2 mt-4">
          <Button type="button" onClick={criar} disabled={salvando}>Iniciar atendimento</Button>
          <Button type="button" variant="outline" onClick={onCancelar}>Cancelar</Button>
        </div>
        {mensagem && <p className="text-sm text-muted-foreground mt-2">{mensagem}</p>}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: `src/components/lancamento-form.tsx`**

Manter as linhas 1–202 (imports, tipos, e toda a lógica — `useEffect` de busca de horários, `adicionarServico`, `adicionarProduto`, `removerServico`, `removerProduto`, `salvar`) exatamente como estão, adicionando aos imports:

```tsx
import { Select } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
```

Substituir só o `return (...)` final por:

```tsx
  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="font-heading text-base font-bold mb-4">Atender agendamento — {modoAgenda.horaInicio.slice(0, 5)}</h3>

        <ClienteAutocomplete
          key={clienteAutocompleteKey}
          onResolved={setCliente}
          valorInicial={{ nome: modoAgenda.clienteNome, telefone: modoAgenda.clienteTelefone }}
        />

        <div className="mt-4">
          <p className="text-[11.5px] font-bold text-foreground/70 uppercase tracking-wide mb-2">Serviços (corte, serviço extra...)</p>
          {servicosSelecionados.map((s, index) => (
            <div key={`${s.id}-${index}`} className="flex justify-between items-center text-[13.5px] py-1.5 border-b border-muted">
              <span>{s.nome} (R${s.preco})</span>
              <button type="button" onClick={() => removerServico(index)} className="text-destructive text-xs font-bold underline">remover</button>
            </div>
          ))}
          <div className="flex gap-2 mt-2.5">
            <Select value={servicoParaAdicionar} onChange={(e) => setServicoParaAdicionar(e.target.value)} className="flex-1">
              <option value="">Serviço</option>
              {servicos.filter((s) => s.ativo).map((s) => <option key={s.id} value={s.id}>{s.nome} (R${s.preco})</option>)}
            </Select>
            <Button type="button" variant="outline" onClick={adicionarServico} disabled={!servicoParaAdicionar}>+ Adicionar</Button>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-[11.5px] font-bold text-foreground/70 uppercase tracking-wide mb-2">Produtos (opcional)</p>
          {produtosSelecionados.map((p) => (
            <div key={p.id} className="flex justify-between items-center text-[13.5px] py-1.5 border-b border-muted">
              <span>{p.quantidade}x {p.nome} (R${p.preco_venda})</span>
              <button type="button" onClick={() => removerProduto(p.id)} className="text-destructive text-xs font-bold underline">remover</button>
            </div>
          ))}
          <div className="flex gap-2 mt-2.5">
            <Select value={produtoParaAdicionar} onChange={(e) => setProdutoParaAdicionar(e.target.value)} className="flex-1">
              <option value="">Produto</option>
              {produtos.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome} (estoque: {p.quantidade_estoque})</option>)}
            </Select>
            <Input type="number" min={1} value={quantidadeParaAdicionar} onChange={(e) => setQuantidadeParaAdicionar(Number(e.target.value))} className="w-16" />
            <Button type="button" variant="outline" onClick={adicionarProduto} disabled={!produtoParaAdicionar}>+ Adicionar</Button>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-[13px] font-semibold flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={agendarRetorno} onChange={(e) => setAgendarRetorno(e.target.checked)} className="w-4 h-4 accent-primary" />
            Agendar próxima visita deste cliente
          </label>
          {agendarRetorno && (
            <div className="flex flex-col gap-2.5 mt-3">
              <Select value={retornoServicoId} onChange={(e) => setRetornoServicoId(e.target.value)}>
                <option value="">Serviço do retorno</option>
                {servicos.filter((s) => s.ativo).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </Select>
              <Input type="date" value={retornoData} onChange={(e) => setRetornoData(e.target.value)} />
              {buscandoHorarios && <p className="text-xs text-muted-foreground">Buscando horários...</p>}
              {!buscandoHorarios && retornoHorarios.length > 0 && (
                <Select value={retornoHorario} onChange={(e) => setRetornoHorario(e.target.value)}>
                  <option value="">Horário</option>
                  {retornoHorarios.map((h) => <option key={h.hora_inicio} value={h.hora_inicio}>{h.hora_inicio.slice(0, 5)}</option>)}
                </Select>
              )}
              {!buscandoHorarios && retornoHorarios.length === 0 && retornoServicoId && (
                <p className="text-xs text-muted-foreground">Nenhum horário disponível para esse dia.</p>
              )}
            </div>
          )}
        </div>

        <Button type="button" onClick={salvar} disabled={salvando} className="w-full mt-5">Concluir atendimento</Button>
        {mensagem && <p className="text-sm text-muted-foreground mt-2">{mensagem}</p>}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: `src/components/agendar-slot-form.tsx`**

Manter as linhas 1–87 (imports, tipos, `servicoSelecionado`/`conflito`, `gravar`, `confirmar`) exatamente como estão, adicionando aos imports:

```tsx
import { Select } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
```

Substituir só o `return (...)` final por:

```tsx
  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="font-heading text-base font-bold mb-4">Agendar horário — {horaInicio.slice(0, 5)}</h3>
        <div className="flex flex-col gap-3">
          <ClienteAutocomplete onResolved={setCliente} />
          <Select value={servicoId} onChange={(e) => { setServicoId(e.target.value); setPedindoConfirmacao(false) }}>
            <option value="">Serviço</option>
            {servicos.filter((s) => s.ativo).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </Select>
        </div>

        {pedindoConfirmacao && (
          <div className="mt-4 rounded-2xl border border-amber/30 bg-amber-tint p-4 flex flex-col gap-3">
            <p className="text-[13.5px] text-amber-text">Este horário já possui um serviço agendado. Tem certeza de que deseja confirmar este agendamento?</p>
            <div className="flex gap-2">
              <Button type="button" onClick={gravar} disabled={salvando}>Confirmar mesmo assim</Button>
              <Button type="button" variant="outline" onClick={() => setPedindoConfirmacao(false)}>Cancelar</Button>
            </div>
          </div>
        )}

        {!pedindoConfirmacao && (
          <Button type="button" onClick={confirmar} disabled={salvando} className="w-full mt-4">Confirmar agendamento</Button>
        )}
        {mensagem && <p className="text-sm text-muted-foreground mt-2">{mensagem}</p>}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: `src/components/remarcar-form.tsx`**

Manter as linhas 1–55 (imports, tipos, `buscarHorarios`, `confirmar`) exatamente como estão, adicionando aos imports:

```tsx
import { Select } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
```

Substituir só o `return (...)` final por:

```tsx
  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="font-heading text-base font-bold mb-4">Remarcar — {clienteNome}</h3>
        <div className="flex flex-col gap-3">
          <Input type="date" value={data} onChange={(e) => { setData(e.target.value); setHorarios([]); setHorario('') }} />
          <Button type="button" variant="outline" onClick={buscarHorarios} disabled={buscando}>Ver horários</Button>
          {horarios.length > 0 && (
            <Select value={horario} onChange={(e) => setHorario(e.target.value)}>
              <option value="">Horário</option>
              {horarios.map((h) => <option key={h.hora_inicio} value={h.hora_inicio}>{h.hora_inicio.slice(0, 5)}</option>)}
            </Select>
          )}
        </div>
        <div className="flex gap-2 mt-4">
          <Button type="button" onClick={confirmar} disabled={salvando || !horario}>Confirmar</Button>
          <Button type="button" variant="outline" onClick={onCancelar}>Cancelar</Button>
        </div>
        {mensagem && <p className="text-sm text-muted-foreground mt-2">{mensagem}</p>}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 5: `src/components/cliente-autocomplete.tsx`**

Manter as linhas 1–174 (imports, tipos, e todas as funções `handle*`/`verificar`/`selecionar`) exatamente como estão, adicionando ao import de `@/components/ui/select`:

```tsx
import { Select } from '@/components/ui/select'
```

Substituir só o `return (...)` final por:

```tsx
  return (
    <div className="flex flex-col gap-2.5">
      <Input placeholder="Nome do cliente" value={nome} onChange={(e) => handleNomeChange(e.target.value)} />
      <div className="relative">
        <Input
          placeholder="Telefone"
          value={telefone}
          onChange={(e) => verificar(e.target.value)}
          onBlur={() => setMostrarLista(false)}
        />
        {mostrarLista && resultados.length > 0 && (
          <div className="absolute z-10 w-full mt-1.5 bg-card border border-border rounded-2xl shadow-[0_1px_2px_rgba(20,32,27,0.04)] max-h-48 overflow-y-auto">
            {resultados.map((r) => (
              <button
                key={r.id}
                type="button"
                onMouseDown={() => selecionar(r)}
                className="w-full text-left px-3.5 py-2.5 text-[13.5px] hover:bg-muted border-b border-muted last:border-b-0"
              >
                {r.nome} · {r.telefone} · {r.total_cortes}º corte aqui
              </button>
            ))}
          </div>
        )}
      </div>
      <Input type="date" placeholder="Data de nascimento (opcional)" value={dataNascimento} onChange={(e) => handleDataNascimentoChange(e.target.value)} />
      <Input placeholder="Bairro (opcional)" value={bairro} onChange={(e) => handleBairroChange(e.target.value)} />
      <Input placeholder="Cidade (opcional)" value={cidade} onChange={(e) => handleCidadeChange(e.target.value)} />
      <Select
        value={categoriaOrigem}
        onChange={(e) => handleCategoriaOrigemChange(e.target.value)}
      >
        <option value="">Como conheceu a barbearia?</option>
        {CATEGORIAS_ORIGEM.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </Select>
    </div>
  )
}
```

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 7: Verificação visual manual — os 4 fluxos completos**

Como barbeiro em `/painel/agenda`:
1. **Atender agora**: clicar, preencher cliente novo (nome+telefone+"como conheceu"), escolher serviço, "Iniciar atendimento" — deve abrir o painel de "Atender agendamento" (LancamentoForm). Adicionar um produto, clicar "Concluir atendimento" — confirmar que salva e o horário aparece como "realizado" na grade.
2. **Agendar horário**: clicar num slot livre, preencher cliente + serviço, confirmar — o slot deve virar "ocupado".
3. **Remarcar**: num agendamento confirmado, clicar "remarcar", escolher nova data, "Ver horários", escolher um horário, confirmar — o agendamento deve mudar de horário.
4. **Bloquear horário**: preencher data/início/fim/motivo, "Bloquear" — o card retorna a mostrar "Bloquear horário" (painel fechado) e o slot bloqueado aparece na grade.

Confirmar que o autocomplete de cliente (digitar telefone de um cliente já existente) mostra a lista de sugestões com o visual novo e que selecionar uma preenche os campos corretamente.

- [ ] **Step 8: Commit**

```bash
git add src/components/atender-agora-form.tsx src/components/lancamento-form.tsx src/components/agendar-slot-form.tsx src/components/remarcar-form.tsx src/components/cliente-autocomplete.tsx
git commit -m "feat: redesign agenda action panels to match SF visual identity"
```

---

### Task 4: Regressão final

**Files:** none (verification only).

- [ ] **Step 1: Automatizada**

Run:
```bash
npm test
npm run build
npx supabase test db
```
Expected: todos os testes existentes continuam passando (nenhuma lógica muda nesta fase); build sem erros; suíte pgTAP sem regressão.

- [ ] **Step 2: Passagem manual completa (se navegador disponível)**

Repetir a checagem visual das Tasks 2 e 3 uma vez mais de ponta a ponta, com o resultado final combinado. Conferir também que `/painel` (Dashboard, Fase 1), `/painel/clientes`, `/painel/prospeccao`, `/painel/sonhos`, `/login` e uma página do `/admin` continuam corretas — o ajuste de fundo do `Input`/novo `Select` afeta essas telas também (formulários existentes nelas), mesmo sem redesenho de conteúdo.

- [ ] **Step 3: Sem commit para esta task** — é só verificação; se algo for encontrado,
corrigir como um commit pequeno separado, referenciando qual task/step regrediu.
