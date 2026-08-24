# Redesign Visual — Admin: Ranking (Fase 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar mais espaçamento interno aos cards de ranking (`p-4` → `p-6`) e destacar visualmente o 1º colocado de cada lista (`text-primary font-bold`) em `/admin/ranking` — sem mudar nenhum dado, query ou lógica já existente, só a apresentação.

**Architecture:** Mudança isolada em `src/app/admin/ranking/page.tsx`, dentro do componente local `Secao` (já existe, usado pelas 3 seções da página). Nenhum componente novo, nenhum arquivo novo.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui, Supabase.

**Spec:** `docs/superpowers/specs/2026-08-24-redesign-visual-admin-ranking-fase6-design.md`

## Global Constraints

- **Nenhum dado, query ou lógica muda** — `rankingServico`, `rankingProduto`, e todas as queries continuam com o corpo idêntico; só a apresentação (JSX/estilo) é reescrita.
- **Sem ícones/badges novos** — o destaque do 1º lugar é só `text-primary font-bold` no texto, nada além disso.

---

### Task 1: Espaçamento + destaque do 1º lugar no Ranking

**Files:**
- Modify: `src/app/admin/ranking/page.tsx`

**Interfaces:**
- Nenhuma interface nova — mudança de classes CSS apenas.

- [ ] **Step 1: Reescrever `src/app/admin/ranking/page.tsx`**

Substituir o arquivo inteiro por:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'

export default async function RankingPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

  const { data: barbeiros } = await supabase
    .from('membros').select('id, nome')
    .eq('barbearia_id', membro!.barbearia_id).eq('papel', 'barbeiro').eq('ativo', true)
    .order('nome')
  const { data: servicos } = await supabase
    .from('servicos').select('id, nome, tipo')
    .eq('barbearia_id', membro!.barbearia_id).eq('ativo', true)
    .order('nome')
  const { data: produtos } = await supabase
    .from('produtos').select('id, nome')
    .eq('barbearia_id', membro!.barbearia_id).eq('ativo', true)
    .order('nome')

  const { data: atendimentos } = await supabase
    .from('atendimentos').select('membro_id, servico_id, preco')
    .eq('barbearia_id', membro!.barbearia_id).gte('data', inicioMes)
  const { data: vendas } = await supabase
    .from('vendas_produtos').select('membro_id, produto_id, quantidade, preco_unitario')
    .eq('barbearia_id', membro!.barbearia_id).gte('data', inicioMes)

  function rankingServico(servicoId: string) {
    return (barbeiros ?? [])
      .map((b) => {
        const linhas = (atendimentos ?? []).filter((a) => a.servico_id === servicoId && a.membro_id === b.id)
        return {
          nome: b.nome,
          quantidade: linhas.length,
          valor: linhas.reduce((s, a) => s + Number(a.preco), 0),
        }
      })
      .sort((a, b) => b.quantidade - a.quantidade)
  }

  function rankingProduto(produtoId: string) {
    return (barbeiros ?? [])
      .map((b) => {
        const linhas = (vendas ?? []).filter((v) => v.produto_id === produtoId && v.membro_id === b.id)
        return {
          nome: b.nome,
          quantidade: linhas.reduce((s, v) => s + v.quantidade, 0),
          valor: linhas.reduce((s, v) => s + Number(v.preco_unitario) * v.quantidade, 0),
        }
      })
      .sort((a, b) => b.quantidade - a.quantidade)
  }

  const cortes = (servicos ?? []).filter((s) => s.tipo === 'corte')
  const extras = (servicos ?? []).filter((s) => s.tipo === 'servico_extra')

  function Secao({ titulo, itens, ranking }: { titulo: string; itens: { id: string; nome: string }[]; ranking: (id: string) => { nome: string; quantidade: number; valor: number }[] }) {
    return (
      <>
        <h2 className="font-heading text-lg font-semibold mb-3">{titulo}</h2>
        <div className="grid gap-4 mb-8 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
          {itens.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-6">
                <p className="font-semibold mb-3">{item.nome}</p>
                <ol className="text-sm flex flex-col gap-1">
                  {ranking(item.id).map((r, i) => (
                    <li key={r.nome} className={`flex justify-between gap-2 ${i === 0 ? 'text-primary font-bold' : ''}`}>
                      <span>{i + 1}. {r.nome}</span>
                      <span className="font-medium text-right">{r.quantidade}x — R$ {r.valor.toFixed(2)}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
          {itens.length === 0 && <p className="text-sm text-muted-foreground">Nada cadastrado nessa categoria.</p>}
        </div>
      </>
    )
  }

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Ranking (mês)</h1>
      <Secao titulo="Cortes" itens={cortes} ranking={rankingServico} />
      <Secao titulo="Serviços extras" itens={extras} ranking={rankingServico} />
      <Secao titulo="Produtos" itens={produtos ?? []} ranking={rankingProduto} />
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 3: Verificação visual manual**

Login como admin, abrir `/admin/ranking`. Confirmar o padding maior nos cards e que o 1º colocado de pelo menos uma lista aparece em destaque (cor primária + negrito), com as demais posições no estilo padrão. Confirmar que uma categoria vazia continua mostrando "Nada cadastrado nessa categoria." normalmente.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/ranking/page.tsx
git commit -m "feat: redesign admin ranking to match SF visual identity"
```
