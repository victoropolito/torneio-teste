import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

/**
 * Sobe um servidor HTTP local que imita os comportamentos do site oficial
 * (200, 404, 503, sem resposta, JSON inválido) e verifica como o cliente
 * classifica cada um: encontrada, não encontrada, temporária ou definitiva.
 */
let server: Server;
let client: typeof import('./client.js');

const MATCH = {
  matchId: '1',
  playedAt: '2026-09-05T20:00:00Z',
  teams: [
    { name: 'Lobos', result: 'win', players: [{ nickname: 'Pipoca', minutesPlayed: 40, kills: 10 }] },
    { name: 'Corvos', result: 'loss', players: [{ nickname: 'Zeca', minutesPlayed: 40, kills: 5 }] },
  ],
};

before(async () => {
  server = createServer((req, res) => {
    const id = req.url!.split('/').pop();
    const send = (status: number, body: string) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(body);
    if (id === '1') send(200, JSON.stringify(MATCH));
    else if (id === '404') send(404, '{"error":"Match not found"}');
    else if (id === '503') send(503, '{"error":"unavailable"}');
    else if (id === '400') send(400, '{}');
    else if (id === 'broken') send(200, '{"matchId": ');
    else if (id === 'weird') send(200, '{"foo": 1}');
    // 'hang': nunca responde
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  process.env.OFFICIAL_API_URL = `http://localhost:${(server.address() as AddressInfo).port}`;
  process.env.OFFICIAL_TIMEOUT_MS = '300';
  client = await import('./client.js'); // lê a configuração ao carregar
});

after(() => {
  server.closeAllConnections();
  server.close();
});

describe('fetchOfficialMatch', () => {
  it('traduz a resposta para o formato do domínio (e aceita "#" no ID)', async () => {
    const result = await client.fetchOfficialMatch('#1');
    assert.deepEqual(result, {
      kind: 'found',
      match: {
        externalId: '#1',
        playedOn: '2026-09-05',
        teams: ['Lobos', 'Corvos'],
        winner: 'Lobos',
        players: [
          { team: 'Lobos', nick: 'Pipoca', minutes: 40, kills: 10 },
          { team: 'Corvos', nick: 'Zeca', minutes: 40, kills: 5 },
        ],
      },
    });
  });

  it('404 = partida não encontrada (não é erro)', async () => {
    assert.deepEqual(await client.fetchOfficialMatch('#404'), { kind: 'not_found' });
  });

  it('503 e JSON cortado = falha temporária (vale retry)', async () => {
    await assert.rejects(client.fetchOfficialMatch('#503'), client.TransientError);
    await assert.rejects(client.fetchOfficialMatch('#broken'), client.TransientError);
  });

  it('sem resposta = falha temporária por timeout', async () => {
    await assert.rejects(client.fetchOfficialMatch('#hang'), (err: Error) => {
      assert.ok(err instanceof client.TransientError);
      assert.match(err.message, /não respondeu/);
      return true;
    });
  });

  it('4xx e formato inesperado = falha definitiva (não adianta repetir)', async () => {
    await assert.rejects(client.fetchOfficialMatch('#400'), client.PermanentError);
    await assert.rejects(client.fetchOfficialMatch('#weird'), client.PermanentError);
  });
});
