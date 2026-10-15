// Tests for the pure chat helpers in out/chat/conversation-export.js: context
// stripping, Markdown / JSON export and conversation search. Run after
// `npm run compile` (npm test does both).
const assert = require('assert');
const {
  userTextOf,
  stripLegacyContext,
  toMarkdown,
  toJsonBundle,
  safeFileName,
  foldForSearch,
  searchConversations,
  EXPORT_SCHEMA_VERSION,
} = require('../out/chat/conversation-export.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// The exact shape context-builder.ts writes in front of a prompt.
const FAKE_SECRET = 'not-a-real-secret-value';
const legacyWithFile =
  'Active file `src/.env.ts`:\n```typescript\nexport const KEY = "' + FAKE_SECRET + '";\n```\n\n' +
  'Selected from `src/a.ts`:\n```typescript\nconst x = 1;\n```\n\n' +
  'Why does this fail?';

function conv(id, title, messages, updatedAt = 1) {
  return {
    meta: { id, title, providerId: 'copilot', model: 'gpt-4o', createdAt: 0, updatedAt },
    messages,
  };
}

// ---- context stripping ---------------------------------------------------------

test('a v0.7 message uses its prompt and reports the omitted context', () => {
  const r = userTextOf({ content: legacyWithFile, prompt: 'Why does this fail?' });
  assert.deepStrictEqual(r, { text: 'Why does this fail?', contextOmitted: true });
  assert.deepStrictEqual(userTextOf({ content: 'hi', prompt: 'hi' }), { text: 'hi', contextOmitted: false });
});

test('a legacy message has its context cut at the last closing fence', () => {
  const r = stripLegacyContext(legacyWithFile);
  assert.strictEqual(r.text, 'Why does this fail?');
  assert.strictEqual(r.contextOmitted, true);
});

test('a legacy message with no context is left alone', () => {
  const plain = 'Explain this:\n```js\nfoo()\n```\n\nthanks';
  assert.deepStrictEqual(stripLegacyContext(plain), { text: plain, contextOmitted: false });
});

test('a fence inside the question never lets the context through', () => {
  const content = 'Active file `a.ts`:\n```ts\n' + FAKE_SECRET + '\n```\n\nCompare with\n```\nx\n```\n\nok?';
  const r = stripLegacyContext(content);
  assert.ok(!r.text.includes(FAKE_SECRET), 'context leaked');
  assert.strictEqual(r.contextOmitted, true);
});

// ---- export -----------------------------------------------------------------------

test('Markdown export leaves attached context out', () => {
  const md = toMarkdown(
    conv('a', 'Env question', [
      { role: 'user', content: legacyWithFile, ts: 0 },
      { role: 'assistant', content: 'Because KEY is undefined.', ts: 60000 },
    ])
  );
  assert.ok(md.startsWith('# Env question\n'));
  assert.ok(md.includes('Why does this fail?'));
  assert.ok(md.includes('Because KEY is undefined.'));
  assert.ok(md.includes('attached context omitted'));
  assert.ok(!md.includes(FAKE_SECRET), 'context leaked into Markdown');
  assert.ok(md.includes('1970-01-01 00:01 UTC'), 'timestamps are locale-independent');
});

test('JSON bundle is versioned and context-free', () => {
  const json = toJsonBundle(
    [conv('a', 'A', [{ role: 'user', content: legacyWithFile, prompt: 'Why does this fail?', ts: 0 }])],
    0
  );
  const parsed = JSON.parse(json);
  assert.strictEqual(parsed.schemaVersion, EXPORT_SCHEMA_VERSION);
  assert.strictEqual(parsed.conversations[0].messages[0].content, 'Why does this fail?');
  assert.strictEqual(parsed.conversations[0].messages[0].contextOmitted, true);
  assert.ok(!json.includes(FAKE_SECRET), 'context leaked into JSON');
  assert.ok(!('prompt' in parsed.conversations[0].messages[0]));
});

test('safeFileName strips characters Windows rejects', () => {
  assert.strictEqual(safeFileName('a/b:c*d?"e<f>g|h', 'md'), 'a b c d e f g h.md');
  assert.strictEqual(safeFileName('   ', 'json'), 'conversation.json');
  assert.strictEqual(safeFileName('ends with dots...', 'md'), 'ends with dots.md');
  assert.ok(safeFileName('x'.repeat(200), 'md').length <= 63);
});

// ---- search -----------------------------------------------------------------------

test('folding ignores case and Vietnamese diacritics, keeping an index map', () => {
  const { folded, map } = foldForSearch('Đặt Lịch');
  assert.strictEqual(folded, 'dat lich');
  assert.strictEqual(map.length, folded.length);
  assert.strictEqual(map[4], 4);
});

test('search matches bodies without diacritics and returns a snippet', () => {
  const files = [
    conv('old', 'Khác', [{ role: 'assistant', content: 'Không liên quan', ts: 0 }], 1),
    conv('new', 'Hỏi về lỗi', [{ role: 'assistant', content: 'Bạn cần cấu hình lại webpack trước.', ts: 0 }], 2),
  ];
  const hits = searchConversations(files, 'CAU HINH');
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].id, 'new');
  assert.ok(hits[0].snippet.includes('cấu hình'), hits[0].snippet);
});

