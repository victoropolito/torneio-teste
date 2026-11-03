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
`);
