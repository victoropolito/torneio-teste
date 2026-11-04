/**
 * Classificação, desempate e prêmios (funções puras, sem I/O).
 *
 * Classificação: número de vitórias. Desempate, nesta ordem:
 *   1. confronto direto (vitórias nas partidas entre os times empatados);
 *   2. saldo de kills (kills feitas − kills sofridas no torneio);
 *   3. menos jogadores utilizados (quem precisou de menos substitutos);
 *   4. persistindo, os times dividem igualmente os prêmios das posições que ocupam.
 *
 * Prêmio do time: percentual da colocação × total. Dentro do time: proporcional
 * aos minutos (ou kills) de cada jogador somados no torneio. Tudo em centavos,
 * com sobra distribuída pelo método do maior resto: a soma bate exatamente.
 */
import type { ParsedPlayer } from '../import/validate.js';

export type PrizeBasis = 'minutes' | 'kills';

export interface EffectiveMatch {
  externalId: string;
  teams: [string, string];
  /** null = partida sem resultado (não conta vitória para ninguém). */
  winner: string | null;
  players: ParsedPlayer[];
}

export type Tiebreak = 'head_to_head' | 'kill_balance' | 'fewer_players';

export interface TeamStanding {
  team: string;
  position: number;
  /** Empate não resolvido: divide a posição com outros times. */
  sharedPosition: boolean;
  /** Critério que definiu a posição dentro de um grupo empatado em vitórias. */
  tiebreak: Tiebreak | null;
  played: number;
  wins: number;
  losses: number;
  killsFor: number;
  killsAgainst: number;
  killBalance: number;
  playersUsed: number;
  prizePercent: number;
  prizeCents: number;
}

export interface PlayerPrize {
  nick: string;
  team: string;
  position: number;
  matches: number;
  minutes: number;
  kills: number;
  teamMinutes: number;
  teamKills: number;
  prizeByMinutes: number;
  prizeByKills: number;
}

export interface Results {
  standings: TeamStanding[];
  players: PlayerPrize[];
}

// ---------------------------------------------------------------------------
// Divisão em centavos
// ---------------------------------------------------------------------------

/**
 * Divide `totalCents` proporcionalmente aos pesos, em inteiros que somam
 * exatamente o total. Pesos todos zero → divisão igual. Empate no resto →
 * ordem dos itens (o chamador passa ordenado de forma determinística).
 */
