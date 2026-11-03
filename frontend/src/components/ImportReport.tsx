import { useState } from 'react';
import type { ImportIssue, Severity } from '../types';
import { SEVERITIES, SEVERITY_LABEL } from './IssueBadges';

export function ImportReport({ issues }: { issues: ImportIssue[] }) {
  const [filter, setFilter] = useState<Severity | 'all'>('all');

  if (!issues.length) return <p className="muted">A planilha não teve nenhum problema.</p>;

  const count = (severity: Severity) => issues.filter((issue) => issue.severity === severity).length;
  const visible = filter === 'all' ? issues : issues.filter((issue) => issue.severity === filter);

  return (
    <>
      <div className="filters">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
          Todos ({issues.length})
        </button>
        {SEVERITIES.filter((severity) => count(severity) > 0).map((severity) => (
          <button key={severity} className={filter === severity ? 'active' : ''} onClick={() => setFilter(severity)}>
            {SEVERITY_LABEL[severity].many} ({count(severity)})
          </button>
        ))}
      </div>

      <table>
        <thead>
          <tr>
            <th>Tipo</th>
            <th className="num">Linha</th>
            <th>Partida</th>
            <th>O que aconteceu</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((issue, index) => (
            <tr key={index}>
              <td>
                <span className={`badge ${issue.severity}`}>{SEVERITY_LABEL[issue.severity].one}</span>
              </td>
              <td className="num">{issue.line ?? '—'}</td>
              <td>{issue.matchId ?? '—'}</td>
              <td>{issue.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
