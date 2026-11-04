import { Fragment, useMemo, useState } from 'react';
import { formatCents, formatPercent, normalizeSearch } from '../format';
import type { PlayerPrize, PrizeBasis, TeamStanding } from '../types';
import { ExpandButton } from './ExpandButton';
import { SortTh, useSort } from './Sortable';

interface Props {
  players: PlayerPrize[];
  standings: TeamStanding[];
  basis: PrizeBasis;
}

const share = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);

export function PlayerPrizes({ players, standings, basis }: Props) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const visible = useMemo(() => {
    const term = normalizeSearch(search);
    return players
      .filter((p) => !term || normalizeSearch(p.nick).includes(term) || normalizeSearch(p.team).includes(term))
      .sort((a, b) => b.prizeCents - a.prizeCents || a.position - b.position || a.nick.localeCompare(b.nick));
  }, [players, search]);

  const { rows, sorter } = useSort(visible, {
    nick: (p) => p.nick,
    team: (p) => p.team,
    position: (p) => -p.position, // "maior" = melhor colocação
    minutes: (p) => p.minutes,
    kills: (p) => p.kills,
    byMinutes: (p) => p.prizeByMinutes,
    byKills: (p) => p.prizeByKills,
  });

  const teamPrize = new Map(standings.map((s) => [s.team, s]));
  const key = (p: PlayerPrize) => `${p.team}/${p.nick}`;

  return (
    <>
      <div className="filters">
        <input
          type="search"
          className="search"
          placeholder="Filtrar por nick ou time…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="muted small">
          {visible.length} de {players.length} jogadores
        </span>
      </div>

      <table>
        <thead>
          <tr>
            <SortTh sorter={sorter} column="nick">
              Jogador
            </SortTh>
            <SortTh sorter={sorter} column="team">
              Time
            </SortTh>
            <SortTh sorter={sorter} column="position" className="num">
              Coloc.
            </SortTh>
            <SortTh sorter={sorter} column="minutes" className="num">
              Minutos
            </SortTh>
            <SortTh sorter={sorter} column="kills" className="num">
              Kills
            </SortTh>
            <SortTh sorter={sorter} column="byMinutes" className={`num ${basis === 'minutes' ? 'active-col' : ''}`}>
              Por minutos
            </SortTh>
            <SortTh sorter={sorter} column="byKills" className={`num ${basis === 'kills' ? 'active-col' : ''}`}>
              Por kills
            </SortTh>
            <th className="expand-col" />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const isOpen = open === key(p);
            return (
              <Fragment key={key(p)}>
                <tr>
                  <td>
                    <strong>{p.nick}</strong>
                  </td>
                  <td>{p.team}</td>
                  <td className="num">{p.position}º</td>
                  <td className="num">
                    {p.minutes} <span className="muted">({formatPercent(share(p.minutes, p.teamMinutes))})</span>
                  </td>
                  <td className="num">
                    {p.kills} <span className="muted">({formatPercent(share(p.kills, p.teamKills))})</span>
                  </td>
                  <td className={`num ${basis === 'minutes' ? 'active-col' : 'muted'}`}>{formatCents(p.prizeByMinutes)}</td>
                  <td className={`num ${basis === 'kills' ? 'active-col' : 'muted'}`}>{formatCents(p.prizeByKills)}</td>
                  <td className="expand-col">
                    <ExpandButton open={isOpen} onClick={() => setOpen(isOpen ? null : key(p))} label="explicação do cálculo" />
                  </td>
                </tr>
                {isOpen && (
                  <tr className="details">
                    <td colSpan={8}>
                      <Explanation player={p} team={teamPrize.get(p.team)} basis={basis} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {!visible.length && (
            <tr>
              <td colSpan={8} className="muted">
                Nenhum jogador encontrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

/** Texto pronto para responder "por que eu recebi só isso?". */
function Explanation({ player, team, basis }: { player: PlayerPrize; team?: TeamStanding; basis: PrizeBasis }) {
  if (!team) return null;
  if (team.prizeCents === 0) {
    return (
      <p>
        {player.team} terminou em {team.position}º lugar, fora das colocações premiadas, então nenhum jogador do time
        recebe prêmio.
      </p>
    );
  }

  const detail =
    basis === 'minutes'
      ? `jogou ${player.minutes} dos ${player.teamMinutes} minutos do time`
      : `fez ${player.kills} das ${player.teamKills} kills do time`;
  const percent = basis === 'minutes' ? share(player.minutes, player.teamMinutes) : share(player.kills, player.teamKills);
  return (
    <p>
      {player.team} terminou em {team.position}º lugar{team.sharedPosition && ' (empatado)'} e ficou com{' '}
      <strong>{formatCents(team.prizeCents)}</strong> ({formatPercent(team.prizePercent)} do prêmio). O valor do time é
      dividido {basis === 'minutes' ? 'pelos minutos jogados' : 'pelas kills'} de cada jogador no torneio:{' '}
      {player.nick} {detail} ({formatPercent(percent)}), em {player.matches} partida{player.matches === 1 ? '' : 's'}, e recebe{' '}
      <strong>{formatCents(player.prizeCents)}</strong>.
    </p>
  );
}
