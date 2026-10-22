export interface CaseStats {
  k: number;
  n: number;
  e: number;
  unknown: number;
  turns: number;
  inputTokens?: number;
  cacheHitPct?: number;
  agentCost?: number;
  calls: Record<string, number>;
  tools: string[];
}

export interface Row {
  case: string;
  a: CaseStats;
  b: CaseStats;
  move: 'UP' | 'DOWN' | '~' | '=' | '';
  turnsFlag: boolean;
  costFlag: boolean;
  cacheShift: boolean;
}

export interface RunFlags {
  partial: boolean;
  tainted: boolean;
  errored: boolean;
}

export interface Comparison {
  a: string;
  b: string;
  verdict: 'BETTER' | 'WORSE' | 'NO CHANGE' | 'INCONCLUSIVE' | 'NOT COMPARABLE';
  reasons: string[];
  rows: Row[];
  up: number;
  down: number;
  noise: number;
  errors: number;
  notInBoth: string[];
  toolsChanged: Record<string, string[]>;
  agentCostChange?: number;
  cacheWarmthDiffers: boolean;
  flags: { a: RunFlags; b: RunFlags };
  warnings: string[];
  model?: string;
  judge?: string;
  labels: { a: string | null; b: string | null };
}

export function compareRuns(refA?: string, refB?: string, options?: { resultsDir?: string }): Comparison;
export function resolveRef(ref?: string, options?: { resultsDir?: string }): string;
export function formatCompare(c: Comparison): string;
export function baselineId(resultsDir?: string): string | null;
export function pin(id: string, resultsDir?: string): void;
