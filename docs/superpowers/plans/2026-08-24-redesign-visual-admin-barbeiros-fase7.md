# Redesign Visual — Admin: Barbeiros (Fase 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reestilizar `/admin/barbeiros` — envolver o formulário "Adicionar barbeiro" e a tabela de barbeiros cada um num `Card`, e trocar os elementos nativos (`<select>`, `<input>`) da célula "Plano de carreira" e da linha "Expediente" pelos componentes compartilhados `Select`/`Input` — sem mudar nenhum dado, query ou lógica já existente, só a apresentação.

**Architecture:** Duas mudanças no mesmo par de arquivos que já se importam um ao outro: `src/app/admin/barbeiros/page.tsx` (a página, com o formulário de criar) e `src/components/barbeiro-row.tsx` (a linha da tabela, com a célula de plano/metas e a linha expansível de expediente). Ambos reaproveitam componentes já existentes (`Card`/`CardContent` da Fase 1, `Select` da Fase 2) — nenhum componente novo é criado nesta fase. Os checkboxes de dia da semana continuam nativos (não existe um componente `Checkbox` compartilhado no projeto).

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui, Supabase.

**Spec:** `docs/superpowers/specs/2026-08-24-redesign-visual-admin-barbeiros-fase7-design.md`

## Global Constraints

- **Nenhum dado, query ou lógica muda** — as server actions `vincularPlano`/`criarBarbeiro`, e em `barbeiro-row.tsx` as funções `salvar`/`cancelar`/`alternarAtivo`/`atualizarDia`/`diasValidos`/`salvarExpediente`/`construirDiasIniciais`, continuam com o corpo idêntico; só a apresentação (JSX/estilo) é reescrita.
- **`Card`/`Select` já existem** (Fases 1 e 2) — nenhum token novo, nenhum componente novo nesta fase.
- **Checkboxes de dia da semana continuam nativos** — não criar um componente `Checkbox` compartilhado.
- **Toda troca de `<select>`/`<input>` nativo por `Select`/`Input` compartilhado precisa de largura explícita** (`className="w-..."`) igual à largura que o elemento nativo já tinha — os componentes compartilhados são `w-full` por padrão, e sem largura própria eles estufam pra 100% dentro de uma linha `flex`, quebrando o layout compacto (lição das Fases 4/5, já incorporada no código abaixo).

---

### Task 1: Cards + Select/Input compartilhados em Barbeiros

**Files:**
- Modify: `src/app/admin/barbeiros/page.tsx`
- Modify: `src/components/barbeiro-row.tsx`

**Interfaces:**
- Consumes: `Card`/`CardContent` (`src/components/ui/card.tsx`, Fase 1), `Select` (`src/components/ui/select.tsx`, Fase 2) — ambos já existentes, sem mudança de interface.

- [ ] **Step 1: Reescrever `src/app/admin/barbeiros/page.tsx`**

Substituir o arquivo inteiro por:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { getAdminSupabaseClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { BarbeiroRow } from '@/components/barbeiro-row'
import { Table, TableHeader, TableBody, TableRow, TableHead } from '@/components/ui/table'

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

async function criarBarbeiro(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Não autenticado.')
  }

  // O client com service-role usado abaixo ignora RLS por completo — esta
  // checagem é o único ponto que impede um usuário autenticado qualquer
  // (inclusive um barbeiro comum) de criar contas em qualquer barbearia.
  const { data: chamador } = await supabase
    .from('membros')
    .select('barbearia_id, papel, ativo')
    .eq('user_id', user.id)
    .single()
  if (!chamador || chamador.papel !== 'admin' || !chamador.ativo) {
    throw new Error('Apenas administradores podem cadastrar barbeiros.')
  }

  const nome = formData.get('nome') as string
  const telefone = (formData.get('telefone') as string) || null
  const email = formData.get('email') as string
  const senha = formData.get('senha') as string

  const admin = getAdminSupabaseClient()
  const { data: novoUsuario, error: erroCriacao } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })
  if (erroCriacao || !novoUsuario.user) {
    throw new Error(erroCriacao?.message ?? 'Não foi possível criar o usuário.')
  }

  const { error: erroMembro } = await admin.from('membros').insert({
    barbearia_id: chamador.barbearia_id,
    user_id: novoUsuario.user.id,
    papel: 'barbeiro',
    nome,
    telefone,
  })
  if (erroMembro) {
    // Sem isso, um usuário de autenticação órfão fica pra trás — consegue
    // logar, mas sem linha em `membros` fica preso num loop de redirect
    // entre / e /painel, e o e-mail passa a estar "usado" para sempre.
    try {
      await admin.auth.admin.deleteUser(novoUsuario.user.id)
    } catch {
      // Ignora falha na limpeza — o erro original abaixo é o que importa.
    }
    throw new Error(erroMembro.message)
  }

  revalidatePath('/admin/barbeiros')
}

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

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Adicionar barbeiro</h2>
          <form action={criarBarbeiro} className="flex gap-2 flex-wrap">
            <Input name="nome" placeholder="Nome" required className="w-40" />
            <Input name="telefone" placeholder="Telefone" className="w-32" />
            <Input name="email" type="email" placeholder="E-mail" required className="w-48" />
            <Input name="senha" type="password" placeholder="Senha" required minLength={6} className="w-32" />
            <Button type="submit">Adicionar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Barbeiros cadastrados</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>
                  <div className="flex gap-2 flex-wrap">
                    <span>Plano de carreira</span>
                    <span className="w-32">Meta prospecção/dia</span>
                    <span className="w-36">Meta prospecção/semana</span>
                    <span className="w-44">Meta faturamento/mês (R$)</span>
                  </div>
                </TableHead>
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
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Reescrever `src/components/barbeiro-row.tsx`**

