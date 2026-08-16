# Cadastro de expediente do barbeiro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin cadastrar/editar o expediente (dia da semana + horário) de cada barbeiro em `/admin/barbeiros` — hoje `horarios_trabalho` só é lida pela agenda, nunca escrita por nenhuma tela.

**Architecture:** `admin/barbeiros/page.tsx` passa a buscar `horarios_trabalho` de toda a barbearia numa query extra (RLS já escopa, sem filtro explícito), agrupa por `membro_id` num `Map`, e repassa pra `BarbeiroRow`. `BarbeiroRow` ganha um botão "Expediente" que expande uma segunda `<TableRow>` com os 7 dias da semana (checkbox "trabalha" + horário início/fim). Salvar substitui tudo de uma vez (apaga + insere os dias marcados).

**Deviation from spec:** o spec descreve o salvamento como uma Server Action. Na implementação, ficou mais consistente usar chamadas diretas ao client do browser (`getBrowserSupabaseClient()`), do mesmo jeito que `BarbeiroRow.salvar()`/`alternarAtivo()` já fazem no mesmo componente — RLS já autoriza o admin sem precisar do client de service-role (diferente de `criarBarbeiro`, que precisa bypassar RLS pra criar o usuário no Auth). Como esse componente é 100% controlado por estado React (checkbox por dia habilitando/desabilitando os inputs de horário), uma Server Action exigiria codificar um array em `FormData`; chamar o browser client direto evita isso. Diferente do padrão "sem UI de erro dedicada" do spec (que citava o crash de página de uma Server Action), aqui os erros de `.delete()`/`.insert()` são verificados explicitamente e mostrados via `alert()` — mesma lição já aplicada em `SonhoRow.salvar()` depois da revisão final do ciclo anterior, onde uma falha engolida silenciosamente numa chamada direta ao browser client foi um achado Important. A substância do spec (substituir tudo de uma vez, sem UI de erro sofisticada, admin-only, sem mudança de RLS) continua valendo.

