# Redesign Visual — Agendamento Público (Fase 13) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reestilizar `PublicBookingFlow` (a única tela pública/não-autenticada do app) com o cabeçalho "SF" + `Card` já usado em `/login`, botões de seleção em estilo "chip" consistente com o resto do app, `Select` compartilhado, e uma tela de confirmação com ícone de check — sem mudar nenhuma lógica de negócio, só a apresentação.

**Architecture:** Uma única mudança em `src/components/public-booking-flow.tsx` (o único arquivo que renderiza conteúdo — `src/app/[barbeariaSlug]/page.tsx` é um wrapper fino que não precisa mudar). Reaproveita `Card`/`CardContent` (Fase 1) e `Select` (Fase 2). O ícone de check é copiado inline do padrão já usado no Diagnóstico do Dashboard do painel (`src/app/painel/page.tsx`) — não vira componente compartilhado.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui, Supabase.

**Spec:** `docs/superpowers/specs/2026-08-25-redesign-visual-agendamento-publico-fase13-design.md`

## Global Constraints

- **Nenhuma lógica de negócio muda** — `buscarHorarios`, `selecionarServico`/`selecionarBarbeiro`, `verificarCliente`, `confirmar` (incluindo a validação de categoria de origem), e a chamada RPC `criar_agendamento_publico`, continuam com o corpo idêntico; só a apresentação (JSX/estilo) é reescrita.
- **Uma pequena correção de consistência é intencional e faz parte desta fase**: o botão de horário ganha a mesma condicional de destaque visual que serviço/barbeiro já tinham (`horario === h.hora_inicio ? ... : ...`) — o clique já selecionava o horário antes, só não havia indicação visual. Isso não é uma mudança de comportamento (nenhum estado novo, nenhuma lógica nova), só a apresentação de um estado que já existia.
- **`Card`/`Select` já existem** (Fases 1 e 2) — nenhum token novo, nenhum componente novo nesta fase.

---

### Task 1: Redesign de `PublicBookingFlow`

**Files:**
- Modify: `src/components/public-booking-flow.tsx`

**Interfaces:**
- Consumes: `Card`/`CardContent` (`src/components/ui/card.tsx`, Fase 1), `Select` (`src/components/ui/select.tsx`, Fase 2) — ambos já existentes, sem mudança de interface. O componente `PublicBookingFlow` mantém exatamente a mesma assinatura de props (`{ barbearia, servicos, barbeiros }`), consumida sem mudança por `src/app/[barbeariaSlug]/page.tsx`.

- [ ] **Step 1: Reescrever `src/components/public-booking-flow.tsx`**

Substituir o arquivo inteiro por:

