# Redesign Visual — Admin: Prospecção (Fase 10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Envolver a tabela de conversão de prospecção num `Card` em `/admin/prospeccao` — sem mudar nenhum dado, query ou lógica já existente, só a apresentação.

**Architecture:** Uma única mudança em `src/app/admin/prospeccao/page.tsx`, reaproveitando `Card`/`CardContent` (já existentes desde a Fase 1). `/painel/prospeccao` não é tocada — não compartilha nenhum componente com esta página.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui, Supabase.

**Spec:** `docs/superpowers/specs/2026-08-25-redesign-visual-admin-prospeccao-fase10-design.md`

## Global Constraints

- **Nenhum dado, query ou lógica muda** — todas as queries e o mapeamento de `linhas` continuam com o corpo idêntico; só a apresentação (JSX/estilo) é reescrita.
- **`/painel/prospeccao` não é tocada** — não compartilha nenhum componente com `/admin/prospeccao`.

---

### Task 1: Card na tabela de conversão de prospecção

**Files:**
- Modify: `src/app/admin/prospeccao/page.tsx`

**Interfaces:**
- Consumes: `Card`/`CardContent` (`src/components/ui/card.tsx`, Fase 1) — já existente, sem mudança de interface.

- [ ] **Step 1: Reescrever `src/app/admin/prospeccao/page.tsx`**

Substituir o arquivo inteiro por:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'

type Linha = {
  nome: string
  telefone: string
  data: string
  convertido_em: string | null
  status: string
  agendamento_id: string | null
  membros: { nome: string } | null
}
type ItemAtendimento = { agendamento_id: string | null; preco: number; servicos: { nome: string } | null }
type ItemVenda = { agendamento_id: string | null; preco_unitario: number; quantidade: number; produtos: { nome: string } | null }

export default async function AdminProspeccaoPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const { data: convertidos } = await supabase
    .from('prospeccoes')
    .select('nome, telefone, data, convertido_em, status, agendamento_id, membros(nome)')
    .eq('barbearia_id', membro!.barbearia_id)
    .eq('status', 'convertido')
    .order('convertido_em', { ascending: false }) as { data: Linha[] | null }

  const agendamentoIds = (convertidos ?? []).map((c) => c.agendamento_id).filter((id): id is string => id !== null)

  const { data: atendimentosPorAgendamento } = await supabase
    .from('atendimentos')
    .select('agendamento_id, preco, servicos(nome)')
    .in('agendamento_id', agendamentoIds.length > 0 ? agendamentoIds : ['00000000-0000-0000-0000-000000000000']) as { data: ItemAtendimento[] | null }

  const { data: vendasPorAgendamento } = await supabase
    .from('vendas_produtos')
    .select('agendamento_id, preco_unitario, quantidade, produtos(nome)')
    .eq('barbearia_id', membro!.barbearia_id) as { data: ItemVenda[] | null }

  const linhas = (convertidos ?? []).map((c) => {
    const servicos = (atendimentosPorAgendamento ?? []).filter((a) => a.agendamento_id === c.agendamento_id)
    const produtos = (vendasPorAgendamento ?? []).filter((v) => v.agendamento_id === c.agendamento_id)
    const valorServicos = servicos.reduce((s, a) => s + Number(a.preco), 0)
    const valorProdutos = produtos.reduce((s, v) => s + Number(v.preco_unitario) * v.quantidade, 0)
    return {
      ...c,
      servicosTexto: servicos.map((s) => s.servicos?.nome ?? '—').join(', ') || '—',
      produtosTexto: produtos.map((p) => `${p.quantidade}x ${p.produtos?.nome ?? '—'}`).join(', ') || '—',
      valorTotal: valorServicos + valorProdutos,
    }
  })

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Conversão de prospecção</h1>
      <Card>
        <CardContent className="p-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead><TableHead>Telefone</TableHead><TableHead>Prospecção</TableHead><TableHead>Atendimento</TableHead>
                <TableHead>Serviços</TableHead><TableHead>Produtos</TableHead><TableHead>Total</TableHead><TableHead>Profissional</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l, i) => (
                <TableRow key={i}>
                  <TableCell>{l.nome}</TableCell>
                  <TableCell>{l.telefone}</TableCell>
                  <TableCell>{new Date(l.data).toLocaleDateString()}</TableCell>
                  <TableCell>{l.convertido_em ? new Date(l.convertido_em).toLocaleDateString() : '—'}</TableCell>
                  <TableCell>{l.servicosTexto}</TableCell>
                  <TableCell>{l.produtosTexto}</TableCell>
                  <TableCell>R$ {l.valorTotal.toFixed(2)}</TableCell>
                  <TableCell>{l.membros?.nome ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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

Login como admin, abrir `/admin/prospeccao`. Confirmar o `Card` ao redor da tabela e que as linhas de conversão mostram os mesmos dados de antes (nome, telefone, datas, serviços/produtos, total, profissional).

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/prospeccao/page.tsx
git commit -m "feat: redesign admin prospecção to match SF visual identity"
```
