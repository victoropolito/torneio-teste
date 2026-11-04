import { useEffect, useState } from 'react';
import { api } from '../api';
import { TournamentList } from '../components/TournamentList';
import { UploadForm } from '../components/UploadForm';
import type { TournamentSummary } from '../types';
import { navigate } from '../useHashRoute';

export function HomePage() {
  const [tournaments, setTournaments] = useState<TournamentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listTournaments()
      .then(setTournaments)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <>
      <section className="card">
        <header className="card-header">
          <h2>Importar planilha</h2>
          <p className="muted small">
            Envie o CSV exportado do Excel. As partidas são conferidas automaticamente no site oficial.
          </p>
        </header>
        <UploadForm onImported={(tournament) => navigate.tournament(tournament.id)} />
      </section>

      <section className="card">
        <header className="card-header">
          <h2>Torneios importados</h2>
        </header>
        {error && <p className="error">{error}</p>}
        {!error && !tournaments && <p className="muted">Carregando…</p>}
        {tournaments && <TournamentList tournaments={tournaments} />}
      </section>
    </>
  );
}
