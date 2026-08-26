# Redesign Visual — Painel: Prospecção (Fase 11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reestilizar `/painel/prospeccao` — 4 seções soltas (metas, novo contato, pendentes, conversão) viram `Card`s, os `<select>` nativos (canal, categoria de origem, status) viram `Select` compartilhado — sem mudar nenhum dado, query ou lógica já existente, só a apresentação.

**Architecture:** Três arquivos tratados como uma unidade só, porque `src/app/painel/prospeccao/page.tsx` renderiza diretamente os outros dois (`TelefoneClienteBusca` dentro do formulário "Novo contato", `ProspeccaoStatusForm` dentro da lista de pendentes) — mesmo padrão de "página + sub-componentes citados" já usado na Fase 7 (Barbeiros). Reaproveita `Card`/`CardContent` (Fase 1) e `Select` (Fase 2), ambos já existentes — nenhum componente novo. O checkbox de "oferta de corte grátis" continua nativo (sem componente `Checkbox` compartilhado).

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui, Supabase.

**Spec:** `docs/superpowers/specs/2026-08-25-redesign-visual-painel-prospeccao-fase11-design.md`

## Global Constraints

- **Nenhum dado, query ou lógica muda** — a busca de cliente por telefone (debounce + RPC), a server action `novoContato`, e `salvar` de `ProspeccaoStatusForm` continuam com o corpo idêntico; só a apresentação (JSX/estilo) é reescrita.
- **`Card`/`Select` já existem** (Fases 1 e 2) — nenhum token novo, nenhum componente novo nesta fase.
- **Sem componente `Checkbox` novo** — o checkbox de "oferta de corte grátis" continua nativo.
- **Toda troca de `<select>` nativo por `Select` compartilhado precisa de largura explícita** igual à intenção visual original: campos em linhas com `flex-wrap` (`canal`, `categoria_origem`) ganham largura pra manter o layout compacto; o `Select` de status em `ProspeccaoStatusForm` (container **sem** `flex-wrap`) precisa da largura pela mesma razão que a Fase 7 já corrigiu no Expediente de Barbeiros — sem isso, ele briga por espaço via `flex-shrink`.
- **Barras de progresso usam `rounded-full`** (não `rounded`), alinhando com o estilo já usado em Sonhos e na sidebar do painel.

---

### Task 1: Cards + Select compartilhado em Prospecção (painel)

**Files:**
- Modify: `src/app/painel/prospeccao/page.tsx`
- Modify: `src/components/telefone-cliente-busca.tsx`
- Modify: `src/components/prospeccao-status-form.tsx`

**Interfaces:**
- Consumes: `Card`/`CardContent` (`src/components/ui/card.tsx`, Fase 1), `Select` (`src/components/ui/select.tsx`, Fase 2) — ambos já existentes, sem mudança de interface. `TelefoneClienteBusca` e `ProspeccaoStatusForm` mantêm suas assinaturas de props exatas (`TelefoneClienteBusca` não recebe props; `ProspeccaoStatusForm({ prospeccaoId, statusAtual })`).

- [ ] **Step 1: Reescrever `src/components/telefone-cliente-busca.tsx`**

Substituir o arquivo inteiro por:

```tsx
'use client'

import { useRef, useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { CATEGORIAS_ORIGEM } from '@/lib/categorias-origem'

type ResultadoBusca = {
  id: string
  nome: string
  telefone: string
  total_cortes: number
  data_nascimento: string | null
  bairro: string | null
  cidade: string | null
}

// Não reaproveita ClienteAutocomplete de propósito — esta tela tem seu
// próprio formulário inline via Server Action (novoContato), sem o
// callback onResolved que ClienteAutocomplete usa pra reportar mudanças
// pro componente pai. Os campos aqui postam direto pelo <form> nativo,
// via os atributos name.
export function TelefoneClienteBusca() {
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [resultados, setResultados] = useState<ResultadoBusca[]>([])
  const [mostrarLista, setMostrarLista] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const buscaSeqRef = useRef(0)

  function verificar(tel: string) {
    setTelefone(tel)
    const seq = ++buscaSeqRef.current

    if (debounceRef.current) clearTimeout(debounceRef.current)

    const digitos = tel.replace(/\D/g, '')
    if (digitos.length < 4) {
      setResultados([])
      setMostrarLista(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      const supabase = getBrowserSupabaseClient()
      const { data: rows } = await supabase.rpc('buscar_clientes_por_telefone', { p_busca: tel })
      if (seq !== buscaSeqRef.current) return
      setResultados(rows ?? [])
      setMostrarLista((rows ?? []).length > 0)
    }, 300)
  }

  function selecionar(cliente: ResultadoBusca) {
    setNome(cliente.nome)
    setTelefone(cliente.telefone)
    setBairro(cliente.bairro ?? '')
    setCidade(cliente.cidade ?? '')
    setMostrarLista(false)
    setResultados([])
  }

  return (
    <>
      <Input name="nome" placeholder="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} className="w-40" />
      <div className="relative">
        <Input
          name="telefone"
          placeholder="Telefone"
          required
          value={telefone}
          onChange={(e) => verificar(e.target.value)}
          onBlur={() => setMostrarLista(false)}
          className="w-40"
        />
        {mostrarLista && resultados.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-card border rounded-lg shadow-md max-h-48 overflow-y-auto">
            {resultados.map((r) => (
              <button
                key={r.id}
                type="button"
                onMouseDown={() => selecionar(r)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0"
              >
                {r.nome} · {r.telefone} · {r.total_cortes}º corte aqui
              </button>
            ))}
          </div>
        )}
      </div>
      <Input name="bairro" placeholder="Bairro (opcional)" value={bairro} onChange={(e) => setBairro(e.target.value)} className="w-32" />
      <Input name="cidade" placeholder="Cidade (opcional)" value={cidade} onChange={(e) => setCidade(e.target.value)} className="w-32" />
      <Select name="categoria_origem" aria-label="Como conheceu a barbearia?" className="w-56" defaultValue="">
        <option value="">Como conheceu a barbearia?</option>
        {CATEGORIAS_ORIGEM.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </Select>
    </>
  )
}
```

- [ ] **Step 2: Reescrever `src/components/prospeccao-status-form.tsx`**

Substituir o arquivo inteiro por:

```tsx
'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

const OPCOES = [
  { value: 'novo_lead', label: 'Novo lead' },
  { value: 'em_contato', label: 'Em contato' },
  { value: 'interessado', label: 'Interessado' },
]

// agendou/compareceu/convertido/nao_convertido não aparecem aqui de
// propósito — esses só mudam sozinhos, via o agendamento vinculado (ver
// migration 0015_prospeccao_auto_conversao.sql), nunca por edição manual.
export function ProspeccaoStatusForm({ prospeccaoId, statusAtual }: { prospeccaoId: string; statusAtual: string }) {
  const [status, setStatus] = useState(statusAtual)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('prospeccoes').update({ status }).eq('id', prospeccaoId)
    setSalvando(false)
    window.location.reload()
  }

  return (
    <div className="flex gap-2 items-center">
      <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className="w-36">
        {OPCOES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
      <Button type="button" onClick={salvar} disabled={salvando || status === statusAtual}>Salvar</Button>
    </div>
  )
}
```

- [ ] **Step 3: Reescrever `src/app/painel/prospeccao/page.tsx`**

Substituir o arquivo inteiro por:

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ProspeccaoStatusForm } from '@/components/prospeccao-status-form'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { TelefoneClienteBusca } from '@/components/telefone-cliente-busca'