```tsx
'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { CATEGORIAS_ORIGEM, type CategoriaOrigem } from '@/lib/categorias-origem'

type Servico = { id: string; nome: string; duracao_minutos: number; preco: number }
type Barbeiro = { id: string; nome: string }

const CHIP_BASE = 'rounded-lg px-3 py-1.5 text-sm transition-colors'
const CHIP_SELECIONADO = 'border border-primary bg-primary text-primary-foreground font-semibold'
const CHIP_PADRAO = 'border border-input bg-input-bg hover:border-ring'

export function PublicBookingFlow({
  barbearia, servicos, barbeiros,
}: { barbearia: { id: string; nome: string }; servicos: Servico[]; barbeiros: Barbeiro[] }) {
  const [servico, setServico] = useState<Servico | null>(null)
  const [barbeiro, setBarbeiro] = useState<Barbeiro | null>(null)
  const [data] = useState(() => new Date().toISOString().slice(0, 10))
  const [horarios, setHorarios] = useState<{ hora_inicio: string; hora_fim: string }[]>([])
  const [horario, setHorario] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [categoriaOrigem, setCategoriaOrigem] = useState<CategoriaOrigem | ''>('')
  const [reconhecimento, setReconhecimento] = useState<string | null>(null)
  const [confirmado, setConfirmado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function buscarHorarios(s: Servico, b: Barbeiro) {
    const supabase = getBrowserSupabaseClient()
    const { data: slots } = await supabase.rpc('horarios_disponiveis', {
      p_barbearia_id: barbearia.id, p_membro_id: b.id, p_servico_id: s.id, p_data: data,
    })
    setHorarios(slots ?? [])
    setHorario(null)
  }

  // Each button sets only its own piece of state — loading horários only
  // requires BOTH servico and barbeiro, so whichever click completes the
  // pair (in either order) is the one that triggers the RPC.
  function selecionarServico(s: Servico) {
    setServico(s)
    if (barbeiro) buscarHorarios(s, barbeiro)
  }

  function selecionarBarbeiro(b: Barbeiro) {
    setBarbeiro(b)
    if (servico) buscarHorarios(servico, b)
  }

  async function verificarCliente(tel: string) {
    setTelefone(tel)
    if (tel.length < 10) { setReconhecimento(null); return }
    const supabase = getBrowserSupabaseClient()
    const { data: rows } = await supabase.rpc('reconhecer_cliente', { p_barbearia_id: barbearia.id, p_telefone: tel })
    const encontrado = rows?.[0]
    if (encontrado) {
      setNome(encontrado.nome)
      setReconhecimento(`Bem-vindo de volta, ${encontrado.nome}! Este será seu ${encontrado.total_cortes + 1}º corte aqui.`)
    } else {
      setReconhecimento(null)
    }
  }

  async function confirmar() {
    if (!servico || !barbeiro || !horario) return
    if (!reconhecimento && !categoriaOrigem) { setErro('Escolha como você conheceu a barbearia.'); return }
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase.rpc('criar_agendamento_publico', {
      p_barbearia_id: barbearia.id, p_membro_id: barbeiro.id, p_servico_id: servico.id,
      p_data: data, p_hora_inicio: horario, p_nome_cliente: nome, p_telefone_cliente: telefone,
      p_bairro: bairro || null, p_cidade: cidade || null, p_categoria_origem: categoriaOrigem || null,
    })
    if (error) { setErro(error.message); return }
    setConfirmado(true)
  }

  const cabecalho = (
    <div className="flex flex-col items-center gap-3">
      <div className="w-[46px] h-[46px] rounded-[14px] bg-primary flex items-center justify-center font-extrabold text-lg text-primary-foreground">SF</div>
      <div className="flex flex-col items-center leading-tight">
        <span className="text-lg font-bold tracking-tight">{barbearia.nome}</span>
        <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground">Barbearia</span>
      </div>
    </div>
  )

  if (confirmado) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-4">
        {cabecalho}
        <Card className="w-full max-w-md">
          <CardContent className="p-6 flex flex-col items-center text-center gap-3">
            <div className="w-[34px] h-[34px] rounded-[11px] bg-primary flex items-center justify-center">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4"><path d="M5 13l4 4 10-10" /></svg>
            </div>
            <p>Agendamento confirmado! {servico?.nome} com {barbeiro?.nome} às {horario}.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-4 py-10">
      {cabecalho}

      <Card className="w-full max-w-md">
        <CardContent className="p-6 flex flex-col gap-6">
          <div>
            <p className="font-heading text-base font-bold mb-3">1. Escolha o serviço</p>
            <div className="flex gap-2 flex-wrap">
              {servicos.map((s) => (
                <button
                  key={s.id}
                  onClick={() => selecionarServico(s)}
                  className={`${CHIP_BASE} ${servico?.id === s.id ? CHIP_SELECIONADO : CHIP_PADRAO}`}
                >
                  {s.nome} ({s.duracao_minutos}min · R${s.preco})
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="font-heading text-base font-bold mb-3">2. Escolha o barbeiro</p>
            <div className="flex gap-2 flex-wrap">
              {barbeiros.map((b) => (
                <button
                  key={b.id}
                  onClick={() => selecionarBarbeiro(b)}
                  className={`${CHIP_BASE} ${barbeiro?.id === b.id ? CHIP_SELECIONADO : CHIP_PADRAO}`}
                >
                  {b.nome}
                </button>
              ))}
            </div>
          </div>

          {horarios.length > 0 && (
            <div>
              <p className="font-heading text-base font-bold mb-3">3. Escolha o horário</p>
              <div className="flex gap-2 flex-wrap">
                {horarios.map((h) => (
                  <button
                    key={h.hora_inicio}
                    onClick={() => setHorario(h.hora_inicio)}
                    className={`${CHIP_BASE} ${horario === h.hora_inicio ? CHIP_SELECIONADO : CHIP_PADRAO}`}
                  >
                    {h.hora_inicio}
                  </button>
                ))}
              </div>
            </div>
          )}

          {horario && (
            <div>
              <p className="font-heading text-base font-bold mb-3">4. Seus dados</p>
              <div className="flex flex-col gap-3">
                <Input placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
                <Input placeholder="Telefone" value={telefone} onBlur={(e) => verificarCliente(e.target.value)} onChange={(e) => setTelefone(e.target.value)} />
                <Input placeholder="Bairro (opcional)" value={bairro} onChange={(e) => setBairro(e.target.value)} />
                <Input placeholder="Cidade (opcional)" value={cidade} onChange={(e) => setCidade(e.target.value)} />
                <Select value={categoriaOrigem} onChange={(e) => setCategoriaOrigem(e.target.value as CategoriaOrigem | '')} aria-label="Como conheceu a barbearia?">
                  <option value="">Como conheceu a barbearia?</option>
                  {CATEGORIAS_ORIGEM.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </Select>
                {reconhecimento && <p className="text-sm text-primary">{reconhecimento}</p>}
                {erro && <p className="text-sm text-destructive">{erro}</p>}
                <Button onClick={confirmar} className="w-full">Confirmar agendamento</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 3: Verificação visual manual**

Abrir `/<slug-de-uma-barbearia>` sem estar logado (ex.: `/seu-fernandes`, se essa for a slug cadastrada — confirmar no banco se necessário). Confirmar o cabeçalho "SF" + Card. Testar o fluxo completo: escolher serviço, escolher barbeiro, confirmar que os chips ficam destacados (`bg-primary`) quando selecionados — incluindo o horário, que antes não tinha destaque. Preencher os dados (testar telefone de um cliente já cadastrado pra ver a mensagem de reconhecimento em `text-primary`), escolher categoria pelo `Select` novo, confirmar o agendamento e ver a tela de sucesso com o círculo de check verde. Testar o caso de erro (confirmar sem categoria quando não há reconhecimento — deve mostrar a mensagem em `text-destructive`).

- [ ] **Step 4: Commit**

```bash
git add src/components/public-booking-flow.tsx
git commit -m "feat: redesign public booking flow to match SF visual identity"
```
