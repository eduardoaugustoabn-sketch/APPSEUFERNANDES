# Fluxo Agendamento → Atendimento → Faturamento — Design

## Contexto

O MVP (spec `2026-08-03-barbearia-mvp-design.md`, 22 tasks + revisão final, mergeado) já entrega cadastro, agenda, lançamento, comissão, ociosidade e prospecção básicos. Em uso real, surgiram problemas de integração entre esses módulos:

- Existe uma tela "Lançamentos" separada da Agenda, criando duplicidade de entrada de dado.
- A agenda só permite clique em horários de hoje; outras datas usam um formulário fixo abaixo da grade.
- Uma constraint de banco bloqueia qualquer sobreposição de horário, mesmo quando é uma decisão legítima do barbeiro (encaixe).
- `agendamentos.status` só distingue `confirmado`/`cancelado`/`concluido` — não há como registrar não-comparecimento, nem uma etapa de confirmação separada da criação.
- `clientes` não tem data de nascimento.
- `prospeccoes` não exige telefone no contato inicial e só linka a um cliente manualmente, no momento da conversão — não há ligação automática com agendamento/atendimento.
- A dashboard já soma corretamente só a partir de `atendimentos`/`vendas_produtos` (não de `agendamentos`), mas não expõe nenhum indicador de agendamento (perdidos, não comparecidos, remarcados) nem nada sobre o resultado da prospecção.

Este spec cobre o rework desses pontos. Não é um novo módulo — é uma correção de modelo de dados e de fluxo sobre o que já existe, então a maior parte da mudança é em `agendamentos`, `prospeccoes`, na Agenda e na Dashboard.

## Decisões de escopo (confirmadas com o usuário)

- **Walk-in (cliente sem agendamento prévio):** não existe mais tela de lançamento avulso. Um botão "Atender agora" na Agenda cria um agendamento no horário atual e abre imediatamente a mesma tela de "concluir atendimento" já usada para agendamentos existentes — nenhuma tela nova, nenhum caminho de dado que não passe por `agendamentos`.
- **Conflito de horário:** permitido **só no fluxo interno** (barbeiro/admin agendando pela Agenda). O link público de agendamento continua bloqueando horários ocupados sem exceção — só quem tem contexto de negócio (a equipe) pode decidir sobrepor.
- **Etapas "Agendado" → "Confirmado":** são duas etapas reais e manuais. Um agendamento criado pelo barbeiro/admin internamente já nasce `confirmado` (a equipe já falou com o cliente no ato de marcar). Um agendamento criado pelo cliente no link público nasce `agendado`, pendente de alguém da equipe confirmar.
- **Remarcação:** continua editando a mesma linha (troca `data`/`hora_inicio`/`hora_fim`), sem virar um status próprio nem gerar uma linha nova. Um contador (`vezes_remarcado`) alimenta o indicador da dashboard.
- **Não comparecimento:** ação manual — sem job agendado no projeto. Um agendamento `agendado` ou `confirmado` cuja data/hora já passou ganha um botão "Não compareceu" na Agenda.
- **Prospecção → conversão:** automático via gatilho no banco, amarrado ao status do agendamento vinculado — nunca uma ação manual duplicando o que já está registrado no atendimento.

## Modelo de dados — mudanças

### `agendamentos`

```
status: 'agendado' | 'confirmado' | 'realizado' | 'nao_compareceu' | 'cancelado'
        (era: 'confirmado' | 'cancelado' | 'concluido' — 'concluido' renomeia para 'realizado')
vezes_remarcado: int not null default 0   -- novo
```

Regra de criação: quem insere define o status inicial (não há default de tabela) —
- Agenda interna (`AgendarSlotForm`, "Atender agora", "agendar retorno" no lançamento) → insere já `confirmado`.
- `criar_agendamento_publico()` (RPC do link público) → insere `agendado`.

Remove-se a exclusion constraint `agendamento_sem_sobreposicao` (GiST). Ela hoje bloqueia sobreposição para qualquer origem — mas o requisito é bloquear só o público. Constraints de exclusão do Postgres são simétricas (o predicado `WHERE` filtra os dois lados da comparação igualmente), então não dá pra expressar "bloqueia se o novo é público, ignora se é interno" numa constraint só. A checagem de conflito para o público passa a ser uma query explícita dentro de `criar_agendamento_publico()` (mesma forma de comparação de intervalo que `horarios_disponiveis()` já usa), que levanta exceção se houver colisão com qualquer agendamento não cancelado. Os inserts internos deixam de ter qualquer bloqueio de banco — a Agenda decide se avisa o usuário, mas o insert em si sempre é aceito.

