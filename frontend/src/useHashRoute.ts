import { useEffect, useState } from 'react';

function readRoute() {
  const match = /^#\/torneios\/(\d+)/.exec(window.location.hash);
  return { tournamentId: match ? Number(match[1]) : null };
}

/** Roteamento mínimo por hash: "#/torneios/3" -> { tournamentId: 3 }. */
export function useHashRoute() {
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    const onChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}

export const navigate = {
  tournament: (id: number) => {
    window.location.hash = `#/torneios/${id}`;
  },
};
