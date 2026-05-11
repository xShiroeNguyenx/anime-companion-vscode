import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import AdmZip = require('adm-zip');
import { log } from './log';

const MAX_REDIRECTS = 5;

export type VoiceAssetLang = 'en' | 'vi';

export class VoiceAssetDownloader {
  private _cacheRoot: string;
  private _extensionVersion: string;
  private _inflight = new Map<string, Promise<string | null>>();

  constructor(context: vscode.ExtensionContext) {
    this._extensionVersion = String(
      vscode.extensions.getExtension('shiroenguyen.anime-companion-vscode')?.packageJSON?.version ?? '0.0.0'
    );
    this._cacheRoot = path.join(
      context.globalStorageUri.fsPath,
      'voice-assets',
      this._extensionVersion
    );
    fs.mkdirSync(this._cacheRoot, { recursive: true });
  }

  public get cacheRoot(): string {
    return this._cacheRoot;
  }

  public getCachedDir(lang: VoiceAssetLang): string {
    return path.join(this._cacheRoot, lang);
  }

  public isCached(lang: VoiceAssetLang): boolean {
    const dir = this.getCachedDir(lang);
    if (!fs.existsSync(dir)) return false;
    try {
      return fs.readdirSync(dir).some((f) => f.toLowerCase().endsWith('.mp3'));
    } catch {
      return false;
    }
  }

  // Returns the local cache directory for the language on success, or null
  // on failure. Caller is expected to fall back to bundled audio when null.
  public ensureLanguageAudio(lang: VoiceAssetLang): Promise<string | null> {
    if (this.isCached(lang)) {
      return Promise.resolve(this.getCachedDir(lang));
    }

    const existing = this._inflight.get(lang);
    if (existing) return existing;

    const promise = this._downloadAndExtract(lang)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        log(`VoiceAssetDownloader: ${lang} failed: ${msg}`);
        return null;
      })
      .finally(() => {
        this._inflight.delete(lang);
      });

    this._inflight.set(lang, promise);
    return promise;
  }

  private async _downloadAndExtract(lang: VoiceAssetLang): Promise<string | null> {
    const baseUrl = vscode.workspace
      .getConfiguration('animeCompanion')
      .get<string>('voiceAssets.downloadBaseUrl', '')
      .replace(/\/+$/, '');
    if (!baseUrl) {
      throw new Error('voiceAssets.downloadBaseUrl is not configured');
    }

    const zipUrl = `${baseUrl}/${encodeURIComponent(lang)}.zip`;
    const targetDir = this.getCachedDir(lang);
    const tmpZip = path.join(this._cacheRoot, `.${lang}.${Date.now()}.zip.part`);

    log(`VoiceAssetDownloader: fetching ${zipUrl}`);

    return vscode.window.withProgress<string | null>(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Downloading ${lang.toUpperCase()} voice assets`,
        cancellable: false,
      },
      async (progress) => {
        try {
          await this._fetchToFile(zipUrl, tmpZip, (downloaded, total) => {
            const pct = total > 0 ? Math.floor((downloaded / total) * 100) : 0;
            const kbDone = (downloaded / 1024).toFixed(0);
            const kbTotal = total > 0 ? ` / ${(total / 1024).toFixed(0)} KB` : '';
            progress.report({ message: `${kbDone} KB${kbTotal} (${pct}%)` });
          });

          progress.report({ message: 'Extracting...' });
          fs.mkdirSync(targetDir, { recursive: true });
          const zip = new AdmZip(tmpZip);
          zip.extractAllTo(targetDir, true);
          fs.unlinkSync(tmpZip);

          if (!this.isCached(lang)) {
            throw new Error(`Extraction succeeded but no .mp3 files found under ${targetDir}.`);
          }

          log(`VoiceAssetDownloader: ${lang} ready at ${targetDir}`);
          return targetDir;
        } catch (err) {
          try { fs.existsSync(tmpZip) && fs.unlinkSync(tmpZip); } catch { /* ignore */ }
          try { fs.existsSync(targetDir) && fs.rmSync(targetDir, { recursive: true, force: true }); } catch { /* ignore */ }
          throw err;
        }
      }
    );
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
