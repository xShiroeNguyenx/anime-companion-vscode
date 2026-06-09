import * as fs from 'fs';
import * as path from 'path';

const fsp = fs.promises;

// The encoded data-URI is embedded into workbench.desktop.main.js, which VS
// Code parses on every window load. Keep images modest so startup isn't
// bloated. Warn past WARN, refuse past MAX.
const WARN_BYTES = 1_000_000; // ~1 MB
const MAX_BYTES = 2_500_000; // ~2.4 MB

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
};

export interface EncodeResult {
  ok: boolean;
  dataUri?: string;
  bytes?: number;
  warn?: string;
  reason?: string;
}

export async function encodeImageToDataUri(fsPath: string): Promise<EncodeResult> {
  const ext = path.extname(fsPath).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) {
    return { ok: false, reason: `Unsupported image type "${ext}". Use png, jpg, webp, gif, bmp, or svg.` };
  }
  let stat: fs.Stats;
  try {
    stat = await fsp.stat(fsPath);
  } catch {
    return { ok: false, reason: `Image file not found: ${fsPath}` };
  }
  if (!stat.isFile()) {
    return { ok: false, reason: `Not a file: ${fsPath}` };
  }
  if (stat.size > MAX_BYTES) {
    return {
      ok: false,
      reason: `Image is too large (${(stat.size / 1_000_000).toFixed(1)} MB). Please use one under ${(MAX_BYTES / 1_000_000).toFixed(1)} MB — large images slow VS Code startup.`,
    };
  }
  let buf: Buffer;
  try {
    buf = await fsp.readFile(fsPath);
  } catch (err) {
    return { ok: false, reason: `Could not read image: ${err instanceof Error ? err.message : String(err)}` };
  }
  const dataUri = `data:${mime};base64,${buf.toString('base64')}`;
  const warn = stat.size > WARN_BYTES
    ? `Image is ${(stat.size / 1_000_000).toFixed(1)} MB — this is embedded into a VS Code startup file and may slow launches a little.`
    : undefined;
  return { ok: true, dataUri, bytes: stat.size, warn };
}
