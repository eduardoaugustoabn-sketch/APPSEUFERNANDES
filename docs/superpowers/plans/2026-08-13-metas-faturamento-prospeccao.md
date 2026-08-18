# Metas de faturamento (mês) e prospecção (dia/semana) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin set, per barbeiro, a monthly revenue goal and a weekly prospecção goal (alongside the existing daily one), and show explicit "X of Y — Z left" progress everywhere a goal applies.

**Architecture:** Two new nullable columns on `membros`. The existing per-barbeiro "metas" form (`vincularPlano` in `/admin/barbeiros`) grows two more inputs. The barbeiro's own dashboard (`/painel`) and prospecção page (`/painel/prospeccao`) each gain a small progress readout — bar + explicit text — computed from data they already fetch (or a nearly-identical query for the new weekly window).

**Tech Stack:** Next.js 16.3 App Router, TypeScript, Supabase (Postgres/RLS), Tailwind CSS v4, shadcn/ui.

## Global Constraints

- No RLS changes — these are two more nullable columns on `membros`, already covered by the existing "admin atualiza membros" / "barbeiro lê a própria linha" policies.
- "Semana" always means the ISO calendar week: Monday through Sunday, computed from the current date — never a rolling 7-day window.
- Every progress readout follows the same phrasing: `"{feito} de {meta} — faltam {restante}"`, or `"Meta batida!"` once `feito >= meta`. No other wording variant.
- A progress bar's fill width is always `Math.min((feito / meta) * 100, 100)` — never allowed to visually overflow past 100%.
- Migration file goes in `supabase/migrations/`, numbered the next integer after whatever is the highest-numbered file present when Task 1 starts (check `ls supabase/migrations` first — do not hardcode a number here).

---

### Task 1: Migration + metas form em `/admin/barbeiros`

**Files:**
- Create: `supabase/migrations/00NN_metas_faturamento_prospeccao_semana.sql` (NN = next available number)
- Modify: `src/components/barbeiro-row.tsx` (whole file)
- Modify: `src/app/admin/barbeiros/page.tsx` — only the `vincularPlano` function and the `<TableHead>` list are affected; see Step 3.

**Interfaces:**
- Produces: `membros.meta_faturamento_mes: numeric | null`, `membros.meta_prospeccao_semana: int | null`, read by Task 2 (`painel/page.tsx`) and Task 3 (`painel/prospeccao/page.tsx`).

- [ ] **Step 1: Check the next migration number and write the migration**

Run: `ls supabase/migrations | sort | tail -3` and use the next integer (zero-padded to 4 digits).

```sql
alter table membros
  add column meta_faturamento_mes numeric(10,2) check (meta_faturamento_mes >= 0);
alter table membros
  add column meta_prospeccao_semana int check (meta_prospeccao_semana >= 0);
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase migration up`
Expected: succeeds, no errors. Do **not** run `supabase db reset` — this local database has real data from manual testing throughout this project (barbeiros, agendamentos, bloqueios, atendimentos); `db reset` would wipe all of it. `migration up` applies only the new pending migration without touching existing rows. If it fails, report BLOCKED rather than falling back to `db reset`.

- [ ] **Step 3: Replace `src/components/barbeiro-row.tsx` in full**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TableRow, TableCell } from '@/components/ui/table'

type Barbeiro = {
  id: string
  nome: string
  telefone: string | null
  ativo: boolean
  plano_carreira_id: string | null
  meta_prospeccao_dia: number | null
  meta_prospeccao_semana: number | null
  meta_faturamento_mes: number | null
}
type Plano = { id: string; nome: string; ativo: boolean }

