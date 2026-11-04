import { HomePage } from './pages/HomePage';
import { TournamentPage } from './pages/TournamentPage';
import { useHashRoute } from './useHashRoute';

export function App() {
  const { tournamentId } = useHashRoute();

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <a href="#" className="brand">
            <span className="brand-mark" aria-hidden>
              🏆
            </span>
            <span>
              <strong>Torneios</strong>
              <small>Conferência e prêmios</small>
            </span>
          </a>
        </div>
      </header>
      <main className="container">{tournamentId ? <TournamentPage id={tournamentId} /> : <HomePage />}</main>
    </div>
  );
}
