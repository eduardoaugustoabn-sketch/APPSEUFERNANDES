# Plataforma de Gestão de Barbearia — Design do MVP (Fase 1)

## Contexto

Plataforma SaaS multi-tenant de gestão para barbearias, com o objetivo central de tornar visível, todo dia, a relação entre prospecção → conversão → faturamento → comissão, para que cada barbeiro entenda que seu ganho é resultado direto do próprio esforço de captar clientes. Premissa de negócio: a barbearia vende tempo — cada minuto ocioso na agenda é receita perdida.

O documento original do produto descreve 5 módulos (estoque, metas/comissionamento, agendamento, prospecção, relatórios). Por ser grande demais para uma única entrega, o trabalho foi decomposto em fases. Este spec cobre a **Fase 1 (MVP)**, que — pela demanda ativa de engajamento diário do barbeiro — já incorpora versões simplificadas dos módulos de comissão, ociosidade e prospecção, além de estoque e agendamento completos.

Fases seguintes (fora do escopo deste spec, a especificar depois):
- **Fase 2:** plano de carreira completo por faixas de faturamento mensal (com simulador "se eu vender mais X, ganho Y" e projeção de fechamento do mês), substituindo o percentual fixo por categoria usado no MVP.
- **Fase 3:** relatórios avançados consolidados (ociosidade cruzada entre barbeiros, ranking/gamificação, comparativos mês a mês) e estoque consignado por barbeiro.
- **Fase 4:** onboarding self-service de novas barbearias (assinatura/pagamento), notificações via WhatsApp, preparação para múltiplas unidades por barbearia.

## Decisões de escopo

- **Modelo de negócio:** SaaS multi-tenant — cada barbearia é um tenant isolado. Novas barbearias são criadas manualmente por um super-admin no MVP; não há cadastro/assinatura self-service nesta fase.
- **Pagamento:** sempre presencial na barbearia. Sem integração de gateway de pagamento no MVP.
- **Notificações:** confirmação de agendamento é exibida na própria tela. Sem envio de e-mail/WhatsApp no MVP.
- **Estoque:** único estoque central por barbearia no MVP (sem estoque consignado por barbeiro).
- **Comissão:** percentual fixo por categoria (produto / serviço), definido em planos de carreira reutilizáveis e vinculados a cada barbeiro — não o plano completo por faixas de faturamento (isso é Fase 2).
- **Clientes:** cadastro rápido (nome + telefone, sem login) obrigatório em todo lançamento de serviço e em toda conversão de prospecção.

## Arquitetura

```
┌─────────────────────────────────────────────────────┐
│                  Next.js (Vercel)                     │
│  ┌───────────────┐ ┌───────────────┐ ┌─────────────┐ │
│  │ /[barbearia]    │ │ /(admin)      │ │ /(barbeiro)   │ │
│  │ página pública  │ │ painel admin  │ │painel barbeiro│ │
│  │ (sem login)     │ │               │ │               │ │
│  └───────────────┘ └───────────────┘ └─────────────┘ │
└───────────────────────┬───────────────────────────────┘
                         │ supabase-js (client) / server actions
┌───────────────────────▼───────────────────────────────┐
│                     Supabase                           │
│  Postgres (RLS por tenant) │ Auth │ Realtime            │
└─────────────────────────────────────────────────────────┘
```

**Stack:** Next.js (TypeScript, App Router) + Supabase (Postgres, Auth, Row Level Security, Realtime) + Tailwind CSS + shadcn/ui. Deploy: Vercel (app) + Supabase Cloud (dados).

**Por que essa combinação:** o isolamento multi-tenant é garantido no próprio banco via RLS — cada barbearia só enxerga suas próprias linhas, reforçado no nível do Postgres em vez de depender apenas de filtros manuais no código de cada query, o que é crítico para um SaaS onde vazar dado de uma barbearia pra outra é falha grave. O Realtime nativo resolve a concorrência de agendamento (evitar overbooking) sem locking complexo. Auth com papéis já pronta reduz código de autenticação escrito à mão.

- **Tenant (barbearia)** é a fronteira de isolamento: toda tabela relevante tem `barbearia_id`, reforçado por política de RLS.
- **Página pública** (`/[slug-da-barbearia]`) roda sem autenticação, com política de RLS que permite apenas `INSERT` de agendamento e `SELECT` de horários/serviços — nunca dados financeiros.
- **Painéis admin/barbeiro** exigem login (Supabase Auth); o papel (`admin` ou `barbeiro`) fica em `membros`, vinculado ao usuário e à barbearia, usado pelas políticas de RLS para diferenciar o que cada um vê.

## Modelo de dados

