import type { Severity } from '../types';

export const SEVERITIES: Severity[] = ['error', 'warning', 'info'];

export const SEVERITY_LABEL: Record<Severity, { one: string; many: string }> = {
  error: { one: 'Erro', many: 'Erros' },
  warning: { one: 'Aviso', many: 'Avisos' },
  info: { one: 'Info', many: 'Infos' },
};

export function IssueBadges({ counts }: { counts: Record<Severity, number> }) {
  const visible = SEVERITIES.filter((severity) => counts[severity] > 0);
  if (!visible.length) return <span className="badge ok">Sem problemas</span>;

  return (
    <span className="badges">
      {visible.map((severity) => {
        const label = SEVERITY_LABEL[severity];
        return (
          <span key={severity} className={`badge ${severity}`}>
            {counts[severity]} {(counts[severity] > 1 ? label.many : label.one).toLowerCase()}
          </span>
        );
      })}
    </span>
  );
}
