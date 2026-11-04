import { formatCents, formatPercent } from '../format';
import type { TeamStanding, Tiebreak } from '../types';

export const TIEBREAK_LABEL: Record<Tiebreak, string> = {
  head_to_head: 'confronto direto',
  kill_balance: 'saldo de kills',
  fewer_players: 'menos jogadores utilizados',
};

export function Standings({ standings }: { standings: TeamStanding[] }) {
  const hasSharedPosition = standings.some((s) => s.sharedPosition);

  return (
    <>
      <table>
        <thead>
          <tr>
            <th className="num">Pos.</th>
            <th>Time</th>
            <th className="num">Vitórias</th>
            <th className="num">Derrotas</th>
            <th className="num">Saldo de kills</th>
            <th className="num">Jogadores</th>
            <th>Desempate</th>
            <th className="num">Prêmio do time</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr key={s.team}>
              <td className="num">
                {s.position}º{s.sharedPosition && '*'}
              </td>
              <td>
                <strong>{s.team}</strong>
              </td>
              <td className="num">{s.wins}</td>
              <td className="num">{s.losses}</td>
              <td className="num">
                {s.killBalance > 0 ? '+' : ''}
                {s.killBalance}
              </td>
              <td className="num">{s.playersUsed}</td>
              <td className="muted">{s.tiebreak ? TIEBREAK_LABEL[s.tiebreak] : s.sharedPosition ? 'empate total' : ''}</td>
              <td className="num">
                {s.prizeCents > 0 ? (
                  <>
                    {formatCents(s.prizeCents)} <span className="muted">({formatPercent(s.prizePercent)})</span>
                  </>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        Classificação por vitórias. Desempate: confronto direto, saldo de kills (feitas − sofridas) e menos jogadores
        utilizados.
        {hasSharedPosition && ' * Empate em todos os critérios: os times dividem igualmente os prêmios das posições que ocupam.'}
      </p>
    </>
  );
}
