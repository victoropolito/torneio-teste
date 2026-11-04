import { Fragment, useState } from 'react';
import { formatDate } from '../format';
import type { Match, MatchCheck } from '../types';
import { ExpandButton } from './ExpandButton';
import { Pagination, usePagination } from './Pagination';
import { CHECK_LABEL, CheckBadge } from './OfficialCheck';
import { SortTh, useSort } from './Sortable';

const PAGE_SIZE = 15;

export function MatchList({ matches, checks }: { matches: Match[]; checks: MatchCheck[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const checkById = new Map(checks.map((check) => [check.externalId, check]));
  const checkStatus = (match: Match) => {
    const check = checkById.get(match.externalId);
    return check ? CHECK_LABEL[check.status].text : null;
  };

  const { rows, sorter } = useSort(matches, {
    id: (m) => m.externalId,
    round: (m) => -m.round, // primeiro clique: rodada 1 primeiro
    date: (m) => m.playedOn,
    matchup: (m) => `${m.teamA} x ${m.teamB}`,
    winner: (m) => m.winner,
    check: checkStatus,
  });
  const page = usePagination(rows, PAGE_SIZE, `${sorter.sort?.key}|${sorter.sort?.dir}`);

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh sorter={sorter} column="id">
                ID
              </SortTh>
              <SortTh sorter={sorter} column="round" className="num">
                Rodada
              </SortTh>
              <SortTh sorter={sorter} column="date">
                Data
              </SortTh>
              <SortTh sorter={sorter} column="matchup">
                Confronto
              </SortTh>
              <SortTh sorter={sorter} column="winner">
                Vencedor (planilha)
              </SortTh>
              <SortTh sorter={sorter} column="check">
                Site oficial
              </SortTh>
              <th className="expand-col" />
            </tr>
          </thead>
          <tbody>
            {page.rows.map((match) => {
              const isOpen = open === match.externalId;
              return (
                <Fragment key={match.externalId}>
                  <tr>
                    <td>
                      <strong>{match.externalId}</strong>
                    </td>
                    <td className="num">{match.round}</td>
                    <td>{formatDate(match.playedOn)}</td>
                    <td>
                      {match.teamA} x {match.teamB}
                    </td>
                    <td>{match.winner ?? <span className="badge warning">sem resultado</span>}</td>
                    <td>
                      <CheckBadge check={checkById.get(match.externalId)} />
                    </td>
                    <td className="expand-col">
                      <ExpandButton
                        open={isOpen}
                        onClick={() => setOpen(isOpen ? null : match.externalId)}
                        label="jogadores da partida"
                      />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="details">
                      <td colSpan={7}>
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
      </div>
      <Pagination state={page} noun="partidas" />
    </>
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
