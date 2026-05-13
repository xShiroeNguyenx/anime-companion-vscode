import * as vscode from 'vscode';
import * as path from 'path';

export interface ContextRequest {
  includeSelection?: boolean;
  includeActiveFile?: boolean;
  fileMentions?: string[];
  // Snapshot of a selection captured earlier (e.g. via the askSelection
  // command). Used when the user moves focus before submitting.
  stagedSelection?: { filePath: string; text: string; languageId?: string };
}

export interface BuiltContext {
  prefix: string;
  // Human-readable summary the UI can show as chip labels.
  attached: Array<{ label: string; sourceKind: 'selection' | 'activeFile' | 'fileMention'; size: number }>;
}

// Cap each file payload so a single 50k-line file doesn't blow the context
// window. Files larger than this are truncated with a clear marker.
const MAX_FILE_CHARS = 12_000;

export async function buildContext(req: ContextRequest): Promise<BuiltContext> {
  const blocks: string[] = [];
  const attached: BuiltContext['attached'] = [];
  const seen = new Set<string>();

  if (req.stagedSelection?.text) {
    const sel = req.stagedSelection;
    const lang = sel.languageId || guessLangFromPath(sel.filePath);
    const rel = workspaceRelative(sel.filePath);
    blocks.push(`Selected from \`${rel}\`:\n\`\`\`${lang}\n${truncate(sel.text)}\n\`\`\``);
    attached.push({ label: `📌 ${rel}`, sourceKind: 'selection', size: sel.text.length });
  } else if (req.includeSelection) {
    const editor = vscode.window.activeTextEditor;
    if (editor && !editor.selection.isEmpty) {
      const text = editor.document.getText(editor.selection);
      const rel = workspaceRelative(editor.document.uri.fsPath);
      const lang = editor.document.languageId;
      blocks.push(`Selected from \`${rel}\`:\n\`\`\`${lang}\n${truncate(text)}\n\`\`\``);
      attached.push({ label: `📌 ${rel}`, sourceKind: 'selection', size: text.length });
    }
  }

  if (req.includeActiveFile) {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const rel = workspaceRelative(editor.document.uri.fsPath);
      if (!seen.has(rel)) {
        seen.add(rel);
        const text = editor.document.getText();
        const lang = editor.document.languageId;
        blocks.push(`Active file \`${rel}\`:\n\`\`\`${lang}\n${truncate(text)}\n\`\`\``);
        attached.push({ label: `📄 ${rel}`, sourceKind: 'activeFile', size: text.length });
      }
    }
  }

  for (const mention of req.fileMentions ?? []) {
    if (!mention) continue;
    const resolved = await resolveMention(mention);
    if (!resolved) continue;
    const rel = workspaceRelative(resolved.fsPath);
    if (seen.has(rel)) continue;
    seen.add(rel);
    try {
      const doc = await vscode.workspace.openTextDocument(resolved);
      const text = doc.getText();
      const lang = doc.languageId || guessLangFromPath(rel);
      blocks.push(`\`${rel}\`:\n\`\`\`${lang}\n${truncate(text)}\n\`\`\``);
      attached.push({ label: `#${path.basename(rel)}`, sourceKind: 'fileMention', size: text.length });
    } catch {
      // Skip unreadable files silently — autocomplete picks files we can list,
      // but a file may be deleted between picker and submit.
    }
  }

  const prefix = blocks.length > 0 ? blocks.join('\n\n') + '\n\n' : '';
  return { prefix, attached };
}

// Search the workspace for a file matching the typed mention. Accepts a bare
// filename ("readme.md") or a path fragment ("src/foo.ts").
async function resolveMention(mention: string): Promise<vscode.Uri | undefined> {
  const cleaned = mention.replace(/^#/, '').trim();
  if (!cleaned) return undefined;

  const matches = await vscode.workspace.findFiles(
    `**/${cleaned}`,
    '**/node_modules/**',
    1
  );
  if (matches.length > 0) return matches[0];

  // Fall back to a fuzzy match by basename if the strict pattern misses.
  const fuzzy = await vscode.workspace.findFiles(
    `**/*${cleaned}*`,
    '**/node_modules/**',
    1
  );
  return fuzzy[0];
}

export async function searchWorkspaceFiles(
  query: string,
  limit = 12
): Promise<Array<{ path: string; basename: string }>> {
  const cleaned = (query || '').replace(/^#/, '').trim();
  const pattern = cleaned ? `**/*${cleaned}*` : '**/*';
  const matches = await vscode.workspace.findFiles(pattern, '**/node_modules/**', limit);
  return matches.map((uri) => {
    const rel = workspaceRelative(uri.fsPath);
    return { path: rel, basename: path.basename(rel) };
  });
}

function workspaceRelative(fsPath: string): string {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (folder && fsPath.startsWith(folder)) {
    return path.relative(folder, fsPath).replace(/\\/g, '/');
  }
  return fsPath.replace(/\\/g, '/');
}

function truncate(text: string): string {
  if (text.length <= MAX_FILE_CHARS) return text;
  const head = text.slice(0, MAX_FILE_CHARS);
  return `${head}\n\n… [truncated ${text.length - MAX_FILE_CHARS} chars]`;
}

function guessLangFromPath(p: string): string {
  const ext = path.extname(p).slice(1).toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin',
    cs: 'csharp', cpp: 'cpp', cc: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
    md: 'markdown', json: 'json', yml: 'yaml', yaml: 'yaml', toml: 'toml',
    sh: 'bash', ps1: 'powershell', html: 'html', css: 'css', scss: 'scss',
    vue: 'vue', svelte: 'svelte', sql: 'sql', php: 'php',
  };
  return map[ext] || ext || '';
}
