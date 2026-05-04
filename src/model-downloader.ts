import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import AdmZip = require('adm-zip');
import { log } from './log';
import { ModelInfo } from './models';

// Caps redirect depth for the download.
const MAX_REDIRECTS = 5;

export class ModelDownloader {
  private _cacheRoot: string;
  // Track in-flight downloads so concurrent ensureModel calls share the work.
  private _inflight = new Map<string, Promise<string>>();

  constructor(context: vscode.ExtensionContext) {
    this._cacheRoot = path.join(context.globalStorageUri.fsPath, 'models');
    fs.mkdirSync(this._cacheRoot, { recursive: true });
  }

  public get cacheRoot(): string {
    return this._cacheRoot;
  }

  // Returns the absolute path to the folder that holds the model's files.
  // For bundled models this is `media/live2d/{folder}` resolved by the caller.
  // For lazy models, this is `{globalStorage}/models/{folder}`.
  public getCachedModelDir(folder: string): string {
    return path.join(this._cacheRoot, folder);
  }

  public isModelCached(folder: string, modelFile: string): boolean {
    return fs.existsSync(path.join(this._cacheRoot, folder, modelFile));
  }

  // Idempotent. If the model is already cached, returns immediately.
  // Otherwise downloads the zip from `{baseUrl}/{folder}.zip` and extracts it.
  public ensureModel(model: ModelInfo): Promise<string> {
    const target = this.getCachedModelDir(model.folder);
    if (this.isModelCached(model.folder, model.file)) {
      return Promise.resolve(target);
    }

    const existing = this._inflight.get(model.folder);
    if (existing) return existing;

    const promise = this._downloadAndExtract(model).finally(() => {
      this._inflight.delete(model.folder);
    });
    this._inflight.set(model.folder, promise);
    return promise;
  }

  private async _downloadAndExtract(model: ModelInfo): Promise<string> {
    const baseUrl = vscode.workspace
      .getConfiguration('animeCompanion')
      .get<string>('modelDownloadBaseUrl', '')
      .replace(/\/+$/, '');
    if (!baseUrl) {
      throw new Error('modelDownloadBaseUrl is not configured');
    }

    const zipUrl = `${baseUrl}/${encodeURIComponent(model.folder)}.zip`;
    const target = this.getCachedModelDir(model.folder);
    const tmpZip = path.join(this._cacheRoot, `.${model.folder}.${Date.now()}.zip.part`);

    log(`ModelDownloader: fetching ${zipUrl}`);

    return vscode.window.withProgress<string>(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Downloading model "${model.name}"`,
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
              increment: undefined,
            });
          });

          progress.report({ message: 'Extracting...' });
          fs.mkdirSync(target, { recursive: true });
          const zip = new AdmZip(tmpZip);
          zip.extractAllTo(target, /*overwrite*/ true);
          fs.unlinkSync(tmpZip);

          if (!this.isModelCached(model.folder, model.file)) {
            throw new Error(
              `Extraction succeeded but ${model.file} not found under ${target}. ` +
                `Make sure the zip's top-level entries match the model folder layout.`
            );
          }

          log(`ModelDownloader: ready at ${target}`);
          return target;
        } catch (err) {
          // Clean up partial files so a retry starts fresh.
          try { fs.existsSync(tmpZip) && fs.unlinkSync(tmpZip); } catch { /* ignore */ }
          try { fs.existsSync(target) && fs.rmSync(target, { recursive: true, force: true }); } catch { /* ignore */ }
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

        // GitHub Releases redirect to S3 — follow up to MAX_REDIRECTS.
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
