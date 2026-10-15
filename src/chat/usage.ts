// Pure token-usage bookkeeping: per day → provider → model. No `vscode`
// import, so scripts/chat-test.js can load it from `out/`.

export interface UsageCell {
  in: number;
  out: number;
  turns: number;
  /** Turns the provider reported no token counts for (Copilot never does). */
  unmetered: number;
}

type ByModel = Record<string, UsageCell>;
type ByProvider = Record<string, ByModel>;

export interface UsageData {
  version: 1;
  /** `YYYY-MM-DD` (local time), the last KEEP_DAYS of them. */
  days: Record<string, ByProvider>;
  /** `YYYY-MM`, older days folded in so all-time totals survive pruning. */
  months: Record<string, ByProvider>;
}

export interface TurnUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export const KEEP_DAYS = 180;

export function emptyUsage(): UsageData {
  return { version: 1, days: {}, months: {} };
}

/** Reads whatever globalState held, discarding anything malformed. */
export function normalizeUsage(raw: unknown): UsageData {
  const r = raw as Partial<UsageData> | undefined;
  if (!r || r.version !== 1 || typeof r.days !== 'object' || typeof r.months !== 'object') return emptyUsage();
  return { version: 1, days: r.days ?? {}, months: r.months ?? {} };
}

export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function cellOf(bucket: ByProvider, provider: string, model: string): UsageCell {
  const byModel = (bucket[provider] ??= {});
  return (byModel[model] ??= { in: 0, out: 0, turns: 0, unmetered: 0 });
}

function count(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** Records one reply. Mutates and returns `data`. */
export function addUsage(data: UsageData, day: string, provider: string, model: string, usage?: TurnUsage): UsageData {
  const cell = cellOf((data.days[day] ??= {}), provider, model || '(default)');
  cell.turns += 1;
  const tin = count(usage?.inputTokens);
  const tout = count(usage?.outputTokens);
  if (tin === 0 && tout === 0) cell.unmetered += 1;
  cell.in += tin;
  cell.out += tout;
  return data;
}

function mergeInto(target: ByProvider, source: ByProvider): void {
  for (const [provider, byModel] of Object.entries(source)) {
    for (const [model, c] of Object.entries(byModel)) {
      const t = cellOf(target, provider, model);
      t.in += c.in;
      t.out += c.out;
      t.turns += c.turns;
      t.unmetered += c.unmetered;
    }
  }
}

/** `YYYY-MM-DD` keys for the `n` days ending at `today`, oldest first. */
export function dayKeysBack(today: string, n: number): string[] {
  // Noon UTC keeps the arithmetic clear of DST and time-zone edges.
  const base = new Date(`${today}T12:00:00Z`).getTime();
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(new Date(base - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

/** Folds days older than `keepDays` into their month. Mutates and returns `data`. */
export function pruneUsage(data: UsageData, today: string, keepDays = KEEP_DAYS): UsageData {
  const oldestKept = dayKeysBack(today, keepDays)[0];
  for (const day of Object.keys(data.days)) {
    if (day >= oldestKept) continue;
    mergeInto((data.months[day.slice(0, 7)] ??= {}), data.days[day]);
    delete data.days[day];
  }
  return data;
}

export interface UsageRow extends UsageCell {
  provider: string;
  model: string;
}

export interface UsageSummary {
  rows: UsageRow[];
  perDay: Array<{ day: string; in: number; out: number; turns: number }>;
  total: UsageCell;
}

/** Totals over the given days (and, for all-time, the folded months too). */
export function aggregateUsage(data: UsageData, days: string[], includeMonths = false): UsageSummary {
  const merged: ByProvider = {};
  const perDay = days.map((day) => {
    const bucket = data.days[day] ?? {};
    mergeInto(merged, bucket);
    let tin = 0, tout = 0, turns = 0;
    for (const byModel of Object.values(bucket)) {
      for (const c of Object.values(byModel)) {
        tin += c.in;
        tout += c.out;
        turns += c.turns;
      }
    }
    return { day, in: tin, out: tout, turns };
  });
  if (includeMonths) {
    for (const bucket of Object.values(data.months)) mergeInto(merged, bucket);
  }
  const rows: UsageRow[] = [];
  const total: UsageCell = { in: 0, out: 0, turns: 0, unmetered: 0 };
  for (const [provider, byModel] of Object.entries(merged)) {
    for (const [model, c] of Object.entries(byModel)) {
      rows.push({ provider, model, ...c });
      total.in += c.in;
      total.out += c.out;
      total.turns += c.turns;
      total.unmetered += c.unmetered;
    }
  }
  rows.sort((a, b) => b.in + b.out - (a.in + a.out) || b.turns - a.turns);
  return { rows, perDay, total };
}

/** Token totals of one conversation, from the usage stored on its replies. */
export function conversationTotals(messages: Array<{ usage?: { in: number; out: number } }>): { in: number; out: number } {
  let tin = 0, tout = 0;
  for (const m of messages) {
    tin += count(m.usage?.in);
    tout += count(m.usage?.out);
  }
  return { in: tin, out: tout };
}
