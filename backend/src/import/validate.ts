import { AppError } from '../errors.js';

export type Severity = 'error' | 'warning' | 'info';

export interface ImportIssue {
  severity: Severity;
  code: string;
  message: string;
  line?: number;
  matchId?: string;
}

export interface ParsedPlayer {
  team: string;
  nick: string;
  minutes: number;
  kills: number;
}

export interface ParsedMatch {
  externalId: string;
  round: number;
  playedOn: string;
  teamA: string;
  teamB: string;
  winner: string | null;
  players: ParsedPlayer[];
}

export interface ImportResult {
  matches: ParsedMatch[];
  issues: ImportIssue[];
  stats: { totalRows: number; acceptedRows: number; duplicateRows: number; rejectedRows: number };
}

/** Linha da planilha já convertida para tipos. */
interface Row extends ParsedPlayer {
  line: number;
  playedOn: string;
  round: number;
  externalId: string;
  teamA: string;
  teamB: string;
  won: boolean | null;
}

export const TEAM_SIZE = 5;

const COLUMNS = {
  date: 'Data',
  round: 'Rodada',
  matchId: 'ID Partida',
  match: 'Partida',
  team: 'Time',
  nick: 'Nick',
  minutes: 'Minutos',
  kills: 'Kills',
  won: 'Venceu?',
} as const;

type Column = keyof typeof COLUMNS;

/** "Venceu?" -> "venceu"; "ID Partida" -> "id partida". */
function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[?]/g, '')
    .trim()
    .toLowerCase();
}

function mapHeader(header: string[]): Record<Column, number> {
  const positions = new Map(header.map((name, index) => [normalizeKey(name), index]));
  const missing: string[] = [];
  const indexes = {} as Record<Column, number>;

  for (const [column, label] of Object.entries(COLUMNS) as [Column, string][]) {
    const index = positions.get(normalizeKey(label));
    if (index === undefined) missing.push(label);
    else indexes[column] = index;
  }

  if (missing.length) {
    throw new AppError(`Colunas obrigatórias ausentes: ${missing.join(', ')}.`);
  }
  return indexes;
}

function parseDate(value: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const [, d, m, y] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function parseNonNegativeInt(value: string): number | null {
  return /^\d+$/.test(value) ? Number(value) : null;
}

function parseWon(value: string): boolean | null | undefined {
  const key = normalizeKey(value);
  if (key === '') return null;
  if (key === 'sim' || key === 's') return true;
  if (key === 'nao' || key === 'n') return false;
  return undefined;
}

function parseTeams(value: string): [string, string] | null {
  const parts = value.split(/\s+x\s+/i).map((part) => part.trim());
  return parts.length === 2 && parts[0] && parts[1] && parts[0] !== parts[1]
    ? [parts[0], parts[1]]
    : null;
}

/** IDs copiados à mão às vezes vêm sem "#". */
function normalizeMatchId(value: string): string {
  return /^\d+$/.test(value) ? `#${value}` : value;
}

const sameText = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Valida e normaliza a planilha. Erros estruturais (cabeçalho, arquivo vazio) lançam AppError. */
export function validateSheet(records: string[][]): ImportResult {
  if (records.length < 2) throw new AppError('A planilha não tem nenhuma partida.');

  const columns = mapHeader(records[0]);
  const issues: ImportIssue[] = [];
  const stats = { totalRows: records.length - 1, acceptedRows: 0, duplicateRows: 0, rejectedRows: 0 };

  const reject = (line: number, code: string, message: string, matchId?: string) => {
    issues.push({ severity: 'error', code, message: `${message} Linha descartada.`, line, matchId });
    stats.rejectedRows++;
  };

  // 1. Conversão linha a linha
  const rows: Row[] = [];
  records.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const cell = (column: Column) => cells[columns[column]] ?? '';

    const externalId = normalizeMatchId(cell('matchId'));
    if (!externalId) return reject(line, 'INVALID_MATCH_ID', 'ID da partida vazio.');

    const playedOn = parseDate(cell('date'));
    if (!playedOn) return reject(line, 'INVALID_DATE', `Data inválida: "${cell('date')}".`, externalId);

    const round = parseNonNegativeInt(cell('round'));
    if (!round) return reject(line, 'INVALID_ROUND', `Rodada inválida: "${cell('round')}".`, externalId);

    const teams = parseTeams(cell('match'));
    if (!teams) {
      return reject(line, 'INVALID_MATCHUP', `Partida deveria estar no formato "Time A x Time B": "${cell('match')}".`, externalId);
    }

    const team = teams.find((name) => sameText(name, cell('team')));
    if (!team) {
      return reject(line, 'TEAM_NOT_IN_MATCH', `Time "${cell('team')}" não joga a partida "${cell('match')}".`, externalId);
    }

    const nick = cell('nick');
    if (!nick) return reject(line, 'EMPTY_NICK', 'Nick vazio.', externalId);

    const minutes = parseNonNegativeInt(cell('minutes'));
    if (minutes === null) return reject(line, 'INVALID_MINUTES', `Minutos inválidos: "${cell('minutes')}".`, externalId);

    const kills = parseNonNegativeInt(cell('kills'));
    if (kills === null) return reject(line, 'INVALID_KILLS', `Kills inválidas: "${cell('kills')}".`, externalId);

    const won = parseWon(cell('won'));
    if (won === undefined) {
      return reject(line, 'INVALID_WON', `"Venceu?" deveria ser "sim", "não" ou vazio: "${cell('won')}".`, externalId);
    }

    rows.push({ line, externalId, playedOn, round, teamA: teams[0], teamB: teams[1], team, nick, minutes, kills, won });
  });

  unifyNickCasing(rows, issues);
  const matches = buildMatches(rows, issues, stats);
  checkTournament(matches, issues);

  stats.acceptedRows = matches.reduce((sum, match) => sum + match.players.length, 0);
  return { matches, issues, stats };
}

