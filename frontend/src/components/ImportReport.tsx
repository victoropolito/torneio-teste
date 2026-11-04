import { useState } from 'react';
import type { ImportIssue, Severity } from '../types';
import { SEVERITIES, SEVERITY_LABEL } from './IssueBadges';
import { SortTh, useSort } from './Sortable';

const SEVERITY_RANK: Record<Severity, number> = { error: 3, warning: 2, info: 1 };

export function ImportReport({ issues }: { issues: ImportIssue[] }) {
  const [filter, setFilter] = useState<Severity | 'all'>('all');

  const visible = filter === 'all' ? issues : issues.filter((issue) => issue.severity === filter);
  const { rows, sorter } = useSort(visible, {
    severity: (i) => SEVERITY_RANK[i.severity],
    line: (i) => (i.line == null ? null : -i.line), // primeiro clique: linha 1 primeiro
    match: (i) => i.matchId,
    message: (i) => i.message,
  });

  if (!issues.length) return <p className="muted">A planilha não teve nenhum problema.</p>;

  const count = (severity: Severity) => issues.filter((issue) => issue.severity === severity).length;

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

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh sorter={sorter} column="severity">
                Tipo
              </SortTh>
              <SortTh sorter={sorter} column="line" className="num">
                Linha
              </SortTh>
              <SortTh sorter={sorter} column="match">
                Partida
              </SortTh>
              <SortTh sorter={sorter} column="message">
                O que aconteceu
              </SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((issue, index) => (
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
      </div>
    </>
  );
}
