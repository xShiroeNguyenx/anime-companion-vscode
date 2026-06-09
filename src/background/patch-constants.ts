// Shared, dependency-free constants for the workbench background patch.
//
// IMPORTANT: this module must NOT import `vscode`. It is required by both the
// extension host (background-patch-manager.ts) AND the plain-Node uninstall
// hook (uninstall.ts, run by VS Code as `node ./out/background/uninstall`),
// where the `vscode` API does not exist.

// Marker comments wrapping the injected block. Named distinctly from the
// popular shalldie/vscode-background extension so the two can coexist without
// eating each other's blocks.
export const MARKER_START = '// anime-companion-background-start';
export const MARKER_END = '// anime-companion-background-end';

// DOM id of the injected <style> element (so re-injection is idempotent).
export const STYLE_ELEMENT_ID = 'anime-companion-background-style';

// Sidecar file written next to the compiled patch code. The uninstall hook
// reads it to learn which workbench file to clean, since it can't use
// vscode.env.appRoot. Lives in <ext>/out/background/, which still exists at
// uninstall time (the hook itself is in that folder).
export const SIDECAR_NAME = '.bg-target.json';

export interface PatchTargetSidecar {
  workbenchPath: string;
  vscodeVersion?: string;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Matches the full injected block including the leading newline, non-greedy so
// stacked or duplicate blocks are each removed without swallowing real code in
// between. Used by both apply (strip-before-append) and restore/uninstall.
export function buildStripRegex(): RegExp {
  return new RegExp(
    `\\n?${escapeRegExp(MARKER_START)}[\\s\\S]*?${escapeRegExp(MARKER_END)}`,
    'g',
  );
}

export function stripPatch(content: string): string {
  return content.replace(buildStripRegex(), '');
}

export function isPatched(content: string): boolean {
  return content.includes(MARKER_START) && content.includes(MARKER_END);
}