`horarios_disponiveis()` (RPC usada por "ver horários" em remarcar/retorno/agenda pública) não muda — continua só listando o que está livre; ela não impede a Agenda de deixar o barbeiro clicar num horário ocupado de propósito.

### `clientes`

```
data_nascimento: date null   -- novo, opcional
```

### `prospeccoes`

```
nome: text not null            -- novo
telefone: text not null        -- novo
cliente_id: uuid not null references clientes(id)   -- era nullable, preenchido só na conversão; agora obrigatório e preenchido na criação
agendamento_id: uuid null references agendamentos(id)  -- novo
status: 'novo_lead' | 'em_contato' | 'interessado' | 'agendou' | 'compareceu' | 'convertido' | 'nao_convertido'
        (era: 'contactado' | 'convertido')
-- convertido_em: timestamptz null (sem mudança)
-- canal, oferta_corte_gratis, data, membro_id, barbearia_id: sem mudança
```

Ao registrar um contato, o form chama `criar_ou_obter_cliente(nome, telefone)` (mesma função já usada em lançamento/agendamento) antes do insert, então uma pessoa que já é cliente (ou já foi prospectada antes, mesmo telefone) é reconhecida na hora — sem recadastro. Status inicial no registro: `em_contato` (o próprio ato de registrar já é um contato feito). `novo_lead`/`interessado` ficam disponíveis para o barbeiro ajustar manualmente conforme a conversa evolui; `agendou`/`convertido`/`nao_convertido` são só automáticos (não editáveis à mão, ver triggers abaixo), para não haver dois caminhos escrevendo o mesmo dado.

`compareceu` fica no enum por completude (é um dos status pedidos), mas não tem transição própria: no fluxo atual, todo atendimento salvo já exige pelo menos um serviço ou produto (`LancamentoForm`), então "compareceu" e "convertido" acontecem no mesmo instante — o agendamento vai direto de `agendou` para a prospecção `convertido` quando é marcado `realizado`, sem passar por um `compareceu` intermediário.

O botão manual "Converteu" (`ProspeccaoConverterForm`) é removido — substituído pelas transições automáticas abaixo.

### Gatilhos de transição automática (prospecção ↔ agendamento)

Dois triggers em `agendamentos`, cobrindo INSERT e UPDATE de `status`:

1. **INSERT** — se o `cliente_id` do novo agendamento tem uma prospecção aberta (`status` em `novo_lead`/`em_contato`/`interessado`, `agendamento_id` ainda nulo), pega a mais recente (`order by criado_em desc limit 1`) e marca `status = 'agendou'`, `agendamento_id = novo.id`.
2. **UPDATE de status** — se o agendamento tem uma prospecção vinculada (`agendamento_id = agendamento.id`) ainda não finalizada:
   - novo status `realizado` → prospecção vira `convertido`, `convertido_em = now()`.
   - novo status `nao_compareceu` ou `cancelado` → prospecção vira `nao_convertido`.

Isso cobre o fluxo do item 16 do pedido original sem exigir nenhuma tela nova: prospecção nasce pelo registro de contato, muda sozinha quando o mesmo telefone aparece num agendamento, e fecha sozinha quando esse agendamento é atendido, cancelado ou vira falta.

## Agenda — comportamento

- Slots de 1 em 1 hora (era 30 min).
- Clique funciona em qualquer data selecionada (era só hoje); o formulário fixo "Novo agendamento (outra data)" abaixo da grade é removido — a própria grade, com o seletor de data que já existe, cobre esse caso.
- Uma célula pode ter mais de um agendamento (overbooking proposital); todos aparecem empilhados dentro da célula, cada um com suas próprias ações. Uma célula (mesmo com algo já marcado) sempre tem um "+ agendar outro aqui" para adicionar mais um.
- Ao confirmar um novo agendamento interno num horário que colide com outro já existente, aparece: "Este horário já possui um serviço agendado. Tem certeza que deseja confirmar este agendamento?" com Confirmar/Cancelar — não bloqueia, só avisa (troca a checagem que hoje desabilita o botão em `AgendarSlotForm`).
- Ações por status, na própria célula:
  - `agendado` → Confirmar, Cancelar.
  - `confirmado` → clicar abre a tela de atendimento (marca `realizado` ao salvar, como já funciona hoje); Remarcar, Cancelar; "Não compareceu" aparece se a data/hora já passou.
  - `realizado` / `nao_compareceu` → só exibição (como hoje para `concluido`).
  - `cancelado` → continua fora da grade (já é filtrado hoje).