export function splitCents(totalCents: number, weights: number[]): number[] {
  if (!weights.length) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  const effective = sum > 0 ? weights : weights.map(() => 1);
  const effectiveSum = sum > 0 ? sum : weights.length;

  const exact = effective.map((w) => (totalCents * w) / effectiveSum);
  const result = exact.map((x) => Math.floor(x + 1e-9));
  let leftover = totalCents - result.reduce((a, b) => a + b, 0);

  const byRemainder = exact
    .map((x, index) => ({ index, remainder: x - result[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder) {
    if (leftover <= 0) break;
    result[index]++;
    leftover--;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Classificação
// ---------------------------------------------------------------------------

interface TeamStats {
  team: string;
  played: number;
  wins: number;
  losses: number;
  killsFor: number;
  killsAgainst: number;
  players: Set<string>;
}

function teamStats(matches: EffectiveMatch[]): Map<string, TeamStats> {
  const stats = new Map<string, TeamStats>();
  const get = (team: string) => {
    let s = stats.get(team);
    if (!s) {
      s = { team, played: 0, wins: 0, losses: 0, killsFor: 0, killsAgainst: 0, players: new Set() };
      stats.set(team, s);
    }
    return s;
  };

  for (const match of matches) {
    const [a, b] = match.teams;
    const kills = (team: string) =>
      match.players.filter((p) => p.team === team).reduce((sum, p) => sum + p.kills, 0);
    for (const [team, opponent] of [[a, b], [b, a]]) {
      const s = get(team);
      s.played++;
      if (match.winner === team) s.wins++;
      else if (match.winner === opponent) s.losses++;
      s.killsFor += kills(team);
      s.killsAgainst += kills(opponent);
    }
    for (const p of match.players) {
      if (p.minutes > 0) get(p.team).players.add(p.nick.toLowerCase());
    }
  }
  return stats;
}

interface Tier {
  teams: string[];
  tiebreak: Tiebreak | null;
  tied: boolean;
}

type Criterion = { id: Tiebreak; value: (team: string, group: string[]) => number };

/** Agrupa por valor, do maior para o menor. */
function partition(group: string[], value: (team: string) => number): string[][] {
  const byValue = new Map<number, string[]>();
  for (const team of group) {
    const v = value(team);
    byValue.set(v, [...(byValue.get(v) ?? []), team]);
  }
  return [...byValue.entries()].sort((x, y) => y[0] - x[0]).map(([, teams]) => teams);
}

function buildCriteria(matches: EffectiveMatch[], stats: Map<string, TeamStats>): Criterion[] {
  return [
    {
      id: 'head_to_head',
      value: (team, group) =>
        matches.filter((m) => m.winner === team && m.teams.every((t) => group.includes(t))).length,
    },
    { id: 'kill_balance', value: (team) => stats.get(team)!.killsFor - stats.get(team)!.killsAgainst },
    { id: 'fewer_players', value: (team) => -stats.get(team)!.players.size },
  ];
}

/**
 * Ordena um grupo empatado. Quando um critério separa o grupo, cada subgrupo
 * ainda empatado recomeça do confronto direto (agora só entre os que sobraram).
 */
function resolveTie(group: string[], criteria: Criterion[]): Tier[] {
  if (group.length === 1) return [{ teams: group, tiebreak: null, tied: false }];

  for (const criterion of criteria) {
    const parts = partition(group, (team) => criterion.value(team, group));
    if (parts.length === 1) continue;
    return parts.flatMap((part) =>
      part.length === 1
        ? [{ teams: part, tiebreak: criterion.id, tied: false }]
        : resolveTie(part, criteria).map((tier) => ({ ...tier, tiebreak: tier.tiebreak ?? criterion.id })),
    );
  }
  return [{ teams: [...group].sort((a, b) => a.localeCompare(b)), tiebreak: null, tied: true }];
}

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

export function calculateResults(matches: EffectiveMatch[], prizeTotalCents: number, prizeSplit: number[]): Results {
  const stats = teamStats(matches);
  const criteria = buildCriteria(matches, stats);

  const tiers = partition([...stats.keys()], (team) => stats.get(team)!.wins).flatMap((group) =>
    resolveTie(group, criteria),
  );

  // Posições e percentuais (posições empatadas dividem a soma dos percentuais).
  const placed: { team: string; position: number; tier: Tier; percent: number }[] = [];
  let position = 1;
  for (const tier of tiers) {
    const size = tier.teams.length;
    const percent = prizeSplit.slice(position - 1, position - 1 + size).reduce((a, b) => a + b, 0) / size;
    for (const team of tier.teams) placed.push({ team, position, tier, percent });
    position += size;
  }

  const teamCents = splitCents(
    prizeTotalCents,
    placed.map((p) => p.percent),
  );

  const standings: TeamStanding[] = placed.map((p, index) => {
    const s = stats.get(p.team)!;
    return {
      team: p.team,
      position: p.position,
      sharedPosition: p.tier.tied,
      tiebreak: p.tier.tiebreak,
      played: s.played,
      wins: s.wins,
      losses: s.losses,
      killsFor: s.killsFor,
      killsAgainst: s.killsAgainst,
      killBalance: s.killsFor - s.killsAgainst,
      playersUsed: s.players.size,
      prizePercent: p.percent,
      prizeCents: teamCents[index],
    };
  });

  return { standings, players: playerPrizes(matches, standings) };
}

function playerPrizes(matches: EffectiveMatch[], standings: TeamStanding[]): PlayerPrize[] {
  const players: PlayerPrize[] = [];

  for (const standing of standings) {
    const totals = new Map<string, { nick: string; matches: number; minutes: number; kills: number }>();
    for (const match of matches) {
      for (const p of match.players) {
        if (p.team !== standing.team) continue;
        const key = p.nick.toLowerCase();
        const t = totals.get(key) ?? { nick: p.nick, matches: 0, minutes: 0, kills: 0 };
        if (p.minutes > 0) t.matches++;
        t.minutes += p.minutes;
        t.kills += p.kills;
        totals.set(key, t);
      }
    }

    const roster = [...totals.values()].sort((a, b) => a.nick.localeCompare(b.nick));
    const teamMinutes = roster.reduce((sum, p) => sum + p.minutes, 0);
    const teamKills = roster.reduce((sum, p) => sum + p.kills, 0);
    const byMinutes = splitCents(standing.prizeCents, roster.map((p) => p.minutes));
    const byKills = splitCents(standing.prizeCents, roster.map((p) => p.kills));

    roster.forEach((p, i) =>
      players.push({
        nick: p.nick,
        team: standing.team,
        position: standing.position,
        matches: p.matches,
        minutes: p.minutes,
        kills: p.kills,
        teamMinutes,
        teamKills,
        prizeByMinutes: byMinutes[i],
        prizeByKills: byKills[i],
      }),
    );
  }
  return players;
}