**Tech Stack:** Next.js 16.3 App Router, TypeScript, Supabase (Postgres/RLS via `@supabase/supabase-js` e `@supabase/ssr`), Tailwind CSS v4, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-08-16-expediente-barbeiro-design.md`

## Global Constraints

- Só o admin gerencia o expediente — sem tela pro barbeiro editar o próprio.
- No máximo um intervalo contínuo por dia da semana — sem múltiplos blocos/pausas.
- **Sem mudança de RLS** — a policy `"admin gerencia horarios_trabalho"` (`supabase/migrations/0005_agenda.sql`) já cobre `for all` (select/insert/update/delete) para admin da mesma barbearia.
- **Sem migration nova.**
- Validação client-side (hora_fim > hora_inicio, campos obrigatórios se marcado) antes de qualquer chamada ao banco — evita a maior parte do risco de um envio inválido no meio do caminho entre apagar e inserir.

---

### Task 1: `admin/barbeiros` — buscar/agrupar expediente, UI de edição em `BarbeiroRow`

**Files:**
- Modify: `src/components/barbeiro-row.tsx` (whole file)
- Modify: `src/app/admin/barbeiros/page.tsx` (query + prop passing only, `criarBarbeiro`/`vincularPlano` ficam iguais)

**Interfaces:**
- Consumes: tabela `horarios_trabalho` (`membro_id uuid`, `dia_semana int 0-6`, `hora_inicio time`, `hora_fim time`), já existente (`supabase/migrations/0005_agenda.sql`).
- Produces: `BarbeiroRow` ganha uma nova prop `expediente: { dia_semana: number; hora_inicio: string; hora_fim: string }[]`. Nenhuma outra task depende desta.

- [ ] **Step 1: Rewrite `BarbeiroRow`**

Replace `src/components/barbeiro-row.tsx` in full:

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
}
type Plano = { id: string; nome: string; ativo: boolean }
type Expediente = { dia_semana: number; hora_inicio: string; hora_fim: string }

const NOMES_DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

function construirDiasIniciais(expediente: Expediente[]) {
  return NOMES_DIAS.map((nome, dia_semana) => {
    const existente = expediente.find((e) => e.dia_semana === dia_semana)
    return {
      dia_semana,
      nome,
      trabalha: !!existente,
      hora_inicio: existente?.hora_inicio.slice(0, 5) ?? '09:00',
      hora_fim: existente?.hora_fim.slice(0, 5) ?? '18:00',
    }
  })
}

export function BarbeiroRow({
  barbeiro,
  planos,
  expediente,
  vincularPlanoAction,
}: {
  barbeiro: Barbeiro
  planos: Plano[]
  expediente: Expediente[]
  vincularPlanoAction: (formData: FormData) => void
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(barbeiro.nome)
  const [telefone, setTelefone] = useState(barbeiro.telefone ?? '')
  const [salvando, setSalvando] = useState(false)
  const [mostrarExpediente, setMostrarExpediente] = useState(false)
  const [dias, setDias] = useState(() => construirDiasIniciais(expediente))
  const [salvandoExpediente, setSalvandoExpediente] = useState(false)

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

  function atualizarDia(index: number, patch: Partial<{ trabalha: boolean; hora_inicio: string; hora_fim: string }>) {
    setDias((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  }

  function diasValidos() {
    return dias.every((d) => !d.trabalha || (d.hora_inicio && d.hora_fim && d.hora_fim > d.hora_inicio))
  }

  async function salvarExpediente() {
    if (!diasValidos()) {
      alert('Confira os horários — a hora de término precisa ser depois da hora de início em todo dia marcado.')
      return
    }
    setSalvandoExpediente(true)
    const supabase = getBrowserSupabaseClient()

    const { error: erroExcluir } = await supabase.from('horarios_trabalho').delete().eq('membro_id', barbeiro.id)
    if (erroExcluir) {
      setSalvandoExpediente(false)
      alert(erroExcluir.message)
      return
    }

    const diasParaSalvar = dias
      .filter((d) => d.trabalha)
      .map((d) => ({
        membro_id: barbeiro.id,
        dia_semana: d.dia_semana,
        hora_inicio: d.hora_inicio,
        hora_fim: d.hora_fim,
      }))

    if (diasParaSalvar.length > 0) {
      const { error: erroInserir } = await supabase.from('horarios_trabalho').insert(diasParaSalvar)
      if (erroInserir) {
        setSalvandoExpediente(false)
        alert(erroInserir.message)
        return
      }
    }

    setSalvandoExpediente(false)
    setMostrarExpediente(false)
    router.refresh()
  }

  const celulaPlano = (
    <TableCell>
      <form
        key={`${barbeiro.id}-${barbeiro.plano_carreira_id ?? 'none'}-${barbeiro.meta_prospeccao_dia ?? 'none'}`}
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
          placeholder="Meta diária"
          className="border rounded px-2 py-1 w-32 bg-input"
        />
        <Button type="submit" variant="outline">Salvar</Button>
      </form>
    </TableCell>
  )

  const linhaExpediente = mostrarExpediente && (
    <TableRow>
      <TableCell colSpan={4} className="whitespace-normal bg-muted/30">
        <div className="p-2">
          <p className="font-heading text-sm font-bold mb-3">Expediente</p>
          {dias.map((d, i) => (
            <div key={d.dia_semana} className="flex items-center gap-3 mb-2">
              <label className="flex items-center gap-2 w-32">
                <input
                  type="checkbox"
                  checked={d.trabalha}
                  onChange={(e) => atualizarDia(i, { trabalha: e.target.checked })}
                />
                <span className="text-sm">{d.nome}</span>
              </label>
              <input
                type="time"
                value={d.hora_inicio}
                onChange={(e) => atualizarDia(i, { hora_inicio: e.target.value })}
                disabled={!d.trabalha}
                className="border rounded px-2 py-1 bg-input disabled:opacity-50"
              />
              <span className="text-sm text-muted-foreground">até</span>
              <input
                type="time"
                value={d.hora_fim}
                onChange={(e) => atualizarDia(i, { hora_fim: e.target.value })}
                disabled={!d.trabalha}
                className="border rounded px-2 py-1 bg-input disabled:opacity-50"
              />
            </div>
          ))}
          <div className="flex gap-2 mt-3">
            <Button type="button" onClick={salvarExpediente} disabled={salvandoExpediente}>Salvar expediente</Button>
            <Button type="button" variant="outline" onClick={() => setMostrarExpediente(false)}>Fechar</Button>
          </div>
        </div>
      </TableCell>
    </TableRow>
  )

  if (editando) {
    return (
      <>
        <TableRow>
          <TableCell><Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-32" /></TableCell>
          <TableCell><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} className="w-32" /></TableCell>
          {celulaPlano}
          <TableCell className="flex gap-2">
            <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
            <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
          </TableCell>
        </TableRow>
        {linhaExpediente}
      </>
    )
  }

  return (
    <>
      <TableRow className={barbeiro.ativo ? '' : 'opacity-50'}>
        <TableCell>{barbeiro.nome}</TableCell>
        <TableCell>{barbeiro.telefone}</TableCell>
        {celulaPlano}
        <TableCell className="flex gap-2">
          <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">Editar</button>
          <button type="button" onClick={alternarAtivo} className="text-xs text-destructive underline">{barbeiro.ativo ? 'Desativar' : 'Reativar'}</button>
          <button type="button" onClick={() => setMostrarExpediente((v) => !v)} className="text-xs text-primary underline">Expediente</button>
        </TableCell>
      </TableRow>
      {linhaExpediente}
    </>
  )
}
```

- [ ] **Step 2: Fetch and group `horarios_trabalho` in the page**

