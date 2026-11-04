/** Seta que indica linha expansível; gira quando aberta. */
export function ExpandButton({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      className={`expand ${open ? 'open' : ''}`}
      onClick={onClick}
      aria-expanded={open}
      aria-label={open ? `Ocultar ${label}` : `Mostrar ${label}`}
      title={open ? `Ocultar ${label}` : `Mostrar ${label}`}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
