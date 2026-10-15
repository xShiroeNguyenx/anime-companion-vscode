// HTML for the chat usage panel. Pure (no `vscode`), so the markup and the
// numbers can be tested from scripts/chat-test.js. The page carries no script
// at all: the range tabs are radio buttons styled with CSS, and the colors are
// VS Code's own theme variables, so it follows whichever theme is active.
import { CatalogModel, estimateCostUsd, formatUsd } from './model-catalog';
import type { UsageSummary } from './usage';

export interface UsageRange {
  id: string;
  label: string;
  summary: UsageSummary;
}

export interface UsageViewStrings {
  title: string;
  provider: string;
  model: string;
  turns: string;
  tokensIn: string;
  tokensOut: string;
  cost: string;
  costNote: string;
  unmeteredNote: string;
  empty: string;
  chartTitle: string;
}

export const DEFAULT_USAGE_STRINGS: UsageViewStrings = {
  title: 'Chat usage',
  provider: 'Provider',
  model: 'Model',
  turns: 'Replies',
  tokensIn: 'Tokens in',
  tokensOut: 'Tokens out',
  cost: 'Est. cost',
  costNote: 'Cost is estimated for OpenRouter only, from its current published prices.',
  unmeteredNote: '{count} replies have no token count — the provider did not report one (Copilot never does).',
  empty: 'No chat replies in this period yet.',
  chartTitle: 'Tokens per day, last 30 days',
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function num(n: number): string {
  return n.toLocaleString('en-US');
}

function table(range: UsageRange, s: UsageViewStrings, priceOf: (provider: string, model: string) => CatalogModel | undefined): string {
  const { rows, total } = range.summary;
  if (rows.length === 0) return `<p class="empty">${escapeHtml(s.empty)}</p>`;
  let costTotal = 0;
  let anyCost = false;
  const body = rows
    .map((r) => {
      const usd = r.provider === 'openrouter' ? estimateCostUsd(r, priceOf(r.provider, r.model)) : undefined;
      if (usd !== undefined) {
        costTotal += usd;
        anyCost = true;
      }
      const metered = r.turns > r.unmetered;
      return (
        `<tr><td>${escapeHtml(r.provider)}</td><td class="model">${escapeHtml(r.model)}</td>` +
        `<td class="n">${num(r.turns)}</td>` +
        `<td class="n">${metered ? num(r.in) : '—'}</td><td class="n">${metered ? num(r.out) : '—'}</td>` +
        `<td class="n">${usd === undefined ? '—' : formatUsd(usd)}</td></tr>`
      );
    })
    .join('');
  const notes: string[] = [];
  if (total.unmetered > 0) notes.push(s.unmeteredNote.split('{count}').join(num(total.unmetered)));
  if (anyCost) notes.push(s.costNote);
  return (
    `<table><thead><tr><th>${escapeHtml(s.provider)}</th><th>${escapeHtml(s.model)}</th>` +
    `<th class="n">${escapeHtml(s.turns)}</th><th class="n">${escapeHtml(s.tokensIn)}</th>` +
    `<th class="n">${escapeHtml(s.tokensOut)}</th><th class="n">${escapeHtml(s.cost)}</th></tr></thead>` +
    `<tbody>${body}</tbody>` +
    `<tfoot><tr><td colspan="2"></td><td class="n">${num(total.turns)}</td><td class="n">${num(total.in)}</td>` +
    `<td class="n">${num(total.out)}</td><td class="n">${anyCost ? formatUsd(costTotal) : '—'}</td></tr></tfoot></table>` +
    notes.map((n) => `<p class="note">${escapeHtml(n)}</p>`).join('')
  );
}

/** Bars of in+out tokens per day. Plain SVG, sized by viewBox so it scales. */
export function renderDailyChart(perDay: UsageSummary['perDay']): string {
  const W = 600, H = 120, gap = 2;
  const max = Math.max(1, ...perDay.map((d) => d.in + d.out));
  const bw = perDay.length ? (W - gap * (perDay.length - 1)) / perDay.length : W;
  const bars = perDay
    .map((d, i) => {
      const v = d.in + d.out;
      const h = v === 0 ? 0 : Math.max(2, (v / max) * (H - 4));
      const x = i * (bw + gap);
      return `<rect x="${x.toFixed(1)}" y="${(H - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"><title>${d.day}: ${num(v)}</title></rect>`;
    })
    .join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">${bars}</svg>`;
}

export function renderUsageHtml(
  ranges: UsageRange[],
  chartDays: UsageSummary['perDay'],
  priceOf: (provider: string, model: string) => CatalogModel | undefined,
  strings: UsageViewStrings = DEFAULT_USAGE_STRINGS
): string {
  const tabs = ranges
    .map(
      (r, i) =>
        `<input type="radio" name="range" id="r-${r.id}"${i === 0 ? ' checked' : ''}>` +
        `<label for="r-${r.id}">${escapeHtml(r.label)}</label>`
    )
    .join('');
  const panes = ranges.map((r) => `<section class="pane" data-for="r-${r.id}">${table(r, strings, priceOf)}</section>`).join('');
  // One `:checked ~ .panes .pane[data-for=…]` rule per range shows its pane.
  const showRules = ranges
    .map((r) => `#r-${r.id}:checked ~ .panes .pane[data-for="r-${r.id}"]{display:block}`)
    .join('');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(strings.title)}</title>
<style>
body{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:16px 20px;max-width:960px}
h1{font-size:1.3em;font-weight:600;margin:0 0 14px}
h2{font-size:1em;font-weight:600;margin:22px 0 8px;color:var(--vscode-descriptionForeground)}
input[type=radio]{position:absolute;opacity:0;pointer-events:none}
label{display:inline-block;padding:4px 12px;margin:0 4px 10px 0;border-radius:12px;cursor:pointer;border:1px solid var(--vscode-panel-border,transparent);color:var(--vscode-descriptionForeground)}
input:checked+label{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-color:transparent}
input:focus-visible+label{outline:1px solid var(--vscode-focusBorder)}
.pane{display:none}${showRules}
.table-wrap{overflow-x:auto}
table{border-collapse:collapse;width:100%}
th,td{padding:5px 8px;text-align:left;border-bottom:1px solid var(--vscode-panel-border,rgba(128,128,128,.2));white-space:nowrap}
th{font-weight:600;color:var(--vscode-descriptionForeground)}
td.model{white-space:normal;word-break:break-all}
.n{text-align:right;font-variant-numeric:tabular-nums}
tfoot td{font-weight:600;border-bottom:none}
.note,.empty{color:var(--vscode-descriptionForeground);font-size:.92em;margin:8px 0 0}
.chart{width:100%;height:120px;display:block}
.chart rect{fill:var(--vscode-charts-blue,var(--vscode-button-background))}
</style></head>
<body>
<h1>${escapeHtml(strings.title)}</h1>
${tabs}
<div class="panes table-wrap">${panes}</div>
<h2>${escapeHtml(strings.chartTitle)}</h2>
${renderDailyChart(chartDays)}
</body></html>`;
}
