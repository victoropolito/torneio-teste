import express from 'express';
import { db } from './db.js';

export const app = express();
app.use(express.json());

app.get('/api/health', (_req, res) => {
  const { ok } = db.prepare('SELECT 1 AS ok').get() as { ok: number };
  res.json({ status: 'ok', database: ok === 1 ? 'ok' : 'erro' });
});
