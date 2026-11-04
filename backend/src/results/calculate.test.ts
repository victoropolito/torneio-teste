import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ParsedPlayer } from '../import/validate.js';
import { calculateResults, splitCents, type EffectiveMatch } from './calculate.js';

const TOTAL = 1_000_000; // R$ 10.000,00
const SPLIT = [50, 30, 20];

/** Time com `n` jogadores (nicks `<time>1..n`), todos com os mesmos minutos/kills. */
function roster(team: string, kills = 1, minutes = 30, n = 5): ParsedPlayer[] {
  return Array.from({ length: n }, (_, i) => ({ team, nick: `${team}${i + 1}`, minutes, kills }));
}

function match(a: string, b: string, winner: string | null, players?: ParsedPlayer[]): EffectiveMatch {
  return { externalId: `${a}-${b}`, teams: [a, b], winner, players: players ?? [...roster(a), ...roster(b)] };
}

const order = (matches: EffectiveMatch[], split = SPLIT) =>
  calculateResults(matches, TOTAL, split).standings.map((s) => s.team);

describe('splitCents', () => {
  it('divide proporcionalmente e a soma bate com o total', () => {
    assert.deepEqual(splitCents(1000, [1, 1, 2]), [250, 250, 500]);
  });

  it('distribui a sobra pelo maior resto, desempatando pela ordem', () => {
    assert.deepEqual(splitCents(100, [1, 1, 1]), [34, 33, 33]);
    assert.deepEqual(splitCents(1, [5, 5]), [1, 0]);
  });

  it('pesos todos zero viram divisão igual', () => {
    assert.deepEqual(splitCents(1000, [0, 0]), [500, 500]);
  });

  it('peso zero recebe zero quando outros têm peso', () => {
    assert.deepEqual(splitCents(1000, [0, 3, 1]), [0, 750, 250]);
  });

  it('nunca perde nem cria centavos', () => {
    for (const weights of [[7, 13, 29], [1, 2, 3, 4, 5, 6], [33.33, 33.33, 33.34]]) {
      const parts = splitCents(999_999, weights);
      assert.equal(parts.reduce((a, b) => a + b, 0), 999_999);
    }
  });
});

describe('classificação', () => {
  it('ordena por número de vitórias', () => {
    const matches = [match('A', 'B', 'A'), match('A', 'C', 'A'), match('B', 'C', 'B')];
    assert.deepEqual(order(matches), ['A', 'B', 'C']);
  });

  it('partida sem vencedor não conta vitória nem derrota', () => {
    const { standings } = calculateResults([match('A', 'B', null)], TOTAL, [100]);
    for (const s of standings) {
      assert.equal(s.played, 1);
      assert.equal(s.wins, 0);
      assert.equal(s.losses, 0);
    }
  });

  it('calcula saldo de kills como feitas menos sofridas', () => {
    const players = [...roster('A', 3), ...roster('B', 1)]; // A: 15 kills, B: 5
    const { standings } = calculateResults([match('A', 'B', 'A', players)], TOTAL, [100]);
    const a = standings.find((s) => s.team === 'A')!;
    assert.equal(a.killsFor, 15);
    assert.equal(a.killsAgainst, 5);
    assert.equal(a.killBalance, 10);
  });
});