**Tenant e pessoas**
- `barbearias` — id, nome, slug (único, usado na URL pública), criado_em
- `membros` — id, barbearia_id, user_id (FK auth.users), papel (`admin`|`barbeiro`), nome, telefone, foto_url, ativo, plano_carreira_id (FK, nullable até o admin vincular um plano), meta_prospeccao_dia (int, nullable até o admin definir uma meta)
- `clientes` — id, barbearia_id, nome, telefone, criado_em (cadastro rápido, sem login; **telefone único por barbearia**, usado para reconhecer clientes recorrentes)

**Catálogo**
- `servicos` — id, barbearia_id, nome, duracao_minutos, preco, ativo
- `servico_barbeiros` (N:N) — servico_id, membro_id (quais barbeiros realizam qual serviço)
- `produtos` — id, barbearia_id, nome, categoria, preco_custo, preco_venda, quantidade_estoque, estoque_minimo, unidade_medida

**Comissão / plano de carreira (versão simplificada do MVP)**
- `planos_carreira` — id, barbearia_id, nome (ex: "Júnior", "Sênior"), percentual_produto, percentual_servico

**Agenda**
- `horarios_trabalho` — id, membro_id, dia_semana, hora_inicio, hora_fim (expediente padrão do barbeiro)
- `bloqueios_agenda` — id, membro_id, data, hora_inicio, hora_fim, motivo (almoço, ausência, encaixe bloqueado)
- `agendamentos` — id, barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status (`confirmado`|`cancelado`|`concluido`), origem (`publico`|`interno`)

  Disponibilidade é calculada, não armazenada: horário de trabalho − bloqueios − agendamentos existentes, na hora da consulta. Restrição única de banco em (membro_id, data, hora_inicio) previne overbooking por concorrência.

**Lançamentos diários (faturamento + comissão)**
- `atendimentos` — id, barbearia_id, membro_id, cliente_id, servico_id, preco (snapshot), comissao_percentual_aplicado (snapshot), comissao_valor (snapshot), data, agendamento_id (nullable)
- `vendas_produtos` — id, barbearia_id, membro_id, cliente_id, produto_id, quantidade, preco_unitario (snapshot), comissao_percentual_aplicado (snapshot), comissao_valor (snapshot), data

  `cliente_id` é obrigatório em ambas as tabelas (todo lançamento — corte, serviço extra ou produto — precisa estar vinculado a um cliente), pois alimenta a ficha do cliente e o ranking de itens mais usados. Inserir em `vendas_produtos` decrementa `produtos.quantidade_estoque` via trigger (bloqueado se quantidade insuficiente). Preço e percentual de comissão são congelados no momento do lançamento — mudanças posteriores no plano de carreira ou no preço de um serviço/produto não alteram lançamentos já feitos.

  **Regra de edição:** barbeiro só cria (`INSERT`) `atendimentos` e `vendas_produtos`; apenas `admin` pode editar ou apagar — via RLS.

**Prospecção**
- `prospeccoes` — id, barbearia_id, membro_id, data (dia do contato), canal (`whatsapp`|`indicacao`|`rua`|`redes_sociais`|`outro`, opcional), oferta_corte_gratis (bool), status (`contactado`|`convertido`), cliente_id (nullable, preenchido só na conversão), convertido_em (timestamp, nullable)

  Conversão pode acontecer dias após o contato — por isso `data` (dia do contato) e `convertido_em` (dia da conversão) são campos separados. Meta diária de contatos (`membros.meta_prospeccao_dia`) é a métrica de atividade, totalmente controlável pelo barbeiro; a taxa de conversão é uma métrica de resultado que amadurece com o tempo (contatos recentes ainda podem converter).

**Relatórios (todos calculados sob demanda, sem tabelas próprias)**
- Recorrência de cliente: contagem de `atendimentos` por `cliente_id`.
- Ranking de produtos/serviços mais usados por cliente: agrupamento de `atendimentos` + `vendas_produtos` por `cliente_id`, com contagem e soma de valor.
- Ociosidade: tempo disponível (`horarios_trabalho` − `bloqueios_agenda`) vs. tempo ocupado (soma de `duracao_minutos` dos serviços em `atendimentos`), por dia/semana/mês. Ganho por hora ocupada = faturamento de serviços do período ÷ horas ocupadas. Valor perdido estimado = horas ociosas × ganho médio por hora ocupada.

## Fluxos principais

**Lançamento diário (barbeiro)**
1. Toca "+ Corte/serviço" → seleciona serviço (só os habilitados pra ele) → digita nome/telefone do cliente (autocomplete reconhece cliente existente pelo telefone e mostra "Nº corte aqui") → confirma. Preço vem pré-preenchido do cadastro do serviço.
2. Toca "+ Venda de produto" → seleciona produto (com estoque atual visível) → quantidade → confirma.
3. Atendimento vinculado a um agendamento existente aparece como pendente ("marcar como concluído") para virar lançamento com 1 toque.

