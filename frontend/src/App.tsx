import { HomePage } from './pages/HomePage';
import { TournamentPage } from './pages/TournamentPage';
import { useHashRoute } from './useHashRoute';

export function App() {
  const { tournamentId } = useHashRoute();

  return (
    <div className="app">
      <header className="app-header">
        <a href="#" className="brand">
          🏆 Torneios
        </a>
      </header>
      <main className="container">{tournamentId ? <TournamentPage id={tournamentId} /> : <HomePage />}</main>
    </div>
  );
}
