# Decisões

Este documento registra o que decidi, as alternativas que considerei e, principalmente, o que deixei de fora e por quê.

## Como li o problema

A dor da Maria Clara não é calcular, porque o Excel já calcula. A dor é **confiar no resultado** e **explicar o resultado**:

1. Uma tarde perdida conferindo partida por partida num site lento e instável.
2. O Discord cheio de "por que eu recebi só isso?".

Por isso priorizei, nesta ordem:

1. **Conferência automática robusta**: não pode travar, perder trabalho ou esconder falha.
2. **Transparência**: toda correção, divergência ou pendência aparece com o motivo, e cada prêmio tem a conta escrita.
3. **Cálculo correto e testado**: centavos que fecham, desempates determinísticos.
4. Interface simples: duas telas, sem nada que ela não vá usar.

Também levei a sério que "o próximo torneio vai ter mais times": nada está fixo em 6 times; número de times, valor e divisão do prêmio vêm da planilha e do formulário.

---

## Stack

**Escolhido:** Node + TypeScript (Express 5), React + Vite, SQLite (`better-sqlite3`), npm workspaces.

| Alternativa | Por que não |
|-------------|-------------|
| PostgreSQL + Docker | Mais "produção", mas obriga quem avalia a ter Docker. Para um organizador com alguns torneios, SQLite resolve, e as mesmas tabelas migram para Postgres sem mudar o modelo. |
| ORM (Prisma, Drizzle) | Esquema pequeno; SQL direto fica legível e evita uma etapa de geração/migração. Em um projeto que crescesse, eu adotaria. |
| Next.js / full-stack num só | Misturaria o worker de background com o ciclo de vida do framework. Express + SPA deixa a separação clara. |
| Fila com Redis/BullMQ | Ver "Conferência". |
| Pacote de tipos compartilhado | Os tipos do front duplicam os do back. Para ~10 interfaces é mais simples que configurar um pacote; foi uma troca consciente. |

---

## Importação da planilha

**Princípio:** corrigir o que tem correção óbvia e avisar; rejeitar só o que é realmente inválido, e nunca em silêncio.

