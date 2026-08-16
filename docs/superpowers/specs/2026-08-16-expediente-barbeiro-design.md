# Cadastro de expediente do barbeiro — Design Spec

## Contexto e objetivo

Hoje não existe nenhuma tela para cadastrar o expediente (dia da semana + horário) de um barbeiro — a tabela `horarios_trabalho` (criada em `supabase/migrations/0005_agenda.sql`) só é **lida**, por `src/components/agenda-dia.tsx`, para calcular horários disponíveis na agenda. A única forma de popular essa tabela hoje é inserção manual direta no banco, o que foi feito ad-hoc para testar a feature de sonhos. Este spec adiciona a tela de cadastro que faltava.

## Escopo

- Só o **admin** cadastra/edita o expediente de um barbeiro — mesmo modelo de "admin gerencia dados operacionais do barbeiro" já usado para plano de carreira e meta de prospecção em `/admin/barbeiros`.
- Um barbeiro tem **no máximo um intervalo contínuo por dia da semana** (ex: 9h–18h) — sem suporte a múltiplos blocos no mesmo dia (ex: pausa de almoço). A ausência de linha para um dia já significa "não trabalha nesse dia" (comportamento atual de `agenda-dia.tsx`, que simplesmente não encontra horário disponível).
- **Sem mudança de RLS** — a policy `"admin gerencia horarios_trabalho"` (`supabase/migrations/0005_agenda.sql`) já cobre `for all` (select/insert/update/delete) para admin da mesma barbearia; não é preciso alterar a migration.
- **Sem migration nova** — a tabela `horarios_trabalho` já tem todas as colunas necessárias (`membro_id`, `dia_semana` 0–6, `hora_inicio`, `hora_fim`, com `check (hora_fim > hora_inicio)`).

## Modelo de interação

Na tabela de `/admin/barbeiros`, cada linha (`BarbeiroRow`) ganha um novo botão "Expediente" na coluna Ações, ao lado de Editar/Desativar. Clicar expande — abaixo da linha, dentro do mesmo `<TableRow>` via uma célula com `colSpan` — um formulário com os 7 dias da semana (Domingo a Sábado, na ordem `dia_semana` 0–6, que é a mesma convenção de `Date.getDay()` já usada em `agenda-dia.tsx`). Cada dia é uma linha com: checkbox "trabalha esse dia", e dois inputs de horário (início/fim), desabilitados quando o checkbox está desmarcado. Marcar o checkbox de um dia sem horário prévio preenche 09:00–18:00 como padrão editável.

Um botão "Salvar expediente" no fim do formulário envia tudo de uma vez.

## Dados e fluxo de salvamento

`admin/barbeiros/page.tsx` já faz duas queries (`membros`, `planos_carreira`) e passa pra `BarbeiroRow`; ganha uma terceira: `horarios_trabalho` de todos os barbeiros da barbearia (uma query, sem filtro por membro — RLS já escopa pela barbearia via a policy de admin), agrupada por `membro_id` num `Map` em TS (mesmo padrão de "duas queries + join em JS" já estabelecido na tela `/admin/sonhos` — este projeto nunca usa embedded-select do PostgREST). Cada `BarbeiroRow` recebe seu próprio array de expediente (0 a 7 linhas) como prop nova.

O salvamento é uma Server Action `salvarExpediente(membro_id, dias)` que **substitui tudo de uma vez**: apaga todos os `horarios_trabalho` existentes daquele `membro_id` e insere só os dias que ficaram marcados, com seus horários. Evita ter que decidir individualmente quais dias foram adicionados/removidos/alterados — mais simples e correto para um formulário que sempre representa o estado completo da semana.

**Validação client-side antes de enviar:** todo dia marcado precisa ter hora_início e hora_fim preenchidos, e hora_fim > hora_início (mesma regra do `check` constraint do banco) — isso reduz a maior parte do risco de um envio inválido chegar a meio caminho entre o delete e o insert. Se algo mesmo assim falhar no servidor (ex: uma corrida entre duas abas), a Server Action lança um erro e o Next mostra a página de erro padrão — mesmo padrão já aceito no projeto para `criarBarbeiro`/`criarServico`, sem UI de erro dedicada.

## Testes

Sem lógica de cálculo nova — é CRUD simples sobre uma tabela e política de RLS que já existem. Cobertura via `npm run build` + passada manual (marcar/desmarcar dias, horários válidos e inválidos, salvar, confirmar que a agenda do barbeiro (`agenda-dia.tsx`) reflete o novo expediente) — navegador se disponível na hora da implementação, senão documentar a limitação como já aconteceu nos ciclos anteriores.

## Fora de escopo (explicitamente adiado)

- Múltiplos intervalos por dia (pausa de almoço).
- Barbeiro editar o próprio expediente.
- Data-limite/exceções pontuais (ex: "não trabalho no feriado tal") — isso já existe separadamente via `bloqueios_agenda`, tabela não tocada por este spec.