async function novoContato(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()

  const nome = formData.get('nome') as string
  const telefone = formData.get('telefone') as string
  const bairro = (formData.get('bairro') as string) || null
  const cidade = (formData.get('cidade') as string) || null
  const categoriaOrigem = (formData.get('categoria_origem') as string) || null

  const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
    p_barbearia_id: membro!.barbearia_id, p_nome: nome, p_telefone: telefone,
    p_bairro: bairro, p_cidade: cidade, p_categoria_origem: categoriaOrigem,
  })
  if (clienteId.error) throw new Error(clienteId.error.message)

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

      {(metaDia > 0 || metaSemana > 0) && (
        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="font-heading text-base font-bold mb-5">Metas de prospecção</h2>
            {metaDia > 0 && (
              <div className="mb-4">
                <p className="text-sm mb-1">Meta diária de contatos</p>
                <div className="w-full bg-muted rounded-full h-6 overflow-hidden mb-1">
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
              <div>
                <p className="text-sm mb-1">Meta semanal de contatos</p>
                <div className="w-full bg-muted rounded-full h-6 overflow-hidden mb-1">
                  <div className="bg-primary h-full text-primary-foreground text-xs flex items-center justify-center" style={{ width: `${Math.min((totalContatosSemana / metaSemana) * 100, 100)}%` }}>
                    {totalContatosSemana} / {metaSemana}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {totalContatosSemana >= metaSemana ? 'Meta batida!' : `${totalContatosSemana} de ${metaSemana} — faltam ${metaSemana - totalContatosSemana}`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Novo contato prospectado</h2>
          <form action={novoContato} className="flex gap-2 items-center flex-wrap">
            <TelefoneClienteBusca />
            <Select name="canal" aria-label="Canal" className="w-40" defaultValue="">
              <option value="">Canal (opcional)</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="indicacao">Indicação</option>
              <option value="rua">Na rua</option>
              <option value="redes_sociais">Redes sociais</option>
              <option value="outro">Outro</option>
            </Select>
            <label className="text-sm flex items-center gap-1">
              <input type="checkbox" name="oferta_corte_gratis" /> Ofereci corte grátis + consultoria
            </label>
            <Button type="submit">+ Novo contato prospectado</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Pendentes de conversão ({pendentes?.length ?? 0})</h2>
          {pendentes?.map((p) => (
            <div key={p.id} className="flex justify-between items-center border-b py-2 last:border-b-0">
              <span>{p.nome} · {p.telefone} · {p.canal ?? 'sem canal'}{p.oferta_corte_gratis && ' · corte grátis'} · {new Date(p.criado_em).toLocaleDateString()}</span>
              <ProspeccaoStatusForm prospeccaoId={p.id} statusAtual={p.status} />
            </div>
          ))}
          {(pendentes?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">Nenhuma prospecção pendente.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Conversão</h2>
          <p className="text-sm">Convertidos hoje: {convertidosHoje?.length ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Taxa de conversão deste mês: {taxaMes}% ({finalizadosMes} finalizados de {totalMes} prospectados — os que ainda não agendaram/compareceram não entram nessa conta)</p>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 5: Verificação visual manual**

Login como barbeiro. Testar com metas de prospecção configuradas (confirmar o Card "Metas de prospecção" com as duas barras `rounded-full`) e sem elas (confirmar que o Card inteiro não aparece). Testar de ponta a ponta: buscar um cliente pelo telefone no formulário "Novo contato prospectado" (a lista de sugestões deve aparecer e selecionar uma deve preencher nome/telefone/bairro/cidade), registrar um novo contato com e sem canal/oferta, mudar o status de uma prospecção pendente pelo `Select` novo e salvar, confirmar que "Pendentes de conversão" mostra a mensagem de vazio quando não há nenhuma, e que os números do Card "Conversão" continuam corretos.

- [ ] **Step 6: Commit**

```bash
git add src/app/painel/prospeccao/page.tsx src/components/telefone-cliente-busca.tsx src/components/prospeccao-status-form.tsx
git commit -m "feat: redesign painel prospecção to match SF visual identity"
```
