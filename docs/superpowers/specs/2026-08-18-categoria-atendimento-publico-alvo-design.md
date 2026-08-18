# Categoria de atendimento e Índice de Público-Alvo — Design Spec

## Contexto e objetivo

Este é o Fase 1 de um pedido maior — "Sistema de Gestão — Categorias de Atendimento e Indicadores de Performance" — que na íntegra cobre categorização, vários indicadores derivados (recorrência por categoria, conversão, oportunidade de conversão), alertas automáticos, diagnóstico em texto e um painel comparativo entre barbeiros. Dado o tamanho, o trabalho foi fatiado em fases; este spec cobre só a Fase 1: capturar a categoria de cada atendimento e mostrar, no painel do barbeiro, a distribuição por categoria e o Índice de Público-Alvo. As fases seguintes (recorrência, conversão, alertas, diagnóstico, painel comparativo de admin) ficam para specs futuros, depois que esta base estiver validada em uso real.

O objetivo de negócio: identificar não só se o barbeiro está ocupado, mas com que tipo de cliente — especificamente, qual fração da agenda dele é o público-alvo da barbearia (clientes que fazem cabelo + barba), já que isso impacta ticket médio e faturamento mais que ocupação pura.

## Modelo de dados

A categoria de uma **visita** (não de um atendimento isolado) é **derivada automaticamente** dos serviços realizados nela — não é escolhida manualmente por ninguém. Isso evita divergência entre o que foi de fato prestado e o que foi rotulado, e classifica retroativamente todo o histórico assim que os serviços forem marcados (nenhuma migração de dado em `atendimentos` é necessária).

```sql
alter table servicos add column categoria_servico text not null default 'outro'
  check (categoria_servico in ('cabelo', 'barba', 'outro'));
```

Todo serviço já cadastrado nasce como `'outro'` — nenhuma tentativa de adivinhar a partir do nome ou do campo `tipo` existente (`corte`/`servico_extra`, que é um eixo diferente e não tem correspondência 1:1 com cabelo/barba). O admin revisa e marca cada serviço manualmente pela tela de Serviços, no seu tempo.

**Visita** = um `agendamento_id` (todo `atendimentos.agendamento_id` é sempre preenchido hoje — mesmo um "lançamento avulso" sem hora marcada cria um `agendamento` primeiro, confirmado em `atender-agora-form.tsx`). A categoria da visita é calculada a partir do conjunto de `categoria_servico` dos atendimentos daquele `agendamento_id`, **ignorando os marcados `outro`**:

| Serviços da visita (ignorando `outro`) | Categoria |
|---|---|
| só `cabelo` | Só Cabelo |
| só `barba` | Só Barba |
| `cabelo` e `barba` | Cabelo + Barba |
| nenhum (só `outro`, ou só venda de produto) | fora da contagem — não entra no denominador de nenhum indicador desta fase |

A unidade contada nos indicadores é **visita no mês**, não cliente único — consistente com o resto do `/painel`, que já é inteiramente mensal (faturamento, atendimentos, ocupação). Um cliente que voltar duas vezes no mês conta duas vezes.

## Lógica de cálculo (função pura)

Nova função em `src/lib/categoria-atendimento.ts`, seguindo o mesmo padrão de `calcularOciosidade` em `src/lib/ociosidade.ts` — lógica isolada e testável, chamada a partir de `painel/page.tsx` depois de buscar os atendimentos do mês com o serviço relacionado:

```ts
type CategoriaServico = 'cabelo' | 'barba' | 'outro'
type AtendimentoParaCategoria = { agendamentoId: string; categoriaServico: CategoriaServico }

type DistribuicaoCategorias = {
  soCabelo: number
  soBarba: number
  cabeloEBarba: number
  totalClassificado: number
  indicePublicoAlvo: number // 0–100, arredondado
}

export function calcularDistribuicaoCategorias(atendimentos: AtendimentoParaCategoria[]): DistribuicaoCategorias
```

Internamente: agrupa por `agendamentoId`, monta o conjunto de categorias presentes em cada grupo (excluindo `outro`), classifica cada grupo pela tabela acima, soma. `indicePublicoAlvo = totalClassificado > 0 ? round(cabeloEBarba / totalClassificado * 100) : 0` — mesmo padrão de divisão-por-zero já usado em `percentualCortes` etc. na própria página.

## Captura na UI (admin)

`servico-row.tsx` e `admin/servicos/page.tsx` ganham o mesmo tratamento que o campo `tipo` já tem hoje: um `<select>` "Categoria" com as opções Cabelo / Barba / Outro, tanto no formulário de criação quanto na edição inline de cada linha. `ROTULO_CATEGORIA` mapeia os valores para rótulos, mesmo padrão de `ROTULO_TIPO`.

## Exibição no painel do barbeiro

`/painel` (`src/app/painel/page.tsx`):

- **Índice de Público-Alvo** vira um quarto card no topo, ao lado de Faturamento do mês / Comissão do mês / Ocupação da agenda (mesmo estilo visual — número grande em destaque).
- Um novo Card abaixo de "Ganhos por categoria", no mesmo estilo (barra de progresso + números), mostrando Só Cabelo / Só Barba / Cabelo+Barba com quantidade e % cada.

A página passa a buscar `atendimentos` do mês com um join extra em `servicos(categoria_servico)` (além do `servicos(nome, tipo)` que já busca hoje), e chama `calcularDistribuicaoCategorias` sobre o resultado.

## Casos de borda

- Barbeiro sem nenhuma visita classificável no mês → Índice de Público-Alvo mostra 0%, card de distribuição mostra 0/0/0 — não some nem mostra traço, mesmo padrão do resto do painel.
- Serviço desativado depois de um atendimento já realizado continua contando pro histórico normalmente — a classificação vem da linha de `servicos` vinculada ao `servico_id` daquele atendimento, independente do estado atual (`ativo`) do catálogo.
- Visita com produto vendido mas nenhum serviço prestado → não entra no denominador (nenhum atendimento pra classificar).

## Testes

- **Unitário (vitest):** `calcularDistribuicaoCategorias` — casos: só cabelo, só barba, cabelo+barba, mistura com `outro` (deve ser ignorado na decisão mas não quebrar a contagem), múltiplas visitas agregadas, lista vazia (sem divisão por zero), duas visitas do mesmo `agendamentoId` não devem ser possíveis mas a função deve ser robusta a entradas fora de ordem.
- **pgTAP:** nenhuma policy de RLS nova é necessária — `categoria_servico` é só mais uma coluna já coberta pelas policies de SELECT/UPDATE de `servicos` existentes. Sem necessidade de teste de isolamento novo.
- **Build:** `npm run build` sem erros de tipo.
- **Manual (se navegador disponível):** marcar 2 serviços como cabelo e barba respectivamente, registrar um atendimento avulso com os dois no mesmo agendamento, confirmar que o card de distribuição mostra 1 em Cabelo+Barba e o Índice de Público-Alvo reflete isso.

## Fora de escopo (explicitamente adiado para fases futuras)

- Recorrência por categoria, conversão para categoria-alvo, indicador de oportunidade de conversão (seções 6, 7 e 10 do pedido original) — dependem de rastrear o histórico de categorias por cliente ao longo do tempo, não só do mês corrente.
- Alertas inteligentes e diagnóstico automático em texto (seções 9 e 11) — dependem dos indicadores acima existirem primeiro.
- Painel comparativo entre barbeiros para o admin (seção 14).
- Qualquer edição em massa/preenchimento automático de `categoria_servico` a partir do nome do serviço — cada serviço existente começa `'outro'` e é responsabilidade do admin revisar manualmente.
