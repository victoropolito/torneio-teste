import express, { type ErrorRequestHandler } from 'express';
import multer from 'multer';
import { db } from './db.js';
import { AppError } from './errors.js';
import { tournamentsRouter } from './tournaments/routes.js';

export const app = express();
app.use(express.json());

app.get('/api/health', (_req, res) => {
  const { ok } = db.prepare('SELECT 1 AS ok').get() as { ok: number };
  res.json({ status: 'ok', database: ok === 1 ? 'ok' : 'erro' });
});

app.use('/api/tournaments', tournamentsRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
  } else if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo muito grande (máx. 2 MB).' : err.message;
    res.status(400).json({ error: message });
  } else {
    console.error(err);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
};
app.use(errorHandler);
