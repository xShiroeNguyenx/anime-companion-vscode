import * as vscode from 'vscode';
import { log } from './log';
import { getMessageBank } from './messages';

/**
 * Settings panel — the extension's own, grouped settings page.
 *
 * VS Code's Settings UI lists our ~80 keys alphabetically under one heading,
 * so "Ambient Volume" sits between "Background › Editor › Blur" and "Chat ›
 * Model". This panel reads the same schema from package.json — nothing is
 * declared twice — and lays it out in themed sections with a search box,
 * proper controls per type, and a reset per item. Values are written to user
 * settings exactly as the native UI would; the native UI and settings.json stay
 * one click away for anything unusual.
 */

type SchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';

interface SettingSchema {
  type?: SchemaType | SchemaType[];
  default?: unknown;
  enum?: unknown[];
  enumDescriptions?: string[];
  minimum?: number;
  maximum?: number;
  description?: string;
  markdownDescription?: string;
}

interface SettingItem {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  default: unknown;
  value: unknown;
  isDefault: boolean;
  source: 'default' | 'global' | 'workspace';
  enum?: unknown[];
  enumDescriptions?: string[];
  minimum?: number;
  maximum?: number;
  description: string;
}

interface SectionDef {
  id: string;
  icon: string;
  match: RegExp;
  /** A section whose settings live in another panel shows a button instead of items. */
  command?: string;
}

// Order is the order on screen; a key lands in the first section it matches.
const SECTIONS: SectionDef[] = [
  {
    id: 'model',
    icon: '🎭',
    match: /^(model$|customModelRoots|customModels|expressionMap|modelDownloadBaseUrl|characterSize|showOnStartup|focusFollow\.|menuStyle|hints\.|hoverReactions\.)/,
  },
  { id: 'sound', icon: '🔊', match: /^(voiceLanguage|muted|ambientPreset|ambientVolume|customAmbientTracks|voiceAssets\.)/ },
  {
    id: 'messages',
    icon: '💬',
    match: /^(messageLanguage|messageIntervalMin|messageIntervalMax|quietHours|customPhrases\.|customKeywords|reactive\.|breakReminderMinutes)/,
  },
  { id: 'pomodoro', icon: '🍅', match: /^pomodoro/ },
  { id: 'chibi', icon: '🐥', match: /^cursorChase\./ },
  { id: 'chat', icon: '🤖', match: /^chat\./ },
  { id: 'desktop', icon: '🖥️', match: /^desktopCompanion\./ },
  { id: 'background', icon: '🖼️', match: /^background\./, command: 'animeCompanion.openBackgroundSettings' },
  { id: 'other', icon: '⚙️', match: /./ },
];

const EXT_FILTER = '@ext:shiroenguyen.anime-companion-vscode';

