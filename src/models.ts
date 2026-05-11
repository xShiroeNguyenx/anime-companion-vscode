import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface ModelInfo {
  id: string;
  name: string;
  folder: string;
  file: string;
  description: string;
  // true = ships in the .vsix; false = downloaded on first selection.
  bundled: boolean;
  // Absolute parent directory that contains this model folder.
  // Only used for user-provided local models.
  customRoot?: string;
}

interface CustomModelConfig {
  name?: unknown;
  path?: unknown;
  modelFile?: unknown;
  description?: unknown;
}

export const MODEL_MAP: Record<string, ModelInfo> = {
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
};

export const HIYORI = MODEL_MAP['hiyori'];
type HostMode = 'auto' | 'panel' | 'desktop';

function normalizeModelId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-');
}

function findModel3JsonFile(dirPath: string): string | undefined {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const direct = entries.find((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.model3.json'));
    return direct?.name;
  } catch {
    return undefined;
  }
}

function makeCustomModel(
  idSource: string,
  resolvedPath: string,
  override?: CustomModelConfig
): ModelInfo | null {
  const folder = path.basename(resolvedPath);
  const customRoot = path.dirname(resolvedPath);
  const id = normalizeModelId(idSource);
  if (!id || !folder || !customRoot) return null;

  const explicitModelFile =
    typeof override?.modelFile === 'string' && override.modelFile.trim().length > 0
      ? override.modelFile.trim()
      : undefined;
  const detectedModelFile = explicitModelFile ?? findModel3JsonFile(resolvedPath) ?? `${folder}.model3.json`;

  return {
    id,
    name:
      typeof override?.name === 'string' && override.name.trim().length > 0
        ? override.name.trim()
        : folder,
    folder,
    file: detectedModelFile,
    description:
      typeof override?.description === 'string' && override.description.trim().length > 0
        ? override.description.trim()
        : 'Custom local model',
    bundled: false,
    customRoot,
  };
}

export function listCustomRootModels(): ModelInfo[] {
  const roots = vscode.workspace
    .getConfiguration('animeCompanion')
    .get<string[]>('customModelRoots', []);

  if (!Array.isArray(roots) || roots.length === 0) {
    return [];
  }

  const models: ModelInfo[] = [];
  for (const rootPath of roots) {
    if (typeof rootPath !== 'string' || rootPath.trim().length === 0) continue;
    const resolvedRoot = path.resolve(rootPath.trim());

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(resolvedRoot, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const modelDir = path.join(resolvedRoot, entry.name);
      const modelFile = findModel3JsonFile(modelDir);
      if (!modelFile) continue;

      const model = makeCustomModel(entry.name, modelDir, {
        modelFile,
        name: entry.name,
        description: 'Custom local model (auto-scanned)',
      });
      if (model) {
        models.push(model);
      }
    }
  }

  return models;
}

export function listCustomModels(): ModelInfo[] {
  const raw = vscode.workspace
    .getConfiguration('animeCompanion')
    .get<Record<string, CustomModelConfig>>('customModels', {});

  if (!raw || typeof raw !== 'object') {
    return [];
  }

  const models: ModelInfo[] = [];
  for (const [rawId, entry] of Object.entries(raw)) {
    if (!rawId || !entry || typeof entry !== 'object') continue;

    const modelPath = typeof entry.path === 'string' ? entry.path.trim() : '';
    if (!modelPath) continue;

    const resolvedPath = path.resolve(modelPath);
    const model = makeCustomModel(rawId, resolvedPath, entry);
    if (model) {
      models.push(model);
    }
  }

  return models;
}

function getAllModels(): Record<string, ModelInfo> {
  const autoScanned = listCustomRootModels();
  const explicit = listCustomModels();
  return {
    ...MODEL_MAP,
    ...Object.fromEntries(autoScanned.map((model) => [model.id, model])),
    ...Object.fromEntries(explicit.map((model) => [model.id, model])),
  };
}

export function listVisibleModels(): ModelInfo[] {
  const seen = new Set<string>();
  const out: ModelInfo[] = [];
  for (const model of [...Object.values(MODEL_MAP), ...listCustomRootModels(), ...listCustomModels()]) {
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    out.push(model);
  }
  return out;
}

const WORKSPACE_MODEL_KEY = 'animeCompanion.workspaceModel';

let _ctx: vscode.ExtensionContext | null = null;

export function setExtensionContext(ctx: vscode.ExtensionContext) {
  _ctx = ctx;
}

function readWorkspaceModelId(): string | undefined {
  if (!_ctx) return undefined;
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    return undefined;
  }
  const id = _ctx.workspaceState.get<string>(WORKSPACE_MODEL_KEY);
  return id && getAllModels()[id] ? id : undefined;
}

export function hasWorkspaceModel(): boolean {
  return readWorkspaceModelId() !== undefined;
}

export async function setWorkspaceModel(id: string): Promise<void> {
  if (!_ctx) return;
  if (!getAllModels()[id]) return;
  await _ctx.workspaceState.update(WORKSPACE_MODEL_KEY, id);
}

export async function clearWorkspaceModel(): Promise<void> {
  if (!_ctx) return;
  await _ctx.workspaceState.update(WORKSPACE_MODEL_KEY, undefined);
}

export function getSelectedModel(mode?: HostMode): ModelInfo {
  const allModels = getAllModels();
  const config = vscode.workspace.getConfiguration('animeCompanion');
  const targetMode =
    mode && mode !== 'auto'
      ? mode
      : config.get<boolean>('desktopCompanion.enabled', false)
        ? 'desktop'
        : 'panel';

  if (targetMode === 'desktop') {
    const desktopModelId = config.get<string>('desktopCompanion.model', '').trim();
    if (desktopModelId && allModels[desktopModelId]) {
      return allModels[desktopModelId];
    }
  }

  const wsId = readWorkspaceModelId();
  if (targetMode === 'panel' && wsId) return allModels[wsId];

  const modelId = config.get<string>('model', 'hiyori');
  return allModels[modelId] || MODEL_MAP['hiyori'];
}