export function BarbeiroRow({
  barbeiro,
  planos,
  vincularPlanoAction,
}: {
  barbeiro: Barbeiro
  planos: Plano[]
  vincularPlanoAction: (formData: FormData) => void
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(barbeiro.nome)
  const [telefone, setTelefone] = useState(barbeiro.telefone ?? '')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('membros').update({ nome, telefone: telefone || null }).eq('id', barbeiro.id)
    setSalvando(false)
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setNome(barbeiro.nome)
    setTelefone(barbeiro.telefone ?? '')
    setEditando(false)
  }

  async function alternarAtivo() {
    const supabase = getBrowserSupabaseClient()
    await supabase.from('membros').update({ ativo: !barbeiro.ativo }).eq('id', barbeiro.id)
    router.refresh()
  }

  const celulaPlano = (
    <TableCell>
      <form
        key={`${barbeiro.id}-${barbeiro.plano_carreira_id ?? 'none'}-${barbeiro.meta_prospeccao_dia ?? 'none'}-${barbeiro.meta_prospeccao_semana ?? 'none'}-${barbeiro.meta_faturamento_mes ?? 'none'}`}
        action={vincularPlanoAction}
        className="flex gap-2 items-center flex-wrap"
      >
        <input type="hidden" name="membro_id" value={barbeiro.id} />
        <select name="plano_carreira_id" defaultValue={barbeiro.plano_carreira_id ?? ''} className="border rounded px-2 py-1 bg-input">
          <option value="">Sem plano</option>
          {planos.filter((p) => p.ativo || p.id === barbeiro.plano_carreira_id).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <input
          name="meta_prospeccao_dia"
          type="number"
          defaultValue={barbeiro.meta_prospeccao_dia ?? ''}
          placeholder="Meta prospecção/dia"
          className="border rounded px-2 py-1 w-36 bg-input"
        />
        <input
          name="meta_prospeccao_semana"
          type="number"
          defaultValue={barbeiro.meta_prospeccao_semana ?? ''}
          placeholder="Meta prospecção/semana"
          className="border rounded px-2 py-1 w-40 bg-input"
        />
        <input
          name="meta_faturamento_mes"
          type="number"
          step="0.01"
          defaultValue={barbeiro.meta_faturamento_mes ?? ''}
          placeholder="Meta faturamento/mês (R$)"
          className="border rounded px-2 py-1 w-44 bg-input"
        />
        <Button type="submit" variant="outline">Salvar</Button>
      </form>
    </TableCell>
  )

  if (editando) {
    return (
      <TableRow>
        <TableCell><Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-32" /></TableCell>
        <TableCell><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} className="w-32" /></TableCell>
        {celulaPlano}
        <TableCell className="flex gap-2">
          <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
          <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow className={barbeiro.ativo ? '' : 'opacity-50'}>
      <TableCell>{barbeiro.nome}</TableCell>
      <TableCell>{barbeiro.telefone}</TableCell>
      {celulaPlano}
      <TableCell className="flex gap-2">
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">Editar</button>
        <button type="button" onClick={alternarAtivo} className="text-xs text-destructive underline">{barbeiro.ativo ? 'Desativar' : 'Reativar'}</button>
      </TableCell>
    </TableRow>
  )
}
```

- [ ] **Step 4: Update `vincularPlano` in `src/app/admin/barbeiros/page.tsx`**

Replace the existing `vincularPlano` function:

```ts
async function vincularPlano(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const metaProspeccaoDiaRaw = formData.get('meta_prospeccao_dia') as string
  const metaProspeccaoSemanaRaw = formData.get('meta_prospeccao_semana') as string
  const metaFaturamentoMesRaw = formData.get('meta_faturamento_mes') as string

  await supabase
    .from('membros')
    .update({
      plano_carreira_id: (formData.get('plano_carreira_id') as string) || null,
      meta_prospeccao_dia: metaProspeccaoDiaRaw === '' ? null : Number(metaProspeccaoDiaRaw),
      meta_prospeccao_semana: metaProspeccaoSemanaRaw === '' ? null : Number(metaProspeccaoSemanaRaw),
      meta_faturamento_mes: metaFaturamentoMesRaw === '' ? null : Number(metaFaturamentoMesRaw),
    })
    .eq('id', formData.get('membro_id') as string)
  revalidatePath('/admin/barbeiros')
}
```

Nothing else in that file changes — `criarBarbeiro`, the create form, and the `<Table>`/`<TableHead>` markup stay exactly as they are (the metas live entirely inside the "Plano de carreira" column's own form, same as today).

- [ ] **Step 5: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Manual verification**

No browser tools available in this environment (Playwright/Chrome MCP tools may be flaky or disconnected — do not spend time retrying them). Verify by reading the diff against this task's code. If a browser is available: as `admin@teste.com`, open `/admin/barbeiros`, set all three new values for a barbeiro, Salvar, confirm they persist after a page reload (the row's own `key` includes them, so a stale value would show as a bug).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/*_metas_faturamento_prospeccao_semana.sql src/components/barbeiro-row.tsx src/app/admin/barbeiros/page.tsx
git commit -m "feat: add meta_faturamento_mes and meta_prospeccao_semana to membros"
```

---

### Task 2: `/painel` — progresso da meta de faturamento do mês

**Files:**
- Modify: `src/app/painel/page.tsx`

**Interfaces:**
- Consumes: `membros.meta_faturamento_mes` (Task 1).

- [ ] **Step 1: Fetch `meta_faturamento_mes` and add the progress readout to the KPI card**

In `src/app/painel/page.tsx`, change this line:

```ts
  const { data: membro } = await supabase.from('membros').select('id, nome').eq('user_id', user!.id).single()
```

to:

```ts
  const { data: membro } = await supabase.from('membros').select('id, nome, meta_faturamento_mes').eq('user_id', user!.id).single()
```

Then replace the "Faturamento do mês" `Card` (the first of the three KPI cards near the top):

```tsx
        <Card className="flex-1 min-w-[160px]">
          <CardContent>
            <p className="text-xs uppercase text-muted-foreground">Faturamento do mês</p>
            <p className="text-2xl font-bold text-primary">R$ {totalGanhos.toFixed(2)}</p>
          </CardContent>
        </Card>
```

with:

```tsx
        <Card className="flex-1 min-w-[160px]">
          <CardContent>
            <p className="text-xs uppercase text-muted-foreground">Faturamento do mês</p>
            <p className="text-2xl font-bold text-primary">R$ {totalGanhos.toFixed(2)}</p>
            {membro!.meta_faturamento_mes != null && membro!.meta_faturamento_mes > 0 && (
              <div className="mt-2">
                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden mb-1">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min((totalGanhos / membro!.meta_faturamento_mes) * 100, 100)}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {totalGanhos >= membro!.meta_faturamento_mes
                    ? 'Meta batida!'
                    : `R$ ${totalGanhos.toFixed(2)} de R$ ${membro!.meta_faturamento_mes.toFixed(2)} — faltam R$ ${(membro!.meta_faturamento_mes - totalGanhos).toFixed(2)}`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
```

No other part of the file changes.

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual verification**

No browser tools available — verify via code trace against this task's Step 1. If a browser is available: as a barbeiro with `meta_faturamento_mes` set (Task 1), confirm the bar and text appear under "Faturamento do mês" with the right numbers; as a barbeiro with no meta set, confirm the card looks exactly as it did before (no bar, no text).

- [ ] **Step 4: Commit**

```bash
git add src/app/painel/page.tsx
git commit -m "feat: show meta de faturamento do mês progress on painel"
```

---

### Task 3: `/painel/prospeccao` — texto explícito + meta semanal

**Files:**
- Modify: `src/app/painel/prospeccao/page.tsx` (whole file)

**Interfaces:**
- Consumes: `membros.meta_prospeccao_semana` (Task 1).

- [ ] **Step 1: Replace `src/app/painel/prospeccao/page.tsx` in full**

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ProspeccaoStatusForm } from '@/components/prospeccao-status-form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