In `src/app/admin/barbeiros/page.tsx`, `criarBarbeiro` and `vincularPlano` (the two `'use server'` functions above `BarbeirosPage`) stay exactly as they are — only `BarbeirosPage` itself changes. Replace the function body:

```tsx
export default async function BarbeirosPage() {
  const supabase = await getServerSupabaseClient()
  const { data: barbeiros } = await supabase.from('membros').select('*').eq('papel', 'barbeiro').order('nome')
  const { data: planos } = await supabase.from('planos_carreira').select('*')
  const { data: horarios } = await supabase.from('horarios_trabalho').select('membro_id, dia_semana, hora_inicio, hora_fim')

  const expedientePorMembro = new Map<string, { dia_semana: number; hora_inicio: string; hora_fim: string }[]>()
  for (const h of horarios ?? []) {
    const lista = expedientePorMembro.get(h.membro_id) ?? []
    lista.push({ dia_semana: h.dia_semana, hora_inicio: h.hora_inicio, hora_fim: h.hora_fim })
    expedientePorMembro.set(h.membro_id, lista)
  }

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Barbeiros</h1>

      <form action={criarBarbeiro} className="flex gap-2 mb-6 flex-wrap">
        <Input name="nome" placeholder="Nome" required />
        <Input name="telefone" placeholder="Telefone" />
        <Input name="email" type="email" placeholder="E-mail" required />
        <Input name="senha" type="password" placeholder="Senha" required minLength={6} />
        <Button type="submit">Adicionar</Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Telefone</TableHead>
            <TableHead>Plano de carreira</TableHead>
            <TableHead>Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {barbeiros?.map((b) => (
            <BarbeiroRow
              key={b.id}
              barbeiro={b}
              planos={planos ?? []}
              expediente={expedientePorMembro.get(b.id) ?? []}
              vincularPlanoAction={vincularPlano}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

Note: this query has no explicit filter on `horarios_trabalho` — the `"admin gerencia horarios_trabalho"` RLS policy already restricts the result to rows whose `membro_id` belongs to a membro of the caller's own barbearia (the table has no `barbearia_id` column of its own; RLS joins through `membros`).

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: succeeds, no type errors.

- [ ] **Step 4: Manual verification**

No browser tools available in this environment — verify by tracing the code against these points instead of launching a browser:
- `salvarExpediente` never calls `.insert()` before confirming `.delete()` succeeded (`erroExcluir` checked first, function returns early on error).
- `diasValidos()` runs before any Supabase call, blocking a submit where a marked day has `hora_fim <= hora_inicio` or an empty time.
- The expediente row (`linhaExpediente`) renders in both the `editando` and normal branches, so toggling "Expediente" works regardless of whether the row is also mid-edit.
- `construirDiasIniciais` correctly maps `expediente` (which can be empty, e.g. a brand-new barbeiro) to 7 entries with `trabalha: false` and 09:00–18:00 defaults for days with no existing row.

If a browser is available when this task runs, also do this by hand: as `admin@teste.com`, open `/admin/barbeiros`, click "Expediente" on a barbeiro with none yet, mark a couple of days with times, Salvar expediente, confirm the row's data persists after refresh (click Expediente again). Edit an existing day's hours and remove another day, Salvar, confirm both changes took. Try marking a day with hora_fim before hora_inicio and confirm the alert blocks the submit. Then check `/painel/agenda` as that barbeiro (or the public booking page) on one of the newly-configured days and confirm the configured hours show up as available.

- [ ] **Step 5: Commit**

```bash
git add src/components/barbeiro-row.tsx src/app/admin/barbeiros/page.tsx
git commit -m "feat: let admin manage each barbeiro's weekly work schedule"
```

---

### Task 2: Regressão final

**Files:** none (verification only).

- [ ] **Step 1: Full automated regression**

Run:
```bash
npm test
npm run build
```
Expected: `npm test` shows all existing unit tests still passing (this plan adds no new ones — straightforward CRUD, no new pure function comparable to `calcularOciosidade`); `npm run build` succeeds with no type errors.

- [ ] **Step 2: Manual end-to-end walkthrough (if a browser is available)**

As `admin@teste.com`: `/admin/barbeiros` — for a barbeiro with no expediente yet, click Expediente, mark Segunda a Sexta 09:00–18:00, Salvar expediente, confirm it persists. Edit one day's hours, confirm it updates. Uncheck a day, Salvar, confirm that day no longer counts as worked. Try an invalid range (hora_fim before hora_inicio) and confirm the alert blocks it without touching the database (reopen Expediente and confirm nothing changed).

Then, as that barbeiro (or via the public booking page for the barbearia), confirm the configured days/hours actually produce available slots on `/painel/agenda` and disappear on days left unchecked.

If no browser is available, document that limitation in the ledger instead of skipping the check silently — same pattern used in every prior plan this session.

- [ ] **Step 3: No commit for this task** — it's verification-only; if any issue surfaces, fix it as a small follow-up commit referencing which task's step regressed.
