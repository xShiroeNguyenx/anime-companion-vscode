import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { log } from './log';

export type MessageKey =
  | 'idle'
  | 'greeting'
  | 'error'
  | 'errorMany'
  | 'warning'
  | 'errorFixed'
  | 'save'
  | 'saveSpam'
  | 'typingFast'
  | 'breakReminder'
  | 'buildSuccess'
  | 'buildFail'
  | 'debugStart'
  | 'debugEnd'
  | 'easterTodo'
  | 'easterFixme'
  | 'easterConsole'
  | 'gitRemind'
  | 'gitCommitted'
  | 'gitBranchSwitch'
  | 'gitConflict'
  | 'gitManyChanges'
  | 'moodHappy'
  | 'moodAngry'
  | 'moodSleepy'
  | 'greetingMorning'
  | 'greetingAfternoon'
  | 'greetingEvening'
  | 'greetingNight';

interface MessageDict {
  achievements?: Record<string, string>;
  fileOpen?: Record<string, string>;
  [key: string]: string[] | Record<string, string> | undefined;
}

// Settings keys under animeCompanion.customPhrases.* that augment specific
// message pools. Mapping kept narrow on purpose so users only customize the
// most useful pools.
const CUSTOM_PHRASE_MAP: Partial<Record<MessageKey, string>> = {
  idle: 'idle',
  save: 'save',
  error: 'error',
};

const FALLBACK_LANG = 'vi';
const SUPPORTED_LANGS = new Set(['vi', 'en', 'ja']);

let _bank: MessageBank | null = null;

export function initMessageBank(extensionUri: vscode.Uri): MessageBank {
  _bank?.dispose();
  _bank = new MessageBank(extensionUri);
  return _bank;
}

export function getMessageBank(): MessageBank {
  if (!_bank) {
    throw new Error('MessageBank not initialized — call initMessageBank() first');
  }
  return _bank;
}

export class MessageBank {
  private _extensionUri: vscode.Uri;
  private _dict: MessageDict;
  private _fallback: MessageDict;
  private _disposable: vscode.Disposable;

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
    this._fallback = this._loadLang(FALLBACK_LANG);
    this._dict = this._loadCurrent();
    this._disposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('animeCompanion.messageLanguage')) {
        this._dict = this._loadCurrent();
        log(`MessageBank: reloaded for messageLanguage="${this._currentLang()}"`);
      }
    });
  }

  dispose(): void {
    this._disposable.dispose();
  }

  pick(key: MessageKey, vars?: Record<string, string | number>): string {
    const base = this._poolFor(key);
    const custom = this._customPhrases(key);
    const pool = custom.length > 0 ? base.concat(custom) : base;
    if (pool.length === 0) return '';
    let msg = pool[Math.floor(Math.random() * pool.length)];
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        msg = msg.split(`{${k}}`).join(String(v));
      }
    }
    return msg;
  }

  pickAchievement(id: string): string | undefined {
    return this._dict.achievements?.[id] ?? this._fallback.achievements?.[id];
  }

  // Random reaction shown when the user switches to a file. Looks up by
  // extension first; falls back to the per-language `default` template with
  // `{file}` substituted.
  pickFileMessage(ext: string, fileName: string): string {
    const direct = this._dict.fileOpen?.[ext] ?? this._fallback.fileOpen?.[ext];
    if (direct) return direct;
    const tmpl =
      this._dict.fileOpen?.default ??
      this._fallback.fileOpen?.default ??
      '{file}';
    return tmpl.split('{file}').join(fileName);
  }

  // User-defined `keyword → messages` overrides; consumed by the typing hook
  // alongside the built-in TODO/FIXME/console.log Easter eggs.
  getCustomKeywords(): Array<{ keyword: string; messages: string[] }> {
    const raw = vscode.workspace
      .getConfiguration('animeCompanion')
      .get<Record<string, unknown>>('customKeywords', {});
    if (!raw || typeof raw !== 'object') return [];

    const out: Array<{ keyword: string; messages: string[] }> = [];
    for (const [keyword, val] of Object.entries(raw)) {
      if (!keyword) continue;
      let messages: string[] = [];
      if (Array.isArray(val)) {
        messages = val.filter((s): s is string => typeof s === 'string' && s.length > 0);
      } else if (typeof val === 'string' && val.length > 0) {
        messages = [val];
      }
      if (messages.length > 0) out.push({ keyword, messages });
    }
    return out;
  }

  private _poolFor(key: MessageKey): string[] {
    const primary = this._dict[key];
    if (Array.isArray(primary) && primary.length > 0) return primary;
    const fallback = this._fallback[key];
    return Array.isArray(fallback) ? fallback : [];
  }

  private _customPhrases(key: MessageKey): string[] {
    const sub = CUSTOM_PHRASE_MAP[key];
    if (!sub) return [];
    const cfg = vscode.workspace
      .getConfiguration('animeCompanion')
      .get<unknown>(`customPhrases.${sub}`, []);
    if (!Array.isArray(cfg)) return [];
    return cfg.filter((s): s is string => typeof s === 'string' && s.length > 0);
  }

  private _currentLang(): string {
    const lang = vscode.workspace
      .getConfiguration('animeCompanion')
      .get<string>('messageLanguage', FALLBACK_LANG);
    return SUPPORTED_LANGS.has(lang) ? lang : FALLBACK_LANG;
  }

  private _loadCurrent(): MessageDict {
    return this._loadLang(this._currentLang());
  }

  private _loadLang(lang: string): MessageDict {
    try {
      const filePath = path.join(this._extensionUri.fsPath, 'media', 'messages', `${lang}.json`);
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as MessageDict;
    } catch (err) {
      log(`MessageBank: failed to load ${lang}.json: ${err instanceof Error ? err.message : String(err)}`);
      return {};
    }
  }
}
