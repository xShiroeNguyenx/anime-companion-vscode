// Pure helpers for exporting and searching stored conversations. No `vscode`
// import, so scripts/chat-test.js can exercise them against `out/` directly.
import type { ConversationFile, StoredMessage } from './conversation-store';

export interface UserText {
  text: string;
  /** True when attached context (selection / files) was dropped. */
  contextOmitted: boolean;
}

// Headers context-builder.ts writes before each attached block.
const LEGACY_CONTEXT_HEAD = /^(Selected from `[^`\n]+`:|Active file `[^`\n]+`:|`[^`\n]+`:)\n```/;
const FENCE_CLOSE = '\n```\n\n';

/**
 * What the user actually typed, without the context that was attached to it.
 *
 * Messages saved since v0.7.0 carry it in `prompt`. Older ones only have
 * `content` with the context glued in front, so the prefix is cut at the last
 * closing fence. If the user's own text held a fence, that cuts some of their
 * words too — the safe direction: an export can lose a sentence, but it must
 * never carry a pasted file (which may hold keys) out of the editor.
 */
export function userTextOf(msg: Pick<StoredMessage, 'content' | 'prompt'>): UserText {
  if (typeof msg.prompt === 'string') {
    return { text: msg.prompt, contextOmitted: msg.prompt !== msg.content };
  }
  return stripLegacyContext(msg.content);
}

export function stripLegacyContext(content: string): UserText {
  if (!LEGACY_CONTEXT_HEAD.test(content)) return { text: content, contextOmitted: false };
  const idx = content.lastIndexOf(FENCE_CLOSE);
  return {
    text: idx >= 0 ? content.slice(idx + FENCE_CLOSE.length) : '',
    contextOmitted: true,
  };
}

/** The text a message contributes to an export or a search. */
function visibleText(msg: StoredMessage): UserText {
  return msg.role === 'user' ? userTextOf(msg) : { text: msg.content, contextOmitted: false };
}

function isoMinute(ts: number): string {
  // `toISOString` keeps the output independent of the machine's locale.
  return new Date(ts).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

export interface MarkdownLabels {
  user: string;
  assistant: string;
  contextOmitted: string;
}

export const DEFAULT_MARKDOWN_LABELS: MarkdownLabels = {
  user: 'You',
  assistant: 'Assistant',
  contextOmitted: '_(attached context omitted)_',
};

export function toMarkdown(file: ConversationFile, labels: MarkdownLabels = DEFAULT_MARKDOWN_LABELS): string {
  const { meta } = file;
  const out: string[] = [
    `# ${meta.title || 'Untitled'}`,
    '',
    `> ${meta.providerId} / ${meta.model} · ${isoMinute(meta.createdAt)}`,
    '',
  ];
  for (const msg of file.messages) {
    const { text, contextOmitted } = visibleText(msg);
    out.push(`## ${msg.role === 'user' ? labels.user : labels.assistant} · ${isoMinute(msg.ts)}`, '');
    if (contextOmitted) out.push(labels.contextOmitted, '');
    out.push(text.trim() || '…', '');
  }
  return out.join('\n');
}

export const EXPORT_SCHEMA_VERSION = 1;

/** Every conversation, context stripped, as one JSON document. */
export function toJsonBundle(files: ConversationFile[], exportedAt: number): string {
  return JSON.stringify(
    {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: new Date(exportedAt).toISOString(),
      conversations: files.map((f) => ({
        meta: f.meta,
        messages: f.messages.map((m) => {
          const { text, contextOmitted } = visibleText(m);
          return { role: m.role, content: text, ts: m.ts, ...(contextOmitted ? { contextOmitted: true } : {}) };
        }),
      })),
    },
    null,
    2
  );
}

/** A file name safe on Windows, macOS and Linux. */
export function safeFileName(title: string, ext: string): string {
  const base = Array.from(title, (ch) => (ch.charCodeAt(0) < 0x20 ? ' ' : ch))
    .join('')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .replace(/[. ]+$/, '');
  return `${base || 'conversation'}.${ext}`;
}

// ───────────────────────────────────── search ─────────────────────────────────────

/**
 * Folds case and Vietnamese diacritics, keeping a map back to the original
 * string so a snippet can be cut from the text the user actually wrote.
 */
export function foldForSearch(input: string): { folded: string; map: number[] } {
  let folded = '';
  const map: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const piece = input[i]
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[đĐ]/g, 'd')
      .toLowerCase();
    for (let k = 0; k < piece.length; k++) {
      folded += piece[k];
      map.push(i);
    }
  }
  return { folded, map };
}

export interface SearchHit {
  id: string;
  title: string;
  /** Text around the first body match; empty for a title-only match. */
  snippet: string;
}

const SNIPPET_RADIUS = 40;

function snippetAround(text: string, start: number, end: number): string {
  const from = Math.max(0, start - SNIPPET_RADIUS);
  const to = Math.min(text.length, end + SNIPPET_RADIUS);
  const body = text.slice(from, to).replace(/\s+/g, ' ').trim();
  return `${from > 0 ? '…' : ''}${body}${to < text.length ? '…' : ''}`;
}

/**
 * Conversations whose title or messages contain `query`, newest first.
 *
 * Bodies are searched without attached context, so a file pasted into a
 * question does not make every conversation that touched it a match.
 */
export function searchConversations(files: ConversationFile[], query: string, limit = 50): SearchHit[] {
  const needle = foldForSearch(query.trim()).folded;
  if (!needle) return [];
  const hits: SearchHit[] = [];
  const sorted = [...files].sort((a, b) => b.meta.updatedAt - a.meta.updatedAt);
  for (const file of sorted) {
    if (hits.length >= limit) break;
    let snippet: string | undefined;
    for (const msg of file.messages) {
      const text = visibleText(msg).text;
      const { folded, map } = foldForSearch(text);
      const at = folded.indexOf(needle);
      if (at >= 0) {
        snippet = snippetAround(text, map[at], map[at + needle.length - 1] + 1);
        break;
      }
    }
    const titleMatch = foldForSearch(file.meta.title || '').folded.includes(needle);
    if (snippet !== undefined || titleMatch) {
      hits.push({ id: file.meta.id, title: file.meta.title, snippet: snippet ?? '' });
    }
  }
  return hits;
}
