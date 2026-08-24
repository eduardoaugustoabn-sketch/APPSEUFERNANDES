# Redesign Visual — Admin: Serviços (Fase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reestilizar `/admin/servicos` — envolver o formulário "Adicionar serviço" e a tabela de serviços cada um num `Card`, e trocar os `<select>` nativos (no formulário e na edição inline de linha) pelo componente `Select` compartilhado — sem mudar nenhum dado, query ou lógica já existente, só a apresentação.

**Architecture:** Duas mudanças no mesmo par de arquivos que já existem e se importam um ao outro: `src/app/admin/servicos/page.tsx` (a página, com o formulário de criar) e `src/components/servico-row.tsx` (a linha da tabela com edição inline). Ambos reaproveitam componentes já existentes de fases anteriores (`Card`/`CardContent` da Fase 1, `Select` da Fase 2) — nenhum componente novo é criado nesta fase.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui, Supabase.

**Spec:** `docs/superpowers/specs/2026-08-24-redesign-visual-admin-servicos-fase4-design.md`

## Global Constraints

- **Nenhum dado, query ou lógica muda** — a server action `criarServico`, e as funções `salvar`/`cancelar`/`alternarAtivo` de `servico-row.tsx`, continuam com o corpo idêntico; só a apresentação (JSX/estilo) é reescrita.
- **`Card`/`Select` já existem** (Fases 1 e 2) — nenhum token novo, nenhum componente novo nesta fase.
- **Ações "Editar"/"Desativar"/"Reativar" continuam como links de texto sublinhados** — não viram botões novos.

---

### Task 1: Cards + Select compartilhado em Serviços

**Files:**
- Modify: `src/app/admin/servicos/page.tsx`
- Modify: `src/components/servico-row.tsx`

**Interfaces:**
- Consumes: `Card`/`CardContent` (`src/components/ui/card.tsx`, Fase 1), `Select` (`src/components/ui/select.tsx`, Fase 2) — ambos já existentes, sem mudança de interface.

- [ ] **Step 1: Reescrever `src/app/admin/servicos/page.tsx`**

Substituir o arquivo inteiro por:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ServicoRow } from '@/components/servico-row'
import { Table, TableHeader, TableBody, TableRow, TableHead } from '@/components/ui/table'

async function criarServico(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('servicos').insert({
    barbearia_id: membro!.barbearia_id,
    nome: formData.get('nome') as string,
    duracao_minutos: Number(formData.get('duracao_minutos')),
    preco: Number(formData.get('preco')),
    tipo: (formData.get('tipo') as string) || 'corte',
    categoria_servico: (formData.get('categoria_servico') as string) || 'outro',
  })
  revalidatePath('/admin/servicos')
}

export default async function ServicosPage() {
  const supabase = await getServerSupabaseClient()
  const { data: servicos } = await supabase.from('servicos').select('*').order('nome')

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Serviços</h1>

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Adicionar serviço</h2>
          <form action={criarServico} className="flex gap-2 flex-wrap">
            <Input name="nome" placeholder="Nome" required />
            <Input name="duracao_minutos" type="number" placeholder="Duração (min)" required />
            <Input name="preco" type="number" step="0.01" placeholder="Preço" required />
            <Select name="tipo" defaultValue="corte">
              <option value="corte">Corte</option>
              <option value="servico_extra">Serviço extra</option>
            </Select>
            <Select name="categoria_servico" defaultValue="outro">
              <option value="cabelo">Cabelo</option>
              <option value="barba">Barba</option>
              <option value="outro">Outro</option>
            </Select>
            <Button type="submit">Adicionar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Serviços cadastrados</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Duração</TableHead><TableHead>Preço</TableHead><TableHead>Tipo</TableHead><TableHead>Categoria</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {servicos?.map((s) => <ServicoRow key={s.id} servico={s} />)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Reescrever `src/components/servico-row.tsx`**

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

type Servico = { id: string; nome: string; duracao_minutos: number; preco: number; ativo: boolean; tipo: string; categoria_servico: string }

const ROTULO_TIPO: Record<string, string> = { corte: 'Corte', servico_extra: 'Serviço extra' }
const ROTULO_CATEGORIA: Record<string, string> = { cabelo: 'Cabelo', barba: 'Barba', outro: 'Outro' }

export function ServicoRow({ servico }: { servico: Servico }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(servico.nome)
  const [duracaoMinutos, setDuracaoMinutos] = useState(servico.duracao_minutos)
  const [preco, setPreco] = useState(servico.preco)
  const [tipo, setTipo] = useState(servico.tipo)
  const [categoriaServico, setCategoriaServico] = useState(servico.categoria_servico)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('servicos').update({ nome, duracao_minutos: duracaoMinutos, preco, tipo, categoria_servico: categoriaServico }).eq('id', servico.id)
    setSalvando(false)
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setNome(servico.nome)
    setDuracaoMinutos(servico.duracao_minutos)
    setPreco(servico.preco)
    setTipo(servico.tipo)
    setCategoriaServico(servico.categoria_servico)
    setEditando(false)
  }

  async function alternarAtivo() {
    const supabase = getBrowserSupabaseClient()
    await supabase.from('servicos').update({ ativo: !servico.ativo }).eq('id', servico.id)
    router.refresh()
  }

  if (editando) {
    return (
      <TableRow>
        <TableCell><Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-32" /></TableCell>
        <TableCell><Input type="number" value={duracaoMinutos} onChange={(e) => setDuracaoMinutos(Number(e.target.value))} className="w-20" /></TableCell>
        <TableCell><Input type="number" step="0.01" value={preco} onChange={(e) => setPreco(Number(e.target.value))} className="w-24" /></TableCell>
        <TableCell>
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="corte">Corte</option>
            <option value="servico_extra">Serviço extra</option>
          </Select>
        </TableCell>
        <TableCell>
          <Select value={categoriaServico} onChange={(e) => setCategoriaServico(e.target.value)}>
            <option value="cabelo">Cabelo</option>
            <option value="barba">Barba</option>
            <option value="outro">Outro</option>
          </Select>
        </TableCell>
        <TableCell className="flex gap-2">
          <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
          <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow className={servico.ativo ? '' : 'opacity-50'}>
      <TableCell>{servico.nome}</TableCell>
      <TableCell>{servico.duracao_minutos}min</TableCell>
      <TableCell>R$ {servico.preco}</TableCell>
      <TableCell>{ROTULO_TIPO[servico.tipo] ?? servico.tipo}</TableCell>
      <TableCell>{ROTULO_CATEGORIA[servico.categoria_servico] ?? servico.categoria_servico}</TableCell>
      <TableCell className="flex gap-2">
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">Editar</button>
        <button type="button" onClick={alternarAtivo} className="text-xs text-destructive underline">{servico.ativo ? 'Desativar' : 'Reativar'}</button>
      </TableCell>
    </TableRow>
  )
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 4: Verificação visual manual**

Login como admin, abrir `/admin/servicos`. Confirmar os dois `Card` (formulário "Adicionar serviço" e "Serviços cadastrados"). Testar de ponta a ponta: adicionar um serviço novo (incluindo escolher tipo/categoria pelos `Select` novos), clicar "Editar" numa linha existente, mudar tipo/categoria pelos `Select` da edição, "Salvar", depois "Desativar" e "Reativar" o mesmo serviço — confirmar que tudo funciona exatamente como antes, só com o visual novo.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/servicos/page.tsx src/components/servico-row.tsx
git commit -m "feat: redesign admin serviços to match SF visual identity"
```
