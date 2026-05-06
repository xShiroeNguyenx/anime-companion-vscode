import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import AdmZip = require('adm-zip');
import { log } from './log';

const MAX_REDIRECTS = 5;

export class DesktopPetDownloader {
  private _cacheRoot: string;
  private _extensionVersion: string;
  private _inflight = new Map<string, Promise<string>>();

  constructor(context: vscode.ExtensionContext) {
    this._extensionVersion = String(
      vscode.extensions.getExtension('shiroenguyen.anime-companion-vscode')?.packageJSON?.version ?? '0.0.0'
    );
    this._cacheRoot = path.join(
      context.globalStorageUri.fsPath,
      'desktop-pet',
      this._extensionVersion
    );
    fs.mkdirSync(this._cacheRoot, { recursive: true });
  }

  public getCachedBinaryPath(platformId: string): string {
    const exeName = platformId.startsWith('win-') ? 'anime-companion-pet.exe' : 'anime-companion-pet';
    return path.join(this._cacheRoot, platformId, exeName);
  }

  public isSidecarCached(platformId: string): boolean {
    return fs.existsSync(this.getCachedBinaryPath(platformId));
  }

  public ensureSidecar(platformId: string): Promise<string> {
    if (this.isSidecarCached(platformId)) {
      return Promise.resolve(this.getCachedBinaryPath(platformId));
    }

    const existing = this._inflight.get(platformId);
    if (existing) return existing;

    const promise = this._downloadAndExtract(platformId).finally(() => {
      this._inflight.delete(platformId);
    });
    this._inflight.set(platformId, promise);
    return promise;
  }

  private async _downloadAndExtract(platformId: string): Promise<string> {
    const baseUrl = vscode.workspace
      .getConfiguration('animeCompanion')
      .get<string>('desktopCompanion.downloadBaseUrl', '')
      .replace(/\/+$/, '');
    if (!baseUrl) {
      throw new Error('desktopCompanion.downloadBaseUrl is not configured');
    }

    const zipUrl = `${baseUrl}/${encodeURIComponent(platformId)}.zip`;
    const targetDir = path.join(this._cacheRoot, platformId);
    const tmpZip = path.join(this._cacheRoot, `.${platformId}.${Date.now()}.zip.part`);

    log(`DesktopPetDownloader: fetching ${zipUrl}`);

    return vscode.window.withProgress<string>(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Downloading Desktop Companion',
        cancellable: false,
      },
      async (progress) => {
        try {
          await this._fetchToFile(zipUrl, tmpZip, (downloaded, total) => {
            const pct = total > 0 ? Math.floor((downloaded / total) * 100) : 0;
            const mbDone = (downloaded / 1024 / 1024).toFixed(1);
            const mbTotal = total > 0 ? ` / ${(total / 1024 / 1024).toFixed(1)} MB` : '';
            progress.report({
              message: `${mbDone} MB${mbTotal} (${pct}%)`,
            });
          });

          progress.report({ message: 'Extracting...' });
          fs.mkdirSync(targetDir, { recursive: true });
          const zip = new AdmZip(tmpZip);
          zip.extractAllTo(targetDir, true);
          fs.unlinkSync(tmpZip);

          const binaryPath = this._resolveExtractedBinaryPath(targetDir, platformId);
          if (!binaryPath) {
            throw new Error(
              `Extraction succeeded but anime-companion-pet binary was not found under ${targetDir}.`
            );
          }

          // Normalize the final path so the bridge can always spawn a stable location.
          const finalPath = this.getCachedBinaryPath(platformId);
          if (path.resolve(binaryPath) !== path.resolve(finalPath)) {
            fs.copyFileSync(binaryPath, finalPath);
          }

          log(`DesktopPetDownloader: ready at ${finalPath}`);
          vscode.window.showInformationMessage('Desktop Companion downloaded. Launching now...');
          return finalPath;
        } catch (err) {
          try { fs.existsSync(tmpZip) && fs.unlinkSync(tmpZip); } catch { /* ignore */ }
          try { fs.existsSync(targetDir) && fs.rmSync(targetDir, { recursive: true, force: true }); } catch { /* ignore */ }
          throw err;
        }
      }
    );
  }

  private _resolveExtractedBinaryPath(targetDir: string, platformId: string): string | null {
    const direct = this.getCachedBinaryPath(platformId);
    if (fs.existsSync(direct) && fs.statSync(direct).isFile()) {
      return direct;
    }

    const expectedName = path.basename(direct).toLowerCase();
    const queue = [targetDir];

    while (queue.length > 0) {
      const current = queue.shift()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          queue.push(fullPath);
          continue;
        }
        if (entry.isFile() && entry.name.toLowerCase() === expectedName) {
          return fullPath;
        }
      }
    }

    return null;
  }

  private _fetchToFile(
    url: string,
    destPath: string,
    onProgress: (downloaded: number, total: number) => void,
    redirectsLeft = MAX_REDIRECTS
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? https : http;

      const req = lib.get(u, (res) => {
        const status = res.statusCode ?? 0;

        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          if (redirectsLeft <= 0) {
            reject(new Error('Too many redirects'));
            return;
          }
          const next = new URL(res.headers.location, url).toString();
          res.resume();
          this._fetchToFile(next, destPath, onProgress, redirectsLeft - 1).then(resolve, reject);
          return;
        }

        if (status < 200 || status >= 300) {
          reject(new Error(`HTTP ${status} for ${url}`));
          res.resume();
          return;
        }

        const total = Number.parseInt(String(res.headers['content-length'] ?? '0'), 10) || 0;
        let downloaded = 0;
        const file = fs.createWriteStream(destPath);
        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          onProgress(downloaded, total);
        });
        res.pipe(file);
        file.on('finish', () => file.close((err) => err ? reject(err) : resolve()));
        file.on('error', reject);
      });

      req.on('error', reject);
      req.setTimeout(60_000, () => {
        req.destroy(new Error('Download timeout (60s)'));
      });
    });
  }
}
