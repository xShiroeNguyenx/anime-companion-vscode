import * as vscode from 'vscode';
import { log } from './log';
import { getMessageBank } from './messages';
import { getSelectedModel } from './models';
import { BUNDLED_THEMES, DEFAULT_ACCENT, themeByLabel, themeForModel } from './bundled-themes';
import { ColorMap, accentCustomizations, isHexColor, reconcileCustomizations } from './theme-colors';

/** The theme the user had before we first switched to one of ours. */
const PREVIOUS_THEME_KEY = 'animeCompanion.theme.previous';
/** Keys of workbench.colorCustomizations this extension wrote, with their values. */
const ACCENT_OWNED_KEY = 'animeCompanion.theme.accentOwned';

export interface ThemePickerState {
  themes: Array<{
    id: string;
    label: string;
    name: string;
    group: 'character' | 'lovely';
    type: 'dark' | 'light';
    accent: string;
    background: string;
    sidebar: string;
    foreground: string;
  }>;
  /** The value of `workbench.colorTheme` right now. */
  current: string;
  /** What "restore" goes back to, or '' when there is nothing to restore. */
  previous: string;
}

/**
 * Bundled color themes (switching `workbench.colorTheme`) and the accent tint
 * (a few keys laid over `workbench.colorCustomizations`).
 *
 * Both write user settings, so both are careful about it: the theme switch
 * remembers what it replaced so it can be undone, and the tint only ever adds
 * keys the user has not set and only removes keys still holding the value it
 * wrote (see reconcileCustomizations).
 */
export class ThemeManager implements vscode.Disposable {
  private readonly _disposables: vscode.Disposable[] = [];
  private _lastModelId = '';

  constructor(private readonly _context: vscode.ExtensionContext) {}

  private _cfg() {
    return vscode.workspace.getConfiguration('animeCompanion');
  }

  private _strings(): Record<string, string> {
    return getMessageBank().getWebviewStrings().settingsPanel ?? {};
  }

  private _modelId(): string {
    try {
      return getSelectedModel('panel').id;
    } catch {
      return this._cfg().get<string>('model', 'hiyori');
    }
  }

  /** Another window changing a global setting must not make this one write. */
  private _isFocused(): boolean {
    return vscode.window.state?.focused !== false;
  }

  public activate(): void {
    this._lastModelId = this._modelId();
    const listener = vscode.workspace.onDidChangeConfiguration?.((e) => {
      if (!e.affectsConfiguration('animeCompanion.theme') || !this._isFocused()) return;
      if (e.affectsConfiguration('animeCompanion.theme.followCharacter') && this._followCharacter()) {
        void this.applyForCurrentModel();
      }
      if (
        e.affectsConfiguration('animeCompanion.theme.accentColors') ||
        e.affectsConfiguration('animeCompanion.theme.accentColor')
      ) {
        void this.syncAccent();
      }
    });
    if (listener) this._disposables.push(listener);
    // Bring the tint in line with the settings once per start — e.g. it was
    // turned off in settings.json while VS Code was closed. Skipped entirely
    // when it is off and nothing of ours is left, so a user who never touched
    // the feature never has their color customizations read or written.
    if (this._accentEnabled() || Object.keys(this._owned()).length > 0) void this.syncAccent();
  }

  private _followCharacter(): boolean {
    return this._cfg().get<boolean>('theme.followCharacter', false) === true;
  }

  private _accentEnabled(): boolean {
    return this._cfg().get<boolean>('theme.accentColors', false) === true;
  }

  private _owned(): ColorMap {
    const value = this._context.globalState.get<ColorMap>(ACCENT_OWNED_KEY);
    return value && typeof value === 'object' ? value : {};
  }

  // ---- character theme ---------------------------------------------------------

  public pickerState(): ThemePickerState {
    const workbench = vscode.workspace.getConfiguration('workbench');
    return {
      themes: BUNDLED_THEMES.map((theme) => ({
        id: theme.id,
        label: theme.label,
        name: theme.name,
        group: theme.group,
        type: theme.type,
        accent: theme.palette.accent,
        background: theme.palette.bg,
        sidebar: theme.palette.bgDeep,
        foreground: theme.palette.fg,
      })),
      current: workbench.get<string>('colorTheme', ''),
      previous: this._context.globalState.get<string>(PREVIOUS_THEME_KEY, ''),
    };
  }

  /** Switches VS Code to one of the bundled themes. Returns false if refused. */
  public async applyTheme(label: string): Promise<boolean> {
    const theme = themeByLabel(label);
    if (!theme) return false;
    const workbench = vscode.workspace.getConfiguration('workbench');
    const current = workbench.get<string>('colorTheme', '');
    // Remember the user's own theme, never one of ours: hopping Hiyori → Mao
    // must still restore to whatever they had before Hiyori.
    if (current && !themeByLabel(current)) {
      await this._context.globalState.update(PREVIOUS_THEME_KEY, current);
    }
    await workbench.update('colorTheme', theme.label, vscode.ConfigurationTarget.Global);
    this._warnIfOverridden(theme.label);
    log(`Theme: switched to "${theme.label}"`);
    return true;
  }

