import { formatCents, formatDateTime } from '../format';
import type { TournamentSummary } from '../types';
import { IssueBadges } from './IssueBadges';

export function TournamentList({ tournaments }: { tournaments: TournamentSummary[] }) {
  if (!tournaments.length) return <p className="muted">Nenhum torneio importado ainda.</p>;

  return (
    <table>
      <thead>
        <tr>
          <th>Torneio</th>
          <th>Importado em</th>
          <th className="num">Partidas</th>
          <th className="num">Prêmio</th>
          <th>Importação</th>
        </tr>
      </thead>
      <tbody>
        {tournaments.map((t) => (
          <tr key={t.id}>
            <td>
              <a href={`#/torneios/${t.id}`}>{t.name}</a>
              <div className="muted small">{t.sourceFilename}</div>
            </td>
            <td>{formatDateTime(t.createdAt)}</td>
            <td className="num">{t.matchCount}</td>
            <td className="num">{formatCents(t.prizeTotalCents)}</td>
            <td>
              <IssueBadges counts={t.issueCounts} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
