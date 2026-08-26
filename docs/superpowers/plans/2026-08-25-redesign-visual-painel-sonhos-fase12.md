# Redesign Visual — Painel: Sonhos (Fase 12) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Envolver o formulário "Novo sonho" num `Card` em `/painel/sonhos` — última página pendente do redesign visual do app — sem mudar nenhum dado, query ou lógica já existente, só a apresentação.

**Architecture:** Uma única mudança em `src/app/painel/sonhos/page.tsx`, reaproveitando `Card`/`CardContent` (já existentes desde a Fase 1). `src/components/sonho-row.tsx` **não é tocado** — já está no padrão visual atual (Card, `rounded-full`, badge "Concluído").

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui, Supabase.

**Spec:** `docs/superpowers/specs/2026-08-25-redesign-visual-painel-sonhos-fase12-design.md`

## Global Constraints

- **Nenhum dado, query ou lógica muda** — a server action `criarSonho`, o cálculo de `sonhosComProgresso` (incluindo a auto-conclusão de sonho), continuam com o corpo idêntico; só a apresentação (JSX/estilo) é reescrita.
- **`src/components/sonho-row.tsx` não é modificado nesta fase** — só `src/app/painel/sonhos/page.tsx`.
- **Os 3 campos do formulário já têm largura própria** (`nome` `w-40`, `valor_alvo` `w-32`, `percentual_comissao` `w-32`) — nenhuma mudança nelas, só o container vira `Card`.

---

### Task 1: Card no formulário "Novo sonho"

**Files:**
- Modify: `src/app/painel/sonhos/page.tsx`

**Interfaces:**
- Consumes: `Card`/`CardContent` (`src/components/ui/card.tsx`, Fase 1) — já existente, sem mudança de interface.

- [ ] **Step 1: Reescrever `src/app/painel/sonhos/page.tsx`**

Substituir o arquivo inteiro por:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SonhoRow } from '@/components/sonho-row'

async function criarSonho(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()

  await supabase.from('sonhos').insert({
    barbearia_id: membro!.barbearia_id,
    membro_id: membro!.id,
    nome: formData.get('nome') as string,
    valor_alvo: Number(formData.get('valor_alvo')),
    percentual_comissao: Number(formData.get('percentual_comissao')),
  })
  revalidatePath('/painel/sonhos')
}

export default async function SonhosPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id').eq('user_id', user!.id).single()

  const { data: sonhos } = await supabase
    .from('sonhos')
    .select('*')
    .eq('membro_id', membro!.id)
    .order('concluido')
    .order('criado_em')

  const sonhosComProgresso = await Promise.all(
    (sonhos ?? []).map(async (sonho) => {
      const { data: comissao } = await supabase.rpc('comissao_acumulada', {
        p_membro_id: membro!.id,
        p_data_inicio: sonho.criado_em,
      })
      const valorAcumulado = Math.min(
        Number(comissao ?? 0) * (sonho.percentual_comissao / 100),
        sonho.valor_alvo
      )
      if (!sonho.concluido && valorAcumulado >= sonho.valor_alvo) {
        await supabase.from('sonhos').update({ concluido: true }).eq('id', sonho.id)
        sonho.concluido = true
      }
      return { sonho, valorAcumulado }
    })
  )

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Sonhos</h1>

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Novo sonho</h2>
          <form action={criarSonho} className="flex gap-2 flex-wrap items-center">
            <Input name="nome" placeholder="Nome do sonho" className="w-40" required />
            <Input name="valor_alvo" type="number" step="0.01" min="0.01" placeholder="Valor-alvo" className="w-32" required />
            <Input name="percentual_comissao" type="number" step="0.01" min="0.01" max="100" placeholder="% da comissão" className="w-32" required />
            <Button type="submit">+ Novo sonho</Button>
          </form>
        </CardContent>
      </Card>

      {sonhosComProgresso.map(({ sonho, valorAcumulado }) => (
        <SonhoRow key={sonho.id} sonho={sonho} valorAcumulado={valorAcumulado} />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 3: Verificação visual manual**

Login como barbeiro, abrir `/painel/sonhos`. Confirmar o `Card` ao redor do formulário "Novo sonho" e que ele mantém a linha horizontal compacta. Testar de ponta a ponta: criar um sonho novo, editar um existente (via `SonhoRow`), excluir um, e confirmar que a barra de progresso e o badge "Concluído" continuam funcionando normalmente.

- [ ] **Step 4: Commit**

```bash
git add src/app/painel/sonhos/page.tsx
git commit -m "feat: redesign painel sonhos to match SF visual identity"
```