test('search matches titles and orders newest first', () => {
  const files = [
    conv('a', 'Deploy notes', [], 1),
    conv('b', 'More deploy', [], 3),
    conv('c', 'Other', [], 2),
  ];
  assert.deepStrictEqual(searchConversations(files, 'deploy').map((h) => h.id), ['b', 'a']);
});

test('search does not look inside attached context', () => {
  const files = [conv('a', 'Env question', [{ role: 'user', content: legacyWithFile, ts: 0 }])];
  assert.strictEqual(searchConversations(files, FAKE_SECRET).length, 0);
  assert.strictEqual(searchConversations(files, 'does this fail').length, 1);
});

test('search respects the limit and ignores a blank query', () => {
  const files = Array.from({ length: 80 }, (_, i) => conv(String(i), `note ${i}`, [], i));
  assert.strictEqual(searchConversations(files, 'note').length, 50);
  assert.strictEqual(searchConversations(files, 'note', 5).length, 5);
  assert.strictEqual(searchConversations(files, '   ').length, 0);
});

// ---- model catalog (OpenRouter) ---------------------------------------------------

const {
  parseOpenRouterModels,
  formatModelDetail,
  estimateCostUsd,
  formatUsd,
  isCatalogFresh,
  CATALOG_TTL_MS,
} = require('../out/chat/model-catalog.js');

const OPENROUTER_SAMPLE = {
  data: [
    { id: 'anthropic/claude-sonnet', name: 'Claude Sonnet', context_length: 200000, pricing: { prompt: '0.000003', completion: '0.000015' } },
    { id: 'openrouter/auto', name: 'Auto Router', context_length: 2000000, pricing: { prompt: '-1', completion: '-1' } },
    { id: 'meta/llama:free', context_length: 131072, pricing: { prompt: '0', completion: '0' } },
    { id: 'anthropic/claude-sonnet', pricing: { prompt: '1', completion: '1' } },
    { name: 'no id' },
    'garbage',
  ],
};

test('OpenRouter catalog: router first, duplicates and junk dropped, prices per 1M', () => {
  const models = parseOpenRouterModels(OPENROUTER_SAMPLE);
  assert.deepStrictEqual(models.map((m) => m.id), ['openrouter/auto', 'anthropic/claude-sonnet', 'meta/llama:free']);
  const sonnet = models[1];
  assert.ok(Math.abs(sonnet.promptPerM - 3) < 1e-9 && Math.abs(sonnet.completionPerM - 15) < 1e-9);
  assert.strictEqual(models[0].promptPerM, undefined, 'the router has no fixed price');
  assert.deepStrictEqual(parseOpenRouterModels({}), []);
  assert.deepStrictEqual(parseOpenRouterModels(null), []);
});

test('model detail line', () => {
  const [auto, sonnet, free] = parseOpenRouterModels(OPENROUTER_SAMPLE);
  assert.strictEqual(formatModelDetail(sonnet), '$3 / $15 per 1M · 200k ctx');
  assert.strictEqual(formatModelDetail(free), 'free · 131k ctx');
  assert.strictEqual(formatModelDetail(auto), '2000k ctx');
  assert.strictEqual(formatModelDetail({ id: 'x' }), '');
});

test('cost estimate and freshness', () => {
  const sonnet = parseOpenRouterModels(OPENROUTER_SAMPLE)[1];
  assert.ok(Math.abs(estimateCostUsd({ in: 1_000_000, out: 100_000 }, sonnet) - 4.5) < 1e-9);
  assert.strictEqual(estimateCostUsd({ in: 10, out: 10 }, undefined), undefined);
  assert.strictEqual(formatUsd(0.004), '<$0.01');
  assert.strictEqual(formatUsd(4.5), '$4.50');
  const catalog = { fetchedAt: 1000, models: [sonnet] };
  assert.ok(isCatalogFresh(catalog, 1000 + CATALOG_TTL_MS - 1));
  assert.ok(!isCatalogFresh(catalog, 1000 + CATALOG_TTL_MS));
  assert.ok(!isCatalogFresh({ fetchedAt: 1000, models: [] }, 1000), 'an empty catalog is never fresh');
  assert.ok(!isCatalogFresh(undefined, 0));
});

// ---- usage bookkeeping -------------------------------------------------------------

const {
  emptyUsage,
  normalizeUsage,
  addUsage,
  pruneUsage,
  dayKeysBack,
  aggregateUsage,
  conversationTotals,
} = require('../out/chat/usage.js');

test('dayKeysBack crosses month and year ends', () => {
  assert.deepStrictEqual(dayKeysBack('2026-03-01', 3), ['2026-02-27', '2026-02-28', '2026-03-01']);
  assert.deepStrictEqual(dayKeysBack('2027-01-01', 2), ['2026-12-31', '2027-01-01']);
});