| Decisão | Alternativa descartada |
|---------|------------------------|
| Encoding: tenta UTF-8; se inválido, Windows-1252, que é o que o Excel pt-BR exporta. Delimitador `;` ou `,` detectado pelo cabeçalho. | Exigir UTF-8: ela teria que aprender a exportar de outro jeito. |
| Cabeçalho comparado sem acento, caixa e `?`. Coluna obrigatória ausente rejeita o arquivo inteiro. | Mapeamento manual de colunas na tela: complexidade sem necessidade hoje. |
| Três severidades: **erro** (linha descartada), **aviso** (corrigido automaticamente ou pendente), **info** (interpretação, ex.: substituição). | Só "válido/inválido": esconderia as correções automáticas. |
| Nick igual exceto por maiúsculas = mesmo jogador; grafia canônica = a mais frequente. | Tratar como jogadores diferentes: `xxsniperxx` receberia separado de `xXSniperXx`. |
| Duplicata idêntica é removida (aviso). Mesma pessoa duas vezes na partida com dados diferentes: mantém a primeira e descarta a segunda (erro). | Somar as linhas: dobraria minutos de quem foi colado duas vezes. |
| Vencedor só quando um time é todo "sim" e o outro todo "não". Qualquer outra combinação = sem resultado, resolvido pelo site. | Maioria de "sim": adivinharia o resultado. |
| Time com mais de 5 jogadores = substituição (info); menos de 5 = aviso. | Rejeitar: substituição é legítima e acontece (Corvos na #46903). |
| Checagens do torneio: confronto repetido, time duas vezes na rodada, jogador em mais de um time, todos-contra-todos incompleto. São avisos, não erros. | Bloquear a importação: ela precisa ver o resto mesmo com um problema. |
| Importação transacional; se nenhuma linha for válida, nada é gravado (422). | Gravar parcial e marcar: deixaria torneios "meio importados". |
| Cada upload cria um torneio novo (histórico preservado). | Sobrescrever: perderia o histórico e a rastreabilidade. |

---

## Site oficial simulado

- **Serviço HTTP separado** (`mock-official/`), e não uma função dentro do back. Assim timeout, conexão recusada e 503 são reais, e trocar pelo site verdadeiro é trocar uma URL.
- **Formato diferente do domínio** (inglês, times aninhados, `result: "win"`). O back tem uma camada de tradução (`official/client.ts`), como teria com uma API de terceiros.
- **Comportamento**: latência uniforme de 2 a 10 s, 15% de 503, 5% sem resposta. Tudo configurável por variável de ambiente para testar cenários extremos.
- **Dados**: fixture JSON versionada, gerada da planilha, com **divergências plantadas**:

  | Partida | Divergência |
  |---------|-------------|
  | #40923 | Planilha vazia; site tem o resultado (Panteras venceu) |
  | #44027 | Kills de Dudu.pro: 22 na planilha, 12 no site |
  | #48087 | Minutos de Pipoca: 45 na planilha, 39 no site |
  | #49528 | Substituição não anotada (Naja saiu, Sucuri entrou) |
  | #44799 | ID inexistente no site |

  O vencedor da #40923 foi escolhido como Panteras para preservar o empate Corvos x Tubarões no 2º lugar. Com Falcões haveria empate triplo com confronto direto circular, um cenário que está coberto pelos testes, mas que esconderia o caso "normal" na demonstração.

- **Descartado:** divergências aleatórias a cada consulta. Seria mais "realista", mas o resultado mudaria a cada execução, o que impede demonstrar e testar.

---

## Conferência em background

| Decisão | Por quê | Alternativa descartada |
|---------|---------|------------------------|
| Fila persistida no SQLite (`match_checks`), consumida por um worker no próprio processo do back. | Um processo só, sem infraestrutura extra; reiniciar o back não perde nada. | Redis + BullMQ: mais robusto com vários servidores, mas é infraestrutura para um problema que não temos. Worker em processo separado: idem. |
| Concorrência 3. | ~3x mais rápido que sequencial (15 partidas em ~30 s em vez de ~90 s) sem martelar um site que já é instável. Configurável. | Tudo em paralelo: em torneio maior viraria rajada no site. Sequencial: é o que ela faz hoje, só que sem ela. |
| Timeout de 15 s por consulta. | O site leva até 10 s; acima disso, considerei "não respondeu". | Sem timeout: uma consulta pendurada ocuparia uma vaga para sempre. |
| Erro **temporário** (timeout, conexão recusada, 5xx, 429, JSON cortado) → retry com backoff 2/4/8/16 s + jitter, até 5 tentativas. Erro **definitivo** (outro 4xx, formato inesperado) → falha direto. 404 → "não encontrada", sem retry. | Repetir só o que pode passar sozinho. O jitter evita que as falhas se sincronizem. | Retry infinito: esconderia um problema real. Repetir 404: o ID não vai aparecer sozinho em segundos. |
| Na subida, o que estava "consultando" volta para a fila. | Recupera de queda no meio da consulta. | — |
| Botão "Conferir de novo" recoloca `failed` e `not_found`. | O site pode ter voltado, ou o ID pode ter sido corrigido no jogo. | Retry automático periódico eterno. |
| Front acompanha por polling a cada 2 s, só enquanto houver fila. | Simples e suficiente; para quando termina. | SSE/WebSocket: atualização instantânea, mas mais código e conexão aberta para ganho pequeno. |

---

## Planilha x site: quem vale

**Vale o site oficial**: é o registro do próprio jogo, e a planilha é digitada à mão. Mas nada é trocado em silêncio: cada divergência é listada com os dois valores ("O que não bateu").

- Comparados: data, times, vencedor e, por jogador (nick sem diferenciar caixa), time, minutos, kills, jogador só na planilha e jogador só no site.
- Planilha "não preenchida" (sem vencedor e todos com 0 minutos) vira **uma** divergência, em vez de 20 de minutos/kills que só poluiriam a tela.
- Partida não conferida (pendente, falhou, não encontrada) usa a planilha, e os prêmios ficam **provisórios**.
- **Descartado:** ela escolher, divergência por divergência, qual lado vale. É o mais flexível, mas transforma a ferramenta em mais trabalho manual, o oposto do objetivo. Pode ser um próximo passo (ver "O que não fiz").

---

## Classificação e desempate

**Classificação por vitórias** (regra dela). O desempate não estava especificado; segue esta ordem:

1. **Confronto direto**: vitórias nos jogos entre os times empatados.
2. **Saldo de kills** (kills feitas − kills sofridas no torneio).
3. **Menos jogadores utilizados**: o time que precisou de menos substitutos fica à frente. Definição: nicks distintos com minutos > 0.
4. **Empate total**: os times dividem igualmente a soma dos prêmios das posições que ocupam. Ex.: dois empatados em 2º com 30/20 recebem 25% cada.

Detalhes:
- **Recursivo:** quando um critério separa parte de um grupo empatado, quem continua empatado recomeça do confronto direto, considerando só os jogos entre eles. Assim um triplo empate vira um duplo resolvido pelo jogo entre os dois.
- Partida sem vencedor (planilha vazia e não conferida) não conta vitória nem derrota.
- **Descartado:** saldo de kills antes do confronto direto. Saldo favorece quem massacra times fracos, e o confronto direto responde melhor "quem é melhor entre esses dois".
- **Descartado:** critério de "sorteio" ou ordem alfabética para o empate total. Ninguém aceitaria perder prêmio pela letra do nome.

No torneio de setembro: Lobos 1º (5 V); Corvos 2º e Tubarões 3º (3 V cada; Corvos venceu o confronto direto na #46903).

---

## Prêmios

### Por minutos ou por kills?

A Maria Clara propôs trocar de minutos para kills ("quem joga bem merece mais"). **Questiono a mudança**, mas não decido por ela:

- Kills medem um papel, não o desempenho do time. Quem joga de suporte ou de tank segura o time e faz poucas kills; um jogador com 0 kills que jogou a partida inteira receberia **R$ 0**.
- Incentiva o jogo individual ("roubar kill") num jogo de equipe.
- Minutos medem participação, que é o que torna justo o prêmio coletivo do time.

**Decisão:** o critério é configurável por torneio (padrão: minutos). A tabela mostra **os dois valores lado a lado** para cada jogador, e o seletor recalcula na hora. Assim ela decide olhando o impacto real em vez de discutir em abstrato, e a tela avisa o efeito colateral quando escolhe kills.

**Descartado:** um critério híbrido (ex.: 70% minutos + 30% kills). Talvez seja a resposta certa, mas é uma regra nova que ela não pediu; fica como sugestão.

### Cálculo

- Prêmio do time = % da colocação × total. Prêmio do jogador = prêmio do time × (minutos do jogador ÷ minutos do time), somando o **torneio inteiro**.
  - **Descartado:** dividir partida a partida. O prêmio é do time pelo torneio, e dividir por partida exigiria atribuir valor a cada partida, uma regra que não existe.
- Substitutos entram com os minutos que jogaram (Tuca, 19 min → R$ 65,90).
- **Dinheiro sempre em centavos inteiros.** Arredondamento pelo método do **maior resto**: a soma é sempre exatamente o total, e o centavo que sobra vai para quem tem o maior resto (empate: ordem alfabética, determinístico).
  - **Descartado:** arredondar cada valor isoladamente, que faz a soma dar R$ 9.999,99 ou R$ 10.000,01.
- Time com peso total zero (ex.: nenhuma kill) → divisão igual dentro do time.

### Provisório

Enquanto houver partida não conferida ou sem vencedor, **todos** os valores são marcados como provisórios, com a lista de partidas pendentes.

- **Descartado:** marcar só os times da partida pendente. Parece mais preciso, mas engana: uma partida em aberto pode mudar a classificação inteira e, com ela, o prêmio de todo mundo.

### Transparência

Cada jogador tem um "por quê?" com a conta escrita, por exemplo: "Corvos terminou em 2º lugar e ficou com R$ 3.000,00 (30%). O valor do time é dividido pelos minutos jogados: Bia.gg jogou 154 dos 865 minutos do time (17,8%), em 5 partidas, e recebe R$ 534,10." Ela pode colar esse texto no Discord.

---

## Interface

- Duas telas: lista/upload e torneio. A tela do torneio segue a ordem do que ela quer saber: **prêmios** → conferência → relatório da importação → partidas.
- Busca por nick ou time sem diferenciar acento nem caixa ("tche" encontra "Tchê").
- Roteamento por hash (`#/torneios/:id`) em vez de react-router, porque são só duas telas.
- Sem biblioteca de componentes nem de estado: CSS próprio e `useState`/`useEffect`.

---

## Testes

`npm test` roda 49 testes com `node:test` (sem dependências novas), focados nas regras de negócio:

- **Classificação e prêmios** (`results/calculate.test.ts`): cada critério de desempate isolado, recursão, empate total com divisão, centavos que fecham, minutos x kills, substitutos, caixa de nick.
- **Comparação planilha x site** (`official/compare.test.ts`): cada tipo de divergência.
- **Importação** (`import/validate.test.ts`): encoding, cabeçalho, duplicatas, unificação de nick, substituição, sem resultado, linhas rejeitadas.
- **Cliente do site** (`official/client.test.ts`): servidor HTTP local real; 200, 404, 503, timeout, JSON cortado e formato inesperado classificados corretamente.

A escolha foi testar as **funções puras**, onde mora a regra de dinheiro. O worker, as rotas e o front foram verificados manualmente com o simulador acelerado: 30% de 503 e 10% sem resposta; site derrubado e religado; back derrubado com consultas em andamento (que voltaram para a fila ao reiniciar); "Conferir de novo" após desistência.

---

## O que decidi não fazer (por falta de tempo) e por quê

Em ordem de quanto eu faria a seguir:

1. **Resolver pendências manualmente.** Hoje uma partida "não encontrada" (#44799) fica provisória até o site achá-la. O próximo passo seria ela poder corrigir o ID ou "aceitar a planilha" para aquela partida, com registro de quem decidiu. Ficou de fora porque exige edição de dados e trilha de auditoria; preferi primeiro deixar a pendência visível.
2. **Exportar os pagamentos** (CSV com nick e valor, ou integração Pix). Resolveria o "Pix um por um". Precisa de um cadastro de chave Pix por jogador, que não existe na planilha.
3. **Escolher qual lado vale por divergência.** Hoje vale sempre o site; alguém pode ter certeza de que o site errou.
4. **Testes automatizados do worker, das rotas e do front.** As regras de dinheiro estão cobertas; a orquestração foi testada à mão. Com mais tempo: testes de integração do worker com o simulador acelerado e testes de componente da tela de prêmios.
5. **Identidade de jogador entre torneios.** Hoje jogador = nick dentro do torneio. Um cadastro (nick → pessoa, chave Pix) permitiria histórico e pagamento, mas é outro produto.
6. **Autenticação.** É uma ferramenta de uma pessoa só, rodando localmente; login seria custo sem benefício agora. Antes de publicar na internet, seria obrigatório.
7. **Apagar ou reimportar torneio.** Cada upload cria um torneio novo; não há exclusão nem "nova versão da mesma planilha". Uma reimportação poderia reaproveitar as conferências já feitas.
8. **SSE em vez de polling, e fila externa (Redis).** Só se justificam com muitos usuários ou vários servidores.
9. **Deploy, Docker, CI.** Rodar localmente com `npm install` era mais importante para a avaliação.

## Limitações conhecidas

- O worker roda dentro do processo do back: com duas instâncias do back, a mesma partida poderia ser consultada duas vezes. Isso é aceitável para uso local; resolveria com `UPDATE … RETURNING` atômico ou uma fila externa.
- O polling consulta o back a cada 2 s enquanto há fila, o que não é problema com um usuário.
- Os testes são compilados junto com o back no `npm run build` (inofensivo; poderiam ser excluídos do `tsconfig` de build).
- A tela não foi pensada para celular.
