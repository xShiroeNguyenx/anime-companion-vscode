import * as vscode from 'vscode';

export interface ModelInfo {
  id: string;
  name: string;
  folder: string;
  file: string;
  description: string;
  // true = ships in the .vsix; false = downloaded on first selection.
  bundled: boolean;
  // true = hidden behind `animeCompanion.experimentalModels` setting.
  // Used for assets we don't have clear redistribution rights for; see
  // LICENSE-AUDIT.md. The code stays so the developer can flip the setting
  // and use them locally.
  experimental?: boolean;
}

export const MODEL_MAP: Record<string, ModelInfo> = {
  // ─── Free Material License (Live2D Inc. samples) ───────────────────────
  hiyori: {
    id: 'hiyori',
    name: 'Hiyori',
    folder: 'Hiyori',
    file: 'Hiyori.model3.json',
    description: 'Cute schoolgirl (Live2D Sample)',
    bundled: true,
  },
  haru: {
    id: 'haru',
    name: 'Haru',
    folder: 'Haru',
    file: 'haru_greeter_t05.model3.json',
    description: 'Greeter girl (Live2D Sample)',
    bundled: false,
  },
  mao: {
    id: 'mao',
    name: 'Mao',
    folder: 'Mao',
    file: 'mao_pro.model3.json',
    description: 'Cat-eared shrine girl (Live2D Sample)',
    bundled: false,
  },
  miara: {
    id: 'miara',
    name: 'Miara',
    folder: 'Miara',
    file: 'miara_pro_t03.model3.json',
    description: 'Magical girl (Live2D Sample)',
    bundled: false,
  },

  // ─── Experimental — hidden from the picker by default ──────────────────
  // See LICENSE-AUDIT.md for why each entry is gated.
  cheshire: {
    id: 'cheshire',
    name: 'Cheshire',
    folder: 'chaijun_3',
    file: 'chaijun_3.model3.json',
    description: 'Elegant cat maid (Azur Lane) — experimental',
    bundled: false,
    experimental: true,
  },
  icegirl: {
    id: 'icegirl',
    name: 'Ice Girl',
    folder: 'IceGirl',
    file: 'IceGirl.model3.json',
    description: 'Cute ice girl (TianYeLuLu) — experimental',
    bundled: false,
    experimental: true,
  },
  tsubaki: {
    id: 'tsubaki',
    name: 'Tsubaki',
    folder: 'Tsubaki',
    file: 'Tsubaki.model3.json',
    description: 'November Camellia (11月椿) — experimental',
    bundled: false,
    experimental: true,
  },
  whiteangel: {
    id: 'whiteangel',
    name: 'White Angel',
    folder: 'WhiteAngel',
    file: 'WhiteAngel.model3.json',
    description: 'White Hair Angel (白发天使) — experimental',
    bundled: false,
    experimental: true,
  },
  vivian: {
    id: 'vivian',
    name: 'Vivian',
    folder: 'Vivian',
    file: 'Vivian.model3.json',
    description: 'Vivian (薇薇安) — experimental',
    bundled: false,
    experimental: true,
  },
  changli: {
    id: 'changli',
    name: 'Changli',
    folder: 'Changli',
    file: 'Changli.model3.json',
    description: 'Changli (长离) — experimental',
    bundled: false,
    experimental: true,
  },
};

export const HIYORI = MODEL_MAP['hiyori'];

// Returns models the user is allowed to see in pickers. Experimental ones are
// included only when the developer flips `animeCompanion.experimentalModels`.
export function listVisibleModels(): ModelInfo[] {
  const showExperimental = vscode.workspace
    .getConfiguration('animeCompanion')
    .get<boolean>('experimentalModels', false);
  return Object.values(MODEL_MAP).filter((m) => showExperimental || !m.experimental);
}

const WORKSPACE_MODEL_KEY = 'animeCompanion.workspaceModel';

let _ctx: vscode.ExtensionContext | null = null;

export function setExtensionContext(ctx: vscode.ExtensionContext) {
  _ctx = ctx;
}

function readWorkspaceModelId(): string | undefined {
  if (!_ctx) return undefined;
  // Only meaningful when a workspace is open.
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    return undefined;
  }
  const id = _ctx.workspaceState.get<string>(WORKSPACE_MODEL_KEY);
  return id && MODEL_MAP[id] ? id : undefined;
}

export function hasWorkspaceModel(): boolean {
  return readWorkspaceModelId() !== undefined;
}

export async function setWorkspaceModel(id: string): Promise<void> {
  if (!_ctx) return;
  if (!MODEL_MAP[id]) return;
  await _ctx.workspaceState.update(WORKSPACE_MODEL_KEY, id);
}

export async function clearWorkspaceModel(): Promise<void> {
  if (!_ctx) return;
  await _ctx.workspaceState.update(WORKSPACE_MODEL_KEY, undefined);
}

export function getSelectedModel(): ModelInfo {
  const wsId = readWorkspaceModelId();
  if (wsId) return MODEL_MAP[wsId];

  const config = vscode.workspace.getConfiguration('animeCompanion');
  const modelId = config.get<string>('model', 'hiyori');
  return MODEL_MAP[modelId] || MODEL_MAP['hiyori'];
}