test('addUsage counts tokens, and replies without a count as unmetered', () => {
  const data = emptyUsage();
  addUsage(data, '2026-10-15', 'openrouter', 'a/b', { inputTokens: 100, outputTokens: 20 });
  addUsage(data, '2026-10-15', 'openrouter', 'a/b', { inputTokens: 50, outputTokens: 5 });
  addUsage(data, '2026-10-15', 'copilot', 'gpt-4o', undefined);
  assert.deepStrictEqual(data.days['2026-10-15'].openrouter['a/b'], { in: 150, out: 25, turns: 2, unmetered: 0 });
  assert.deepStrictEqual(data.days['2026-10-15'].copilot['gpt-4o'], { in: 0, out: 0, turns: 1, unmetered: 1 });
});

test('pruneUsage folds old days into months and keeps all-time totals', () => {
  const data = emptyUsage();
  addUsage(data, '2026-01-10', 'openai', 'gpt', { inputTokens: 10, outputTokens: 1 });
  addUsage(data, '2026-01-20', 'openai', 'gpt', { inputTokens: 5, outputTokens: 1 });
  addUsage(data, '2026-10-15', 'openai', 'gpt', { inputTokens: 1, outputTokens: 1 });
  pruneUsage(data, '2026-10-15', 180);
  assert.deepStrictEqual(Object.keys(data.days), ['2026-10-15']);
  assert.deepStrictEqual(data.months['2026-01'].openai.gpt, { in: 15, out: 2, turns: 2, unmetered: 0 });
  const all = aggregateUsage(data, Object.keys(data.days), true);
  assert.deepStrictEqual(all.total, { in: 16, out: 3, turns: 3, unmetered: 0 });
  const recent = aggregateUsage(data, Object.keys(data.days));
  assert.strictEqual(recent.total.in, 1, 'months only count for all-time');
});

test('aggregateUsage sorts by tokens and lists every day asked for', () => {
  const data = emptyUsage();
  addUsage(data, '2026-10-14', 'gemini', 'small', { inputTokens: 1, outputTokens: 1 });
  addUsage(data, '2026-10-15', 'anthropic', 'big', { inputTokens: 900, outputTokens: 100 });
  const s = aggregateUsage(data, ['2026-10-13', '2026-10-14', '2026-10-15']);
  assert.deepStrictEqual(s.rows.map((r) => r.model), ['big', 'small']);
  assert.deepStrictEqual(s.perDay.map((d) => d.in + d.out), [0, 2, 1000]);
});

test('normalizeUsage discards malformed state', () => {
  assert.deepStrictEqual(normalizeUsage(undefined), emptyUsage());
  assert.deepStrictEqual(normalizeUsage({ version: 2 }), emptyUsage());
  assert.deepStrictEqual(normalizeUsage('nope'), emptyUsage());
});

test('conversationTotals sums stored reply usage and ignores the rest', () => {
  assert.deepStrictEqual(
    conversationTotals([{ usage: { in: 10, out: 2 } }, {}, { usage: { in: 5, out: 1 } }, { usage: { in: -3, out: NaN } }]),
    { in: 15, out: 3 }
  );
});

// ---- usage panel ---------------------------------------------------------------------

const { renderUsageHtml, escapeHtml } = require('../out/chat/usage-view.js');

test('usage page: no script, escaped names, cost only for OpenRouter', () => {
  const data = emptyUsage();
  addUsage(data, '2026-10-15', 'openrouter', 'anthropic/claude-sonnet', { inputTokens: 1_000_000, outputTokens: 0 });
  addUsage(data, '2026-10-15', 'ollama', '<img src=x onerror=alert(1)>', { inputTokens: 5, outputTokens: 5 });
  addUsage(data, '2026-10-15', 'copilot', 'gpt-4o', undefined);
  const sonnet = parseOpenRouterModels(OPENROUTER_SAMPLE)[1];
  const html = renderUsageHtml(
    [{ id: 'today', label: 'Today', summary: aggregateUsage(data, ['2026-10-15']) }],
    aggregateUsage(data, ['2026-10-15']).perDay,
    (provider, model) => (provider === 'openrouter' && model === sonnet.id ? sonnet : undefined)
  );
  assert.ok(!/<script/i.test(html), 'the panel must stay script-free');
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(!html.includes('<img src=x'), 'model names must be escaped');
  assert.ok(html.includes(escapeHtml('<img src=x onerror=alert(1)>')));
  assert.ok(html.includes('$3.00'), 'OpenRouter cost is shown');
  assert.ok(html.includes('1 replies have no token count'), 'unmetered replies are explained');
});

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      fn();
    } catch (err) {
      failed++;
      console.error(`[chat-test] FAIL ${name}\n  ${err && err.message}`);
    }
  }
  if (failed) {
    console.error(`[chat-test] ${failed} of ${tests.length} failed`);
    process.exit(1);
  }
  console.log(`[chat-test] ${tests.length} passed.`);
})();
