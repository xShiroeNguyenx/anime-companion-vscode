import { ColorMap, alpha, mix, readableOn } from './theme-colors';

/**
 * The color themes that ship with the extension: one per built-in character,
 * plus a few "lovely" style themes, light and dark, that belong to nobody.
 *
 * This file is the single source: `scripts/gen-themes.js` writes
 * `themes/*.json` from `buildThemeJson`, package.json lists them under
 * `contributes.themes`, and scripts/theme-test.js fails if either drifts.
 * No `vscode` import, so the generator and the test can load it directly.
 */

export interface ThemePalette {
  /** Editor background. */
  bg: string;
  /** Sidebar, panel, widgets — one step off the editor. */
  bgAlt: string;
  /** Title bar, activity bar, tab strip — the frame around everything. */
  bgDeep: string;
  fg: string;
  muted: string;
  accent: string;
  accentSoft: string;
  keyword: string;
  string: string;
  func: string;
  number: string;
  type: string;
  constant: string;
  comment: string;
}

export interface BundledTheme {
  /** Stable short id, used by the webview to ask for this theme. */
  id: string;
  /** Display name: the character, or the style's own name. */
  name: string;
  group: 'character' | 'lovely';
  type: 'dark' | 'light';
  /** The model this theme belongs to (MODEL_MAP id); character themes only. */
  modelId?: string;
  /**
   * The label in contributes.themes, which is also the value VS Code stores in
   * `workbench.colorTheme` (no separate `id` is declared, so the label is it).
   */
  label: string;
  /** File name under themes/. */
  file: string;
  palette: ThemePalette;
}

export const CHARACTER_THEMES: BundledTheme[] = [
  {
    id: 'hiyori',
    name: 'Hiyori',
    group: 'character',
    type: 'dark',
    modelId: 'hiyori',
    label: 'Anime Companion: Hiyori Sakura',
    file: 'hiyori-sakura-color-theme.json',
    palette: {
      bg: '#1f1a1e',
      bgAlt: '#1a1619',
      bgDeep: '#151114',
      fg: '#ecdfe5',
      muted: '#9a8a92',
      accent: '#ff8fb3',
      accentSoft: '#ffc2d4',
      keyword: '#ff8fb3',
      string: '#b8e0a5',
      func: '#ffd59a',
      number: '#f7a38c',
      type: '#9fd6e8',
      constant: '#c9a7ff',
      comment: '#7d6b74',
    },
  },
  {
    id: 'haru',
    name: 'Haru',
    group: 'character',
    type: 'dark',
    modelId: 'haru',
    label: 'Anime Companion: Haru Sky',
    file: 'haru-sky-color-theme.json',
    palette: {
      bg: '#172029',
      bgAlt: '#131b23',
      bgDeep: '#0f161d',
      fg: '#dde8f0',
      muted: '#7f93a3',
      accent: '#6cc4ff',
      accentSoft: '#a9dcff',
      keyword: '#6cc4ff',
      string: '#a6e3a1',
      func: '#ffd580',
      number: '#ff9e7a',
      type: '#8ff0d8',
      constant: '#c3a6ff',
      comment: '#5f7484',
    },
  },
  {
    id: 'mao',
    name: 'Mao',
    group: 'character',
    type: 'dark',
    modelId: 'mao',
    label: 'Anime Companion: Mao Shrine',
    file: 'mao-shrine-color-theme.json',
    palette: {
      bg: '#1e1719',
      bgAlt: '#191315',
      bgDeep: '#140f11',
      fg: '#f0e3df',
      muted: '#9c8681',
      accent: '#ff6a5c',
      accentSoft: '#ffb199',
      keyword: '#ff6a5c',
      string: '#c5e0a5',
      func: '#f6c85f',
      number: '#ffa07a',
      type: '#9ad1c9',
      constant: '#d4a5ff',
      comment: '#7a6662',
    },
  },
  {
    id: 'miara',
    name: 'Miara',
    group: 'character',
    type: 'dark',
    modelId: 'miara',
    label: 'Anime Companion: Miara Magic',
    file: 'miara-magic-color-theme.json',
    palette: {
      bg: '#1c1828',
      bgAlt: '#171421',
      bgDeep: '#120f1a',
      fg: '#e8e2f5',
      muted: '#8d84a6',
      accent: '#b98cff',
      accentSoft: '#ffa6e1',
      keyword: '#b98cff',
      string: '#a8e6b4',
      func: '#ffa6e1',
      number: '#ffc78a',
      type: '#7fdcff',
      constant: '#ff9fb8',
      comment: '#6f6789',
    },
  },
];