function nonce(): string {
  let s = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function primaryType(schema: SettingSchema): SettingItem['type'] {
  const raw = Array.isArray(schema.type)
    ? schema.type.find((entry) => entry !== 'null')
    : schema.type;
  if (raw === 'integer' || raw === 'number') return 'number';
  if (raw === 'boolean') return 'boolean';
  if (raw === 'array') return 'array';
  if (raw === 'object') return 'object';
  return 'string';
}

export class SettingsPanel {
  private static _current: SettingsPanel | undefined;

  static reveal(context: vscode.ExtensionContext): void {
    if (SettingsPanel._current) {
      SettingsPanel._current._panel.reveal(vscode.ViewColumn.Active);
      SettingsPanel._current._broadcast();
      return;
    }
    const strings = getMessageBank().getWebviewStrings().settingsPanel ?? {};
    const panel = vscode.window.createWebviewPanel(
      'animeCompanion.settingsPanel',
      strings.title || 'Anime Companion Settings',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
      }
    );
    SettingsPanel._current = new SettingsPanel(panel, context);
  }

  private readonly _disposables: vscode.Disposable[] = [];
  private _broadcastTimer: NodeJS.Timeout | undefined;

  private constructor(
    private readonly _panel: vscode.WebviewPanel,
    private readonly _context: vscode.ExtensionContext
  ) {
    this._panel.webview.html = this._renderHtml();
    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage((m) => this._handleMessage(m), null, this._disposables);
    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('animeCompanion')) this._broadcast();
      })
    );
  }

  private _dispose(): void {
    SettingsPanel._current = undefined;
    if (this._broadcastTimer) clearTimeout(this._broadcastTimer);
    while (this._disposables.length) {
      try {
        this._disposables.pop()?.dispose();
      } catch {
        /* ignore */
      }
    }
  }

  // ---- schema ----------------------------------------------------------------

  /** The `animeCompanion.*` properties contributed by this extension, short-keyed. */
  private _schemas(): Record<string, SettingSchema> {
    const contributed = this._context.extension.packageJSON?.contributes?.configuration;
    const blocks: Array<{ properties?: Record<string, SettingSchema> }> = Array.isArray(contributed)
      ? contributed
      : contributed
        ? [contributed]
        : [];
    const out: Record<string, SettingSchema> = {};
    for (const block of blocks) {
      for (const [fullKey, schema] of Object.entries(block.properties ?? {})) {
        if (!fullKey.startsWith('animeCompanion.')) continue;
        out[fullKey.slice('animeCompanion.'.length)] = schema;
      }
    }
    return out;
  }

  private _item(key: string, schema: SettingSchema): SettingItem {
    const config = vscode.workspace.getConfiguration('animeCompanion');
    const info = config.inspect<unknown>(key);
    const hasWorkspace =
      info?.workspaceValue !== undefined || info?.workspaceFolderValue !== undefined;
    const hasGlobal = info?.globalValue !== undefined;
    return {
      key,
      type: primaryType(schema),
      default: schema.default,
      value: config.get<unknown>(key),
      isDefault: !hasWorkspace && !hasGlobal,
      source: hasWorkspace ? 'workspace' : hasGlobal ? 'global' : 'default',
      enum: Array.isArray(schema.enum) ? schema.enum : undefined,
      enumDescriptions: Array.isArray(schema.enumDescriptions) ? schema.enumDescriptions : undefined,
      minimum: typeof schema.minimum === 'number' ? schema.minimum : undefined,
      maximum: typeof schema.maximum === 'number' ? schema.maximum : undefined,
      description: schema.markdownDescription || schema.description || '',
    };
  }

  // ---- state -----------------------------------------------------------------

  private _broadcast(): void {
    // Several config events can land in one tick (a reset clears two scopes);
    // one repaint is enough.
    if (this._broadcastTimer) clearTimeout(this._broadcastTimer);
    this._broadcastTimer = setTimeout(() => {
      this._broadcastTimer = undefined;
      this._broadcastNow();
    }, 40);
  }

  private _broadcastNow(): void {
    const schemas = this._schemas();
    const sections = SECTIONS.map((section) => ({
      id: section.id,
      icon: section.icon,
      command: section.command,
      items: [] as SettingItem[],
    }));
    for (const key of Object.keys(schemas)) {
      const target = sections.find((section, index) => SECTIONS[index].match.test(key)) ?? sections[sections.length - 1];
      // Sections handled by another panel list nothing; the panel's own button
      // is what the user sees there.
      if (target.command) continue;
      target.items.push(this._item(key, schemas[key]));
    }
    this._panel.webview.postMessage({
      command: 'settings:state',
      strings: getMessageBank().getWebviewStrings().settingsPanel ?? {},
      sections: sections.filter((section) => section.items.length > 0 || section.command),
    });
  }

  // ---- messages --------------------------------------------------------------

  private async _handleMessage(msg: any): Promise<void> {
    try {
      switch (msg?.command) {
        case 'settings:ready':
          this._broadcast();
          return;
        case 'settings:set':
          await this._set(msg.key, msg.value);
          return;
        case 'settings:reset':
          if (typeof msg.key === 'string' && this._schemas()[msg.key]) {
            await vscode.workspace
              .getConfiguration('animeCompanion')
              .update(msg.key, undefined, vscode.ConfigurationTarget.Global);
          }
          return;
        case 'settings:openNative':
          await vscode.commands.executeCommand('workbench.action.openSettings', EXT_FILTER);
          return;
        case 'settings:openJson':
          await vscode.commands.executeCommand('workbench.action.openSettingsJson');
          return;
        case 'settings:openSection': {
          // Only the commands a section card declares — never an arbitrary one from the webview.
          const section = SECTIONS.find((entry) => entry.id === msg.id && entry.command);
          if (section?.command) await vscode.commands.executeCommand(section.command);
          return;
        }
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      log(`SettingsPanel error: ${detail}`);
      vscode.window.showErrorMessage(`Settings action failed: ${detail}`);
    }
  }

  /** Writes one setting after checking the value against its schema. */
  private async _set(key: unknown, raw: unknown): Promise<void> {
    if (typeof key !== 'string') return;
    const schema = this._schemas()[key];
    if (!schema) return;
    const value = this._coerce(schema, raw);
    if (value === undefined) {
      const strings = getMessageBank().getWebviewStrings().settingsPanel ?? {};
      vscode.window.showWarningMessage(
        (strings.rejected || 'Value not accepted for {key}.').replace('{key}', key)
      );
      this._broadcast();
      return;
    }
    await vscode.workspace
      .getConfiguration('animeCompanion')
      .update(key, value, vscode.ConfigurationTarget.Global);
    this._broadcast();
  }

  /** The value to store, or undefined when it does not fit the schema. */
  private _coerce(schema: SettingSchema, raw: unknown): unknown {
    switch (primaryType(schema)) {
      case 'boolean':
        return typeof raw === 'boolean' ? raw : raw === 'true' ? true : raw === 'false' ? false : undefined;
      case 'number': {
        const n = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(n)) return undefined;
        if (schema.type === 'integer' && !Number.isInteger(n)) return Math.round(n);
        if (typeof schema.minimum === 'number' && n < schema.minimum) return schema.minimum;
        if (typeof schema.maximum === 'number' && n > schema.maximum) return schema.maximum;
        return n;
      }
      case 'string': {
        if (typeof raw !== 'string') return undefined;
        if (Array.isArray(schema.enum) && !schema.enum.includes(raw)) return undefined;
        return raw;
      }
      case 'array':
        return Array.isArray(raw) ? raw : undefined;
      case 'object':
        return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : undefined;
    }
    return undefined;
  }

  // ---- html ------------------------------------------------------------------

  private _renderHtml(): string {
    const webview = this._panel.webview;
    const n = nonce();
    const bust = `${Date.now()}`;
    const cssUri = webview
      .asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'webview', 'settings-panel.css'))
      .with({ query: `v=${bust}` });
    const jsUri = webview
      .asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'webview', 'settings-panel.js'))
      .with({ query: `v=${bust}` });
    const strings = getMessageBank().getWebviewStrings().settingsPanel ?? {};
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource}`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${n}'`,
    ].join('; ');
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<link rel="stylesheet" href="${cssUri}" />
<title>${strings.title || 'Anime Companion Settings'}</title>
</head>
<body>
<div id="root"></div>
<script nonce="${n}">
  window.__SETTINGS_STRINGS__ = ${JSON.stringify(strings)};
</script>
<script nonce="${n}" src="${jsUri}"></script>
</body>
</html>`;
  }
}
