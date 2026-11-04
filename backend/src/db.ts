import Database from 'better-sqlite3';
import path from 'node:path';

const dbPath = process.env.DB_PATH ?? path.resolve('torneio.db');

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS tournaments (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT    NOT NULL,
    source_filename   TEXT    NOT NULL,
    prize_total_cents INTEGER NOT NULL,
    prize_split       TEXT    NOT NULL, -- JSON: percentuais por colocação, ex.: [50,30,20]
    prize_basis       TEXT    NOT NULL DEFAULT 'minutes' CHECK (prize_basis IN ('minutes', 'kills')),
    created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS matches (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    external_id   TEXT    NOT NULL,
    round         INTEGER NOT NULL,
    played_on     TEXT    NOT NULL, -- ISO (yyyy-mm-dd)
    team_a        TEXT    NOT NULL,
    team_b        TEXT    NOT NULL,
    winner        TEXT,             -- NULL = sem resultado na planilha
    UNIQUE (tournament_id, external_id)
  );

  CREATE TABLE IF NOT EXISTS match_players (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    team     TEXT    NOT NULL,
    nick     TEXT    NOT NULL,
    minutes  INTEGER NOT NULL,
    kills    INTEGER NOT NULL,
    UNIQUE (match_id, nick)
  );

  CREATE TABLE IF NOT EXISTS import_issues (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id     INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    severity          TEXT    NOT NULL CHECK (severity IN ('error', 'warning', 'info')),
    code              TEXT    NOT NULL,
    message           TEXT    NOT NULL,
    line              INTEGER,          -- linha na planilha (cabeçalho = 1)
    match_external_id TEXT
  );

  -- Conferência de cada partida no site oficial (fila persistente).
  CREATE TABLE IF NOT EXISTS match_checks (
    match_id        INTEGER PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
    status          TEXT    NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'ok', 'divergent', 'not_found', 'failed')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL DEFAULT 0, -- epoch em ms; só vale para 'pending'
    last_error      TEXT,
    checked_at      TEXT,                       -- última resposta definitiva do site
    official_data   TEXT                        -- JSON (OfficialMatch) quando encontrada
  );

  CREATE TABLE IF NOT EXISTS check_discrepancies (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id       INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    code           TEXT    NOT NULL,
    message        TEXT    NOT NULL,
    nick           TEXT,
    sheet_value    TEXT,
    official_value TEXT
  );

  -- Torneios importados antes da Entrega 3 também entram na fila.
  INSERT OR IGNORE INTO match_checks (match_id) SELECT id FROM matches;
`);

// Migração: bancos criados antes da Entrega 4 não têm prize_basis.
const tournamentColumns = db.prepare(`PRAGMA table_info(tournaments)`).all() as { name: string }[];
if (!tournamentColumns.some((column) => column.name === 'prize_basis')) {
  db.exec(`ALTER TABLE tournaments ADD COLUMN prize_basis TEXT NOT NULL DEFAULT 'minutes'
           CHECK (prize_basis IN ('minutes', 'kills'))`);
}
