# Busca de cliente por telefone parcial — Design Spec

## Contexto e objetivo

Hoje, `ClienteAutocomplete` (usado nas 3 telas internas de agendar horário, atender agora e lançamento avulso) só reconhece um cliente quando o telefone digitado bate **exato e completo** (`tel.length >= 10`) contra `reconhecer_cliente()`, que retorna no máximo um resultado e preenche o nome silenciosamente. A tela de prospecção tem seu próprio campo de telefone separado, sem nenhum reconhecimento.

Este spec substitui esse reconhecimento por uma busca com lista suspensa: a partir de 4 dígitos digitados, mostra os clientes cujo telefone contém aquela sequência em qualquer posição; clicar num deles preenche todos os campos já conhecidos daquele cliente (nome, telefone, nascimento, bairro, cidade).

Este é o segundo dos três pedidos relacionados a clientes desta rodada (o primeiro, bairro/cidade no cadastro, já foi implementado e mesclado; o terceiro — categoria de origem no agendamento + lista de clientes + campo de observação — é uma spec separada, ainda por vir).

## Escopo e uma decisão de segurança

Esta busca é **só para telas internas autenticadas** (admin/barbeiro): as 3 telas que já usam `ClienteAutocomplete`, mais o campo de telefone da tela de prospecção. **A página pública de agendamento (`PublicBookingFlow`) fica de fora** — ela é anônima (sem login), e uma busca que retorna múltiplos clientes por 4 dígitos permitiria qualquer visitante descobrir nome e telefone de outros clientes da barbearia digitando sequências ao acaso. `PublicBookingFlow` continua com o comportamento atual (`reconhecer_cliente`, que exige o telefone completo e retorna no máximo um resultado) — spec e código dessa tela não são tocados aqui.

## Backend — nova função `buscar_clientes_por_telefone`

Uma função nova, **separada** de `reconhecer_cliente` (que continua intocada, servindo só `PublicBookingFlow`):

```sql
create or replace function public.buscar_clientes_por_telefone(p_busca text)
returns table(
  id uuid, nome text, telefone text, total_cortes int,
  data_nascimento date, bairro text, cidade text
)
language sql security definer set search_path = public as $$
  select
    c.id, c.nome, c.telefone,
    (select count(*)::int from atendimentos a where a.cliente_id = c.id) as total_cortes,
    c.data_nascimento, c.bairro, c.cidade
  from clientes c
  where c.barbearia_id = auth_barbearia_id()
    and length(regexp_replace(p_busca, '\D', '', 'g')) >= 4
    and c.telefone like '%' || regexp_replace(p_busca, '\D', '', 'g') || '%'
  order by c.nome
  limit 10;
$$;

grant execute on function public.buscar_clientes_por_telefone(text) to authenticated;
```

Duas decisões de segurança deliberadas, diferentes do padrão que `reconhecer_cliente` já usa:
- **Sem parâmetro `p_barbearia_id`** — usa `auth_barbearia_id()` (a barbearia do usuário autenticado que está chamando) em vez de confiar num parâmetro vindo do cliente. Isso fecha a possibilidade de um barbeiro autenticado forjar o parâmetro pra ver clientes de uma barbearia diferente da sua. *(Nota: `reconhecer_cliente` já tem essa fragilidade hoje — recebe `p_barbearia_id` como parâmetro e não valida contra o chamador — mas ela é mitigada por só retornar 1 resultado exato, e por só ser alcançável por quem já sabe o telefone completo de alguém. Corrigir isso está fora do escopo deste spec, já que mudaria o comportamento da página pública, que precisa continuar acessível a `anon`.)*
- **`grant` só para `authenticated`, nunca `anon`** — mesmo que alguém tentasse chamar essa função diretamente pela API sem estar logado, seria rejeitado. Reforça em profundidade o que a UI já não expõe na tela pública.

Menos de 4 dígitos: retorna vazio (a checagem de tamanho está na própria query, não só na UI, como segunda camada de proteção).

## Frontend — `ClienteAutocomplete`

O campo Telefone continua sendo onde o barbeiro digita, mas passa a funcionar como caixa de busca:

- A partir de 4 dígitos (contando só dígitos, ignorando formatação), dispara `buscar_clientes_por_telefone` com debounce de 300ms — evita uma chamada a cada tecla digitada.
- Enquanto há resultados, uma lista suspensa aparece abaixo do campo Telefone: cada item mostra nome, telefone e "Xº corte aqui". Isso vale mesmo se o telefone digitado for o número completo e exato de um único cliente — sem caso especial, sempre lista e sempre exige um clique pra selecionar (comportamento único e previsível, ao custo de exigir um clique a mais do que o auto-reconhecimento de hoje quando o número completo é digitado).
- Clicar num item preenche nome, telefone, data de nascimento, bairro e cidade com o que aquele cliente já tem cadastrado (campos que ele nunca preencheu ficam em branco, editáveis normalmente) e fecha a lista.
- Sem resultados (nenhum cliente bate com os dígitos digitados): a lista simplesmente não aparece — mesmo comportamento de hoje para "cliente novo", o barbeiro segue digitando nome/telefone manualmente pra cadastrar um cliente que ainda não existe.
- Sem navegação por teclado (setas + enter) nesta primeira versão — só clique do mouse. Simplificação deliberada; o app não tem esse padrão em nenhum outro lugar hoje.

## Frontend — tela de prospecção

O campo de telefone da tela de prospecção (`painel/prospeccao/page.tsx`), hoje um `<input>` solto sem nenhum reconhecimento, ganha a mesma busca com lista suspensa — mesma função, mesmo comportamento de auto-preencher ao clicar. Como essa tela não usa `ClienteAutocomplete` (tem seu próprio formulário inline com Server Action), a lógica de busca/lista é implementada ali diretamente, não via import do componente compartilhado — mas replicando o mesmo comportamento.

## Testes

Sem lógica de cálculo nova, mas a função nova tem uma regra de segurança que merece cobertura pgTAP: um teste confirmando que um barbeiro autenticado da Barbearia A nunca vê clientes da Barbearia B via `buscar_clientes_por_telefone`, mesmo que os dígitos batam — a `barbearia_id` vem de `auth_barbearia_id()`, não de um parâmetro manipulável. Mais um teste confirmando que menos de 4 dígitos retorna vazio. Cobertura via `npx supabase test db` + `npm run build` + passada manual (buscar por 4 dígitos do meio do telefone, confirmar lista aparece; clicar num resultado, confirmar todos os campos preenchidos; buscar dígitos que não batem com ninguém, confirmar lista não aparece).

## Fora de escopo (explicitamente adiado)

- Busca por nome (só por telefone, como pedido).
- Navegação por teclado na lista suspensa.
- Página de agendamento público — continua com `reconhecer_cliente` inalterado.
- Corrigir a falta de validação de `barbearia_id` em `reconhecer_cliente` — pré-existente, não introduzido por este spec, precisa de decisão própria sobre como afeta a página pública.