/** Style themes not tied to a character. */
export const LOVELY_THEMES: BundledTheme[] = [
  {
    id: 'strawberry-milk',
    name: 'Strawberry Milk',
    group: 'lovely',
    type: 'light',
    label: 'Anime Companion: Strawberry Milk',
    file: 'strawberry-milk-color-theme.json',
    palette: {
      bg: '#fff7f9',
      bgAlt: '#fdeef3',
      bgDeep: '#f9e1ea',
      fg: '#5a3a46',
      muted: '#997884',
      accent: '#e8638f',
      accentSoft: '#c53f70',
      keyword: '#c53f70',
      string: '#447b4c',
      func: '#aa5c27',
      number: '#bc4e3b',
      type: '#2c7896',
      constant: '#875ac3',
      comment: '#9a848d',
    },
  },
  {
    id: 'peach-latte',
    name: 'Peach Latte',
    group: 'lovely',
    type: 'light',
    label: 'Anime Companion: Peach Latte',
    file: 'peach-latte-color-theme.json',
    palette: {
      bg: '#fffaf4',
      bgAlt: '#fbf0e4',
      bgDeep: '#f5e4d2',
      fg: '#5b4334',
      muted: '#957d6b',
      accent: '#ee8455',
      accentSoft: '#b35832',
      keyword: '#b75433',
      string: '#4f7e3d',
      func: '#976817',
      number: '#c4483c',
      type: '#317b94',
      constant: '#9159b4',
      comment: '#9b877a',
    },
  },
  {
    id: 'lavender-milk',
    name: 'Lavender Milk',
    group: 'lovely',
    type: 'light',
    label: 'Anime Companion: Lavender Milk',
    file: 'lavender-milk-color-theme.json',
    palette: {
      bg: '#fbf8ff',
      bgAlt: '#f3eefc',
      bgDeep: '#e9e1f8',
      fg: '#4a3f63',
      muted: '#867e9d',
      accent: '#9a6ff0',
      accentSoft: '#7d52d6',
      keyword: '#8152dc',
      string: '#377e54',
      func: '#b24a84',
      number: '#b25731',
      type: '#28769e',
      constant: '#bc446d',
      comment: '#8e869f',
    },
  },
  {
    id: 'matcha-mochi',
    name: 'Matcha Mochi',
    group: 'lovely',
    type: 'light',
    label: 'Anime Companion: Matcha Mochi',
    file: 'matcha-mochi-color-theme.json',
    palette: {
      bg: '#f9fbf4',
      bgAlt: '#eff4e6',
      bgDeep: '#e3ecd5',
      fg: '#3e4a36',
      muted: '#79856d',
      accent: '#79a856',
      accentSoft: '#527c34',
      keyword: '#497f2e',
      string: '#9e632c',
      func: '#b0556f',
      number: '#a1641f',
      type: '#337891',
      constant: '#8460b4',
      comment: '#858d78',
    },
  },
  {
    id: 'cotton-candy',
    name: 'Cotton Candy',
    group: 'lovely',
    type: 'dark',
    label: 'Anime Companion: Cotton Candy',
    file: 'cotton-candy-color-theme.json',
    palette: {
      bg: '#221d2e',
      bgAlt: '#1d1928',
      bgDeep: '#181421',
      fg: '#f1e9fb',
      muted: '#9a90b0',
      accent: '#ff9ad5',
      accentSoft: '#9ad8ff',
      keyword: '#ff9ad5',
      string: '#b5f0c8',
      func: '#9ad8ff',
      number: '#ffc59a',
      type: '#c7b3ff',
      constant: '#ffe08a',
      comment: '#756c8c',
    },
  },
  {
    id: 'midnight-bunny',
    name: 'Midnight Bunny',
    group: 'lovely',
    type: 'dark',
    label: 'Anime Companion: Midnight Bunny',
    file: 'midnight-bunny-color-theme.json',
    palette: {
      bg: '#161a2b',
      bgAlt: '#131726',
      bgDeep: '#0f1220',
      fg: '#e4e6f5',
      muted: '#7e84a3',
      accent: '#ff7eb6',
      accentSoft: '#ffb3d1',
      keyword: '#ff7eb6',
      string: '#a3e0b5',
      func: '#ffd27a',
      number: '#ff9f80',
      type: '#7fc8ff',
      constant: '#c8a2ff',
      comment: '#5d6485',
    },
  },
];

