import { Fragment, useState } from 'react';
import { formatDate } from '../format';
import type { Match } from '../types';

export function MatchList({ matches }: { matches: Match[] }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <table>
      <thead>
        <tr>
          <th className="num">Rodada</th>
          <th>Data</th>
          <th>ID</th>
          <th>Confronto</th>
          <th>Vencedor (planilha)</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {matches.map((match) => {
          const isOpen = open === match.externalId;
          return (
            <Fragment key={match.externalId}>
              <tr>
                <td className="num">{match.round}</td>
                <td>{formatDate(match.playedOn)}</td>
                <td>{match.externalId}</td>
                <td>
                  {match.teamA} x {match.teamB}
                </td>
                <td>{match.winner ?? <span className="badge warning">sem resultado</span>}</td>
                <td>
                  <button className="link" onClick={() => setOpen(isOpen ? null : match.externalId)}>
                    {isOpen ? 'ocultar' : 'jogadores'}
                  </button>
                </td>
              </tr>
              {isOpen && (
                <tr className="details">
                  <td colSpan={6}>
                    <div className="teams">
                      {[match.teamA, match.teamB].map((team) => (
                        <TeamPlayers key={team} team={team} match={match} />
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function TeamPlayers({ team, match }: { team: string; match: Match }) {
  const players = match.players.filter((player) => player.team === team);
  return (
    <div>
      <h4>
        {team} {match.winner === team && '🏆'}
      </h4>
      <table className="compact">
        <thead>
          <tr>
            <th>Nick</th>
            <th className="num">Minutos</th>
            <th className="num">Kills</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr key={player.nick}>
              <td>{player.nick}</td>
              <td className="num">{player.minutes}</td>
              <td className="num">{player.kills}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
