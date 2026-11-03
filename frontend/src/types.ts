export type Severity = 'error' | 'warning' | 'info';

export interface ImportIssue {
  severity: Severity;
  code: string;
  message: string;
  line?: number;
  matchId?: string;
}

export interface Player {
  team: string;
  nick: string;
  minutes: number;
  kills: number;
}

export interface Match {
  externalId: string;
  round: number;
  playedOn: string;
  teamA: string;
  teamB: string;
  winner: string | null;
  players: Player[];
}

export interface TournamentSummary {
  id: number;
  name: string;
  sourceFilename: string;
  prizeTotalCents: number;
  prizeSplit: number[];
  createdAt: string;
  matchCount: number;
  issueCounts: Record<Severity, number>;
}

export interface TournamentDetail extends TournamentSummary {
  matches: Match[];
  issues: ImportIssue[];
}
