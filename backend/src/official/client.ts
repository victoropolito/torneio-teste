/**
 * Cliente HTTP do site oficial. Traduz o formato externo (inglês, times
 * aninhados) para o formato do domínio e classifica as falhas em
 * temporárias (vale tentar de novo) ou definitivas.
 */
import type { ParsedPlayer } from '../import/validate.js';

export interface OfficialMatch {
  externalId: string;
  playedOn: string;
  teams: string[];
  winner: string | null;
  players: ParsedPlayer[];
}

export type FetchResult = { kind: 'found'; match: OfficialMatch } | { kind: 'not_found' };

/** Falha que pode passar sozinha (fora do ar, timeout, 5xx). */
export class TransientError extends Error {}

/** Falha que não melhora com retry (resposta em formato inesperado, 4xx). */
export class PermanentError extends Error {}

const BASE_URL = process.env.OFFICIAL_API_URL ?? 'http://localhost:4000';
const TIMEOUT_MS = Number(process.env.OFFICIAL_TIMEOUT_MS ?? 15000);

interface ApiMatch {
  matchId: string;
  playedAt: string;
  teams: {
    name: string;
    result: 'win' | 'loss';
    players: { nickname: string; minutesPlayed: number; kills: number }[];
  }[];
}

export async function fetchOfficialMatch(externalId: string): Promise<FetchResult> {
  const url = `${BASE_URL}/api/matches/${encodeURIComponent(externalId.replace(/^#/, ''))}`;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new TransientError(`Site não respondeu em ${TIMEOUT_MS / 1000} s.`);
    }
    throw new TransientError('Site fora do ar (falha de conexão).');
  }

  if (res.status === 404) return { kind: 'not_found' };
  if (res.status >= 500 || res.status === 429) {
    throw new TransientError(`Site respondeu HTTP ${res.status}.`);
  }
  if (!res.ok) throw new PermanentError(`Site respondeu HTTP ${res.status}.`);

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new TransientError('Resposta do site incompleta ou corrompida.');
  }
  return { kind: 'found', match: toDomain(externalId, body) };
}

function toDomain(externalId: string, body: unknown): OfficialMatch {
  const data = body as ApiMatch;
  const valid =
    data &&
    typeof data.playedAt === 'string' &&
    Array.isArray(data.teams) &&
    data.teams.every(
      (team) =>
        typeof team?.name === 'string' &&
        Array.isArray(team.players) &&
        team.players.every(
          (p) => typeof p?.nickname === 'string' && Number.isInteger(p.minutesPlayed) && Number.isInteger(p.kills),
        ),
    );
  if (!valid) throw new PermanentError('Resposta do site em formato inesperado.');

  const winners = data.teams.filter((team) => team.result === 'win');
  return {
    externalId,
    playedOn: data.playedAt.slice(0, 10),
    teams: data.teams.map((team) => team.name),
    winner: winners.length === 1 ? winners[0].name : null,
    players: data.teams.flatMap((team) =>
      team.players.map((p) => ({ team: team.name, nick: p.nickname, minutes: p.minutesPlayed, kills: p.kills })),
    ),
  };
}
