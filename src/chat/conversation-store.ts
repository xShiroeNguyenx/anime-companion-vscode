import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { log } from '../log';
import type { ChatMessage } from './llm-provider';
import type { ProviderId } from './secrets';

export interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

export interface ConversationMeta {
  id: string;
  title: string;
  providerId: ProviderId;
  model: string;
  createdAt: number;
  updatedAt: number;
}

export interface ConversationFile {
  meta: ConversationMeta;
  messages: StoredMessage[];
}

const ACTIVE_KEY = 'animeCompanion.chat.activeConversationId';

// Multi-conversation store. Each conversation lives in its own JSON file under
// globalStorageUri/chat-history/<id>.json so the per-conversation payload can
// grow without bloating globalState. The active conversation id is held in
// workspaceState — different workspaces can each pin a different chat.
export class ConversationStore {
  private _dir: string;
  private _ready: Promise<void>;
  private _metaCache: ConversationMeta[] | null = null;

  constructor(private readonly _context: vscode.ExtensionContext) {
    this._dir = path.join(_context.globalStorageUri.fsPath, 'chat-history');
    this._ready = fs.promises
      .mkdir(this._dir, { recursive: true })
      .then(() => {
        // Touch — ensures the cache is warm before the first call returns.
        return undefined;
      })
      .catch((err) => {
        log(`ConversationStore: mkdir failed for ${this._dir}: ${err instanceof Error ? err.message : String(err)}`);
      });
  }

  // ───────────────────────────────────── meta / list ─────────────────────────────────────

  async list(): Promise<ConversationMeta[]> {
    if (this._metaCache) return [...this._metaCache];

    await this._ready;
    const out: ConversationMeta[] = [];
    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(this._dir, { withFileTypes: true });
    } catch (err) {
      log(`ConversationStore.list: readdir failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const file = await this._readFile(path.join(this._dir, entry.name));
      if (file) out.push(file.meta);
    }

    out.sort((a, b) => b.updatedAt - a.updatedAt);
    this._metaCache = out;
    return [...out];
  }

  getActiveId(): string | undefined {
    return this._context.workspaceState.get<string>(ACTIVE_KEY);
  }

  async setActiveId(id: string | undefined): Promise<void> {
    await this._context.workspaceState.update(ACTIVE_KEY, id);
  }

  // ───────────────────────────────────── CRUD ─────────────────────────────────────

  async get(id: string): Promise<ConversationFile | undefined> {
    await this._ready;
    return this._readFile(this._filePath(id));
  }

  async create(providerId: ProviderId, model: string): Promise<ConversationFile> {
    await this._ready;
    const now = Date.now();
    const file: ConversationFile = {
      meta: {
        id: newId(),
        title: 'New chat',
        providerId,
        model,
        createdAt: now,
        updatedAt: now,
      },
      messages: [],
    };
    await this._writeFile(file);
    this._metaCache = null;
    return file;
  }

  async save(file: ConversationFile): Promise<void> {
    await this._ready;
    file.meta.updatedAt = Date.now();
    if (file.meta.title === 'New chat') {
      const first = file.messages.find((m) => m.role === 'user');
      if (first) file.meta.title = makeTitle(first.content);
    }
    await this._writeFile(file);
    this._metaCache = null;
  }

  async delete(id: string): Promise<void> {
    await this._ready;
    try {
      await fs.promises.unlink(this._filePath(id));
    } catch (err) {
      log(`ConversationStore.delete: unlink failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    this._metaCache = null;
    if (this.getActiveId() === id) {
      await this.setActiveId(undefined);
    }
  }

  async rename(id: string, title: string): Promise<void> {
    const file = await this.get(id);
    if (!file) return;
    file.meta.title = title.trim() || file.meta.title;
    await this._writeFile(file);
    this._metaCache = null;
  }

  // Drop all conversations. Currently invoked by the legacy "Clear Chat History"
  // command — useful when the user wants a clean slate.
  async clearAll(): Promise<void> {
    await this._ready;
    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(this._dir, { withFileTypes: true });
    } catch {
      // ignore
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.json')) {
        try {
          await fs.promises.unlink(path.join(this._dir, entry.name));
        } catch {
          // ignore — best effort
        }
      }
    }
    this._metaCache = null;
    await this.setActiveId(undefined);
  }

  // ───────────────────────────────────── helpers ─────────────────────────────────────

  toProviderMessages(file: ConversationFile): ChatMessage[] {
    return file.messages.map((m) => ({ role: m.role, content: m.content }));
  }

  private _filePath(id: string): string {
    return path.join(this._dir, `${id}.json`);
  }

  private async _readFile(filePath: string): Promise<ConversationFile | undefined> {
    try {
      const raw = await fs.promises.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as ConversationFile;
      if (!parsed?.meta?.id || !Array.isArray(parsed.messages)) return undefined;
      return parsed;
    } catch {
      return undefined;
    }
  }

  private async _writeFile(file: ConversationFile): Promise<void> {
    const target = this._filePath(file.meta.id);
    const tmp = `${target}.tmp`;
    const data = JSON.stringify(file, null, 2);
    await fs.promises.writeFile(tmp, data, 'utf8');
    await fs.promises.rename(tmp, target);
  }
}

function newId(): string {
  // Tiny URL-safe id. Collision risk is negligible for per-user chat history.
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${Date.now().toString(36)}-${rnd}`;
}

function makeTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 48) return cleaned || 'New chat';
  return cleaned.slice(0, 45) + '…';
}