/**
 * Nicks que só diferem por maiúsculas/minúsculas são tratados como o mesmo jogador.
 * A grafia canônica é a mais frequente (empate: a que aparece primeiro).
 */
function unifyNickCasing(rows: Row[], issues: ImportIssue[]) {
  const spellings = new Map<string, Map<string, Row[]>>();
  for (const row of rows) {
    const key = row.nick.toLowerCase();
    const variants = spellings.get(key) ?? new Map<string, Row[]>();
    variants.set(row.nick, [...(variants.get(row.nick) ?? []), row]);
    spellings.set(key, variants);
  }

  for (const variants of spellings.values()) {
    if (variants.size < 2) continue;
    const [canonical] = [...variants.entries()].reduce((best, current) =>
      current[1].length > best[1].length ? current : best,
    );
    for (const [spelling, variantRows] of variants) {
      if (spelling === canonical) continue;
      for (const row of variantRows) {
        issues.push({
          severity: 'warning',
          code: 'NICK_CASE_UNIFIED',
          message: `Nick "${spelling}" unificado com "${canonical}" (mesmo nick com maiúsculas/minúsculas diferentes).`,
          line: row.line,
          matchId: row.externalId,
        });
        row.nick = canonical;
      }
    }
  }
}

function buildMatches(rows: Row[], issues: ImportIssue[], stats: ImportResult['stats']): ParsedMatch[] {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    groups.set(row.externalId, [...(groups.get(row.externalId) ?? []), row]);
  }

  const matches: ParsedMatch[] = [];
  for (const [externalId, group] of groups) {
    const first = group[0];
    const kept: Row[] = [];
    const byNick = new Map<string, Row>();

    for (const row of group) {
      const sameMatchup = [row.teamA, row.teamB].every((team) => team === first.teamA || team === first.teamB);
      if (row.playedOn !== first.playedOn || row.round !== first.round || !sameMatchup) {
        issues.push({
          severity: 'error',
          code: 'MATCH_DATA_CONFLICT',
          message: `Data, rodada ou confronto diferente das outras linhas da partida ${externalId} (linha ${first.line}). Linha descartada.`,
          line: row.line,
          matchId: externalId,
        });
        stats.rejectedRows++;
        continue;
      }

      const previous = byNick.get(row.nick.toLowerCase());
      if (previous) {
        const identical =
          previous.team === row.team &&
          previous.minutes === row.minutes &&
          previous.kills === row.kills &&
          previous.won === row.won;
        issues.push(
          identical
            ? {
                severity: 'warning',
                code: 'DUPLICATE_ROW',
                message: `Linha duplicada de "${row.nick}" (igual à linha ${previous.line}). Duplicata removida.`,
                line: row.line,
                matchId: externalId,
              }
            : {
                severity: 'error',
                code: 'CONFLICTING_ROW',
                message: `"${row.nick}" aparece de novo na partida com dados diferentes da linha ${previous.line}. Mantida a primeira, esta foi descartada.`,
                line: row.line,
                matchId: externalId,
              },
        );
        if (identical) stats.duplicateRows++;
        else stats.rejectedRows++;
        continue;
      }

      byNick.set(row.nick.toLowerCase(), row);
      kept.push(row);
    }

    checkTeamSizes(externalId, first, kept, issues);
    matches.push({
      externalId,
      round: first.round,
      playedOn: first.playedOn,
      teamA: first.teamA,
      teamB: first.teamB,
      winner: resolveWinner(externalId, first, kept, issues),
      players: kept.map(({ team, nick, minutes, kills }) => ({ team, nick, minutes, kills })),
    });
  }
  return matches;
}

