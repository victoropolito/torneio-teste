import type { TournamentChecks, TournamentDetail, TournamentSummary } from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Erro HTTP ${res.status}`);
  return body as T;
}

export const api = {
  listTournaments: () => request<TournamentSummary[]>('/api/tournaments'),
  getTournament: (id: number) => request<TournamentDetail>(`/api/tournaments/${id}`),
  importTournament: (form: FormData) =>
    request<TournamentDetail>('/api/tournaments', { method: 'POST', body: form }),
  getChecks: (id: number) => request<TournamentChecks>(`/api/tournaments/${id}/checks`),
  retryChecks: (id: number) =>
    request<TournamentChecks & { requeued: number }>(`/api/tournaments/${id}/checks/retry`, { method: 'POST' }),
};
