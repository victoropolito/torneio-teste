import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError } from '../errors.js';
import { readCsv } from './csv.js';
import { validateSheet } from './validate.js';

const HEADER = 'Data;Rodada;ID Partida;Partida;Time;Nick;Minutos;Kills;Venceu?';

/** Linhas de uma partida completa 5x5 entre A e B, vencida por A. */
function matchRows(id = '#1', a = 'Lobos', b = 'Corvos', date = '05/09/2026', round = 1): string[] {
  const rows: string[] = [];
  for (const [team, won] of [[a, 'sim'], [b, 'não']]) {
    for (let i = 1; i <= 5; i++) rows.push(`${date};${round};${id};${a} x ${b};${team};${team}${i};40;${i};${won}`);
  }
  return rows;
}

const sheet = (lines: string[], header = HEADER) => validateSheet(readCsv(Buffer.from([header, ...lines].join('\n'))));
const codes = (lines: string[]) => sheet(lines).issues.map((issue) => issue.code);

describe('readCsv', () => {
  it('lê Windows-1252 (Excel pt-BR) e UTF-8 igual', () => {
    const text = `${HEADER}\n05/09/2026;1;#1;Lobos x Tubarões;Tubarões;Tchê;40;1;não\n`;
    const utf8 = readCsv(Buffer.from(text, 'utf8'));
    const latin1 = readCsv(Buffer.from(text, 'latin1'));
    assert.deepEqual(latin1, utf8);
    assert.equal(utf8[1][5], 'Tchê');
  });

  it('aceita vírgula como separador', () => {
    const rows = readCsv(Buffer.from('Data,Rodada\n05/09/2026,1\n'));
    assert.deepEqual(rows[1], ['05/09/2026', '1']);
  });
});

describe('validateSheet', () => {
  it('planilha correta: partida, vencedor e nenhuma linha descartada', () => {
    const result = sheet(matchRows());
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].winner, 'Lobos');
    assert.equal(result.matches[0].playedOn, '2026-09-05');
    assert.equal(result.stats.acceptedRows, 10);
    assert.equal(result.issues.filter((i) => i.severity === 'error').length, 0);
  });

  it('cabeçalho sem acento, caixa ou "?" é aceito', () => {
    const result = sheet(matchRows(), 'data;RODADA;id partida;Partida;time;nick;minutos;kills;venceu');
    assert.equal(result.matches.length, 1);
  });

  it('coluna obrigatória ausente rejeita o arquivo', () => {
    assert.throws(() => sheet([], 'Data;Rodada;Partida'), AppError);
  });

  it('remove duplicata idêntica com aviso', () => {
    const rows = matchRows();
    const result = sheet([...rows, rows[0]]);
    assert.equal(result.stats.duplicateRows, 1);
    assert.equal(result.matches[0].players.length, 10);
    assert.ok(result.issues.some((i) => i.code === 'DUPLICATE_ROW' && i.severity === 'warning'));
  });

  it('nick repetido com dados diferentes mantém a primeira e descarta a segunda', () => {
    const rows = matchRows();
    const result = sheet([...rows, rows[0].replace(';40;1;', ';40;9;')]);
    assert.equal(result.stats.rejectedRows, 1);
    assert.ok(result.issues.some((i) => i.code === 'CONFLICTING_ROW' && i.severity === 'error'));
  });

  it('unifica nicks que só diferem por maiúsculas, usando a grafia mais frequente', () => {
    const second = matchRows('#2', 'Lobos', 'Panteras', '06/09/2026', 2).map((r) => r.replace(';Lobos1;', ';LOBOS1;'));
    const third = matchRows('#3', 'Lobos', 'Serpentes', '07/09/2026', 3);
    const result = sheet([...matchRows(), ...second, ...third]);
    const nicks = result.matches.flatMap((m) => m.players.map((p) => p.nick));
    assert.ok(!nicks.includes('LOBOS1'));
    assert.ok(result.issues.some((i) => i.code === 'NICK_CASE_UNIFIED'));
  });

  it('6 jogadores num time = substituição (info)', () => {
    const rows = matchRows();
    rows[4] = rows[4].replace(';40;', ';20;');
    rows.push('05/09/2026;1;#1;Lobos x Corvos;Lobos;Reserva;20;2;sim');
    assert.ok(codes(rows).includes('SUBSTITUTION'));
  });

  it('time com menos de 5 jogadores = aviso', () => {
    assert.ok(codes(matchRows().slice(1)).includes('TEAM_INCOMPLETE'));
  });

  it('"Venceu?" vazio nos dois times = sem resultado (vencedor fica para o site)', () => {
    const rows = matchRows().map((r) => r.replace(/;(sim|não)$/, ';').replace(';40;', ';0;').replace(/;\d+;$/, ';0;'));
    const result = sheet(rows);
    assert.equal(result.matches[0].winner, null);
    assert.ok(result.issues.some((i) => i.code === 'MATCH_WITHOUT_RESULT'));
  });

  it('"Venceu?" contraditório = erro de vencedor inconsistente', () => {
    const rows = matchRows();
    rows[0] = rows[0].replace(/sim$/, 'não');
    const result = sheet(rows);
    assert.equal(result.matches[0].winner, null);
    assert.ok(codes(rows).includes('WINNER_INCONSISTENT'));
  });

  it('rejeita linhas inválidas com o motivo e mantém as demais', () => {
    const bad = [
      '31/02/2026;1;#9;Lobos x Corvos;Lobos;X;40;1;sim',
      '05/09/2026;1;#9;Lobos x Corvos;Panteras;X;40;1;sim',
      '05/09/2026;1;#9;Lobos x Corvos;Lobos;X;quarenta;1;sim',
      '05/09/2026;1;#9;Lobos x Corvos;Lobos;X;40;-1;sim',
      '05/09/2026;1;#9;Lobos x Corvos;Lobos;X;40;1;talvez',
    ];
    const result = sheet([...matchRows(), ...bad]);
    assert.equal(result.stats.rejectedRows, 5);
    assert.deepEqual(
      result.issues.filter((i) => i.severity === 'error').map((i) => i.code),
      ['INVALID_DATE', 'TEAM_NOT_IN_MATCH', 'INVALID_MINUTES', 'INVALID_KILLS', 'INVALID_WON'],
    );
    assert.equal(result.matches.length, 1);
  });

  it('ID sem "#" é normalizado', () => {
    const result = sheet(matchRows('45659'));
    assert.equal(result.matches[0].externalId, '#45659');
  });

  it('acusa todos contra todos incompleto', () => {
    const rows = [...matchRows('#1', 'A', 'B'), ...matchRows('#2', 'A', 'C', '06/09/2026', 2)];
    assert.ok(codes(rows).includes('ROUND_ROBIN_INCOMPLETE'));
  });
});
