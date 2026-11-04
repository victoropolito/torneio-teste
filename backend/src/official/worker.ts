/**
 * Conferência em background: consome a fila `match_checks`, consulta o site
 * oficial com concorrência limitada e reagenda falhas temporárias com backoff
 * exponencial. O estado fica no SQLite, então reiniciar o back não perde nada.
 */
import { fetchOfficialMatch, PermanentError, TransientError } from './client.js';
import { compareMatch } from './compare.js';
import {
  claimJobs,
  getSheetMatch,
  nextPendingAt,
  requeueInterrupted,
  saveFailed,
  saveFound,
  saveNotFound,
  scheduleRetry,
  type CheckJob,
} from './repository.js';

const env = (name: string, fallback: number) => Number(process.env[name] ?? fallback);

const CONCURRENCY = env('OFFICIAL_CONCURRENCY', 3);
const MAX_ATTEMPTS = env('OFFICIAL_MAX_ATTEMPTS', 5);
const RETRY_BASE_MS = env('OFFICIAL_RETRY_BASE_MS', 2000);
const RETRY_MAX_MS = 60_000;
/** Mesmo sem aviso, olha a fila de tempos em tempos. */
const IDLE_POLL_MS = 5000;

let active = 0;
let timer: NodeJS.Timeout | undefined;

/** 2 s, 4 s, 8 s, 16 s… (+ até 1 s aleatório para não sincronizar as tentativas). */
export function retryDelay(previousAttempts: number): number {
  return Math.round(Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** previousAttempts) + Math.random() * 1000);
}

function schedule(delayMs: number) {
  clearTimeout(timer);
  timer = setTimeout(tick, Math.max(0, delayMs));
}

function tick() {
  const free = CONCURRENCY - active;
  if (free > 0) {
    for (const job of claimJobs(free, Date.now())) {
      active++;
      void runCheck(job).finally(() => {
        active--;
        schedule(0);
      });
    }
  }
  // Com todas as vagas ocupadas, quem terminar chama schedule(0).
  const next = active < CONCURRENCY ? nextPendingAt() : null;
  const wait = next === null ? IDLE_POLL_MS : Math.min(IDLE_POLL_MS, next - Date.now());
  schedule(wait);
}

async function runCheck(job: CheckJob): Promise<void> {
  const sheet = getSheetMatch(job.matchId);
  if (!sheet) return; // torneio apagado no meio da consulta

  try {
    const result = await fetchOfficialMatch(sheet.externalId);
    if (result.kind === 'not_found') {
      saveNotFound(job.matchId);
    } else {
      saveFound(job.matchId, result.match, compareMatch(sheet, result.match));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = job.attempts + 1;
    if (err instanceof TransientError && attempts < MAX_ATTEMPTS) {
      scheduleRetry(job.matchId, message, Date.now() + retryDelay(job.attempts));
    } else {
      if (!(err instanceof TransientError || err instanceof PermanentError)) console.error(err);
      const suffix = err instanceof TransientError ? ` (desistiu após ${attempts} tentativas)` : '';
      saveFailed(job.matchId, message + suffix);
    }
  }
}

export function startCheckWorker(): void {
  const requeued = requeueInterrupted();
  if (requeued) console.log(`Conferência: ${requeued} consulta(s) interrompida(s) voltaram para a fila.`);
  console.log(`Conferência no site oficial ativa (concorrência ${CONCURRENCY}, até ${MAX_ATTEMPTS} tentativas).`);
  schedule(0);
}

/** Avisa que há trabalho novo (upload, reconferência) sem esperar o próximo ciclo. */
export function wakeCheckWorker(): void {
  if (timer) schedule(0);
}
