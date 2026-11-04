/**
 * Compara a partida da planilha com o registro do site oficial (função pura).
 * Cada diferença vira uma divergência com os dois valores, para a Maria Clara
 * saber exatamente o que não bateu. Nos cálculos, vale o site oficial.
 */
import type { ParsedMatch } from '../import/validate.js';
import type { OfficialMatch } from './client.js';

export type DiscrepancyCode =
  | 'sheet_incomplete'
  | 'date'
  | 'teams'
  | 'winner'
  | 'player_missing_on_site'
  | 'player_missing_on_sheet'
  | 'player_team'
  | 'minutes'
  | 'kills';

export interface Discrepancy {
  code: DiscrepancyCode;
  message: string;
  nick?: string;
  sheetValue?: string;
  officialValue?: string;
}

/** "2026-09-05" -> "05/09/2026" */
const formatIsoDate = (iso: string) => iso.split('-').reverse().join('/');
const key = (nick: string) => nick.toLowerCase();
const sameTeams = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

export function compareMatch(sheet: ParsedMatch, official: OfficialMatch): Discrepancy[] {
  const result: Discrepancy[] = [];
  const add = (d: Discrepancy) => result.push(d);

  // Partida que a planilha não preencheu (sem vencedor e todos com 0 minutos):
  // em vez de dezenas de divergências de minutos/kills, um único aviso.
  const sheetIncomplete = sheet.winner === null && sheet.players.every((p) => p.minutes === 0);
  if (sheetIncomplete) {
    add({
      code: 'sheet_incomplete',
      message: `Planilha sem resultado nem estatísticas; usando os dados do site (${official.winner ?? 'sem vencedor'}).`,
      sheetValue: 'sem resultado',
      officialValue: official.winner ?? 'sem vencedor',
    });
  }

  if (sheet.playedOn !== official.playedOn) {
    add({
      code: 'date',
      message: `Data diferente: planilha ${formatIsoDate(sheet.playedOn)}, site ${formatIsoDate(official.playedOn)}.`,
      sheetValue: sheet.playedOn,
      officialValue: official.playedOn,
    });
  }

  const sheetTeams = [sheet.teamA, sheet.teamB];
  if (!sameTeams(sheetTeams, official.teams)) {
    add({
      code: 'teams',
      message: `Times diferentes: planilha ${sheetTeams.join(' x ')}, site ${official.teams.join(' x ')}.`,
      sheetValue: sheetTeams.join(' x '),
      officialValue: official.teams.join(' x '),
    });
  }

  if (!sheetIncomplete && sheet.winner !== official.winner) {
    add({
      code: 'winner',
      message: `Vencedor diferente: planilha ${sheet.winner ?? 'sem resultado'}, site ${official.winner ?? 'sem vencedor'}.`,
      sheetValue: sheet.winner ?? 'sem resultado',
      officialValue: official.winner ?? 'sem vencedor',
    });
  }

  const officialByNick = new Map(official.players.map((p) => [key(p.nick), p]));
  const sheetByNick = new Map(sheet.players.map((p) => [key(p.nick), p]));

  for (const player of sheet.players) {
    const other = officialByNick.get(key(player.nick));
    if (!other) {
      add({
        code: 'player_missing_on_site',
        message: `${player.nick} (${player.team}) está na planilha, mas não aparece no site.`,
        nick: player.nick,
      });
      continue;
    }
    if (other.team !== player.team) {
      add({
        code: 'player_team',
        message: `${player.nick}: time diferente (planilha ${player.team}, site ${other.team}).`,
        nick: player.nick,
        sheetValue: player.team,
        officialValue: other.team,
      });
    }
    if (sheetIncomplete) continue;
    if (other.minutes !== player.minutes) {
      add({
        code: 'minutes',
        message: `${player.nick}: minutos diferentes (planilha ${player.minutes}, site ${other.minutes}).`,
        nick: player.nick,
        sheetValue: String(player.minutes),
        officialValue: String(other.minutes),
      });
    }
    if (other.kills !== player.kills) {
      add({
        code: 'kills',
        message: `${player.nick}: kills diferentes (planilha ${player.kills}, site ${other.kills}).`,
        nick: player.nick,
        sheetValue: String(player.kills),
        officialValue: String(other.kills),
      });
    }
  }

  for (const player of official.players) {
    if (sheetByNick.has(key(player.nick))) continue;
    add({
      code: 'player_missing_on_sheet',
      message: `${player.nick} (${player.team}) jogou ${player.minutes} min segundo o site, mas não está na planilha.`,
      nick: player.nick,
      officialValue: `${player.minutes} min, ${player.kills} kills`,
    });
  }

  return result;
}