function checkTeamSizes(externalId: string, match: Row, rows: Row[], issues: ImportIssue[]) {
  const duration = Math.max(0, ...rows.map((row) => row.minutes));

  for (const team of [match.teamA, match.teamB]) {
    const players = rows.filter((row) => row.team === team);
    if (players.length < TEAM_SIZE) {
      issues.push({
        severity: 'warning',
        code: 'TEAM_INCOMPLETE',
        message: `${team} tem ${players.length} jogador(es) na partida ${externalId} (esperado: ${TEAM_SIZE}).`,
        matchId: externalId,
      });
    } else if (players.length > TEAM_SIZE) {
      const partial = players
        .filter((row) => row.minutes < duration)
        .map((row) => `${row.nick} (${row.minutes} min)`);
      issues.push({
        severity: 'info',
        code: 'SUBSTITUTION',
        message:
          `${team} escalou ${players.length} jogadores na partida ${externalId} (duração: ${duration} min). ` +
          (partial.length
            ? `Interpretado como substituição: ${partial.join(', ')}.`
            : 'Nenhum jogou menos que a partida inteira; verifique a escalação.'),
        matchId: externalId,
      });
    }
  }
}

/** O vencedor é o time em que todos marcaram "sim" enquanto todos do outro marcaram "não". */
function resolveWinner(externalId: string, match: Row, rows: Row[], issues: ImportIssue[]): string | null {
  const answers = (team: string) => new Set(rows.filter((row) => row.team === team).map((row) => row.won));
  const a = answers(match.teamA);
  const b = answers(match.teamB);
  const only = (set: Set<boolean | null>, value: boolean | null) => set.size === 1 && set.has(value);

  if (only(a, true) && only(b, false)) return match.teamA;
  if (only(b, true) && only(a, false)) return match.teamB;

  if (only(a, null) && only(b, null)) {
    const empty = rows.every((row) => row.minutes === 0 && row.kills === 0);
    issues.push({
      severity: 'warning',
      code: 'MATCH_WITHOUT_RESULT',
      message:
        `Partida ${externalId} (${match.teamA} x ${match.teamB}) sem vencedor na planilha` +
        (empty ? ', com minutos e kills zerados' : '') +
        '. O resultado será obtido do site oficial.',
      matchId: externalId,
    });
  } else {
    issues.push({
      severity: 'error',
      code: 'WINNER_INCONSISTENT',
      message: `Coluna "Venceu?" inconsistente na partida ${externalId}: não dá para saber quem venceu. O resultado será obtido do site oficial.`,
      matchId: externalId,
    });
  }
  return null;
}

/** Checagens que dependem do torneio inteiro (todos contra todos, jogador em mais de um time). */
function checkTournament(matches: ParsedMatch[], issues: ImportIssue[]) {
  const pairKey = (a: string, b: string) => [a, b].sort().join(' x ');
  const pairs = new Map<string, string>();
  const teamRounds = new Map<string, string>();
  const playerTeams = new Map<string, Set<string>>();

  for (const match of matches) {
    const key = pairKey(match.teamA, match.teamB);
    const previous = pairs.get(key);
    if (previous) {
      issues.push({
        severity: 'warning',
        code: 'MATCH_REPEATED',
        message: `${key} se enfrentaram mais de uma vez (${previous} e ${match.externalId}).`,
        matchId: match.externalId,
      });
    } else {
      pairs.set(key, match.externalId);
    }

    for (const team of [match.teamA, match.teamB]) {
      const roundKey = `${team}|${match.round}`;
      const other = teamRounds.get(roundKey);
      if (other) {
        issues.push({
          severity: 'warning',
          code: 'TEAM_TWICE_IN_ROUND',
          message: `${team} jogou duas vezes na rodada ${match.round} (${other} e ${match.externalId}).`,
          matchId: match.externalId,
        });
      } else {
        teamRounds.set(roundKey, match.externalId);
      }
    }

    for (const player of match.players) {
      playerTeams.set(player.nick, (playerTeams.get(player.nick) ?? new Set()).add(player.team));
    }
  }

  for (const [nick, teams] of playerTeams) {
    if (teams.size > 1) {
      issues.push({
        severity: 'warning',
        code: 'PLAYER_MULTIPLE_TEAMS',
        message: `"${nick}" jogou por mais de um time: ${[...teams].join(', ')}.`,
      });
    }
  }

  const teams = [...new Set(matches.flatMap((match) => [match.teamA, match.teamB]))].sort();
  const missing: string[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      if (!pairs.has(pairKey(teams[i], teams[j]))) missing.push(pairKey(teams[i], teams[j]));
    }
  }
  if (missing.length) {
    issues.push({
      severity: 'warning',
      code: 'ROUND_ROBIN_INCOMPLETE',
      message: `Faltam confrontos para fechar o todos contra todos: ${missing.join(', ')}.`,
    });
  }
}
