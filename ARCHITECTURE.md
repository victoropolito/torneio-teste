## Visão geral

```
┌──────────────────────┐   /api/*    ┌──────────────────────┐        ┌────────────┐
│ Frontend             │  (proxy do  │ Backend              │        │ SQLite     │
│ React + Vite (:5173) │ ──────────▶ │ Express + TS (:3333) │ ─────▶ │ torneio.db │
└──────────────────────┘    Vite)    │  └ worker conferência│        └────────────┘
                                     └──────────┬───────────┘
                                                │ GET /api/matches/:id
                                                ▼  (2–10 s, 503, sem resposta)
                                     ┌──────────────────────┐
                                     │ Site oficial simulado│
                                     │ mock-official (:4000)│
                                     └──────────────────────┘
```

- Em desenvolvimento, o Vite faz proxy de `/api` para o back-end, então o front sempre chama caminhos relativos e o back não precisa de CORS.
- O site oficial simulado é um processo separado: o back só o conhece pela URL (`OFFICIAL_API_URL`), como seria com o site real.
- O banco é um arquivo SQLite local (`backend/torneio.db`), criado automaticamente na primeira execução (schema aplicado com `CREATE TABLE IF NOT EXISTS`). Caminho configurável via `DB_PATH`.

## Estrutura de pastas

```
torneio-teste/
├── package.json              # npm workspaces; scripts dev/build da raiz
├── PROGRESS.md               # acompanhamento das entregas
├── ARCHITECTURE.md           # este documento
├── backend/
│   └── src/
│       ├── server.ts         # ponto de entrada (PORT, padrão 3333)
│       ├── app.ts            # Express: middlewares, rotas, tratamento de erros
│       ├── db.ts             # conexão SQLite + schema
│       ├── errors.ts         # AppError (erro esperado com status HTTP)
│       ├── import/
│       │   ├── csv.ts        # bytes → matriz de células (encoding, delimitador)
│       │   └── validate.ts   # matriz → partidas normalizadas + problemas (função pura)
│       ├── results/
│       │   ├── calculate.ts  # classificação, desempate, prêmios em centavos (função pura)
│       │   └── service.ts    # dados efetivos (site > planilha) + flag provisório
│       ├── official/
│       │   ├── client.ts     # HTTP do site oficial: timeout, tradução, erro temporário x definitivo
│       │   ├── compare.ts    # planilha x site → divergências (função pura)
│       │   ├── worker.ts     # fila em background: concorrência, retry com backoff
│       │   └── repository.ts # SQL da fila e das divergências
│       └── tournaments/
│           ├── routes.ts     # endpoints /api/tournaments
│           └── repository.ts # acesso ao banco (SQL)
├── mock-official/
│   ├── data/matches.json     # "verdade" do site (com divergências plantadas)
│   └── src/server.ts         # GET /api/matches/:id com latência e falhas
└── frontend/
    ├── vite.config.ts        # plugin React + proxy /api
    └── src/
        ├── main.tsx          # bootstrap do React
        ├── App.tsx           # layout + roteamento por hash
        ├── useHashRoute.ts   # "#/torneios/:id" → estado
        ├── useChecks.ts      # polling da conferência (2 s enquanto há fila)
        ├── api.ts            # cliente HTTP (fetch + tratamento de erro)
        ├── types.ts          # tipos das respostas da API
        ├── format.ts         # moeda, datas
        ├── styles.css
        ├── pages/
        │   ├── HomePage.tsx        # upload + lista de torneios
        │   └── TournamentPage.tsx  # resumo, relatório e partidas
        └── components/
            ├── UploadForm.tsx      # arquivo, nome, prêmio e divisão
            ├── TournamentList.tsx
            ├── IssueBadges.tsx     # contadores por severidade
            ├── ImportReport.tsx    # tabela de problemas com filtro
            ├── Results.tsx         # prêmios: faixa provisório/final, critério minutos/kills
            ├── Standings.tsx       # classificação com critério de desempate
            ├── PlayerPrizes.tsx    # prêmio por jogador, busca por nick, "por quê?"
            ├── Sortable.tsx        # useSort + SortTh: ordenação por coluna em todas as tabelas
            ├── ExpandButton.tsx    # seta de expandir linha (detalhes)
            ├── Pagination.tsx      # usePagination + controles (jogadores 20, partidas 15)
            ├── OfficialCheck.tsx   # progresso, divergências, não conferidas, reconferir
            └── MatchList.tsx       # partidas (status no site) com jogadores expansíveis
```