/** Every theme in contributes.themes, characters first. */
export const BUNDLED_THEMES: BundledTheme[] = [...CHARACTER_THEMES, ...LOVELY_THEMES];

/** Used for the accent tint when the character has no theme of its own. */
export const DEFAULT_ACCENT = CHARACTER_THEMES[0].palette.accent;

export function themeForModel(modelId: string): BundledTheme | undefined {
  return CHARACTER_THEMES.find((theme) => theme.modelId === modelId);
}

export function themeByLabel(label: unknown): BundledTheme | undefined {
  return BUNDLED_THEMES.find((theme) => theme.label === label);
}

export function themeById(id: unknown): BundledTheme | undefined {
  return BUNDLED_THEMES.find((theme) => theme.id === id);
}

function workbenchColors(p: ThemePalette, type: BundledTheme['type']): ColorMap {
  const onAccent = readableOn(p.accent);
  // Translucent washes: white lifts a dark surface, black tints a light one.
  const wash = (opacity: number) => alpha(type === 'light' ? '#000000' : '#ffffff', opacity);
  const line = wash(type === 'light' ? 0.09 : 0.07);
  const lighten = type === 'light' ? '#000000' : '#ffffff';
  return {
    'focusBorder': alpha(p.accent, 0.6),
    'foreground': p.fg,
    'descriptionForeground': p.muted,
    'errorForeground': type === 'light' ? '#d64545' : '#ff7a85',
    'selection.background': alpha(p.accent, 0.35),
    'widget.shadow': type === 'light' ? '#00000022' : '#00000066',
    'textLink.foreground': p.accent,
    'textLink.activeForeground': p.accentSoft,

    'button.background': p.accent,
    'button.foreground': onAccent,
    'button.hoverBackground': mix(p.accent, lighten, 0.12),
    'button.secondaryBackground': mix(p.bgAlt, lighten, 0.06),
    'button.secondaryForeground': p.fg,
    'badge.background': p.accent,
    'badge.foreground': onAccent,
    'progressBar.background': p.accent,

    'input.background': p.bgDeep,
    'input.foreground': p.fg,
    'input.border': line,
    'input.placeholderForeground': p.muted,
    'inputOption.activeBorder': p.accent,
    'dropdown.background': p.bgDeep,
    'dropdown.border': line,
    'checkbox.background': p.bgDeep,
    'checkbox.border': line,

    'scrollbarSlider.background': wash(0.08),
    'scrollbarSlider.hoverBackground': wash(0.14),
    'scrollbarSlider.activeBackground': alpha(p.accent, 0.55),

    'list.activeSelectionBackground': alpha(p.accent, 0.25),
    'list.activeSelectionForeground': p.fg,
    'list.inactiveSelectionBackground': alpha(p.accent, 0.14),
    'list.hoverBackground': wash(0.04),
    'list.focusOutline': alpha(p.accent, 0.6),
    'list.highlightForeground': p.accent,

    'titleBar.activeBackground': p.bgDeep,
    'titleBar.activeForeground': p.fg,
    'titleBar.inactiveBackground': p.bgDeep,
    'titleBar.inactiveForeground': p.muted,
    'titleBar.border': line,

    'activityBar.background': p.bgDeep,
    'activityBar.foreground': p.accentSoft,
    'activityBar.inactiveForeground': p.muted,
    'activityBar.activeBorder': p.accent,
    'activityBar.border': line,
    'activityBarBadge.background': p.accent,
    'activityBarBadge.foreground': onAccent,

    'sideBar.background': p.bgAlt,
    'sideBar.foreground': p.fg,
    'sideBar.border': line,
    'sideBarTitle.foreground': p.fg,
    'sideBarSectionHeader.background': p.bgDeep,
    'sideBarSectionHeader.foreground': p.fg,

    'editorGroupHeader.tabsBackground': p.bgDeep,
    'editorGroup.border': line,
    'tab.activeBackground': p.bg,
    'tab.activeForeground': p.fg,
    'tab.inactiveBackground': p.bgDeep,
    'tab.inactiveForeground': p.muted,
    'tab.activeBorderTop': p.accent,
    'tab.border': p.bgDeep,
    'tab.hoverBackground': p.bgAlt,

    'editor.background': p.bg,
    'editor.foreground': p.fg,
    'editorLineNumber.foreground': mix(p.muted, p.bg, 0.35),
    'editorLineNumber.activeForeground': p.accentSoft,
    'editorCursor.foreground': p.accent,
    'editor.selectionBackground': alpha(p.accent, 0.3),
    'editor.inactiveSelectionBackground': alpha(p.accent, 0.15),
    'editor.selectionHighlightBackground': alpha(p.accent, 0.15),
    'editor.wordHighlightBackground': wash(0.07),
    'editor.findMatchBackground': alpha(p.func, 0.4),
    'editor.findMatchHighlightBackground': alpha(p.func, 0.2),
    'editor.lineHighlightBackground': wash(0.03),
    'editor.lineHighlightBorder': '#00000000',
    'editorIndentGuide.background1': wash(0.06),
    'editorIndentGuide.activeBackground1': alpha(p.accent, 0.45),
    'editorWhitespace.foreground': wash(0.12),
    'editorBracketMatch.background': alpha(p.accent, 0.15),
    'editorBracketMatch.border': alpha(p.accent, 0.6),
    'editorError.foreground': type === 'light' ? '#d64545' : '#ff6b6b',
    'editorWarning.foreground': type === 'light' ? '#c98a1b' : '#f5c26b',
    'editorInfo.foreground': type === 'light' ? '#2f7fd0' : '#6cb6ff',
    'editorGutter.addedBackground': '#7ccf8a',
    'editorGutter.modifiedBackground': '#6cb6ff',
    'editorGutter.deletedBackground': '#ff7a85',
    'editorWidget.background': p.bgAlt,
    'editorWidget.border': line,
    'editorHoverWidget.background': p.bgAlt,
    'editorHoverWidget.border': line,
    'editorSuggestWidget.background': p.bgAlt,
    'editorSuggestWidget.border': line,
    'editorSuggestWidget.selectedBackground': alpha(p.accent, 0.25),
    'editorSuggestWidget.highlightForeground': p.accent,
    'peekView.border': p.accent,
    'peekViewEditor.background': p.bgAlt,
    'peekViewResult.background': p.bgDeep,
    'peekViewTitle.background': p.bgDeep,

    'panel.background': p.bgAlt,
    'panel.border': line,
    'panelTitle.activeBorder': p.accent,
    'panelTitle.activeForeground': p.fg,
    'panelTitle.inactiveForeground': p.muted,
    'terminal.background': p.bgAlt,
    'terminal.foreground': p.fg,
    'terminalCursor.foreground': p.accent,

    'statusBar.background': p.bgDeep,
    'statusBar.foreground': mix(p.fg, p.bgDeep, 0.2),
    'statusBar.border': line,
    'statusBar.noFolderBackground': p.bgDeep,
    'statusBar.debuggingBackground': p.accent,
    'statusBar.debuggingForeground': onAccent,
    'statusBarItem.remoteBackground': p.accent,
    'statusBarItem.remoteForeground': onAccent,
    'statusBarItem.hoverBackground': wash(0.08),

    'menu.background': p.bgAlt,
    'menu.foreground': p.fg,
    'menu.selectionBackground': alpha(p.accent, 0.25),
    'menu.selectionForeground': p.fg,
    'menu.border': line,
    'quickInput.background': p.bgAlt,
    'quickInputList.focusBackground': alpha(p.accent, 0.25),
    'pickerGroup.foreground': p.accent,
    'pickerGroup.border': line,
    'notifications.background': p.bgAlt,
    'notifications.border': line,
    'breadcrumb.foreground': p.muted,
    'breadcrumb.focusForeground': p.fg,
    'breadcrumb.activeSelectionForeground': p.accent,
  };
}

