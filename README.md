# Torneio — conferência e prêmios

Sistema para a Maria Clara subir a planilha do torneio, ter cada partida conferida automaticamente no site oficial do jogo e ver quanto cada jogador recebe, com o motivo de cada valor.

- **Importação da planilha** (CSV exportado do Excel): corrige o que tem correção óbvia (duplicatas, nick com maiúsculas diferentes, ID sem `#`), rejeita só o que é realmente inválido e mostra um relatório linha a linha.
- **Conferência no site oficial em background**: as partidas entram numa fila, são consultadas com concorrência limitada, timeout e novas tentativas com backoff. O progresso aparece na tela em tempo real e cada divergência mostra "planilha diz X, site diz Y".
- **Classificação e prêmios**: classificação por vitórias com desempate (confronto direto → saldo de kills → menos jogadores utilizados → divisão igual). Prêmio por jogador por **minutos** ou por **kills**, com os dois valores lado a lado, busca por nick e, em cada jogador, uma explicação expansível com a conta escrita para responder. Todas as tabelas ordenam por coluna; jogadores e partidas são paginados.
- **Site oficial simulado**: um serviço HTTP separado que demora de 2 a 10 s, às vezes cai e às vezes não responde. Tem divergências plantadas de propósito em relação à planilha.

## Como rodar

Pré-requisito: **Node.js 22 ou superior** (testado no 24). Não precisa de Docker nem de banco instalado.

```bash
npm install
npm run dev
```

Isso sobe três processos:

| Serviço | Endereço | O que é |
|---------|----------|---------|
| Front-end | http://localhost:5173 | Abra este no navegador |
| Back-end | http://localhost:3333 | API + worker da conferência |
| Site oficial simulado | http://localhost:4000 | `GET /api/matches/:id` |

Depois, na tela inicial, envie o `torneio-setembro.csv` (prêmio padrão R$ 10.000, divisão 50/30/20). A conferência das 15 partidas leva cerca de 30 s.

O banco é um arquivo SQLite (`backend/torneio.db`), criado na primeira execução. Para começar do zero, apague esse arquivo com o back parado.

### Outros comandos

```bash
npm test        # testes das regras (importação, comparação, cliente do site, classificação e prêmios)
npm run build   # compila os três workspaces
```

### Configuração (opcional)

| Variável | Onde | Padrão | Para quê |
|----------|------|--------|----------|
| `PORT` | back / simulador | 3333 / 4000 | Porta |
| `DB_PATH` | back | `backend/torneio.db` | Arquivo do SQLite |
| `OFFICIAL_API_URL` | back | `http://localhost:4000` | Endereço do site oficial |
| `OFFICIAL_TIMEOUT_MS` | back | 15000 | Tempo máximo por consulta |
| `OFFICIAL_CONCURRENCY` | back | 3 | Consultas simultâneas |
| `OFFICIAL_MAX_ATTEMPTS` | back | 5 | Tentativas antes de desistir |
| `OFFICIAL_RETRY_BASE_MS` | back | 2000 | Base do backoff (2 s, 4 s, 8 s…) |
| `MOCK_MIN_DELAY_MS` / `MOCK_MAX_DELAY_MS` | simulador | 2000 / 10000 | Latência simulada |
| `MOCK_FAILURE_RATE` | simulador | 0.15 | Chance de responder 503 |
| `MOCK_HANG_RATE` | simulador | 0.05 | Chance de nunca responder |

Para ver o retry em ação, suba o simulador mais instável, por exemplo `MOCK_FAILURE_RATE=0.5`, ou derrube-o no meio da conferência e suba de novo.

## O que esperar com a planilha de setembro

| Situação | Onde aparece |
|----------|--------------|
| Linha duplicada (Pantera_X na #46065) e `xxsniperxx` unificado com `xXSniperXx` | Relatório da importação (avisos) |
| Substituição nos Corvos (#46903: Bia.gg 18 min + Tuca 19 min) | Relatório da importação (info) |
| #40923 sem resultado na planilha → o site informa Panteras | Conferência (divergência) |
| Kills, minutos e substituição que diferem do site (#44027, #48087, #49528) | Conferência → "O que não bateu" |
| #44799 não existe no site | Conferência → "Não conferidas"; prêmios **provisórios** |
| Corvos e Tubarões com 3 vitórias | Classificação: Corvos 2º pelo confronto direto |

## Stack e por quê

| Camada | Escolha | Motivo |
|--------|---------|--------|
| Back-end | Node + TypeScript + Express 5 | É o que domino, e assim uso uma linguagem só no back e no front. O Express é pequeno e conhecido. O Express 5 já trata erro em handler assíncrono. |
| Banco | SQLite (`better-sqlite3`) | Zero instalação: quem for avaliar roda `npm install` e pronto. É relacional de verdade (FK, transações, `CHECK`) e suficiente para um organizador com alguns torneios. A API síncrona deixa as transações da importação e da fila simples. |
| Front-end | React + Vite | Rápido de montar e com proxy de `/api` em dev (sem CORS). Só 2 telas, então sem roteador nem biblioteca de estado. |
| Testes | `node:test` + `tsx` | Nenhuma dependência nova; o foco está nas funções puras de regra de negócio. |
| Simulador | Express num workspace separado | O back só conhece uma URL, como seria com o site real. Timeout, conexão recusada e 503 são de verdade, não `if` dentro do código. |

Monorepo com npm workspaces: `backend/`, `frontend/`, `mock-official/`.

## Estrutura

```
backend/src/
  import/      csv.ts (encoding/delimitador) · validate.ts (regras da planilha, pura)
  official/    client.ts (HTTP + tradução + tipo de erro) · compare.ts (planilha x site, pura)
               worker.ts (fila, concorrência, backoff) · repository.ts
  results/     calculate.ts (classificação, desempate, centavos, pura) · service.ts
  tournaments/ routes.ts · repository.ts
frontend/src/
  pages/       HomePage (upload + lista) · TournamentPage (prêmios, conferência, relatório, partidas)
  components/  Results, Standings, PlayerPrizes, OfficialCheck, ImportReport, MatchList…
mock-official/
  data/matches.json   "verdade" do site, com divergências plantadas
  src/server.ts
```

### API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/health` | Status da API e do banco |
| GET | `/api/tournaments` | Lista de torneios |
| POST | `/api/tournaments` | Importa planilha (multipart: `file`, `name`, `prizeTotal`, `prizeSplit`) |
| GET | `/api/tournaments/:id` | Torneio com partidas, jogadores e relatório da importação |
| PATCH | `/api/tournaments/:id` | `{ "prizeBasis": "minutes" \| "kills" }` |
| GET | `/api/tournaments/:id/results` | Classificação e prêmio por jogador (pelos dois critérios) |
| GET | `/api/tournaments/:id/checks` | Andamento da conferência e divergências |
| POST | `/api/tournaments/:id/checks/retry` | Recoloca na fila as partidas que falharam ou não foram encontradas |

Erros respondem `{ "error": "mensagem" }` com `400`, `404`, `422` ou `500`.
