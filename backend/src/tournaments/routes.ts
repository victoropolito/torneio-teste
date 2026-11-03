import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { AppError } from '../errors.js';
import { readCsv } from '../import/csv.js';
import { validateSheet } from '../import/validate.js';
import { createTournament, getTournament, listTournaments } from './repository.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

export const tournamentsRouter = Router();

/** Aceita "10000", "10000.50" ou "10.000,50". */
function parsePrizeTotal(value: unknown): number {
  const text = String(value ?? '').trim();
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  const amount = Number(normalized);
  if (!text || !Number.isFinite(amount) || amount <= 0) {
    throw new AppError('Valor do prêmio inválido.');
  }
  return Math.round(amount * 100);
}

/** "50,30,20" -> [50, 30, 20]; precisa somar 100. */
function parsePrizeSplit(value: unknown): number[] {
  const split = String(value ?? '')
    .split(/[,;/ ]+/)
    .filter(Boolean)
    .map(Number);
  if (!split.length || split.some((percent) => !Number.isFinite(percent) || percent <= 0)) {
    throw new AppError('Divisão do prêmio inválida: informe percentuais positivos, ex.: 50,30,20.');
  }
  const total = split.reduce((sum, percent) => sum + percent, 0);
  if (Math.abs(total - 100) > 0.001) {
    throw new AppError(`A divisão do prêmio precisa somar 100% (soma atual: ${total}%).`);
  }
  return split;
}

tournamentsRouter.get('/', (_req, res) => {
  res.json(listTournaments());
});

tournamentsRouter.get('/:id', (req, res) => {
  const tournament = getTournament(Number(req.params.id));
  if (!tournament) throw new AppError('Torneio não encontrado.', 404);
  res.json(tournament);
});

tournamentsRouter.post('/', upload.single('file'), (req, res) => {
  if (!req.file) throw new AppError('Envie a planilha no campo "file".');

  const prizeTotalCents = parsePrizeTotal(req.body.prizeTotal);
  const prizeSplit = parsePrizeSplit(req.body.prizeSplit);
  const sourceFilename = req.file.originalname;
  const name = String(req.body.name ?? '').trim() || path.parse(sourceFilename).name;

  const result = validateSheet(readCsv(req.file.buffer));
  if (!result.matches.length) {
    throw new AppError('Nenhuma linha válida na planilha; nada foi importado.', 422);
  }

  const teamCount = new Set(result.matches.flatMap((match) => [match.teamA, match.teamB])).size;
  if (prizeSplit.length > teamCount) {
    throw new AppError(`A divisão tem ${prizeSplit.length} colocações premiadas, mas o torneio só tem ${teamCount} times.`);
  }

  const id = createTournament({ name, sourceFilename, prizeTotalCents, prizeSplit }, result);
  res.status(201).json({ ...getTournament(id), stats: result.stats });
});
