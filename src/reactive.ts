import * as vscode from 'vscode';
import { getMessageBank, MessageKey, ResolvedPhrase } from './messages';
import { StatsStore } from './stats';

export type CompanionMood = 'idle' | 'happy' | 'angry' | 'sleepy';

// Cap delta between activity events when accumulating coding time, so an idle
// gap doesn't get counted as work.
const CODING_GAP_CAP_MS = 60_000;

// Reactive manager
export class ReactiveManager {
  private _sendMessageImpl: (phrase: ResolvedPhrase, motion?: string) => void;
  private _sendMood: (mood: CompanionMood) => void;
  private _stats: StatsStore;
  private _disposables: vscode.Disposable[] = [];

  // Tracking state
  private _prevErrorCount = 0;
  private _saveTimes: number[] = [];
  private _keystrokeCount = 0;
  private _keystrokeTimer?: NodeJS.Timeout;
  private _codingStartTime = Date.now();
  private _lastActivityTime = Date.now();
  private _breakTimer?: NodeJS.Timeout;
  private _breakIntervalMs = 30 * 60 * 1000;
  private _currentMood: CompanionMood = 'idle';
  private _moodTimer?: NodeJS.Timeout;
  private _prevBranch = '';
  private _prevCommitCount = 0;

  constructor(
    sendMessage: (phrase: ResolvedPhrase, motion?: string) => void,
    sendMood: (mood: CompanionMood) => void,
    stats: StatsStore
  ) {
    this._sendMessageImpl = sendMessage;
    this._sendMood = sendMood;
    this._stats = stats;
  }

  private _pick(key: MessageKey, vars?: Record<string, string | number>): ResolvedPhrase {
    return getMessageBank().pickResolved(key, vars);
  }

  // Settings gates
  // Read settings live so user can toggle without reload.
  private _isEnabled(key: 'diagnostics' | 'save' | 'typing' | 'git'): boolean {
    return vscode.workspace
      .getConfiguration('animeCompanion')
      .get<boolean>(`reactive.${key}`, true);
  }

  // Returns true if "now" falls inside any user-configured quiet hour range.
  // Format per range: "HH:MM-HH:MM" (24h). Ranges may cross midnight (e.g. "22:00-06:00").
  private _isQuietHour(): boolean {
    const ranges = vscode.workspace
      .getConfiguration('animeCompanion')
      .get<string[]>('quietHours', []);
    if (!ranges || ranges.length === 0) return false;

    const now = new Date();
    const minutesNow = now.getHours() * 60 + now.getMinutes();
    const re = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/;
    for (const range of ranges) {
      const m = re.exec(range);
      if (!m) continue;
      const start = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
      const end = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
      if (start === end) continue; // empty range
      const inside = start < end
        ? (minutesNow >= start && minutesNow < end)
        : (minutesNow >= start || minutesNow < end); // crosses midnight
      if (inside) return true;
    }
    return false;
  }

  // Wrapper that respects quietHours. All internal calls go through this so
  // the quiet-hour gate is applied uniformly. Mood/expression updates skip
  // this gate (handled directly via _sendMood).
  private _sendMessage(phrase: ResolvedPhrase, motion?: string) {
    if (!phrase.text) return;
    if (this._isQuietHour()) return;
    this._sendMessageImpl(phrase, motion);
  }

  public activate() {
    this._hookDiagnostics();
    this._hookFileSave();
    this._hookTyping();
    this._hookBuildTasks();
    this._hookDebug();
    this._hookGit();
    this._startBreakTimer();
    this._startMoodSystem();
    this._sendTimeGreeting();
  }

  public dispose() {
    this._disposables.forEach(d => d.dispose());
    if (this._keystrokeTimer) clearInterval(this._keystrokeTimer);
    if (this._breakTimer) clearInterval(this._breakTimer);
    if (this._moodTimer) clearInterval(this._moodTimer);
  }

  // 1. Error/Warning reactions
  private _hookDiagnostics() {
    this._disposables.push(
      vscode.languages.onDidChangeDiagnostics(() => {
        if (!this._isEnabled('diagnostics')) return;
        const allDiag = vscode.languages.getDiagnostics();
        let errors = 0, warnings = 0;
        for (const [, diags] of allDiag) {
          for (const d of diags) {
            if (d.severity === vscode.DiagnosticSeverity.Error) errors++;
            else if (d.severity === vscode.DiagnosticSeverity.Warning) warnings++;
          }
        }

        if (errors > this._prevErrorCount) {
          if (errors >= 5) {
            this._sendMessage(this._pick('errorMany', { count: errors, error_count: errors }), 'TapBody');
          } else {
            this._sendMessage(this._pick('error', { count: errors, error_count: errors }), 'TapBody');
          }
        } else if (errors === 0 && this._prevErrorCount > 0) {
          const fixed = this._prevErrorCount;
          void this._stats.incErrorsFixed(fixed).then((total) => {
            this._sendMessage(this._pick('errorFixed'), 'Idle');
            void this._tryUnlock('error_fix', total);
          });
        } else if (warnings > 0 && errors === 0 && this._prevErrorCount === 0 && Math.random() < 0.3) {
          this._sendMessage(this._pick('warning'));
        }
        this._prevErrorCount = errors;
      })
    );
  }

