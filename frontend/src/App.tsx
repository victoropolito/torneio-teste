import { useEffect, useState } from 'react';

type Health = { status: string; database: string };

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Health>;
      })
      .then(setHealth)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>Torneio — Prêmios</h1>
      {error && <p style={{ color: 'crimson' }}>API indisponível: {error}</p>}
      {!error && !health && <p>Conectando à API…</p>}
      {health && (
        <p>
          API: <strong>{health.status}</strong> · Banco: <strong>{health.database}</strong>
        </p>
      )}
    </main>
  );
}
