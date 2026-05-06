import * as vscode from 'vscode';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const MIME_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.moc3': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Tiny localhost HTTP server backing the companion runtime.
//
// Routes (resolved in order):
//   1. /audio/<lang>/<file>   -> {extensionUri}/media/audio/<lang>/<file>
//   2. /desktop-pet/<path>    -> {extensionUri}/desktop-pet/web/<path>
//   3. /ambient/<id>          -> dynamic registry (registerAmbientTrack)
//   4. /<rest>                -> first match across model roots (bundled live2d, downloader cache, custom roots)
//
// Added beyond the original Live2D-only role so a Tauri webview can fetch
// audio/ambient/runtime assets directly over HTTP without going through
// VS Code's vscode-resource:// URIs (which a non-VS-Code window can't reach).
export class ModelFileServer {
  private _server: http.Server | null = null;
  private _port: number = 0;
  private _roots: string[];
  private _extensionUri: vscode.Uri;
  private _ambientTracks: Map<string, string> = new Map();

  constructor(extensionUri: vscode.Uri, extraRoots: string[] = []) {
    this._extensionUri = extensionUri;
    const bundled = path.join(extensionUri.fsPath, 'media', 'live2d');
    this._roots = [bundled, ...extraRoots];
  }

  public addRoot(root: string) {
    if (!this._roots.includes(root)) {
      this._roots.push(root);
    }
  }

  // Register a custom ambient track so it is reachable at /ambient/<id>.
  // Used by bridge mode where webview.asWebviewUri() URLs are not usable.
  public registerAmbientTrack(id: string, absolutePath: string) {
    this._ambientTracks.set(id, path.resolve(absolutePath));
  }

  public clearAmbientTracks() {
    this._ambientTracks.clear();
  }

  async start(): Promise<number> {
    if (this._server) {
      return this._port;
    }

    return new Promise((resolve, reject) => {
      this._server = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        const resolved = this._route(urlPath);
        if (!resolved) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        fs.readFile(resolved, (err, data) => {
          if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
          }

          const ext = path.extname(resolved).toLowerCase();
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(data);
        });
      });

      this._server.listen(0, '127.0.0.1', () => {
        const addr = this._server!.address();
        if (addr && typeof addr !== 'string') {
          this._port = addr.port;
          console.log(`🌸 Model server started on port ${this._port}`);
          resolve(this._port);
        } else {
          reject(new Error('Failed to get server port'));
        }
      });

      this._server.on('error', reject);
    });
  }

  // Dispatch URL paths through prefix-specific handlers, falling back to
  // model-root lookup for legacy `/<folder>/<file>` requests.
  private _route(urlPath: string): string | null {
    if (urlPath.startsWith('/audio/')) {
      return this._resolveAudio(urlPath.slice('/audio/'.length));
    }
    if (urlPath.startsWith('/desktop-pet/')) {
      return this._resolveDesktopPet(urlPath.slice('/desktop-pet/'.length));
    }
    if (urlPath.startsWith('/media/')) {
      return this._resolveMedia(urlPath.slice('/media/'.length));
    }
    if (urlPath.startsWith('/ambient/')) {
      return this._resolveAmbient(urlPath.slice('/ambient/'.length));
    }
    return this._resolveModel(urlPath);
  }

  private _resolveAudio(rest: string): string | null {
    return this._safeJoin(path.join(this._extensionUri.fsPath, 'media', 'audio'), rest);
  }

  private _resolveDesktopPet(rest: string): string | null {
    return this._safeJoin(path.join(this._extensionUri.fsPath, 'desktop-pet', 'web'), rest);
  }

  // Generic media root — exposes things like lib/pixi.min.js, companion.css,
  // character.png so the floating-pet HTML can reference them by path.
  private _resolveMedia(rest: string): string | null {
    return this._safeJoin(path.join(this._extensionUri.fsPath, 'media'), rest);
  }

  private _resolveAmbient(rest: string): string | null {
    // Strip extension if any — registry is keyed by id.
    const id = rest.replace(/\.[^.]+$/, '');
    const registered = this._ambientTracks.get(id);
    if (!registered) return null;
    if (!fs.existsSync(registered) || !fs.statSync(registered).isFile()) return null;
    return registered;
  }

  // Returns the first existing absolute path under any model root, or null.
  // Path-traversal protected: resolved path must start with the root.
  private _resolveModel(urlPath: string): string | null {
    for (const root of this._roots) {
      const candidate = path.join(root, urlPath);
      if (!candidate.startsWith(root)) continue;
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
    return null;
  }

  // Join `rest` onto `base` and reject path traversal. Returns null if the
  // file does not exist or escapes the base.
  private _safeJoin(base: string, rest: string): string | null {
    const candidate = path.normalize(path.join(base, rest));
    const baseNormalized = path.normalize(base);
    if (!candidate.startsWith(baseNormalized + path.sep) && candidate !== baseNormalized) {
      return null;
    }
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
      return null;
    }
    return candidate;
  }

  stop() {
    if (this._server) {
      this._server.close();
      this._server = null;
    }
  }

  get port(): number {
    return this._port;
  }

  // Expose the underlying HTTP server so the desktop pet bridge can attach
  // an `upgrade` handler for the WebSocket endpoint. Returns null until
  // `start()` resolves.
  get httpServer(): http.Server | null {
    return this._server;
  }
}