  // 3. Save reactions
  private _hookFileSave() {
    this._disposables.push(
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (!this._isEnabled('save')) return;
        this._resetActivity();
        const now = Date.now();
        const fileName = vscode.workspace.asRelativePath(document.uri, false) || document.fileName;
        const extension = document.uri.scheme === 'file'
          ? document.fileName.split('.').pop() || ''
          : '';
        this._saveTimes.push(now);
        // Keep only last 10 saves
        if (this._saveTimes.length > 10) this._saveTimes.shift();

        // Detect spam save (3+ saves in 5 seconds)
        const recent = this._saveTimes.filter(t => now - t < 5000);
        if (recent.length >= 3) {
          this._sendMessage(this._pick('saveSpam', {
            filename: fileName,
            extension,
          }));
        } else if (Math.random() < 0.3) {
          this._sendMessage(this._pick('save', {
            filename: fileName,
            extension,
          }));
        }

        void this._stats.incSave().then((total) => {
          void this._tryUnlock('save', total);
        });
      })
    );
  }

  // 5. Typing intensity + Easter eggs + user-defined keywords
  private _hookTyping() {
    this._disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (!this._isEnabled('typing')) return;
        if (e.document.uri.scheme !== 'file') return;
        this._keystrokeCount += e.contentChanges.length;
        this._resetActivity();

        const customKeywords = getMessageBank().getCustomKeywords();

        for (const change of e.contentChanges) {
          const text = change.text;
          const upper = text.toUpperCase();

          if (upper.includes('TODO')) {
            if (Math.random() < 0.5) this._sendMessage(this._pick('easterTodo'));
          } else if (upper.includes('FIXME')) {
            if (Math.random() < 0.5) this._sendMessage(this._pick('easterFixme'));
          } else if (text.includes('console.log')) {
            if (Math.random() < 0.5) this._sendMessage(this._pick('easterConsole'));
          }

          // User-defined keyword reactions: case-insensitive substring match.
          // Each keyword fires probabilistically so a flurry of edits doesn't
          // spam the bubble.
          if (customKeywords.length > 0 && text.length > 0) {
            for (const { keyword, messages } of customKeywords) {
              if (!keyword) continue;
              if (upper.includes(keyword.toUpperCase()) && Math.random() < 0.5) {
                const template = messages[Math.floor(Math.random() * messages.length)];
                this._sendMessage({
                  key: 'typingFast',
                  text: template,
                  template,
                  fromCustom: true,
                  hasPlaceholders: /\{[a-zA-Z0-9_]+\}/.test(template),
                });
                break;
              }
            }
          }
        }
      })
    );

    // Check typing speed every 5 seconds
    this._keystrokeTimer = setInterval(() => {
      if (!this._isEnabled('typing')) {
        this._keystrokeCount = 0;
        return;
      }
      if (this._keystrokeCount > 30) { // >6 keystrokes/sec
        this._sendMessage(this._pick('typingFast'));
      }
      this._keystrokeCount = 0;
    }, 5000);
  }

  // 6. Break reminder
  private _startBreakTimer() {
    this._breakTimer = setInterval(() => {
      const elapsed = Date.now() - this._codingStartTime;
      const mins = Math.floor(elapsed / 60000);
      if (elapsed >= this._breakIntervalMs) {
        this._sendMessage(this._pick('breakReminder', { mins }));
        // Check coding achievements (threshold in minutes)
        void this._tryUnlock('coding', mins);
      }
    }, 10 * 60 * 1000); // Check every 10 minutes
  }

  // Updates lastActivityTime AND accumulates active coding time. Bounded so
  // an idle gap (>1 min) doesn't get counted.
  private _resetActivity() {
    const now = Date.now();
    const delta = now - this._lastActivityTime;
    this._lastActivityTime = now;
    if (delta > 0 && delta <= CODING_GAP_CAP_MS) {
      void this._stats.addCodingTime(delta);
    }
  }

  // 7. Build/task reactions
  private _hookBuildTasks() {
    this._disposables.push(
      vscode.tasks.onDidEndTaskProcess((e) => {
        if (e.exitCode === 0) {
          this._sendMessage(this._pick('buildSuccess'), 'Idle');
        } else {
          this._sendMessage(this._pick('buildFail'), 'TapBody');
        }
      })
    );
  }

  // 8. Debug reactions
  private _hookDebug() {
    this._disposables.push(
      vscode.debug.onDidStartDebugSession(() => {
        this._sendMessage(this._pick('debugStart'));
      })
    );
    this._disposables.push(
      vscode.debug.onDidTerminateDebugSession(() => {
        this._sendMessage(this._pick('debugEnd'));
      })
    );
  }

  // 9. Git integration (enhanced)
  private _hookGit() {
    const gitCheck = setInterval(async () => {
      if (!this._isEnabled('git')) return;
      try {
        const gitExt = vscode.extensions.getExtension('vscode.git');
        if (!gitExt) return;
        const git = gitExt.isActive ? gitExt.exports : await gitExt.activate();
        const api = git.getAPI(1);
        if (!api || api.repositories.length === 0) return;

        const repo = api.repositories[0];

        // Track branch changes
        const currentBranch = repo.state.HEAD?.name || '';
        if (this._prevBranch && currentBranch && currentBranch !== this._prevBranch) {
          this._sendMessage(this._pick('gitBranchSwitch', {
            name: currentBranch,
            branch: currentBranch,
          }));
        }
        this._prevBranch = currentBranch;

        // Track new commits
        const commitLog = repo.state.HEAD?.commit || '';
        if (commitLog && this._prevCommitCount > 0) {
          // Simple heuristic: if HEAD commit changed, a commit was made
          // We'll track by counting indexed changes going to 0
          const indexedNow = repo.state.indexChanges.length;
          if (indexedNow === 0 && this._prevCommitCount > 0) {
            this._sendMessage(this._pick('gitCommitted'), 'Idle');
            this._setMood('happy');
            void this._stats.incCommit().then((total) => {
              void this._tryUnlock('commit', total);
            });
          }
        }
        this._prevCommitCount = repo.state.indexChanges.length;

        // Track uncommitted changes
        const changes = repo.state.workingTreeChanges.length + repo.state.indexChanges.length;
        if (changes > 10 && Math.random() < 0.3) {
          this._sendMessage(this._pick('gitManyChanges', { count: changes, error_count: changes }));
        } else if (changes > 5 && Math.random() < 0.2) {
          this._sendMessage(this._pick('gitRemind'));
        }

        // Merge conflicts
        if (repo.state.mergeChanges.length > 0) {
          this._sendMessage(this._pick('gitConflict'), 'TapBody');
          this._setMood('angry');
        }
      } catch { /* Git not available */ }
    }, 3 * 60 * 1000); // Every 3 minutes

    this._disposables.push({ dispose: () => clearInterval(gitCheck) });
  }

  // 12. Mood / animation state system
  private _setMood(mood: CompanionMood) {
    if (mood !== this._currentMood) {
      this._currentMood = mood;
      this._sendMood(mood);
      console.log(`🌸 Mood changed to: ${mood}`);
    }
  }

  private _startMoodSystem() {
    // Check and update mood every 30 seconds
    this._moodTimer = setInterval(() => {
      const now = Date.now();
      const idleTime = now - this._lastActivityTime;

      // Sleepy: no activity for 5+ minutes
      if (idleTime > 5 * 60 * 1000) {
        if (this._currentMood !== 'sleepy') {
          this._setMood('sleepy');
          if (Math.random() < 0.3) {
            this._sendMessage(this._pick('moodSleepy'), 'Idle');
          }
        }
        return;
      }

      // Angry: many errors
      if (this._prevErrorCount >= 5) {
        if (this._currentMood !== 'angry') {
          this._setMood('angry');
          if (Math.random() < 0.5) {
            this._sendMessage(this._pick('moodAngry'), 'TapBody');
          }
        }
        return;
      }

      // Happy: no errors and recently active
      if (this._prevErrorCount === 0 && idleTime < 60 * 1000) {
        if (this._currentMood !== 'happy') {
          this._setMood('happy');
          if (Math.random() < 0.2) {
            this._sendMessage(this._pick('moodHappy'), 'Idle');
          }
        }
        return;
      }

      // Default: idle
      if (this._currentMood !== 'idle') {
        this._setMood('idle');
      }
    }, 30 * 1000);
  }

  // 4. Time awareness
  private _sendTimeGreeting() {
    const hour = new Date().getHours();
    let key: MessageKey;
    if (hour >= 5 && hour < 12) key = 'greetingMorning';
    else if (hour >= 12 && hour < 17) key = 'greetingAfternoon';
    else if (hour >= 17 && hour < 22) key = 'greetingEvening';
    else key = 'greetingNight';

    // Delay so it doesn't overlap with the greeting
    setTimeout(() => {
      this._sendMessage(this._pick(key));
    }, 8000);
  }

  // 11. Achievements — checks stats threshold and announces if newly unlocked.
  private async _tryUnlock(type: 'save' | 'commit' | 'error_fix' | 'coding', count: number) {
    const def = await this._stats.tryUnlockByThreshold(type, count);
    if (def) {
      const template = getMessageBank().pickAchievement(def.id) ?? `🏆 ${def.title}`;
      this._sendMessage({
        key: 'moodHappy',
        text: template,
        template,
        fromCustom: false,
        hasPlaceholders: /\{[a-zA-Z0-9_]+\}/.test(template),
      });
    }
  }
}
