import * as vscode from 'vscode';

export type BackgroundRegion = 'fullscreen' | 'editor' | 'sidebar' | 'panel';
// 'fullscreen' first so it renders deepest (whole-window image behind every
// part); the per-region images layer on top of it when also enabled.
export const REGIONS: readonly BackgroundRegion[] = ['fullscreen', 'editor', 'sidebar', 'panel'];

export type BackgroundSize = 'cover' | 'contain' | 'repeat' | 'stretch';

export interface RegionConfig {
  enabled: boolean;
  /** Absolute fs path to the image, or '' when unset. */
  image: string;
  /** 0–100 (percent). */
  opacity: number;
  /** 0–40 px. */
  blur: number;
  size: BackgroundSize;
  /** CSS background-position token, e.g. 'center', 'top left'. */
  position: string;
}

export interface BackgroundConfig {
  enabled: boolean;
  patchChecksums: boolean;
  fullscreen: RegionConfig;
  editor: RegionConfig;
  sidebar: RegionConfig;
  panel: RegionConfig;
}

export interface PatchResult {
  ok: boolean;
  /** True when the on-disk workbench file changed and a reload is needed. */
  changed: boolean;
  reason?: string;
  /** Set when the failure was a write-permission problem. */
  permissionDenied?: boolean;
}

const SIZE_VALUES: BackgroundSize[] = ['cover', 'contain', 'repeat', 'stretch'];

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function readRegion(
  cfg: vscode.WorkspaceConfiguration,
  region: BackgroundRegion,
): RegionConfig {
  const size = cfg.get<string>(`background.${region}.size`, 'cover');
  // Fullscreen is opt-in (it's an alternative whole-window mode); the per-region
  // ones default enabled so a picked image shows without an extra toggle.
  return {
    enabled: cfg.get<boolean>(`background.${region}.enabled`, region !== 'fullscreen'),
    image: cfg.get<string>(`background.${region}.image`, '') ?? '',
    opacity: clamp(Math.round(cfg.get<number>(`background.${region}.opacity`, 15)), 0, 100),
    blur: clamp(Math.round(cfg.get<number>(`background.${region}.blur`, 0)), 0, 40),
    size: (SIZE_VALUES as string[]).includes(size) ? (size as BackgroundSize) : 'cover',
    position: cfg.get<string>(`background.${region}.position`, 'center') || 'center',
  };
}

export function readBackgroundConfig(): BackgroundConfig {
  const cfg = vscode.workspace.getConfiguration('animeCompanion');
  return {
    enabled: cfg.get<boolean>('background.enabled', false),
    patchChecksums: cfg.get<boolean>('background.patchChecksums', false),
    fullscreen: readRegion(cfg, 'fullscreen'),
    editor: readRegion(cfg, 'editor'),
    sidebar: readRegion(cfg, 'sidebar'),
    panel: readRegion(cfg, 'panel'),
  };
}

/** True when at least one enabled region actually has an image to render. */
export function hasRenderableRegion(config: BackgroundConfig): boolean {
  if (!config.enabled) return false;
  return REGIONS.some((r) => config[r].enabled && config[r].image.trim().length > 0);
}
