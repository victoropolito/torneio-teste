const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatCents = (cents: number) => currency.format(cents / 100);

/** "2026-09-05" -> "05/09/2026" */
export const formatDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/** "2026-11-03 19:21:00" (UTC, formato do SQLite) -> data/hora local */
export const formatDateTime = (sqlite: string) =>
  new Date(`${sqlite.replace(' ', 'T')}Z`).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** 17.84 -> "17,8%" */
export const formatPercent = (value: number) =>
  `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

/** Para busca: sem acento e sem caixa ("Tchê" casa com "tche"). */
export const normalizeSearch = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