- "Atender agora": abre um formulário mínimo (cliente + primeiro serviço), cria o agendamento com `data`/`hora_inicio` = agora, `hora_fim` = agora + duração do serviço, `status = 'confirmado'`, `origem = 'interno'`, e na sequência abre a mesma tela de lançamento (`modoAgenda`) já usada pra atender um agendamento existente.

`LancamentoForm` perde o modo "avulso" (sem `modoAgenda`) — deixa de ser opcional, já que não existe mais nenhuma rota que o abra sem um agendamento por trás.

## Ficha do cliente

Além do que já existe (ranking de itens mais usados, histórico de atendimentos/produtos), passa a mostrar:
- **Agendamentos:** todas as datas/horários/serviço/status daquele cliente, incluindo cancelados e não-comparecidos (histórico completo, diferente da grade da Agenda que só mostra o que ainda é relevante pro dia).
- **Prospecção** (se aplicável): data do contato, canal, status atual, data de conversão.

## Dashboard

Três blocos, claramente separados (hoje só existe o primeiro):

1. **Resultados reais** — sem mudança de lógica: faturamento, comissão, atendimentos realizados, produtos vendidos, ocupação, sempre a partir de `atendimentos`/`vendas_produtos`. `agendamentos` nunca entra nessa conta, hoje ou depois.
2. **Indicadores de agendamento** (novo) — no mês: total de agendamentos, realizados, não compareceram, cancelados, remarcados (soma de `vezes_remarcado`). Rotulado explicitamente como não somado ao financeiro.
3. **Prospecção** (novo) — no mês: prospectados, convertidos, não convertidos, faturamento gerado pelos convertidos (soma de `atendimentos`/`vendas_produtos` cujo `agendamento_id` é o `agendamento_id` que converteu a prospecção — ou seja, o valor da visita que efetivamente converteu, não o histórico de vida inteiro do cliente), com quebra por serviço.

Blocos 2 e 3 entram tanto no dashboard do barbeiro (`/painel`, escopo próprio) quanto na visão geral do admin (`/admin`, escopo da barbearia inteira).

Um novo relatório, só pro admin (`/admin/prospeccao`), lista cada prospecção convertida com: nome, telefone, data da prospecção, data do atendimento, status, serviço + extras, produtos, valores, profissional responsável — a visão línea-a-linha por trás do bloco 3 agregado.

## Migrações e RLS

Tudo isso é RLS-sensível do mesmo jeito que o resto do projeto (padrão já estabelecido: toda policy de INSERT/UPDATE valida FK-por-tenant, ver `progress.md` do MVP). Pontos que precisam de atenção extra na implementação:

- Os dois triggers de prospecção/agendamento rodam como `security definer` (mesmo padrão de `aplicar_comissao_atendimento`/`processar_venda_produto`) — o barbeiro não tem UPDATE direto em `prospeccoes` de outro membro, mas o trigger precisa poder gravar independente de quem disparou o UPDATE em `agendamentos`.
- A policy de INSERT de `prospeccoes` precisa mudar (hoje pina `status = 'contactado'` e `cliente_id is null`; passa a exigir `status = 'em_contato'` e `cliente_id` preenchido).
- Ao expandir o check constraint de `agendamentos.status`, migrar as linhas existentes (`concluido` → `realizado`) antes de trocar a constraint.

## Testes

Segue o padrão pgTAP já usado no projeto (`supabase/tests/database/`):
- Overbooking interno permitido / público bloqueado (dois casos, mesmo horário).
- Trigger de prospecção: agendar → `agendou`; realizar → `convertido`; cancelar/não-comparecer → `nao_convertido`.
- RLS: barbeiro não decide status de agendamento de outro barbeiro; INSERT de prospecção sem telefone falha (`not null`); INSERT de prospecção com `cliente_id` nulo ou `status` diferente de `em_contato` continua bloqueado pela policy.

Mais o regression pass já padrão do projeto ao final: `npx supabase db reset` + `npx supabase test db` + `npm test` + `npm run build`, e uma passada manual pela Agenda/Prospecção/Dashboard como a que fechou o MVP.
