import { useState, type ReactNode } from 'react';

type SortValue = string | number | boolean | null | undefined;
type SortDir = 'asc' | 'desc';

export interface Sorter<K extends string> {
  sort: { key: K; dir: SortDir } | null;
  toggle: (key: K) => void;
}

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

function compare(a: SortValue, b: SortValue): number {
  if (a == null || a === '') return b == null || b === '' ? 0 : 1; // vazios sempre no fim
  if (b == null || b === '') return -1;
  if (typeof a === 'string' && typeof b === 'string') return collator.compare(a, b);
  return Number(a) - Number(b);
}

/**
 * Ordenação por coluna. Clique: números começam do maior, textos de A a Z;
 * o segundo clique inverte e o terceiro volta à ordem original.
 */
export function useSort<T, K extends string>(rows: T[], columns: Record<K, (row: T) => SortValue>) {
  /** `inverted`: já houve o segundo clique nesta coluna. */
  const [sort, setSort] = useState<{ key: K; dir: SortDir; inverted: boolean } | null>(null);

  const toggle = (key: K) =>
    setSort((current) => {
      if (current?.key !== key) {
        const sample = rows.map(columns[key]).find((v) => v != null && v !== '');
        return { key, dir: typeof sample === 'string' ? 'asc' : 'desc', inverted: false };
      }
      if (!current.inverted) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc', inverted: true };
      return null;
    });

  let sorted = rows;
  if (sort) {
    const get = columns[sort.key];
    const factor = sort.dir === 'asc' ? 1 : -1;
    sorted = [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      // vazios ficam no fim nas duas direções
      if (va == null || va === '' || vb == null || vb === '') return compare(va, vb);
      return compare(va, vb) * factor;
    });
  }

  return { rows: sorted, sorter: { sort, toggle } as Sorter<K> };
}

interface ThProps<K extends string> {
  sorter: Sorter<K>;
  column: K;
  className?: string;
  children: ReactNode;
}

export function SortTh<K extends string>({ sorter, column, className, children }: ThProps<K>) {
  const active = sorter.sort?.key === column ? sorter.sort.dir : null;
  return (
    <th className={className} aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none'}>
      <button type="button" className={`sort ${active ? 'active' : ''}`} onClick={() => sorter.toggle(column)}>
        {children}
        <span className="sort-icon" aria-hidden>
          {active === 'asc' ? '▲' : active === 'desc' ? '▼' : '↕'}
        </span>
      </button>
    </th>
  );
}