async function novoContato(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()

  const nome = formData.get('nome') as string
  const telefone = formData.get('telefone') as string

  const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
    p_barbearia_id: membro!.barbearia_id, p_nome: nome, p_telefone: telefone,
  })
  if (clienteId.error) return

  await supabase.from('prospeccoes').insert({
    barbearia_id: membro!.barbearia_id,
    membro_id: membro!.id,
    nome,
    telefone,
    cliente_id: clienteId.data,
    canal: (formData.get('canal') as string) || null,
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

  const hoje = new Date().toISOString().slice(0, 10)
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

  const agora = new Date()
  const diaSemanaAtual = agora.getDay() // 0 = domingo, 1 = segunda, ...
  const diasDesdeSegunda = diaSemanaAtual === 0 ? 6 : diaSemanaAtual - 1
  const inicioSemana = new Date(agora)
  inicioSemana.setDate(agora.getDate() - diasDesdeSegunda)
  const inicioSemanaStr = inicioSemana.toISOString().slice(0, 10)

  const { data: contatosHoje } = await supabase.from('prospeccoes').select('id').eq('membro_id', membro!.id).eq('data', hoje)
  const { data: contatosSemana } = await supabase.from('prospeccoes').select('id').eq('membro_id', membro!.id).gte('data', inicioSemanaStr)
  const { data: convertidosHoje } = await supabase.from('prospeccoes').select('id').eq('membro_id', membro!.id).gte('convertido_em', `${hoje}T00:00:00`)
  const { data: pendentes } = await supabase.from('prospeccoes').select('*').eq('membro_id', membro!.id).in('status', ['novo_lead', 'em_contato', 'interessado']).order('criado_em')
  const { data: contatosMes } = await supabase.from('prospeccoes').select('status').eq('membro_id', membro!.id).gte('data', inicioMes)

  const totalContatosHoje = contatosHoje?.length ?? 0
  const metaDia = membro!.meta_prospeccao_dia ?? 0
  const totalContatosSemana = contatosSemana?.length ?? 0
  const metaSemana = membro!.meta_prospeccao_semana ?? 0
  const totalMes = contatosMes?.length ?? 0
  const convertidosMes = contatosMes?.filter((c) => c.status === 'convertido').length ?? 0
  const naoConvertidosMes = contatosMes?.filter((c) => c.status === 'nao_convertido').length ?? 0
  const finalizadosMes = convertidosMes + naoConvertidosMes
  const taxaMes = finalizadosMes > 0 ? Math.round((convertidosMes / finalizadosMes) * 100) : 0

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Prospecção</h1>

      {metaDia > 0 && (
        <div className="mb-4">
          <p className="text-sm mb-1">Meta diária de contatos</p>
          <div className="w-full bg-muted rounded h-6 overflow-hidden mb-1">
            <div className="bg-primary h-full text-primary-foreground text-xs flex items-center justify-center" style={{ width: `${Math.min((totalContatosHoje / metaDia) * 100, 100)}%` }}>
              {totalContatosHoje} / {metaDia}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {totalContatosHoje >= metaDia ? 'Meta batida!' : `${totalContatosHoje} de ${metaDia} — faltam ${metaDia - totalContatosHoje}`}
          </p>
        </div>
      )}

      {metaSemana > 0 && (
        <div className="mb-4">
          <p className="text-sm mb-1">Meta semanal de contatos</p>
          <div className="w-full bg-muted rounded h-6 overflow-hidden mb-1">
            <div className="bg-primary h-full text-primary-foreground text-xs flex items-center justify-center" style={{ width: `${Math.min((totalContatosSemana / metaSemana) * 100, 100)}%` }}>
              {totalContatosSemana} / {metaSemana}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {totalContatosSemana >= metaSemana ? 'Meta batida!' : `${totalContatosSemana} de ${metaSemana} — faltam ${metaSemana - totalContatosSemana}`}
          </p>
        </div>
      )}

      <form action={novoContato} className="flex gap-2 items-center mt-4 flex-wrap">
        <Input name="nome" placeholder="Nome" required />
        <Input name="telefone" placeholder="Telefone" required />
        <select name="canal" className="border rounded px-2 py-1 bg-input">
          <option value="">Canal (opcional)</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="indicacao">Indicação</option>
          <option value="rua">Na rua</option>
          <option value="redes_sociais">Redes sociais</option>
          <option value="outro">Outro</option>
        </select>
        <label className="text-sm flex items-center gap-1">
          <input type="checkbox" name="oferta_corte_gratis" /> Ofereci corte grátis + consultoria
        </label>
        <Button type="submit">+ Novo contato prospectado</Button>
      </form>

      <h2 className="font-heading text-lg font-semibold mt-6 mb-2">Pendentes de conversão ({pendentes?.length ?? 0})</h2>
      {pendentes?.map((p) => (
        <div key={p.id} className="flex justify-between items-center border-b py-2">
          <span>{p.nome} · {p.telefone} · {p.canal ?? 'sem canal'}{p.oferta_corte_gratis && ' · corte grátis'} · {new Date(p.criado_em).toLocaleDateString()}</span>
          <ProspeccaoStatusForm prospeccaoId={p.id} statusAtual={p.status} />
        </div>
      ))}

      <h2 className="font-heading text-lg font-semibold mt-6 mb-2">Conversão</h2>
      <p>Convertidos hoje: {convertidosHoje?.length ?? 0}</p>
      <p>Taxa de conversão deste mês: {taxaMes}% ({finalizadosMes} finalizados de {totalMes} prospectados — os que ainda não agendaram/compareceram não entram nessa conta)</p>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual verification**

No browser tools available — verify via code trace against this task's Step 1. If a browser is available: as a barbeiro with both `meta_prospeccao_dia` and `meta_prospeccao_semana` set, open `/painel/prospeccao`, confirm both bars render with the "X de Y — faltam Z" text below each; register a contato and confirm both counters increase; confirm the weekly window doesn't reset until the next Monday (check `inicioSemanaStr` against today's actual weekday if verifying by hand).

- [ ] **Step 4: Commit**

```bash
git add src/app/painel/prospeccao/page.tsx
git commit -m "feat: add meta semanal de prospecção + explicit faltam-N text"
```

---

### Task 4: Regressão final

**Files:** none (verification only).

- [ ] **Step 1: Full automated regression**

Run:
```bash
npm test
npm run build
```
Expected: `npm test` shows all existing unit tests still passing (this plan adds no new ones — it's arithmetic on already-fetched aggregates, no new pure function comparable to `calcularOciosidade`); `npm run build` succeeds with no type errors.

- [ ] **Step 2: Manual end-to-end walkthrough (if a browser is available)**

As `admin@teste.com`: in `/admin/barbeiros`, set all three new metas (faturamento/mês, prospecção/dia, prospecção/semana) for a barbeiro. As that barbeiro: confirm `/painel`'s "Faturamento do mês" card shows the progress bar and "R$ X de R$ Y — faltam R$ Z" text; confirm `/painel/prospeccao` shows both the daily and weekly bars with correct counts and "faltam" text. Register enough contatos to exceed one of the goals and confirm it switches to "Meta batida!" instead of showing a negative "faltam" value.

If no browser is available, document that limitation in the ledger instead of skipping the check silently — same pattern used in every prior plan this session.

- [ ] **Step 3: No commit for this task** — it's verification-only; if any issue surfaces, fix it as a small follow-up commit referencing which task's step regressed.
