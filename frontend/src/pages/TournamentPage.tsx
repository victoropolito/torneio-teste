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
    api
      .getTournament(id)
      .then(setTournament)
      .catch((err: Error) => setError(err.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!tournament) return <p className="muted">Carregando…</p>;

  return (
    <>
      <section className="page-header">
        <a href="#" className="back-link">
          ← Todos os torneios
        </a>
        <h1>{tournament.name}</h1>
        <p className="muted small">
          {tournament.sourceFilename} · importado em {formatDateTime(tournament.createdAt)}
        </p>
        <dl className="stats">
          <div className="stat">
            <dt>Prêmio total</dt>
            <dd>{formatCents(tournament.prizeTotalCents)}</dd>
          </div>
          <div className="stat">
            <dt>Divisão</dt>
            <dd>{tournament.prizeSplit.map((percent, i) => `${i + 1}º ${percent}%`).join(' · ')}</dd>
          </div>
          <div className="stat">
            <dt>Partidas</dt>
            <dd>{tournament.matchCount}</dd>
          </div>
          <div className="stat">
            <dt>Importação</dt>
            <dd>
              <IssueBadges counts={tournament.issueCounts} />
            </dd>
          </div>
        </dl>
      </section>

      <section className="card">
        <header className="card-header">
          <h2>Prêmios</h2>
          <p className="muted small">Classificação final e quanto cada jogador recebe.</p>
        </header>
        <Results tournamentId={id} refreshKey={resultsKey} />
      </section>

      <section className="card">
        <header className="card-header">
          <h2>Conferência no site oficial</h2>
          <p className="muted small">Cada partida da planilha comparada com o registro oficial do jogo.</p>
        </header>
        <OfficialCheck checks={checks.checks} error={checks.error} onRetry={checks.retry} />
      </section>

      <section className="card">
        <header className="card-header">
          <h2>Relatório da importação</h2>
          <p className="muted small">O que foi corrigido, interpretado ou descartado ao ler a planilha.</p>
        </header>
        <ImportReport issues={tournament.issues} />
      </section>

      <section className="card">
        <header className="card-header">
          <h2>Partidas</h2>
          <p className="muted small">Como estão na planilha. Abra uma partida para ver os jogadores.</p>
        </header>
        <MatchList matches={tournament.matches} checks={checks.checks?.matches ?? []} />
      </section>
    </>
  );
}
