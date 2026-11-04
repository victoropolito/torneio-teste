import { formatCents, formatPercent } from '../format';
import type { TeamStanding, Tiebreak } from '../types';
import { SortTh, useSort } from './Sortable';

export const TIEBREAK_LABEL: Record<Tiebreak, string> = {
  head_to_head: 'confronto direto',
  kill_balance: 'saldo de kills',
  fewer_players: 'menos jogadores utilizados',
};

export function Standings({ standings }: { standings: TeamStanding[] }) {
  const hasSharedPosition = standings.some((s) => s.sharedPosition);
  const { rows, sorter } = useSort(standings, {
    position: (s) => -s.position,
    team: (s) => s.team,
    wins: (s) => s.wins,
    losses: (s) => s.losses,
    balance: (s) => s.killBalance,
    players: (s) => s.playersUsed,
    tiebreak: (s) => (s.tiebreak ? TIEBREAK_LABEL[s.tiebreak] : s.sharedPosition ? 'empate total' : null),
    prize: (s) => s.prizeCents,
  });

  return (
    <>
      <table>
        <thead>
          <tr>
            <SortTh sorter={sorter} column="position" className="num">
              Pos.
            </SortTh>
            <SortTh sorter={sorter} column="team">
              Time
            </SortTh>
            <SortTh sorter={sorter} column="wins" className="num">
              Vitórias
            </SortTh>
            <SortTh sorter={sorter} column="losses" className="num">
              Derrotas
            </SortTh>
            <SortTh sorter={sorter} column="balance" className="num">
              Saldo de kills
            </SortTh>
            <SortTh sorter={sorter} column="players" className="num">
              Jogadores
            </SortTh>
            <SortTh sorter={sorter} column="tiebreak">
              Desempate
            </SortTh>
            <SortTh sorter={sorter} column="prize" className="num">
              Prêmio do time
            </SortTh>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
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
