import * as vscode from 'vscode';
import type { WebSocket } from 'ws';

// Abstraction over the message channel between the extension host and the
// Live2D runtime. The webview implementation wraps `webview.postMessage` /
// `onDidReceiveMessage`. A future WebSocket implementation (Phase B) will
// implement the same interface so the rest of the code does not care which
// transport is in use.
export interface CompanionTransport {
  // Push a message to the runtime. Fire-and-forget; drops silently if the
  // transport is not attached yet.
  post(message: unknown): void;

  // Subscribe to messages coming from the runtime.
  onMessage(handler: (message: any) => void): vscode.Disposable;

  // Optional lifecycle signals so callers can pause timers when the runtime
  // is not visible. Webview transport mirrors VS Code's visibility events;
  // bridge transport will mirror sidecar process state.
  onVisibilityChange?(handler: (visible: boolean) => void): vscode.Disposable;
  isVisible?(): boolean;

  dispose(): void;
}

// Webview-backed transport. Holds an internal reference that may be (re)set
// when the WebviewView is resolved or torn down by VS Code so we can keep
// `CompanionTransport` instances stable across view recreations.
export class WebviewTransport implements CompanionTransport {
  private _view?: vscode.WebviewView;
  private _disposables: vscode.Disposable[] = [];
  private _messageHandlers: Array<(message: any) => void> = [];
  private _visibilityHandlers: Array<(visible: boolean) => void> = [];

  attach(view: vscode.WebviewView) {
    this.detach();
    this._view = view;

    this._disposables.push(
      view.webview.onDidReceiveMessage((message) => {
        for (const handler of this._messageHandlers) {
          handler(message);
        }
      })
    );

    this._disposables.push(
      view.onDidChangeVisibility(() => {
        const visible = view.visible;
        for (const handler of this._visibilityHandlers) {
          handler(visible);
        }
      })
    );

    this._disposables.push(
      view.onDidDispose(() => {
        this.detach();
      })
    );
  }

  detach() {
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
    this._view = undefined;
  }

  post(message: unknown): void {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  onMessage(handler: (message: any) => void): vscode.Disposable {
    this._messageHandlers.push(handler);
    return {
      dispose: () => {
        const i = this._messageHandlers.indexOf(handler);
        if (i >= 0) this._messageHandlers.splice(i, 1);
      },
    };
  }

  onVisibilityChange(handler: (visible: boolean) => void): vscode.Disposable {
    this._visibilityHandlers.push(handler);
    return {
      dispose: () => {
        const i = this._visibilityHandlers.indexOf(handler);
        if (i >= 0) this._visibilityHandlers.splice(i, 1);
      },
    };
  }

  isVisible(): boolean {
    return this._view?.visible ?? false;
  }

  dispose() {
    this.detach();
    this._messageHandlers = [];
    this._visibilityHandlers = [];
  }
}

// WebSocket-backed transport. Wraps a single live `ws` connection; the bridge
// (re)attaches one when a sidecar client connects and detaches on close. The
// "visible" signal here mirrors connection state — connected = visible — so
// idle timers naturally pause when the sidecar is gone.
export class WebSocketTransport implements CompanionTransport {
  private _ws: WebSocket | null = null;
  private _messageHandlers: Array<(message: any) => void> = [];
  private _visibilityHandlers: Array<(visible: boolean) => void> = [];

  attach(ws: WebSocket) {
    this.detach();
    this._ws = ws;

    ws.on('message', (data) => {
      // ws emits Buffer (or Buffer[] for fragmented frames). Convert to string
      // before JSON.parse. Drop malformed frames silently — defensive against
      // a misbehaving sidecar.
      let text: string;
      if (Buffer.isBuffer(data)) {
        text = data.toString('utf8');
      } else if (Array.isArray(data)) {
        text = Buffer.concat(data as Buffer[]).toString('utf8');
      } else {
        text = String(data);
      }
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        return;
      }
      for (const handler of this._messageHandlers) {
        handler(parsed);
      }
    });

    ws.on('close', () => {
      if (this._ws === ws) {
        this._ws = null;
        for (const handler of this._visibilityHandlers) {
          handler(false);
        }
      }
    });

    // Initial visibility = true on attach.
    for (const handler of this._visibilityHandlers) {
      handler(true);
    }
  }

  detach() {
    if (this._ws) {
      const ws = this._ws;
      this._ws = null;
      try {
        ws.removeAllListeners();
        ws.close();
      } catch {
        // ignore
      }
    }
  }

  post(message: unknown): void {
    if (!this._ws || this._ws.readyState !== 1 /* OPEN */) {
      return;
    }
    try {
      this._ws.send(JSON.stringify(message));
    } catch {
      // Connection probably went away mid-send; let the close handler clean up.
    }
  }

  onMessage(handler: (message: any) => void): vscode.Disposable {
    this._messageHandlers.push(handler);
    return {
      dispose: () => {
        const i = this._messageHandlers.indexOf(handler);
        if (i >= 0) this._messageHandlers.splice(i, 1);
      },
    };
  }

  onVisibilityChange(handler: (visible: boolean) => void): vscode.Disposable {
    this._visibilityHandlers.push(handler);
    return {
      dispose: () => {
        const i = this._visibilityHandlers.indexOf(handler);
        if (i >= 0) this._visibilityHandlers.splice(i, 1);
      },
    };
  }

  isVisible(): boolean {
    return this._ws !== null && this._ws.readyState === 1;
  }

  dispose() {
    this.detach();
    this._messageHandlers = [];
    this._visibilityHandlers = [];
  }
}
