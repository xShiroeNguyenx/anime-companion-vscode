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
};

// Tiny localhost HTTP server that serves Live2D model assets so PIXI's loader
// can fetch them without VS Code's CSP / vscode-resource scheme getting in the way.
export class ModelFileServer {
  private _server: http.Server | null = null;
  private _port: number = 0;
  private _modelDir: string;

  constructor(extensionUri: vscode.Uri) {
    this._modelDir = path.join(extensionUri.fsPath, 'media', 'live2d');
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

        const urlPath = decodeURIComponent(req.url || '/');
        const filePath = path.join(this._modelDir, urlPath);

        if (!filePath.startsWith(this._modelDir)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
          }

          const ext = path.extname(filePath).toLowerCase();
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

  stop() {
    if (this._server) {
      this._server.close();
      this._server = null;
    }
  }

  get port(): number {
    return this._port;
  }
}