describe('desempate', () => {
  it('1º critério: confronto direto', () => {
    // X vence todos; A e B têm 1 vitória cada, e B venceu A.
    const matches = [
      match('X', 'A', 'X'), match('X', 'B', 'X'), match('X', 'C', 'X'),
      match('B', 'A', 'B'), match('A', 'C', 'A'), match('B', 'C', null),
    ];
    const { standings } = calculateResults(matches, TOTAL, SPLIT);
    assert.deepEqual(standings.map((s) => s.team), ['X', 'B', 'A', 'C']);
    assert.equal(standings[1].tiebreak, 'head_to_head');
    assert.equal(standings[2].tiebreak, 'head_to_head');
  });

  it('caso de setembro: Corvos x Tubarões com 3 vitórias, Corvos venceu o confronto direto', () => {
    const matches = [
      match('Corvos', 'Tubaroes', 'Corvos'),
      match('Corvos', 'Lobos', 'Lobos'),
      match('Tubaroes', 'Lobos', 'Lobos'),
      match('Corvos', 'S', 'Corvos'),
      match('Corvos', 'P', 'Corvos'),
      match('Tubaroes', 'S', 'Tubaroes'),
      match('Tubaroes', 'P', 'Tubaroes'),
      match('Lobos', 'S', 'Lobos'),
      match('Lobos', 'P', 'Lobos'),
    ];
    const { standings } = calculateResults(matches, TOTAL, SPLIT);
    assert.deepEqual(standings.slice(0, 3).map((s) => s.team), ['Lobos', 'Corvos', 'Tubaroes']);
    assert.equal(standings[1].prizeCents, 300_000);
    assert.equal(standings[2].prizeCents, 200_000);
  });

  it('2º critério: saldo de kills quando o confronto direto é circular', () => {
    // A>B, B>C, C>A; saldos A +5, C 0, B -5
    const matches = [
      match('A', 'B', 'A', [...roster('A', 3), ...roster('B', 1)]),
      match('B', 'C', 'B', [...roster('B', 3), ...roster('C', 2)]),
      match('C', 'A', 'C', [...roster('C', 2), ...roster('A', 1)]),
    ];
    const { standings } = calculateResults(matches, TOTAL, SPLIT);
    assert.deepEqual(standings.map((s) => s.team), ['A', 'C', 'B']);
    assert.ok(standings.every((s) => s.tiebreak === 'kill_balance'));
  });

  it('3º critério: menos jogadores utilizados', () => {
    // Ciclo com saldos iguais; A usou um 6º jogador (sem kills, não altera o saldo).
    const sixth = { team: 'A', nick: 'A6', minutes: 10, kills: 0 };
    const matches = [
      match('A', 'B', 'A', [...roster('A', 2), sixth, ...roster('B', 1)]),
      match('B', 'C', 'B', [...roster('B', 2), ...roster('C', 1)]),
      match('C', 'A', 'C', [...roster('C', 2), ...roster('A', 1)]),
    ];
    const { standings } = calculateResults(matches, TOTAL, SPLIT);
    assert.deepEqual(standings.map((s) => s.playersUsed), [5, 5, 6]);
    assert.equal(standings[2].team, 'A');
    assert.equal(standings[2].tiebreak, 'fewer_players');
    // B e C continuam empatados e voltam ao confronto direto: B venceu C.
    assert.deepEqual(standings.slice(0, 2).map((s) => s.team), ['B', 'C']);
    assert.equal(standings[0].tiebreak, 'head_to_head');
  });

  it('jogador com 0 minutos não conta como utilizado', () => {
    const bench = { team: 'A', nick: 'Banco', minutes: 0, kills: 0 };
    const { standings } = calculateResults([match('A', 'B', 'A', [...roster('A'), bench, ...roster('B')])], TOTAL, [100]);
    assert.equal(standings.find((s) => s.team === 'A')!.playersUsed, 5);
  });

  it('empate em todos os critérios: divide igualmente os prêmios das posições', () => {
    const matches = [match('A', 'B', 'A'), match('B', 'C', 'B'), match('C', 'A', 'C')];
    const { standings } = calculateResults(matches, TOTAL, SPLIT);
    assert.ok(standings.every((s) => s.position === 1 && s.sharedPosition));
    assert.deepEqual(standings.map((s) => s.prizeCents), [333_334, 333_333, 333_333]);
  });

  it('empate total no 2º lugar soma 30% + 20% e divide entre os empatados', () => {
    const matches = [
      match('X', 'A', 'X'),
      match('X', 'B', 'X'),
      match('A', 'B', null), // não há confronto direto decidido
    ];
    const { standings } = calculateResults(matches, TOTAL, SPLIT);
    assert.equal(standings[0].team, 'X');
    const tied = standings.slice(1);
    assert.ok(tied.every((s) => s.position === 2 && s.sharedPosition));
    assert.deepEqual(tied.map((s) => s.prizeCents), [250_000, 250_000]);
  });

  it('empate em posição sem prêmio não afeta os premiados', () => {
    const matches = [
      match('A', 'B', 'A'), match('A', 'C', 'A'), match('A', 'D', 'A'),
      match('B', 'C', 'B'), match('B', 'D', 'B'),
      match('C', 'D', null),
    ];
    const { standings } = calculateResults(matches, TOTAL, [60, 40]);
    assert.deepEqual(standings.map((s) => s.prizeCents), [600_000, 400_000, 0, 0]);
  });
});