**Agendamento público (cliente, sem login)**
1. Acessa `/barbearia-slug` → escolhe serviço → escolhe barbeiro (ou "sem preferência") → vê só horários realmente livres → escolhe horário → informa nome/telefone (reconhece cliente recorrente pelo telefone, mostra "Este será seu Nº corte aqui") → confirma → tela de confirmação.
2. Realtime garante que, se dois clientes tentarem o mesmo horário ao mesmo tempo, o segundo vê o horário sumir da lista antes de conseguir confirmar.

**Agendamento interno (admin ou barbeiro)**
Mesma tela de escolha de horário, acessível dentro do painel logado, com opção extra de criar bloqueio (almoço, ausência) diretamente na agenda.

**Prospecção diária (barbeiro)**
1. Toca "+ Novo contato prospectado" → opcionalmente marca canal e/ou "ofereci corte grátis + consultoria" → salva. Conta para a meta diária de atividade.
2. Contato pendente aparece numa lista; quando vira cliente de fato, barbeiro toca "Converteu" → informa/reconhece o cliente (cadastro rápido) → status vira `convertido`, `convertido_em` registrado.
3. Dashboard mostra: meta de contatos do dia (barra de progresso), convertidos hoje (de qualquer contato, de qualquer data), taxa de conversão dos contatos deste mês (rotulada como "ainda pode subir"), taxa específica da campanha de corte grátis, e lista de pendentes com destaque para contatos parados há muitos dias sem seguimento.

## Telas (validadas visualmente durante o brainstorming)

- **Painel do barbeiro:** cards de faturamento do mês, comissão já ganha (calculada em tempo real), % de ocupação da agenda; detalhamento de ganhos por categoria (produto vs. serviço); barra dia/semana de tempo ocupado vs. ocioso, com ganho médio por hora ocupada e valor estimado perdido; atalhos de lançamento rápido.
- **Painel do admin:** visão geral (faturamento total, comissões acumuladas, alerta de estoque baixo); tabela comparativa de barbeiros (faturamento, comissão, ocupação); ações rápidas de cadastro (barbeiro, serviço, produto, plano de carreira).
- **Página pública de agendamento:** fluxo em 4 passos (serviço → barbeiro → horário → dados/confirmação), com reconhecimento automático de cliente recorrente pelo telefone.
- **Ficha do cliente:** histórico completo de cortes/produtos/serviços, com ranking "mais usados por ele" (quantidade + valor total por item). Barbeiro vê apenas o histórico do cliente com ele mesmo; admin vê o histórico completo com todos os barbeiros.
- **Prospecção do barbeiro:** barra de meta diária de contatos, lista de pendentes de conversão com aviso de contatos antigos sem seguimento, métricas de conversão do dia/mês e gráfico de evolução.

## Perfis de acesso

- **Admin/gestor:** acesso total dentro da própria barbearia — cadastro de planos de carreira, serviços, produtos, membros, edição de lançamentos, todos os relatórios e fichas de cliente.
- **Barbeiro:** acesso apenas aos próprios dados — próprios lançamentos (só criação, sem edição/exclusão), própria agenda, próprio painel de metas/ociosidade/prospecção, histórico de clientes restrito às próprias interações. Sem visão de dados financeiros de outros barbeiros.
- **Cliente (sem login):** acesso apenas à página pública de agendamento da própria barbearia.

## Tratamento de erros e casos extremos

- **Concorrência na agenda:** restrição única de banco (membro_id, data, hora_inicio); em conflito, o segundo cliente recebe aviso de horário indisponível e a lista atualiza via Realtime.
- **Estoque insuficiente:** venda de produto além do estoque disponível é bloqueada; ajuste de saldo é feito pelo admin.
- **Isolamento entre barbearias (RLS):** acesso fora do próprio tenant retorna vazio/negado, sem revelar existência de outros tenants.
- **Cliente duplicado:** telefone único por barbearia — telefone já cadastrado é reconhecido automaticamente em vez de criar duplicata.
- **Sem modo offline no MVP:** lançamento e agendamento exigem conexão; limitação conhecida, fora de escopo desta fase.

## Testes

Foco dos testes automatizados nos dois pontos de maior risco:
1. **Isolamento multi-tenant (RLS):** garantir que um usuário da barbearia A nunca lê/escreve dados da barbearia B, em cada tabela sensível.
2. **Concorrência de agendamento:** duas reservas simultâneas no mesmo horário — garantir que só uma vence.

Testes de unidade para cálculo de comissão (percentual congelado) e de disponibilidade de horários (expediente − bloqueios − agendamentos). Demais telas via verificação manual guiada no navegador.