## Back-end

Organizado por funcionalidade (`import/`, `tournaments/`), com três camadas:

| Camada | Onde | Responsabilidade |
|--------|------|------------------|
| HTTP | `*/routes.ts`, `app.ts` | Ler/validar a requisição, chamar o domínio, responder |
| Domínio | `import/validate.ts`, `official/compare.ts`, `results/calculate.ts` | Regras de negócio puras (sem I/O) — fácil de testar |
| Integração | `official/client.ts`, `official/worker.ts` | Site externo e processamento em background |
| Dados | `*/repository.ts`, `db.ts` | SQL e transações |

Erros esperados são lançados como `AppError(mensagem, status)` e convertidos em `{ error }` pelo middleware de erro em `app.ts`. O Express 5 captura exceções lançadas nos handlers.

### Fluxo de importação

```
POST /api/tournaments (multipart)
  │
  ├─ routes.ts       valida prêmio (centavos) e divisão (soma 100%)
  ├─ csv.ts          decodifica (UTF-8 → fallback Windows-1252), detecta ";" ou ","
  ├─ validate.ts     1. mapeia cabeçalho (sem acento/caixa)
  │                  2. converte cada linha (rejeita inválidas → issue "error")
  │                  3. unifica nicks por caixa
  │                  4. agrupa por ID da partida: remove duplicatas, checa
  │                     tamanho dos times, resolve vencedor
  │                  5. checagens do torneio (todos contra todos etc.)
  └─ repository.ts   grava tudo numa transação (+ 1 linha "pending" por partida em match_checks)
```

### Conferência no site oficial

```
worker.ts (laço com setTimeout, dentro do processo do back)
  │
  ├─ claimJobs        pega até N partidas "pending" com next_attempt_at vencido → "running"
  ├─ client.ts        GET {OFFICIAL_API_URL}/api/matches/:id  (timeout 15 s)
  │    ├─ 200         → compare.ts → "ok" ou "divergent" (+ divergências, + official_data)
  │    ├─ 404         → "not_found"   (não repete sozinho)
  │    ├─ temporária  → "pending" com backoff 2/4/8/16 s; na 5ª falha → "failed"
  │    └─ definitiva  → "failed"
  └─ ao terminar uma, acorda de novo; ocioso, olha a fila a cada 5 s
```

- Ciclo de vida: `pending → running → ok | divergent | not_found | failed`, e `running → pending` em falha temporária ou se o back reiniciar.
- O estado inteiro está no SQLite: reiniciar o back retoma de onde parou (`running` órfão volta para `pending`).
- "Conferir de novo" (`POST …/checks/retry`) volta `failed` e `not_found` para `pending` com tentativas zeradas.
- Regra para a Entrega 4: dado efetivo de uma partida = `official_data` se conferida, senão a planilha (e o prêmio fica provisório).

### Cálculo dos prêmios

```
GET /api/tournaments/:id/results
  │
  ├─ service.ts     por partida: official_data (se ok/divergent) ou planilha
  │                 partidas não conferidas / sem vencedor → pendingMatches → provisional
  └─ calculate.ts   1. estatísticas por time (V, D, kills feitas/sofridas, jogadores usados)
                    2. agrupa por vitórias; grupos empatados → resolveTie (recursivo):
                       confronto direto → saldo de kills → menos jogadores → empate (divide)
                    3. % por posição (posições empatadas: soma dos % / nº de times)
                    4. splitCents: times, depois jogadores (minutos e kills do torneio)
```

A resposta traz o prêmio pelos dois critérios (`prizeByMinutes`, `prizeByKills`) e `prizeCents` no critério escolhido no torneio (`prizeBasis`).

### Site oficial simulado (`mock-official/`)