  /** Back to the theme that was active before the first bundled theme. */
  public async restorePrevious(): Promise<boolean> {
    const previous = this._context.globalState.get<string>(PREVIOUS_THEME_KEY, '');
    if (!previous) return false;
    const workbench = vscode.workspace.getConfiguration('workbench');
    await workbench.update('colorTheme', previous, vscode.ConfigurationTarget.Global);
    await this._context.globalState.update(PREVIOUS_THEME_KEY, undefined);
    this._warnIfOverridden(previous);
    log(`Theme: restored "${previous}"`);
    return true;
  }

  /**
   * A workspace that pins its own `workbench.colorTheme` wins over user
   * settings, so the write above succeeds and nothing changes on screen.
   * Say so instead of leaving the user wondering.
   */
  private _warnIfOverridden(expected: string): void {
    const info = vscode.workspace.getConfiguration('workbench').inspect<string>('colorTheme');
    const pinned = info?.workspaceFolderValue ?? info?.workspaceValue;
    if (pinned !== undefined && pinned !== expected) {
      const text = (this._strings().themeWorkspaceOverride ||
        'This workspace sets its own color theme ("{theme}") in .vscode/settings.json, so the change will not show in this window.'
      ).replace('{theme}', pinned);
      void vscode.window.showWarningMessage(text);
    }
  }

  /** Follows the character on screen, when the user asked for that. */
  public async applyForCurrentModel(): Promise<void> {
    const theme = themeForModel(this._modelId());
    // Custom models have no theme of their own: leave whatever is active.
    if (!theme) return;
    const current = vscode.workspace.getConfiguration('workbench').get<string>('colorTheme', '');
    if (current === theme.label) return;
    await this.applyTheme(theme.label);
  }

  /** Called whenever the model in this window may have changed. */
  public onModelChanged(): void {
    if (!this._isFocused()) return;
    const modelId = this._modelId();
    if (modelId === this._lastModelId) return;
    this._lastModelId = modelId;
    if (this._followCharacter()) void this.applyForCurrentModel();
    // An explicit accent color does not depend on the character.
    if (this._accentEnabled() && !isHexColor(this._cfg().get<string>('theme.accentColor', ''))) {
      void this.syncAccent();
    }
  }

  // ---- accent tint -------------------------------------------------------------

  private _accentColor(): string {
    const explicit = this._cfg().get<string>('theme.accentColor', '');
    if (isHexColor(explicit)) return explicit;
    if (explicit) log(`Theme: ignoring accentColor "${explicit}" — expected #RRGGBB`);
    return themeForModel(this._modelId())?.palette.accent ?? DEFAULT_ACCENT;
  }

  /** Adds, updates or removes the tint to match the settings. */
  public async syncAccent(): Promise<void> {
    try {
      const desired = this._accentEnabled() ? accentCustomizations(this._accentColor()) : {};
      const workbench = vscode.workspace.getConfiguration('workbench');
      const current = workbench.inspect<Record<string, unknown>>('colorCustomizations')?.globalValue;
      const result = reconcileCustomizations(current, desired, this._owned());
      if (result.changed) {
        const value = Object.keys(result.next).length > 0 ? result.next : undefined;
        await workbench.update('colorCustomizations', value, vscode.ConfigurationTarget.Global);
      }
      await this._context.globalState.update(
        ACCENT_OWNED_KEY,
        Object.keys(result.owned).length > 0 ? result.owned : undefined
      );
      const skipped = Object.keys(desired).length - Object.keys(result.owned).length;
      if (skipped > 0) log(`Theme: accent tint skipped ${skipped} color(s) you customized yourself`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      log(`Theme: accent tint failed — ${detail}`);
      void vscode.window.showErrorMessage(
        (this._strings().themeAccentFailed || 'Could not update the accent colors: {error}').replace('{error}', detail)
      );
    }
  }

  // ---- quick pick --------------------------------------------------------------

  /** The "Change Theme…" command: character themes, restore, and the full list. */
  public async showQuickPick(openSettings: () => void): Promise<void> {
    const s = this._strings();
    const state = this.pickerState();
    type Item = vscode.QuickPickItem & { run?: () => Thenable<unknown> | void };
    const items: Item[] = [];
    for (const group of ['character', 'lovely'] as const) {
      items.push({
        label: group === 'character' ? s.themeGroupCharacter || 'Characters' : s.themeGroupLovely || 'Lovely',
        kind: vscode.QuickPickItemKind.Separator,
      });
      for (const theme of state.themes.filter((entry) => entry.group === group)) {
        items.push({
          label: (theme.label === state.current ? '$(check) ' : '$(color-mode) ') + theme.name,
          description: theme.label === state.current ? s.themeActive || 'In use' : theme.type === 'light' ? '☀' : '☾',
          run: () => this.applyTheme(theme.label),
        });
      }
    }
    items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
    if (state.previous) {
      items.push({
        label: '$(discard) ' + (s.themeRestore || 'Back to {theme}').replace('{theme}', state.previous),
        run: () => this.restorePrevious(),
      });
    }
    items.push({
      label: '$(symbol-color) ' + (s.themeBrowse || 'All VS Code themes…'),
      run: () => vscode.commands.executeCommand('workbench.action.selectTheme'),
    });
    items.push({ label: '$(gear) ' + (s.themeOpenSettings || 'Theme settings…'), run: openSettings });
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: s.themePickerTitle || 'Themes',
    });
    if (picked?.run) await picked.run();
  }

  public dispose(): void {
    this._disposables.forEach((d) => d.dispose());
    this._disposables.length = 0;
  }
}
