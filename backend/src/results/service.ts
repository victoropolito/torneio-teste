/**
 * Monta os dados efetivos de cada partida (site oficial quando conferida,
 * senão planilha) e calcula classificação e prêmios.
 */
import { db } from '../db.js';
import type { ParsedPlayer } from '../import/validate.js';
import type { OfficialMatch } from '../official/client.js';
import type { CheckStatus } from '../official/repository.js';
import { calculateResults, type EffectiveMatch, type PlayerPrize, type PrizeBasis, type TeamStanding } from './calculate.js';

export const PRIZE_BASES: PrizeBasis[] = ['minutes', 'kills'];

export interface PendingMatch {
  externalId: string;
  reason: string;
}

export interface TournamentResults {
  basis: PrizeBasis;
  prizeTotalCents: number;
  /** Algum valor ainda pode mudar (partida não conferida ou sem resultado). */
  provisional: boolean;
  pendingMatches: PendingMatch[];
  /** Partidas em que o cálculo usou o site oficial / a planilha. */
  sources: { official: number; sheet: number };
  standings: TeamStanding[];
  players: (PlayerPrize & { prizeCents: number })[];
}

const PENDING_REASON: Partial<Record<CheckStatus, string>> = {
  pending: 'conferência em andamento',
  running: 'conferência em andamento',
  not_found: 'não encontrada no site oficial',
  failed: 'site oficial não respondeu',
};

export function getResults(tournamentId: number, basis: PrizeBasis, prizeTotalCents: number, prizeSplit: number[]): TournamentResults {
  const rows = db
    .prepare(
      `SELECT m.id, m.external_id, m.team_a, m.team_b, m.winner, c.status, c.official_data
       FROM matches m LEFT JOIN match_checks c ON c.match_id = m.id
       WHERE m.tournament_id = ? ORDER BY m.round, m.id`,
    )
    .all(tournamentId) as {
    id: number;
    external_id: string;
    team_a: string;
    team_b: string;
    winner: string | null;
    status: CheckStatus | null;
    official_data: string | null;
  }[];

  const playerRows = db
    .prepare(
      `SELECT p.match_id, p.team, p.nick, p.minutes, p.kills
       FROM match_players p JOIN matches m ON m.id = p.match_id
       WHERE m.tournament_id = ? ORDER BY p.id`,
    )
    .all(tournamentId) as ({ match_id: number } & ParsedPlayer)[];

  const pendingMatches: PendingMatch[] = [];
  const sources = { official: 0, sheet: 0 };

  const matches: EffectiveMatch[] = rows.map((row) => {
    const verified = (row.status === 'ok' || row.status === 'divergent') && row.official_data;
    let match: EffectiveMatch;
    if (verified) {
      const official = JSON.parse(row.official_data!) as OfficialMatch;
      sources.official++;
      match = {
        externalId: row.external_id,
        teams: [official.teams[0], official.teams[1]],
        winner: official.winner,
        players: official.players,
      };
    } else {
      sources.sheet++;
      pendingMatches.push({
        externalId: row.external_id,
        reason: PENDING_REASON[row.status ?? 'pending'] ?? 'não conferida',
      });
      match = {
        externalId: row.external_id,
        teams: [row.team_a, row.team_b],
        winner: row.winner,
        players: playerRows
          .filter((p) => p.match_id === row.id)
          .map(({ team, nick, minutes, kills }) => ({ team, nick, minutes, kills })),
      };
    }
    if (match.winner === null && !pendingMatches.some((p) => p.externalId === row.external_id)) {
      pendingMatches.push({ externalId: row.external_id, reason: 'sem vencedor definido' });
    }
    return match;
  });

  const { standings, players } = calculateResults(matches, prizeTotalCents, prizeSplit);

  return {
    basis,
    prizeTotalCents,
    provisional: pendingMatches.length > 0,
    pendingMatches,
    sources,
    standings,
    players: players.map((p) => ({ ...p, prizeCents: basis === 'kills' ? p.prizeByKills : p.prizeByMinutes })),
  };
}
