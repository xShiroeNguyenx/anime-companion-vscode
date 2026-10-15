// Pure helpers for provider model catalogs (OpenRouter's `/api/v1/models`):
// parsing, the one-line detail shown in the model picker, and cost estimates.
// No `vscode` import, so scripts/chat-test.js can load it from `out/`.

export interface CatalogModel {
  id: string;
  name?: string;
  contextLength?: number;
  /** USD per million input tokens; undefined when the provider gives none. */
  promptPerM?: number;
  /** USD per million output tokens. */
  completionPerM?: number;
}

export interface ModelCatalog {
  fetchedAt: number;
  models: CatalogModel[];
}

/** A day: the catalog changes when vendors ship models, not by the minute. */
export const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

export function isCatalogFresh(catalog: ModelCatalog | undefined, now: number, ttlMs = CATALOG_TTL_MS): boolean {
  return !!catalog && catalog.models.length > 0 && now - catalog.fetchedAt < ttlMs;
}

// OpenRouter prices are strings in USD per token; "-1" marks a router whose
// price depends on the model it picks (openrouter/auto).
function perMillion(raw: unknown): number | undefined {
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n * 1_000_000;
}

export function parseOpenRouterModels(json: unknown): CatalogModel[] {
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const out: CatalogModel[] = [];
  const seen = new Set<string>();
  for (const raw of data) {
    const m = raw as {
      id?: unknown;
      name?: unknown;
      context_length?: unknown;
      pricing?: { prompt?: unknown; completion?: unknown };
    };
    if (typeof m?.id !== 'string' || !m.id || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push({
      id: m.id,
      name: typeof m.name === 'string' ? m.name : undefined,
      contextLength: typeof m.context_length === 'number' && m.context_length > 0 ? m.context_length : undefined,
      promptPerM: perMillion(m.pricing?.prompt),
      completionPerM: perMillion(m.pricing?.completion),
    });
  }
  // The router first: it is the default, and the sensible pick when unsure.
  out.sort((a, b) => Number(b.id === 'openrouter/auto') - Number(a.id === 'openrouter/auto'));
  return out;
}

function money(n: number): string {
  if (n === 0) return '0';
  if (n < 0.01) return n.toPrecision(2);
  return n.toFixed(2).replace(/\.?0+$/, '');
}

/** "$3 / $15 per 1M · 200k ctx", "free · 128k ctx", or "" when nothing is known. */
export function formatModelDetail(m: CatalogModel): string {
  const parts: string[] = [];
  if (m.promptPerM !== undefined && m.completionPerM !== undefined) {
    parts.push(
      m.promptPerM === 0 && m.completionPerM === 0
        ? 'free'
        : `$${money(m.promptPerM)} / $${money(m.completionPerM)} per 1M`
    );
  }
  if (m.contextLength) {
    parts.push(m.contextLength >= 1000 ? `${Math.round(m.contextLength / 1000)}k ctx` : `${m.contextLength} ctx`);
  }
  return parts.join(' · ');
}

/** Estimated USD for a token count, or undefined when the price is unknown. */
export function estimateCostUsd(
  tokens: { in: number; out: number },
  model: CatalogModel | undefined
): number | undefined {
  if (!model || model.promptPerM === undefined || model.completionPerM === undefined) return undefined;
  return (tokens.in * model.promptPerM + tokens.out * model.completionPerM) / 1_000_000;
}

export function formatUsd(n: number): string {
  if (n === 0) return '$0';
  if (n < 0.01) return '<$0.01';
  return `$${n.toFixed(2)}`;
}
