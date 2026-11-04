import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ParsedMatch } from '../import/validate.js';
import type { OfficialMatch } from './client.js';
import { compareMatch } from './compare.js';

const sheet = (): ParsedMatch => ({
  externalId: '#1',
  round: 1,
  playedOn: '2026-09-05',
  teamA: 'Lobos',
  teamB: 'Corvos',
  winner: 'Lobos',
  players: [
    { team: 'Lobos', nick: 'Pipoca', minutes: 40, kills: 10 },
    { team: 'Corvos', nick: 'Zeca', minutes: 40, kills: 5 },
  ],
});

const official = (): OfficialMatch => ({
  externalId: '#1',
  playedOn: '2026-09-05',
  teams: ['Corvos', 'Lobos'], // ordem diferente não é divergência
  winner: 'Lobos',
  players: [
    { team: 'Lobos', nick: 'Pipoca', minutes: 40, kills: 10 },
    { team: 'Corvos', nick: 'Zeca', minutes: 40, kills: 5 },
  ],
});

const codes = (s: ParsedMatch, o: OfficialMatch) => compareMatch(s, o).map((d) => d.code);

describe('compareMatch', () => {
  it('partidas iguais não geram divergência', () => {
    assert.deepEqual(compareMatch(sheet(), official()), []);
  });

  it('nick com caixa diferente é o mesmo jogador', () => {
    const o = official();
    o.players[0].nick = 'PIPOCA';
    assert.deepEqual(codes(sheet(), o), []);
  });

  it('detecta kills e minutos diferentes, com os dois valores', () => {
    const o = official();
    o.players[0].kills = 12;
    o.players[1].minutes = 35;
    const result = compareMatch(sheet(), o);
    assert.deepEqual(result.map((d) => d.code), ['kills', 'minutes']);
    assert.deepEqual(
      { nick: result[0].nick, sheet: result[0].sheetValue, site: result[0].officialValue },
      { nick: 'Pipoca', sheet: '10', site: '12' },
    );
  });

  it('detecta vencedor, data e times diferentes', () => {
    const o = official();
    o.winner = 'Corvos';
    o.playedOn = '2026-09-06';
    o.teams = ['Lobos', 'Panteras'];
    assert.deepEqual(codes(sheet(), o).sort(), ['date', 'teams', 'winner']);
  });

  it('detecta jogador só na planilha, só no site e em outro time', () => {
    const o = official();
    o.players = [
      { team: 'Corvos', nick: 'Pipoca', minutes: 40, kills: 10 },
      { team: 'Corvos', nick: 'Sucuri', minutes: 14, kills: 3 },
    ];
    assert.deepEqual(codes(sheet(), o).sort(), ['player_missing_on_sheet', 'player_missing_on_site', 'player_team']);
  });

  it('planilha sem resultado mas com estatísticas: divergência de vencedor', () => {
    const s = sheet();
    s.winner = null;
    assert.deepEqual(codes(s, official()), ['winner']);
  });

  it('planilha não preenchida (sem vencedor, 0 minutos) vira um único aviso', () => {
    const s = sheet();
    s.winner = null;
    s.players = s.players.map((p) => ({ ...p, minutes: 0, kills: 0 }));
    const result = compareMatch(s, official());
    assert.deepEqual(result.map((d) => d.code), ['sheet_incomplete']);
    assert.equal(result[0].officialValue, 'Lobos');
  });
});
