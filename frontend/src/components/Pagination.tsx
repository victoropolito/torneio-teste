import { useEffect, useState } from 'react';

export interface PageState<T> {
  rows: T[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  setPage: (page: number) => void;
}

/**
 * Pagina `rows`. Volta para a página 1 quando `resetKey` muda (filtro ou
 * ordenação novos), para a pessoa não ficar numa página que não faz mais sentido.
 */
export function usePagination<T>(rows: T[], pageSize: number, resetKey = ''): PageState<T> {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [resetKey]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount);
  return {
    rows: rows.slice((current - 1) * pageSize, current * pageSize),
    page: current,
    pageCount,
    pageSize,
    total: rows.length,
    setPage,
  };
}

/** Páginas visíveis: primeira, última e vizinhas da atual; o resto vira "…". */
function visiblePages(page: number, pageCount: number): (number | 'gap')[] {
  const pages: (number | 'gap')[] = [];
  for (let p = 1; p <= pageCount; p++) {
    if (p === 1 || p === pageCount || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages.at(-1) !== 'gap') pages.push('gap');
  }
  return pages;
}

export function Pagination<T>({ state, noun }: { state: PageState<T>; noun: string }) {
  const { page, pageCount, pageSize, total, setPage } = state;
  if (total <= pageSize) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav className="pagination" aria-label={`Páginas de ${noun}`}>
      <span className="muted small">
        {first}–{last} de {total} {noun}
      </span>
      <div className="pages">
        <button type="button" onClick={() => setPage(page - 1)} disabled={page === 1} aria-label="Página anterior">
          ‹
        </button>
        {visiblePages(page, pageCount).map((p, index) =>
          p === 'gap' ? (
            <span key={`gap-${index}`} className="gap">
              …
            </span>
          ) : (
            <button
              type="button"
              key={p}
              className={p === page ? 'current' : ''}
              aria-current={p === page ? 'page' : undefined}
              onClick={() => setPage(p)}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => setPage(page + 1)}
          disabled={page === pageCount}
          aria-label="Próxima página"
        >
          ›
        </button>
      </div>
    </nav>
  );
}
