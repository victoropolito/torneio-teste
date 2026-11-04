import { useState } from 'react';
import type { CheckStatus, MatchCheck, TournamentChecks } from '../types';

export const CHECK_LABEL: Record<CheckStatus, { text: string; badge: string }> = {
  pending: { text: 'Na fila', badge: 'info' },
  running: { text: 'Consultando', badge: 'info' },
  ok: { text: 'Confere', badge: 'ok' },
  divergent: { text: 'Divergente', badge: 'warning' },
  not_found: { text: 'Não encontrada', badge: 'error' },
  failed: { text: 'Falhou', badge: 'error' },
};

const STATUS_ORDER: CheckStatus[] = ['running', 'pending', 'ok', 'divergent', 'not_found', 'failed'];

export function CheckBadge({ check }: { check?: MatchCheck }) {
  if (!check) return <span className="muted">—</span>;
  const label = CHECK_LABEL[check.status];
  const retrying = check.status === 'pending' && check.lastError;
  return (
    <span className={`badge ${label.badge}`} title={check.lastError ?? undefined}>
      {retrying ? 'Tentando de novo' : label.text}
    </span>
  );
}

interface Props {
  checks: TournamentChecks | null;
  error: string | null;
  onRetry: () => Promise<void>;
}

export function OfficialCheck({ checks, error, onRetry }: Props) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  if (!checks) return <p className="muted">{error ?? 'Carregando…'}</p>;

  const { counts, total, finished } = checks;
  const done = total - counts.pending - counts.running;
  const unresolved = counts.failed + counts.not_found;
  const divergent = checks.matches.filter((m) => m.status === 'divergent');
  const problems = checks.matches.filter((m) => m.status === 'not_found' || m.status === 'failed' || m.lastError);

  const retry = async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      await onRetry();
    } catch (err) {
      setRetryError((err as Error).message);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <>
      <div className="progress-line">
        <div className="progress" aria-label={`${done} de ${total} partidas conferidas`}>
          <div className="progress-bar" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
        <span>
          {done} de {total} conferidas
          {!finished && <span className="muted"> · consultando o site oficial…</span>}
        </span>
      </div>

      <div className="badges">
        {STATUS_ORDER.filter((status) => counts[status] > 0).map((status) => (
          <span key={status} className={`badge ${CHECK_LABEL[status].badge}`}>
            {counts[status]} {CHECK_LABEL[status].text.toLowerCase()}
          </span>
        ))}
      </div>

      {error && <p className="error small">Não foi possível atualizar: {error}</p>}

      <p className="muted small">
        Quando planilha e site não batem, vale o site oficial. Partidas não conferidas usam a planilha e deixam os
        prêmios provisórios.
      </p>

      {finished && unresolved > 0 && (
        <p>
          <button onClick={retry} disabled={retrying}>
            {retrying ? 'Recolocando na fila…' : `Conferir de novo (${unresolved})`}
          </button>
          {retryError && <span className="error small"> {retryError}</span>}
        </p>
      )}

      {divergent.length > 0 && (
        <>
          <h3>O que não bateu</h3>
          <table>
            <thead>
              <tr>
                <th>Partida</th>
                <th>Divergência</th>
                <th>Planilha</th>
                <th>Site oficial</th>
              </tr>
            </thead>
            <tbody>
              {divergent.flatMap((match) =>
                match.discrepancies.map((d, index) => (
                  <tr key={`${match.externalId}-${index}`}>
                    <td>{index === 0 ? match.externalId : ''}</td>
                    <td>{d.message}</td>
                    <td>{d.sheetValue ?? '—'}</td>
                    <td>{d.officialValue ?? '—'}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </>
      )}

      {problems.length > 0 && (
        <>
          <h3>Não conferidas</h3>
          <table>
            <thead>
              <tr>
                <th>Partida</th>
                <th>Situação</th>
                <th className="num">Tentativas</th>
                <th>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {problems.map((match) => (
                <tr key={match.externalId}>
                  <td>{match.externalId}</td>
                  <td>
                    <CheckBadge check={match} />
                  </td>
                  <td className="num">{match.attempts}</td>
                  <td>
                    {match.status === 'not_found'
                      ? 'O site não tem partida com esse ID. Confira se o código foi copiado certo.'
                      : match.lastError}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
