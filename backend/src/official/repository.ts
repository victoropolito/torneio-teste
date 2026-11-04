import { db } from '../db.js';
import type { ParsedMatch, ParsedPlayer } from '../import/validate.js';
import type { OfficialMatch } from './client.js';
import type { Discrepancy, DiscrepancyCode } from './compare.js';

export type CheckStatus = 'pending' | 'running' | 'ok' | 'divergent' | 'not_found' | 'failed';

export const CHECK_STATUSES: CheckStatus[] = ['pending', 'running', 'ok', 'divergent', 'not_found', 'failed'];

export interface MatchCheck {
  externalId: string;
  status: CheckStatus;
  attempts: number;
  lastError: string | null;
  checkedAt: string | null;
  nextAttemptAt: number | null;
  discrepancies: Discrepancy[];
}

export interface TournamentChecks {
  counts: Record<CheckStatus, number>;
  total: number;
  /** Nada mais na fila (pendente ou consultando). */
  finished: boolean;
  matches: MatchCheck[];
}

export interface CheckJob {
  matchId: number;
  attempts: number;
}

// ---------------------------------------------------------------------------
// Fila (usada pelo worker)
// ---------------------------------------------------------------------------

/** Volta para a fila o que estava "consultando" quando o processo caiu. */
export function requeueInterrupted(): number {
  return db.prepare(`UPDATE match_checks SET status = 'pending' WHERE status = 'running'`).run().changes;
}

/** Pega até `limit` partidas prontas para consulta e marca como "consultando". */
export const claimJobs = db.transaction((limit: number, now: number): CheckJob[] => {
  const jobs = db
    .prepare(
      `SELECT match_id AS matchId, attempts FROM match_checks
       WHERE status = 'pending' AND next_attempt_at <= ?
       ORDER BY next_attempt_at, match_id LIMIT ?`,
    )
    .all(now, limit) as CheckJob[];
  const markRunning = db.prepare(`UPDATE match_checks SET status = 'running' WHERE match_id = ?`);
  for (const job of jobs) markRunning.run(job.matchId);
  return jobs;
});

/** Quando a próxima partida pendente fica pronta (para o worker saber quanto dormir). */
export function nextPendingAt(): number | null {
  const row = db.prepare(`SELECT MIN(next_attempt_at) AS at FROM match_checks WHERE status = 'pending'`).get() as {
    at: number | null;
  };
  return row.at;
}

export function getSheetMatch(matchId: number): ParsedMatch | null {
  const match = db
    .prepare(
      `SELECT external_id AS externalId, round, played_on AS playedOn, team_a AS teamA, team_b AS teamB, winner
       FROM matches WHERE id = ?`,
    )
    .get(matchId) as Omit<ParsedMatch, 'players'> | undefined;
  if (!match) return null;
  const players = db
    .prepare(`SELECT team, nick, minutes, kills FROM match_players WHERE match_id = ? ORDER BY id`)
    .all(matchId) as ParsedPlayer[];
  return { ...match, players };
}

export const saveFound = db.transaction((matchId: number, official: OfficialMatch, discrepancies: Discrepancy[]) => {
  db.prepare(
    `UPDATE match_checks
     SET status = ?, attempts = attempts + 1, last_error = NULL, checked_at = datetime('now'), official_data = ?
     WHERE match_id = ?`,
  ).run(discrepancies.length ? 'divergent' : 'ok', JSON.stringify(official), matchId);

  db.prepare(`DELETE FROM check_discrepancies WHERE match_id = ?`).run(matchId);
  const insert = db.prepare(
    `INSERT INTO check_discrepancies (match_id, code, message, nick, sheet_value, official_value)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const d of discrepancies) {
    insert.run(matchId, d.code, d.message, d.nick ?? null, d.sheetValue ?? null, d.officialValue ?? null);
  }
});

export const saveNotFound = db.transaction((matchId: number) => {
  db.prepare(
    `UPDATE match_checks
     SET status = 'not_found', attempts = attempts + 1, last_error = NULL, checked_at = datetime('now'), official_data = NULL
     WHERE match_id = ?`,
  ).run(matchId);
  db.prepare(`DELETE FROM check_discrepancies WHERE match_id = ?`).run(matchId);
});

export function scheduleRetry(matchId: number, error: string, nextAttemptAt: number): void {
  db.prepare(
    `UPDATE match_checks SET status = 'pending', attempts = attempts + 1, last_error = ?, next_attempt_at = ?
     WHERE match_id = ?`,
  ).run(error, nextAttemptAt, matchId);
}

export function saveFailed(matchId: number, error: string): void {
  db.prepare(
    `UPDATE match_checks SET status = 'failed', attempts = attempts + 1, last_error = ? WHERE match_id = ?`,
  ).run(error, matchId);
}

// ---------------------------------------------------------------------------
// Consultas (usadas pelas rotas)
// ---------------------------------------------------------------------------

/** Recoloca na fila as partidas que falharam ou não foram encontradas. */
export function requeueUnresolved(tournamentId: number): number {
  return db
    .prepare(
      `UPDATE match_checks SET status = 'pending', attempts = 0, last_error = NULL, next_attempt_at = 0
       WHERE status IN ('failed', 'not_found')
         AND match_id IN (SELECT id FROM matches WHERE tournament_id = ?)`,
    )
    .run(tournamentId).changes;
}

export function getTournamentChecks(tournamentId: number): TournamentChecks {
  const rows = db
    .prepare(
      `SELECT m.id, m.external_id, c.status, c.attempts, c.last_error, c.checked_at, c.next_attempt_at
       FROM matches m JOIN match_checks c ON c.match_id = m.id
       WHERE m.tournament_id = ? ORDER BY m.round, m.id`,
    )
    .all(tournamentId) as {
    id: number;
    external_id: string;
    status: CheckStatus;
    attempts: number;
    last_error: string | null;
    checked_at: string | null;
    next_attempt_at: number;
  }[];

  const discrepancyRows = db
    .prepare(
      `SELECT d.match_id, d.code, d.message, d.nick, d.sheet_value, d.official_value
       FROM check_discrepancies d JOIN matches m ON m.id = d.match_id
       WHERE m.tournament_id = ? ORDER BY d.id`,
    )
    .all(tournamentId) as {
    match_id: number;
    code: DiscrepancyCode;
    message: string;
    nick: string | null;
    sheet_value: string | null;
    official_value: string | null;
  }[];

  const counts = Object.fromEntries(CHECK_STATUSES.map((s) => [s, 0])) as Record<CheckStatus, number>;
  for (const row of rows) counts[row.status]++;

  return {
    counts,
    total: rows.length,
    finished: counts.pending + counts.running === 0,
    matches: rows.map((row) => ({
      externalId: row.external_id,
      status: row.status,
      attempts: row.attempts,
      lastError: row.last_error,
      checkedAt: row.checked_at,
      nextAttemptAt: row.status === 'pending' ? row.next_attempt_at : null,
      discrepancies: discrepancyRows
        .filter((d) => d.match_id === row.id)
        .map((d) => ({
          code: d.code,
          message: d.message,
          nick: d.nick ?? undefined,
          sheetValue: d.sheet_value ?? undefined,
          officialValue: d.official_value ?? undefined,
        })),
    })),
  };
}
