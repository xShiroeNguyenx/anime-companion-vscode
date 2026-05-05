import * as path from 'path';

export type AmbientPresetId = string;

export interface AmbientPreset {
  id: AmbientPresetId;
  label: string;
  description: string;
  filename?: string;
  remoteUrl?: string;
  localPath?: string;
  isCustom?: boolean;
  attribution?: string;
  license?: string;
  sourcePage?: string;
}

export interface CustomAmbientTrackConfig {
  id?: string;
  label?: string;
  description?: string;
  path?: string;
}

// Bundled ambient files. Metadata stays here so the extension can still expose
// attribution/license information in docs or future UI.
const DEFAULT_REMOTE_AMBIENT_BASE_URL =
  'https://raw.githubusercontent.com/xShiroeNguyenx/anime-companion-vscode/main/media/ambient';

export const AMBIENT_PRESETS: Record<AmbientPresetId, AmbientPreset> = {
  off: {
    id: 'off',
    label: 'Off',
    description: 'Silence',
  },
  lofi: {
    id: 'lofi',
    label: 'Lofi Study',
    description: 'Soft beats for focus',
    remoteUrl: `${DEFAULT_REMOTE_AMBIENT_BASE_URL}/lofi.mp3`,
    attribution: 'Kuromaru ft. .hereafter',
    license: 'CC BY 3.0',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Kuromaru_ft_.hereafter_-_%E2%80%99laxin_(Lo_Fi_Background_Music).ogg',
  },
  rain: {
    id: 'rain',
    label: 'Rain',
    description: 'Steady rain ambience',
    remoteUrl: `${DEFAULT_REMOTE_AMBIENT_BASE_URL}/rain.mp3`,
    attribution: 'ezwa via PDSounds',
    license: 'Public domain',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Rain_(1).ogg',
  },
  cafe: {
    id: 'cafe',
    label: 'Cafe',
    description: 'Gentle cafe chatter',
    remoteUrl: `${DEFAULT_REMOTE_AMBIENT_BASE_URL}/cafe.mp3`,
    attribution: 'Marble Toast',
    license: 'CC0 1.0',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Cafe_ambiance.ogg',
  },
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function makeTrackId(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `custom-${(hash >>> 0).toString(36)}`;
}

function normalizeTrackId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'custom-track';
}

export function resolveCustomAmbientTracks(raw: unknown): AmbientPreset[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const usedIds = new Set<string>(Object.keys(AMBIENT_PRESETS));

  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const config = item as CustomAmbientTrackConfig;
    if (!isNonEmptyString(config.path)) {
      return [];
    }

    const localPath = config.path.trim();
    let id = isNonEmptyString(config.id) ? normalizeTrackId(config.id) : makeTrackId(localPath);
    while (usedIds.has(id)) {
      id += '-alt';
    }
    usedIds.add(id);

    const fallbackLabel = path.basename(localPath, path.extname(localPath)) || 'Custom Ambient';

    return [{
      id,
      label: isNonEmptyString(config.label) ? config.label.trim() : fallbackLabel,
      description: isNonEmptyString(config.description) ? config.description.trim() : 'Local ambient track',
      localPath,
      isCustom: true,
    }];
  });
}

export function getAmbientPreset(id: string | undefined, customTracks: AmbientPreset[] = []): AmbientPreset {
  if (!id) {
    return AMBIENT_PRESETS.off;
  }

  const custom = customTracks.find((track) => track.id === id);
  if (custom) {
    return custom;
  }

  if (!(id in AMBIENT_PRESETS)) {
    return AMBIENT_PRESETS.off;
  }

  return AMBIENT_PRESETS[id as keyof typeof AMBIENT_PRESETS];
}

export function listAmbientPresets(customTracks: AmbientPreset[] = []): AmbientPreset[] {
  return [...Object.values(AMBIENT_PRESETS), ...customTracks];
}
