const assert = require('assert');
const path = require('path');
const Module = require('module');
const packageJson = require('../package.json');

const registeredCommands = new Map();
let registeredViewProvider = null;

const configurationStore = {
  voiceLanguage: 'ja',
  model: 'hiyori',
  muted: false,
  showOnStartup: true,
  pomodoroWorkTime: 25,
  pomodoroBreakTime: 5,
};

const configuration = {
  get(key, fallback) {
    return Object.prototype.hasOwnProperty.call(configurationStore, key)
      ? configurationStore[key]
      : fallback;
  },
  inspect(key) {
    if (!Object.prototype.hasOwnProperty.call(configurationStore, key)) {
      return undefined;
    }
    return {
      globalValue: configurationStore[key],
      workspaceValue: undefined,
      workspaceFolderValue: undefined,
    };
  },
  async update(key, value) {
    configurationStore[key] = value;
  },
};

const mockVscode = {
  ExtensionMode: {
    Test: 3,
  },
  StatusBarAlignment: {
    Right: 2,
  },
  QuickPickItemKind: {
    Separator: -1,
    Default: 0,
  },
  EventEmitter: class EventEmitter {
    constructor() {
      this._listeners = new Set();
      this.event = (listener) => {
        this._listeners.add(listener);
        return { dispose: () => this._listeners.delete(listener) };
      };
    }
    fire(data) {
      for (const listener of this._listeners) {
        try { listener(data); } catch { /* ignore */ }
      }
    }
    dispose() {
      this._listeners.clear();
    }
  },
  authentication: {
    getAccounts() {
      return Promise.resolve([]);
    },
    getSession() {
      return Promise.resolve(undefined);
    },
    onDidChangeSessions() {
      return { dispose() {} };
    },
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
  },
  ThemeColor: class ThemeColor {
    constructor(id) {
      this.id = id;
    }
  },
  Uri: {
    joinPath(base, ...segments) {
      return { fsPath: path.join(base.fsPath, ...segments) };
    },
  },
  window: {
    createOutputChannel() {
      return {
        appendLine() {},
        dispose() {},
      };
    },
    createStatusBarItem() {
      return {
        text: '',
        tooltip: '',
        command: undefined,
        backgroundColor: undefined,
        show() {},
        dispose() {},
      };
    },
    registerWebviewViewProvider(viewType, provider) {
      registeredViewProvider = { viewType, provider };
      return { dispose() {} };
    },
    showInformationMessage() {
      return Promise.resolve(undefined);
    },
    showWarningMessage() {
      return Promise.resolve(undefined);
    },
    onDidChangeActiveTextEditor() {
      return { dispose() {} };
    },
  },
  workspace: {
    workspaceFolders: [],
    getConfiguration(section) {
      assert.strictEqual(section, 'animeCompanion');
      return configuration;
    },
    onDidChangeConfiguration() {
      return { dispose() {} };
    },
  },
  commands: {
    registerCommand(name, callback) {
      registeredCommands.set(name, callback);
      return { dispose() {} };
    },
    executeCommand() {
      return Promise.resolve(undefined);
    },
  },
  debug: {
    activeDebugSession: undefined,
    startDebugging() {
      return Promise.resolve(true);
    },
  },
  extensions: {
    getExtension(id) {
      if (id === 'shiroenguyen.anime-companion-vscode') {
        return { packageJSON: { version: packageJson.version } };
      }
      return undefined;
    },
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vscode') {
    return mockVscode;
  }
  return originalLoad.call(this, request, parent, isMain);
};

async function main() {
  try {
    const extension = require('../out/extension.js');
    const context = {
      extensionUri: { fsPath: path.resolve(__dirname, '..') },
      globalStorageUri: { fsPath: path.resolve(__dirname, '..', '.tmp-test-storage') },
      extensionMode: mockVscode.ExtensionMode.Test,
      subscriptions: [],
      globalState: {
        state: new Map(),
        get(key, fallback) {
          return this.state.has(key) ? this.state.get(key) : fallback;
        },
        async update(key, value) {
          this.state.set(key, value);
        },
      },
      workspaceState: {
        state: new Map(),
        get(key, fallback) {
          return this.state.has(key) ? this.state.get(key) : fallback;
        },
        async update(key, value) {
          this.state.set(key, value);
        },
      },
    };

    await extension.activate(context);

    assert.ok(registeredViewProvider, 'Webview view provider should be registered');
    assert.strictEqual(registeredViewProvider.viewType, 'animeCompanion.live2dView');

    const expectedCommands = [
      'animeCompanion.runProject',
      'animeCompanion.show',
      'animeCompanion.hide',
      'animeCompanion.toggle',
      'animeCompanion.changeModel',
      'animeCompanion.changeVoice',
      'animeCompanion.toggleMute',
      'animeCompanion.startPomodoro',
      'animeCompanion.stopPomodoro',
      'animeCompanion.openSettings',
    ];

    for (const command of expectedCommands) {
      assert.ok(registeredCommands.has(command), `Missing registered command: ${command}`);
    }

    extension.deactivate();
    console.log('[smoke-test] Activation and command registration passed.');
  } finally {
    Module._load = originalLoad;
  }
}

main().catch((error) => {
  console.error('[smoke-test] Failed');
  console.error(error);
  process.exit(1);
});
