import { db } from '../db.js';
import type { ImportIssue, ImportResult, ParsedPlayer, Severity } from '../import/validate.js';

export interface NewTournament {
  name: string;
  sourceFilename: string;
  prizeTotalCents: number;
  prizeSplit: number[];
}

export interface TournamentSummary {
  id: number;
  name: string;
  sourceFilename: string;
  prizeTotalCents: number;
  prizeSplit: number[];
  createdAt: string;
  matchCount: number;
  issueCounts: Record<Severity, number>;
}

export interface MatchDetail {
  externalId: string;
  round: number;
  playedOn: string;
  teamA: string;
  teamB: string;
  winner: string | null;
  players: ParsedPlayer[];
}

export interface TournamentDetail extends TournamentSummary {
  matches: MatchDetail[];
  issues: ImportIssue[];
}

interface TournamentRow {
  id: number;
  name: string;
  source_filename: string;
  prize_total_cents: number;
  prize_split: string;
  created_at: string;
  match_count: number;
  errors: number;
  warnings: number;
  infos: number;
}

const SUMMARY_SQL = `
  SELECT t.*,
    (SELECT COUNT(*) FROM matches m WHERE m.tournament_id = t.id) AS match_count,
    (SELECT COUNT(*) FROM import_issues i WHERE i.tournament_id = t.id AND i.severity = 'error')   AS errors,
    (SELECT COUNT(*) FROM import_issues i WHERE i.tournament_id = t.id AND i.severity = 'warning') AS warnings,
    (SELECT COUNT(*) FROM import_issues i WHERE i.tournament_id = t.id AND i.severity = 'info')    AS infos
  FROM tournaments t
`;

function toSummary(row: TournamentRow): TournamentSummary {
  return {
    id: row.id,
    name: row.name,
    sourceFilename: row.source_filename,
    prizeTotalCents: row.prize_total_cents,
    prizeSplit: JSON.parse(row.prize_split) as number[],
    createdAt: row.created_at,
    matchCount: row.match_count,
    issueCounts: { error: row.errors, warning: row.warnings, info: row.infos },
  };
}

export const createTournament = db.transaction((input: NewTournament, result: ImportResult): number => {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO tournaments (name, source_filename, prize_total_cents, prize_split)
       VALUES (?, ?, ?, ?)`,
    )
    .run(input.name, input.sourceFilename, input.prizeTotalCents, JSON.stringify(input.prizeSplit));
  const tournamentId = Number(lastInsertRowid);

  const insertMatch = db.prepare(
    `INSERT INTO matches (tournament_id, external_id, round, played_on, team_a, team_b, winner)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertPlayer = db.prepare(
    `INSERT INTO match_players (match_id, team, nick, minutes, kills) VALUES (?, ?, ?, ?, ?)`,
  );
  const insertIssue = db.prepare(
    `INSERT INTO import_issues (tournament_id, severity, code, message, line, match_external_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  for (const match of result.matches) {
    const matchId = insertMatch.run(
      tournamentId, match.externalId, match.round, match.playedOn, match.teamA, match.teamB, match.winner,
    ).lastInsertRowid;
    for (const player of match.players) {
      insertPlayer.run(matchId, player.team, player.nick, player.minutes, player.kills);
    }
  }

  for (const issue of result.issues) {
    insertIssue.run(tournamentId, issue.severity, issue.code, issue.message, issue.line ?? null, issue.matchId ?? null);
  }

  return tournamentId;
});

export function listTournaments(): TournamentSummary[] {
  const rows = db.prepare(`${SUMMARY_SQL} ORDER BY t.id DESC`).all() as TournamentRow[];
  return rows.map(toSummary);
}

export function getTournament(id: number): TournamentDetail | null {
  const row = db.prepare(`${SUMMARY_SQL} WHERE t.id = ?`).get(id) as TournamentRow | undefined;
  if (!row) return null;

  const matchRows = db
    .prepare(
      `SELECT id, external_id, round, played_on, team_a, team_b, winner
       FROM matches WHERE tournament_id = ? ORDER BY round, id`,
    )
    .all(id) as {
    id: number;
    external_id: string;
    round: number;
    played_on: string;
    team_a: string;
    team_b: string;
    winner: string | null;
  }[];

  const playerRows = db
    .prepare(
      `SELECT p.match_id, p.team, p.nick, p.minutes, p.kills
       FROM match_players p JOIN matches m ON m.id = p.match_id
       WHERE m.tournament_id = ? ORDER BY p.id`,
    )
    .all(id) as ({ match_id: number } & ParsedPlayer)[];

  const issueRows = db
    .prepare(
      `SELECT severity, code, message, line, match_external_id
       FROM import_issues WHERE tournament_id = ?
       ORDER BY CASE severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, line IS NULL, line, id`,
    )
    .all(id) as { severity: Severity; code: string; message: string; line: number | null; match_external_id: string | null }[];

  return {
    ...toSummary(row),
    matches: matchRows.map((match) => ({
      externalId: match.external_id,
      round: match.round,
      playedOn: match.played_on,
      teamA: match.team_a,
      teamB: match.team_b,
      winner: match.winner,
      players: playerRows
        .filter((player) => player.match_id === match.id)
        .map(({ team, nick, minutes, kills }) => ({ team, nick, minutes, kills })),
    })),
    issues: issueRows.map((issue) => ({
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
      line: issue.line ?? undefined,
      matchId: issue.match_external_id ?? undefined,
    })),
  };
}
