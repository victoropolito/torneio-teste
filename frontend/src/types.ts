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
  prizeBasis: PrizeBasis;
  createdAt: string;
  matchCount: number;
  issueCounts: Record<Severity, number>;
}

export interface TournamentDetail extends TournamentSummary {
  matches: Match[];
  issues: ImportIssue[];
}

export type CheckStatus = 'pending' | 'running' | 'ok' | 'divergent' | 'not_found' | 'failed';

export interface Discrepancy {
  code: string;
  message: string;
  nick?: string;
  sheetValue?: string;
  officialValue?: string;
}

export interface MatchCheck {
  externalId: string;
  status: CheckStatus;
  attempts: number;
  lastError: string | null;
  checkedAt: string | null;
  nextAttemptAt: number | null;
  discrepancies: Discrepancy[];
}

export interface TournamentChecks {
  counts: Record<CheckStatus, number>;
  total: number;
  finished: boolean;
  matches: MatchCheck[];
}

export type PrizeBasis = 'minutes' | 'kills';

export type Tiebreak = 'head_to_head' | 'kill_balance' | 'fewer_players';

export interface TeamStanding {
  team: string;
  position: number;
  sharedPosition: boolean;
  tiebreak: Tiebreak | null;
  played: number;
  wins: number;
  losses: number;
  killsFor: number;
  killsAgainst: number;
  killBalance: number;
  playersUsed: number;
  prizePercent: number;
  prizeCents: number;
}

export interface PlayerPrize {
  nick: string;
  team: string;
  position: number;
  matches: number;
  minutes: number;
  kills: number;
  teamMinutes: number;
  teamKills: number;
  prizeByMinutes: number;
  prizeByKills: number;
  prizeCents: number;
}

export interface TournamentResults {
  basis: PrizeBasis;
  prizeTotalCents: number;
  provisional: boolean;
  pendingMatches: { externalId: string; reason: string }[];
  sources: { official: number; sheet: number };
  standings: TeamStanding[];
  players: PlayerPrize[];
}
