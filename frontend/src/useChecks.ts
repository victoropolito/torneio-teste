import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { TournamentChecks } from './types';

const POLL_MS = 2000;

/** Acompanha a conferência do torneio; consulta a cada 2 s enquanto houver fila. */
export function useChecks(tournamentId: number) {
  const [checks, setChecks] = useState<TournamentChecks | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Incrementado na reconferência para religar o polling. */
  const [round, setRound] = useState(0);

  useEffect(() => setChecks(null), [tournamentId]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const load = () => {
      api
        .getChecks(tournamentId)
        .then((data) => {
          if (cancelled) return;
          setChecks(data);
          setError(null);
          if (!data.finished) timer = window.setTimeout(load, POLL_MS);
        })
        .catch((err: Error) => {
          if (cancelled) return;
          setError(err.message);
          timer = window.setTimeout(load, POLL_MS * 2); // back fora do ar: continua tentando
        });
    };

    load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tournamentId, round]);

  const retry = useCallback(async () => {
    setChecks(await api.retryChecks(tournamentId));
    setRound((n) => n + 1);
  }, [tournamentId]);

  return { checks, error, retry };
}
