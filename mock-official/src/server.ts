/**
 * Simulador do site oficial do jogo.
 *
 * Comportamento descrito pela Maria Clara, reproduzido aqui:
 * - consulta pelo ID da partida, uma por vez;
 * - cada consulta leva de 2 a 10 segundos;
 * - de vez em quando fica fora do ar (503) ou simplesmente não responde.
 *
 * Os dados vêm de `data/matches.json`, que tem divergências plantadas de
 * propósito em relação à planilha (ver README do simulador no ARCHITECTURE.md).
 */
import express from 'express';
import { readFileSync } from 'node:fs';

const env = (name: string, fallback: number) => Number(process.env[name] ?? fallback);

const config = {
  port: env('PORT', 4000),
  minDelayMs: env('MOCK_MIN_DELAY_MS', 2000),
  maxDelayMs: env('MOCK_MAX_DELAY_MS', 10000),
  /** Probabilidade de responder 503 (fora do ar). */
  failureRate: env('MOCK_FAILURE_RATE', 0.15),
  /** Probabilidade de nunca responder (o cliente precisa de timeout). */
  hangRate: env('MOCK_HANG_RATE', 0.05),
};

const matches = JSON.parse(
  readFileSync(new URL('../data/matches.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const randomDelay = () => config.minDelayMs + Math.random() * (config.maxDelayMs - config.minDelayMs);

const app = express();

app.get('/api/matches/:id', async (req, res) => {
  const id = req.params.id.replace(/^#/, '');
  const roll = Math.random();

  if (roll < config.hangRate) {
    console.log(`GET ${id} → sem resposta`);
    return; // conexão fica aberta até o cliente desistir
  }

  await sleep(randomDelay());

  if (roll < config.hangRate + config.failureRate) {
    console.log(`GET ${id} → 503`);
    res.status(503).json({ error: 'Service temporarily unavailable' });
    return;
  }

  const match = matches[id];
  if (!match) {
    console.log(`GET ${id} → 404`);
    res.status(404).json({ error: 'Match not found' });
    return;
  }

  console.log(`GET ${id} → 200`);
  res.json(match);
});

app.listen(config.port, () => {
  console.log(`Site oficial simulado em http://localhost:${config.port}`, config);
});