describe('prêmio por jogador', () => {
  it('divide o prêmio do time pelos minutos somados no torneio', () => {
    // A vence as duas; Sub entra no lugar de A5 na segunda partida.
    const second = [...roster('A').slice(0, 4), { team: 'A', nick: 'Sub', minutes: 30, kills: 1 }, ...roster('C')];
    const matches = [match('A', 'B', 'A'), match('A', 'C', 'A', second)];
    const { players } = calculateResults(matches, TOTAL, [100]);
    const a = players.filter((p) => p.team === 'A');

    assert.equal(a.length, 6);
    const get = (nick: string) => a.find((p) => p.nick === nick)!;
    assert.equal(get('A1').minutes, 60);
    assert.equal(get('A5').minutes, 30);
    assert.equal(get('A1').teamMinutes, 300);
    assert.equal(get('A1').prizeByMinutes, 200_000); // 60/300
    assert.equal(get('A5').prizeByMinutes, 100_000); // 30/300
    assert.equal(get('Sub').prizeByMinutes, 100_000);
  });

  it('calcula também por kills; quem tem 0 kills recebe 0', () => {
    const players = [
      { team: 'A', nick: 'Fragger', minutes: 30, kills: 30 },
      { team: 'A', nick: 'Suporte', minutes: 30, kills: 0 },
      ...roster('B'),
    ];
    const { players: result } = calculateResults([match('A', 'B', 'A', players)], TOTAL, [100]);
    const get = (nick: string) => result.find((p) => p.nick === nick)!;
    assert.equal(get('Fragger').prizeByKills, TOTAL);
    assert.equal(get('Suporte').prizeByKills, 0);
    assert.equal(get('Fragger').prizeByMinutes, TOTAL / 2);
    assert.equal(get('Suporte').prizeByMinutes, TOTAL / 2);
  });

  it('time sem nenhuma kill divide por kills igualmente', () => {
    const players = [...roster('A', 0), ...roster('B', 0)];
    const { players: result } = calculateResults([match('A', 'B', 'A', players)], TOTAL, [100]);
    assert.ok(result.filter((p) => p.team === 'A').every((p) => p.prizeByKills === TOTAL / 5));
  });

  it('times fora da premiação recebem zero', () => {
    const { players } = calculateResults([match('A', 'B', 'A')], TOTAL, [100]);
    assert.ok(players.filter((p) => p.team === 'B').every((p) => p.prizeByMinutes === 0 && p.prizeByKills === 0));
  });

  it('a soma de todos os jogadores é exatamente o prêmio total, nos dois critérios', () => {
    const odd = (team: string) =>
      [7, 11, 13, 17, 19].map((minutes, i) => ({ team, nick: `${team}${i}`, minutes, kills: i * 3 + 1 }));
    const teams = ['A', 'B', 'C', 'D'];
    const matches: EffectiveMatch[] = [];
    teams.forEach((a, i) => teams.slice(i + 1).forEach((b) => matches.push(match(a, b, a, [...odd(a), ...odd(b)]))));

    const { players } = calculateResults(matches, 1_234_567, [45.5, 33.3, 21.2]);
    assert.equal(players.reduce((sum, p) => sum + p.prizeByMinutes, 0), 1_234_567);
    assert.equal(players.reduce((sum, p) => sum + p.prizeByKills, 0), 1_234_567);
  });

  it('nick com caixa diferente entre partidas conta como o mesmo jogador', () => {
    const first = [...roster('A'), ...roster('B')];
    const second = [...roster('A').map((p) => ({ ...p, nick: p.nick.toLowerCase() })), ...roster('C')];
    const { players } = calculateResults([match('A', 'B', 'A', first), match('A', 'C', 'A', second)], TOTAL, [100]);
    assert.equal(players.filter((p) => p.team === 'A').length, 5);
  });
});