function tokenColors(p: ThemePalette) {
  const rule = (name: string, scope: string[], foreground: string, fontStyle?: string) => ({
    name,
    scope,
    settings: fontStyle ? { foreground, fontStyle } : { foreground },
  });
  return [
    rule('Comment', ['comment', 'punctuation.definition.comment'], p.comment, 'italic'),
    rule('Keyword', ['keyword', 'storage.type', 'storage.modifier', 'keyword.control'], p.keyword),
    rule('Operator', ['keyword.operator', 'punctuation.separator', 'punctuation.terminator'], mix(p.fg, p.muted, 0.4)),
    rule('String', ['string', 'string.template', 'markup.inline.raw'], p.string),
    rule('Escape', ['constant.character.escape', 'string.regexp'], p.number),
    rule('Number', ['constant.numeric', 'constant.language', 'constant.other.color'], p.number),
    rule('Constant', ['variable.other.constant', 'support.constant', 'variable.other.enummember'], p.constant),
    rule('Function', ['entity.name.function', 'support.function', 'meta.function-call.generic'], p.func),
    rule('Type', ['entity.name.type', 'entity.name.class', 'support.type', 'support.class', 'entity.other.inherited-class'], p.type),
    rule('Variable', ['variable', 'variable.parameter', 'meta.definition.variable'], p.fg),
    rule('Property', ['variable.other.property', 'support.variable.property', 'meta.object-literal.key'], mix(p.fg, p.type, 0.35)),
    rule('Tag', ['entity.name.tag', 'meta.tag.sgml'], p.keyword),
    rule('Attribute', ['entity.other.attribute-name'], p.func),
    rule('Heading', ['markup.heading', 'entity.name.section'], p.accent, 'bold'),
    rule('Bold', ['markup.bold'], p.fg, 'bold'),
    rule('Italic', ['markup.italic'], p.fg, 'italic'),
    rule('Link', ['markup.underline.link'], p.type),
    rule('Invalid', ['invalid'], '#e05555'),
  ];
}

/** The full theme file, as written to themes/<file>. */
export function buildThemeJson(theme: BundledTheme): Record<string, unknown> {
  return {
    $schema: 'vscode://schemas/color-theme',
    name: theme.label,
    type: theme.type,
    semanticHighlighting: true,
    colors: workbenchColors(theme.palette, theme.type),
    tokenColors: tokenColors(theme.palette),
  };
}
