import { useEffect, useState } from 'react';
import { api } from '../api';
import { ImportReport } from '../components/ImportReport';
import { IssueBadges } from '../components/IssueBadges';
import { MatchList } from '../components/MatchList';
import { OfficialCheck } from '../components/OfficialCheck';
import { Results } from '../components/Results';
import { formatCents, formatDateTime } from '../format';
import type { TournamentDetail } from '../types';
import { useChecks } from '../useChecks';

export function TournamentPage({ id }: { id: number }) {
  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const checks = useChecks(id);
  // Recalcula os prêmios a cada partida conferida.
  const counts = checks.checks?.counts;
  const resultsKey = counts ? Object.values(counts).join('-') : '';

  useEffect(() => {
    setTournament(null);
    setError(null);
    api.getTournament(id).then(setTournament).catch((err: Error) => setError(err.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!tournament) return <p className="muted">Carregando…</p>;

  return (
    <>
      <section className="card">
        <a href="#" className="small">
          ← voltar
        </a>
        <h1>{tournament.name}</h1>
        <dl className="summary">
          <div>
            <dt>Planilha</dt>
            <dd>{tournament.sourceFilename}</dd>
          </div>
          <div>
            <dt>Importado em</dt>
            <dd>{formatDateTime(tournament.createdAt)}</dd>
          </div>
          <div>
            <dt>Partidas</dt>
            <dd>{tournament.matchCount}</dd>
          </div>
          <div>
            <dt>Prêmio</dt>
            <dd>
              {formatCents(tournament.prizeTotalCents)}{' '}
              <span className="muted">
                ({tournament.prizeSplit.map((percent, i) => `${i + 1}º ${percent}%`).join(' · ')})
              </span>
            </dd>
          </div>
          <div>
            <dt>Importação</dt>
            <dd>
              <IssueBadges counts={tournament.issueCounts} />
            </dd>
          </div>
        </dl>
      </section>

      <section className="card">
        <h2>Prêmios</h2>
        <Results tournamentId={id} refreshKey={resultsKey} />
      </section>

      <section className="card">
        <h2>Conferência no site oficial</h2>
        <OfficialCheck checks={checks.checks} error={checks.error} onRetry={checks.retry} />
      </section>

      <section className="card">
        <h2>Relatório da importação</h2>
        <ImportReport issues={tournament.issues} />
      </section>

      <section className="card">
        <h2>Partidas</h2>
        <MatchList matches={tournament.matches} checks={checks.checks?.matches ?? []} />
      </section>
    </>
  );
}
