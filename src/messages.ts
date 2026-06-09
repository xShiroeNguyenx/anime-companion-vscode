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

export interface ResolvedPhrase {
  key: MessageKey;
  text: string;
  template: string;
  vars?: Record<string, string | number>;
  fromCustom: boolean;
  hasPlaceholders: boolean;
}

export interface WebviewStrings {
  dblClickMessages?: string[];
  bubbles?: Record<string, string>;
  menu?: Record<string, string>;
  panels?: Record<string, string>;
  backgroundPanel?: Record<string, string>;
}

interface MessageDict {
  achievements?: Record<string, string>;
  fileOpen?: Record<string, string>;
  webview?: WebviewStrings;
  [key: string]: unknown;
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
const BUILTIN_RUNTIME_TEMPLATES: Record<string, Partial<Record<MessageKey, string[]>>> = {
  vi: {
    save: [
      'Đã save xong file {filename} rồi nha~',
    ],
    gitBranchSwitch: [
      'Mình vừa sang branch {branch} đó nha~',
    ],
    errorMany: [
      'Hiện có {error_count} lỗi rồi nè... mình bình tĩnh xử từng cái nha Onii-chan~',
    ],
  },
  en: {
    save: [
      'Saved file {filename} successfully~',
    ],
    gitBranchSwitch: [
      'We just hopped over to branch {branch}~',
    ],
    errorMany: [
      'There are {error_count} errors right now~ let us fix them one by one!',
    ],
  },
  ja: {
    save: [
      '{filename} ÃƒÆ’Ã‚Â£ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã‚Â£ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã‚Â£Ãƒâ€ Ã¢â‚¬â„¢Ãƒâ€šÃ‚Â¼ÃƒÆ’Ã‚Â£Ãƒâ€ Ã¢â‚¬â„¢ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“ÃƒÆ’Ã‚Â£Ãƒâ€šÃ‚ÂÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬ÂÃƒÆ’Ã‚Â£Ãƒâ€šÃ‚ÂÃƒâ€¦Ã‚Â¸ÃƒÆ’Ã‚Â£ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€¹Ã¢â‚¬Â ÃƒÆ’Ã‚Â£ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“',
    ],
    gitBranchSwitch: [
      'ÃƒÆ’Ã‚Â£Ãƒâ€ Ã¢â‚¬â„¢ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“ÃƒÆ’Ã‚Â£Ãƒâ€ Ã¢â‚¬â„¢Ãƒâ€šÃ‚Â©ÃƒÆ’Ã‚Â£Ãƒâ€ Ã¢â‚¬â„¢Ãƒâ€šÃ‚Â³ÃƒÆ’Ã‚Â£Ãƒâ€ Ã¢â‚¬â„¢Ãƒâ€šÃ‚Â {branch} ÃƒÆ’Ã‚Â£Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚Â«ÃƒÆ’Ã‚Â¥Ãƒâ€¹Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¡ÃƒÆ’Ã‚Â£ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€¦Ã‚Â ÃƒÆ’Ã‚Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂºÃƒâ€šÃ‚Â¿ÃƒÆ’Ã‚Â£Ãƒâ€šÃ‚ÂÃƒâ€¹Ã¢â‚¬Â ÃƒÆ’Ã‚Â£Ãƒâ€šÃ‚ÂÃƒâ€¦Ã‚Â¸ÃƒÆ’Ã‚Â£ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€¹Ã¢â‚¬Â ÃƒÆ’Ã‚Â£ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“',
    ],
    errorMany: [
      'ÃƒÆ’Ã‚Â£Ãƒâ€šÃ‚ÂÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾ÃƒÆ’Ã‚Â£Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚Â¾ {error_count} ÃƒÆ’Ã‚Â¥ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¹ÃƒÆ’Ã‚Â£Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚Â®ÃƒÆ’Ã‚Â£ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¨ÃƒÆ’Ã‚Â£Ãƒâ€ Ã¢â‚¬â„¢Ãƒâ€šÃ‚Â©ÃƒÆ’Ã‚Â£Ãƒâ€ Ã¢â‚¬â„¢Ãƒâ€šÃ‚Â¼ÃƒÆ’Ã‚Â£Ãƒâ€šÃ‚ÂÃƒâ€¦Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â£Ãƒâ€šÃ‚ÂÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã‚Â£ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¹ÃƒÆ’Ã‚Â£ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€¹Ã¢â‚¬Â ÃƒÆ’Ã‚Â£ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã‚Â£Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚Â²ÃƒÆ’Ã‚Â£Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚Â¨ÃƒÆ’Ã‚Â£Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚Â¤ÃƒÆ’Ã‚Â£Ãƒâ€šÃ‚ÂÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â£Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚Â¤ÃƒÆ’Ã‚Â§ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂºÃƒâ€šÃ‚Â´ÃƒÆ’Ã‚Â£Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚ÂÃƒÆ’Ã‚Â£Ãƒâ€šÃ‚ÂÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â£Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚Â­ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¼Ãƒâ€šÃ‚Â',
    ],
  },
};

let _bank: MessageBank | null = null;

export function initMessageBank(extensionUri: vscode.Uri): MessageBank {
  _bank?.dispose();
  _bank = new MessageBank(extensionUri);
  return _bank;
}

export function getMessageBank(): MessageBank {
  if (!_bank) {
    throw new Error('MessageBank not initialized ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â call initMessageBank() first');
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
    return this.pickResolved(key, vars).text;
  }

  pickResolved(key: MessageKey, vars?: Record<string, string | number>): ResolvedPhrase {
    const base = this._poolFor(key);
    const custom = this._customPhrases(key);
    const builtinRuntime = this._builtinRuntimeTemplates(key);
    const pool: Array<{ template: string; fromCustom: boolean }> = [
      ...base.map((template) => ({ template, fromCustom: false })),
      ...builtinRuntime.map((template) => ({ template, fromCustom: false })),
      ...custom.map((template) => ({ template, fromCustom: true })),
    ];
    const preferredPool = vars
      ? pool.filter((entry) => this._templateUsesAnyVar(entry.template, vars))
      : [];
    const effectivePool = preferredPool.length > 0 ? preferredPool : pool;

    if (effectivePool.length === 0) {
      return {
        key,
        text: '',
        template: '',
        vars,
        fromCustom: false,
        hasPlaceholders: false,
      };
    }

    const picked = effectivePool[Math.floor(Math.random() * effectivePool.length)];
    return {
      key,
      text: this._applyVars(picked.template, vars),
      template: picked.template,
      vars,
      fromCustom: picked.fromCustom,
      hasPlaceholders: /\{[a-zA-Z0-9_]+\}/.test(picked.template),
    };
  }

  pickAchievement(id: string): string | undefined {
    return this._dict.achievements?.[id] ?? this._fallback.achievements?.[id];
  }

  getWebviewStrings(): WebviewStrings {
    return this._mergeObjects(this._fallback.webview ?? {}, this._dict.webview ?? {});
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

  // User-defined `keyword ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ messages` overrides; consumed by the typing hook
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

  private _builtinRuntimeTemplates(key: MessageKey): string[] {
    return BUILTIN_RUNTIME_TEMPLATES[this._currentLang()]?.[key] ?? [];
  }

  private _templateUsesAnyVar(template: string, vars: Record<string, string | number>): boolean {
    return Object.keys(vars).some((key) => template.includes(`{${key}}`));
  }

  private _applyVars(template: string, vars?: Record<string, string | number>): string {
    if (!vars) return template;

    let msg = template;
    for (const [k, v] of Object.entries(vars)) {
      msg = msg.split(`{${k}}`).join(String(v));
    }
    return msg;
  }

  private _mergeObjects<T>(base: T, override: Partial<T>): T {
    if (Array.isArray(base) || Array.isArray(override)) {
      return (override ?? base) as T;
    }

    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
      if (value === undefined) continue;
      const baseValue = out[key];
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        baseValue &&
        typeof baseValue === 'object' &&
        !Array.isArray(baseValue)
      ) {
        out[key] = this._mergeObjects(
          baseValue as Record<string, unknown>,
          value as Record<string, unknown>
        );
      } else {
        out[key] = value;
      }
    }
    return out as T;
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
