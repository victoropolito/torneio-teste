import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatCents } from '../format';
import type { PrizeBasis, TournamentResults } from '../types';
import { PlayerPrizes } from './PlayerPrizes';
import { Standings } from './Standings';

interface Props {
  tournamentId: number;
  /** Muda quando a conferência avança, para recalcular com os dados do site. */
  refreshKey: string;
}

export function Results({ tournamentId, refreshKey }: Props) {
  const [results, setResults] = useState<TournamentResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getResults(tournamentId)
      .then((data) => !cancelled && (setResults(data), setError(null)))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [tournamentId, refreshKey]);

  const changeBasis = async (basis: PrizeBasis) => {
    setSaving(true);
    try {
      await api.setPrizeBasis(tournamentId, basis);
      setResults(await api.getResults(tournamentId));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!results) return <p className={error ? 'error' : 'muted'}>{error ?? 'Calculando…'}</p>;

  const paid = results.players.reduce((sum, p) => sum + p.prizeCents, 0);

  return (
    <>
      {results.provisional ? (
        <div className="banner warning">
          <strong>Valores provisórios.</strong> Ainda não foi possível confirmar{' '}
          {results.pendingMatches.length === 1 ? 'esta partida' : `${results.pendingMatches.length} partidas`} no
          site oficial: {results.pendingMatches.map((p) => `${p.externalId} (${p.reason})`).join(', ')}. Elas foram
          calculadas com os dados da planilha, e como podem mudar a classificação, todos os valores podem mudar.
        </div>
      ) : (
        <div className="banner ok">
          Todas as {results.sources.official} partidas foram conferidas no site oficial. Valores finais.
        </div>
      )}
      {error && <p className="error small">{error}</p>}

      <h3>Classificação</h3>
      <Standings standings={results.standings} />

      <h3>Prêmio por jogador</h3>
      <div className="basis">
        <span>Dividir o prêmio do time por:</span>
        {(['minutes', 'kills'] as PrizeBasis[]).map((basis) => (
          <label key={basis}>
            <input
              type="radio"
              name="basis"
              checked={results.basis === basis}
              disabled={saving}
              onChange={() => changeBasis(basis)}
            />
            {basis === 'minutes' ? 'minutos jogados' : 'kills'}
          </label>
        ))}
        <span className="muted small">
          Total distribuído: {formatCents(paid)} de {formatCents(results.prizeTotalCents)}
        </span>
      </div>
      {results.basis === 'kills' && (
        <p className="muted small">
          Atenção: por kills, quem joga de suporte recebe menos, e um jogador sem kills não recebe nada, mesmo tendo
          jogado a partida inteira.
        </p>
      )}
      <PlayerPrizes players={results.players} standings={results.standings} basis={results.basis} />
    </>
  );
}
