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
    api.listTournaments().then(setTournaments).catch((err: Error) => setError(err.message));
  }, []);

  return (
    <>
      <section className="card">
        <h2>Importar planilha</h2>
        <UploadForm onImported={(tournament) => navigate.tournament(tournament.id)} />
      </section>

      <section className="card">
        <h2>Torneios importados</h2>
        {error && <p className="error">{error}</p>}
        {!error && !tournaments && <p className="muted">Carregando…</p>}
        {tournaments && <TournamentList tournaments={tournaments} />}
      </section>
    </>
  );
}