Substituir o arquivo inteiro por:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
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
        alert(`O expediente anterior já foi apagado e o novo não pôde ser gravado — o barbeiro está sem expediente. Tente salvar de novo.\n\n${erroInserir.message}`)
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
        key={`${barbeiro.id}-${barbeiro.plano_carreira_id ?? 'none'}-${barbeiro.meta_prospeccao_dia ?? 'none'}-${barbeiro.meta_prospeccao_semana ?? 'none'}-${barbeiro.meta_faturamento_mes ?? 'none'}`}
        action={vincularPlanoAction}
        className="flex gap-2 items-center flex-wrap"
      >
        <input type="hidden" name="membro_id" value={barbeiro.id} />
        <Select name="plano_carreira_id" defaultValue={barbeiro.plano_carreira_id ?? ''} className="w-40">
          <option value="">Sem plano</option>
          {planos.filter((p) => p.ativo || p.id === barbeiro.plano_carreira_id).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </Select>
        <Input
          name="meta_prospeccao_dia"
          type="number"
          defaultValue={barbeiro.meta_prospeccao_dia ?? ''}
          placeholder="Meta diária"
          className="w-32"
        />
        <Input
          name="meta_prospeccao_semana"
          type="number"
          defaultValue={barbeiro.meta_prospeccao_semana ?? ''}
          placeholder="Meta semanal"
          className="w-36"
        />
        <Input
          name="meta_faturamento_mes"
          type="number"
          step="0.01"
          defaultValue={barbeiro.meta_faturamento_mes ?? ''}
          placeholder="Meta faturamento/mês"
          className="w-44"
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
              <Input
                type="time"
                value={d.hora_inicio}
                onChange={(e) => atualizarDia(i, { hora_inicio: e.target.value })}
                disabled={!d.trabalha}
                className="w-28"
              />
              <span className="text-sm text-muted-foreground">até</span>
              <Input
                type="time"
                value={d.hora_fim}
                onChange={(e) => atualizarDia(i, { hora_fim: e.target.value })}
                disabled={!d.trabalha}
                className="w-28"
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
          <button
            type="button"
            onClick={() => {
              if (!mostrarExpediente) setDias(construirDiasIniciais(expediente))
              setMostrarExpediente((v) => !v)
            }}
            className="text-xs text-primary underline"
          >
            Expediente
          </button>
        </TableCell>
      </TableRow>
      {linhaExpediente}
    </>
  )
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 4: Verificação visual manual**

Login como admin, abrir `/admin/barbeiros`. Confirmar os dois `Card` (formulário e tabela). Testar de ponta a ponta: adicionar um barbeiro novo (fluxo completo, incluindo login com a nova conta se possível), editar nome/telefone de um existente, vincular um plano de carreira e definir as 3 metas pelo formulário da célula (confirmar que o `Select` de plano não empurra os campos de meta pra baixo — deve caber numa linha compacta), abrir "Expediente", marcar/desmarcar dias, testar um horário inválido (fim antes do início — deve mostrar o alerta existente), salvar um expediente válido, desativar e reativar um barbeiro.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/barbeiros/page.tsx src/components/barbeiro-row.tsx
git commit -m "feat: redesign admin barbeiros to match SF visual identity"
```