| Variável | Padrão | Efeito |
|----------|--------|--------|
| `PORT` | 4000 | Porta |
| `MOCK_MIN_DELAY_MS` / `MOCK_MAX_DELAY_MS` | 2000 / 10000 | Latência de cada consulta |
| `MOCK_FAILURE_RATE` | 0.15 | Chance de responder 503 |
| `MOCK_HANG_RATE` | 0.05 | Chance de nunca responder |

Formato da resposta (diferente do domínio, de propósito):
`{ matchId, playedAt, teams: [{ name, result: "win"|"loss", players: [{ nickname, minutesPlayed, kills }] }] }`.

Variáveis do back para a integração: `OFFICIAL_API_URL` (`http://localhost:4000`), `OFFICIAL_TIMEOUT_MS` (15000), `OFFICIAL_CONCURRENCY` (3), `OFFICIAL_MAX_ATTEMPTS` (5), `OFFICIAL_RETRY_BASE_MS` (2000).

### Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/health` | Status da API e do banco |
| GET | `/api/tournaments` | Lista de torneios com contagem de partidas e problemas |
| GET | `/api/tournaments/:id` | Torneio com partidas, jogadores e problemas da importação |
| POST | `/api/tournaments` | Importa planilha. Multipart: `file`, `name` (opcional), `prizeTotal` (reais), `prizeSplit` (ex.: `50,30,20`) |
| PATCH | `/api/tournaments/:id` | `{ "prizeBasis": "minutes" \| "kills" }`: critério de divisão dentro do time |
| GET | `/api/tournaments/:id/results` | `provisional`, `pendingMatches`, `sources`, `standings` (posição, V/D, saldo, jogadores, desempate, prêmio) e `players` (minutos, kills, totais do time, prêmio pelos dois critérios) |
| GET | `/api/tournaments/:id/checks` | Andamento da conferência: `counts` por status, `total`, `finished`, e por partida status, tentativas, último erro e divergências |
| POST | `/api/tournaments/:id/checks/retry` | Recoloca `failed`/`not_found` na fila; devolve `requeued` + o mesmo corpo do GET |

Erros: `400` entrada inválida · `404` não encontrado · `422` planilha sem nenhuma linha válida · `500` inesperado. Corpo: `{ "error": "mensagem" }`.

### Modelo de dados

```
tournaments 1──N matches 1──N match_players
     │              ├──1 match_checks
     │              └──N check_discrepancies
     └──────N import_issues
```

| Tabela | Campos principais |
|--------|-------------------|
| `tournaments` | `name`, `source_filename`, `prize_total_cents`, `prize_split` (JSON), `prize_basis` (`minutes`/`kills`), `created_at` |
| `matches` | `external_id` (ex.: `#45659`, único por torneio), `round`, `played_on` (ISO), `team_a`, `team_b`, `winner` (NULL = sem resultado) |
| `match_players` | `team`, `nick` (já normalizado), `minutes`, `kills` — único por (partida, nick) |
| `import_issues` | `severity` (`error`/`warning`/`info`), `code`, `message`, `line`, `match_external_id` |
| `match_checks` | `status`, `attempts`, `next_attempt_at` (epoch ms), `last_error`, `checked_at`, `official_data` (JSON) |
| `check_discrepancies` | `code` (`winner`, `kills`, `minutes`, `player_missing_on_sheet`…), `message`, `nick`, `sheet_value`, `official_value` |

Exclusões em cascata a partir de `tournaments`. Valores monetários sempre em centavos.

## Front-end

SPA React com duas telas, roteadas por hash:

| Rota | Tela |
|------|------|
| `#` | `HomePage` — formulário de upload + lista de torneios |
| `#/torneios/:id` | `TournamentPage` — resumo, prêmios (classificação + jogadores), conferência no site oficial, relatório da importação, partidas |

Estado local com `useState`/`useEffect` (sem biblioteca de estado). Chamadas HTTP centralizadas em `api.ts`.

## Execução

```
npm install
npm run dev     # back em :3333, front em :5173, site oficial simulado em :4000
npm run build   # compila simulador, back (tsc) e front (vite build)
npm test        # testes do back (node:test + tsx), arquivos *.test.ts ao lado do código
```
