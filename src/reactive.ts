import * as vscode from 'vscode';
import * as path from 'path';

// ─── Message Collections ─────────────────────────────────────────────────

const ERROR_MESSAGES = [
  "Ơ kìa lỗi rồi, ai làm đấy? 😤",
  "Lại đỏ rồi… cứu tui với! 😭",
  "Error detected! Bình tĩnh nha~ 🧘",
  "Đỏ lòm rồi kìa, sửa đi bạn! 🔴",
  "Bug xuất hiện! Sẵn sàng chiến chưa? ⚔️",
];
const ERROR_MANY = [
  "Bạn có {count} lỗi… chúc may mắn 😏",
  "{count} errors!? Bình tĩnh, từng cái một nha 💪",
  "Woa {count} lỗi, hít thở sâu đi~ 🧘",
];
const WARNING_MESSAGES = [
  "Có warning nè, không nghiêm trọng lắm~ ⚠️",
  "Warning thôi, nhẹ nhàng nha~ 🌤️",
];
const ERROR_FIXED = [
  "Nice, sạch lỗi rồi! 😎",
  "Hết lỗi! Bạn giỏi quá! ✨",
  "Clean code! Đẹp lắm~ 🌟",
];
const SAVE_MESSAGES = [
  "Đã save! Tốt lắm! 💾",
  "Save rồi nha, yên tâm~ ✅",
  "Good habit! Nhớ commit nữa nha! 📦",
];
const SAVE_SPAM = [
  "Save liên tục vậy chắc đang sợ crash 😆",
  "Ctrl+S warrior detected! 🛡️",
  "Bạn có biết auto-save không? 😂",
];
const TYPING_FAST = [
  "Wow tay nhanh dữ! 🔥",
  "Chậm lại kẻo bug bay ra 😆",
  "Speed coding mode activated! 💨",
  "Ngón tay bạn đang bốc khói! 🔥",
];
const BREAK_REMINDER = [
  "Code {mins} phút rồi, nghỉ chút đi! ⏰",
  "Uống nước chưa bạn? 💧",
  "Mắt bạn đang cần nghỉ đó… 👀",
  "Đứng dậy vươn vai đi nào~ 🧘",
  "Nghỉ 5 phút rồi code tiếp nha! ☕",
];
const BUILD_SUCCESS = [
  "Build OK! Niceeee! 🎉",
  "Build thành công! Tuyệt vời~ ✅",
  "Green build! Đỉnh cao! 💚",
];
const BUILD_FAIL = [
  "Toang rồi 😭",
  "Build fail... bình tĩnh sửa nha! 🔧",
  "Lỗi build... mình không biết đâu nha! 🙈",
];
const DEBUG_START = [
  "Debug time! 🔍",
  "Chúc bạn săn bug thành công! 🐛",
  "Detective mode: ON 🕵️",
];
const DEBUG_END = [
  "Xong debug rồi à? Tìm ra chưa? 😏",
  "Debug session ended~ hy vọng fix được! 🤞",
];
const EASTER_TODO = [
  "TODO à? Nhớ quay lại làm nha~ 📝",
  "Thêm TODO nữa rồi... bao giờ mới done? 😅",
];
const EASTER_FIXME = [
  "FIXME detected! Ai đó để lại bom 💣",
  "FIXME... fix me senpai! 🥺",
];
const EASTER_CONSOLE = [
  "console.log debugging à? Classic! 😂",
  "console.log là bạn thân mà đúng không~ 🤣",
];
const GIT_REMIND = [
  "Lâu rồi chưa commit, nhớ commit nha! 📦",
  "Code nhiều mà chưa commit kìa 👀",
];
const GIT_COMMITTED = [
  "Commit rồi nha! Giỏi lắm! 📦✅",
  "Code đã được commit! Yên tâm~ 🎉",
  "Nice commit! Tiếp tục nào~ 💪",
];
const GIT_BRANCH_SWITCH = [
  "Đổi branch rồi à? Branch {name} nha~ 🌿",
  "Chuyển sang branch {name}! Cẩn thận merge nha~ 🔀",
];
const GIT_CONFLICT = [
  "Merge conflict kìa! 😨 Cẩn thận nha~",
  "Conflict detected! Bình tĩnh resolve nha 🔧",
  "Ối merge conflict! Sẽ ổn thôi~ 💪",
];
const GIT_MANY_CHANGES = [
  "{count} files thay đổi rồi, commit sớm nha! 📦",
  "Bạn sửa {count} files rồi đó, commit đi~ 👀",
];
const MOOD_HAPPY = [
  "Mọi thứ ổn lắm! Tiếp tục nào~ 😊",
  "Không lỗi! Mood đang tốt lắm~ 🌟",
];
const MOOD_ANGRY = [
  "Nhiều lỗi quá... bạn ổn không? 😤",
  "Tình hình căng đây... cố lên! 💢",
];
const MOOD_SLEEPY = [
  "Zzz... bạn đâu rồi? 😴",
  "Lâu quá không thấy gõ phím gì hết... 💤",
  "*ngáp* Mình buồn ngủ quá... 🥱",
];
const ACHIEVEMENT_MSGS: Record<string, string> = {
  'save50': '🏆 Achievement: Save 50 lần! Bạn cẩn thận quá!',
  'save100': '🏆 Achievement: Save 100 lần! Ctrl+S Master!',
  'error_fix_10': '🏆 Achievement: Fix 10 lỗi! Bug Hunter!',
  'error_fix_50': '🏆 Achievement: Fix 50 lỗi! Bug Slayer!',
  'coding_1h': '🏆 Achievement: Code 1 tiếng liên tục!',
  'coding_3h': '🏆 Achievement: Code 3 tiếng! Bạn là machine! 🤖',
  'commit10': '🏆 Achievement: 10 commits! Version control pro!',
};
const TIME_GREETINGS: Record<string, string[]> = {
  morning: ["Good morning coder! ☀️", "Sáng nay code gì nè? 🌅"],
  afternoon: ["Buổi chiều code tiếp nha~ ☕", "Afternoon coding session! 💻"],
  evening: ["Tối rồi, code nhẹ thôi nha~ 🌆"],
  night: ["Khuya rồi, sao chưa ngủ??? 🌙", "2 giờ sáng rồi đó, ngủ đi! 😴"],
};

// ─── Mood System ──────────────────────────────────────────────────────

export type CompanionMood = 'idle' | 'happy' | 'angry' | 'sleepy';

// ─── Reactive Manager ─────────────────────────────────────────────────

export class ReactiveManager {
  private _sendMessageImpl: (text: string, motion?: string) => void;
  private _sendMood: (mood: CompanionMood) => void;
  private _disposables: vscode.Disposable[] = [];

  // Tracking state
  private _prevErrorCount = 0;
  private _saveCount = 0;
  private _saveTimes: number[] = [];
  private _keystrokeCount = 0;
  private _keystrokeTimer?: NodeJS.Timeout;
  private _codingStartTime = Date.now();
  private _lastActivityTime = Date.now();
  private _breakTimer?: NodeJS.Timeout;
  private _breakIntervalMs = 30 * 60 * 1000;
  private _totalErrorsFixed = 0;
  private _achievements = new Set<string>();
  private _currentMood: CompanionMood = 'idle';
  private _moodTimer?: NodeJS.Timeout;
  private _prevBranch = '';
  private _prevCommitCount = 0;
  private _totalCommits = 0;

  constructor(
    sendMessage: (text: string, motion?: string) => void,
    sendMood: (mood: CompanionMood) => void
  ) {
    this._sendMessageImpl = sendMessage;
    this._sendMood = sendMood;
  }

  private _pick(arr: string[]): string {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ── Settings gates ────────────────────────────────────────────────
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
  private _sendMessage(text: string, motion?: string) {
    if (this._isQuietHour()) return;
    this._sendMessageImpl(text, motion);
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

  // ── 1. Error/Warning Reactions ────────────────────────────────────
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
            this._sendMessage(this._pick(ERROR_MANY).replace('{count}', String(errors)), 'TapBody');
          } else {
            this._sendMessage(this._pick(ERROR_MESSAGES), 'TapBody');
          }
        } else if (errors === 0 && this._prevErrorCount > 0) {
          this._totalErrorsFixed += this._prevErrorCount;
          this._sendMessage(this._pick(ERROR_FIXED), 'Idle');
          this._checkAchievement('error_fix', this._totalErrorsFixed);
        } else if (warnings > 0 && errors === 0 && this._prevErrorCount === 0 && Math.random() < 0.3) {
          this._sendMessage(this._pick(WARNING_MESSAGES));
        }
        this._prevErrorCount = errors;
      })
    );
  }

  // ── 3. Save Reactions ─────────────────────────────────────────────
  private _hookFileSave() {
    this._disposables.push(
      vscode.workspace.onDidSaveTextDocument(() => {
        if (!this._isEnabled('save')) return;
        this._saveCount++;
        this._resetActivity();
        const now = Date.now();
        this._saveTimes.push(now);
        // Keep only last 10 saves
        if (this._saveTimes.length > 10) this._saveTimes.shift();

        // Detect spam save (3+ saves in 5 seconds)
        const recent = this._saveTimes.filter(t => now - t < 5000);
        if (recent.length >= 3) {
          this._sendMessage(this._pick(SAVE_SPAM));
        } else if (Math.random() < 0.3) {
          this._sendMessage(this._pick(SAVE_MESSAGES));
        }

        this._checkAchievement('save', this._saveCount);
      })
    );
  }

  // ── 5. Typing Intensity ───────────────────────────────────────────
  private _hookTyping() {
    this._disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (!this._isEnabled('typing')) return;
        if (e.document.uri.scheme !== 'file') return;
        this._keystrokeCount += e.contentChanges.length;
        this._resetActivity();

        // Easter eggs: detect keywords
        for (const change of e.contentChanges) {
          const text = change.text.toUpperCase();
          if (text.includes('TODO')) {
            if (Math.random() < 0.5) this._sendMessage(this._pick(EASTER_TODO));
          } else if (text.includes('FIXME')) {
            if (Math.random() < 0.5) this._sendMessage(this._pick(EASTER_FIXME));
          } else if (change.text.includes('console.log')) {
            if (Math.random() < 0.5) this._sendMessage(this._pick(EASTER_CONSOLE));
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
        this._sendMessage(this._pick(TYPING_FAST));
      }
      this._keystrokeCount = 0;
    }, 5000);
  }

  // ── 6. Break Reminder ─────────────────────────────────────────────
  private _startBreakTimer() {
    this._breakTimer = setInterval(() => {
      const elapsed = Date.now() - this._codingStartTime;
      const mins = Math.floor(elapsed / 60000);
      if (elapsed >= this._breakIntervalMs) {
        this._sendMessage(this._pick(BREAK_REMINDER).replace('{mins}', String(mins)));
        // Check coding achievements
        if (mins >= 180) this._checkAchievement('coding_3h', 1);
        else if (mins >= 60) this._checkAchievement('coding_1h', 1);
      }
    }, 10 * 60 * 1000); // Check every 10 minutes
  }

  private _resetActivity() {
    this._lastActivityTime = Date.now();
  }

  // ── 7. Build/Task Reactions ───────────────────────────────────────
  private _hookBuildTasks() {
    this._disposables.push(
      vscode.tasks.onDidEndTaskProcess((e) => {
        if (e.exitCode === 0) {
          this._sendMessage(this._pick(BUILD_SUCCESS), 'Idle');
        } else {
          this._sendMessage(this._pick(BUILD_FAIL), 'TapBody');
        }
      })
    );
  }

  // ── 8. Debug Reactions ────────────────────────────────────────────
  private _hookDebug() {
    this._disposables.push(
      vscode.debug.onDidStartDebugSession(() => {
        this._sendMessage(this._pick(DEBUG_START));
      })
    );
    this._disposables.push(
      vscode.debug.onDidTerminateDebugSession(() => {
        this._sendMessage(this._pick(DEBUG_END));
      })
    );
  }

  // ── 9. Git Integration (Enhanced) ─────────────────────────────────
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
          this._sendMessage(
            this._pick(GIT_BRANCH_SWITCH).replace('{name}', currentBranch)
          );
        }
        this._prevBranch = currentBranch;

        // Track new commits
        const commitLog = repo.state.HEAD?.commit || '';
        if (commitLog && this._prevCommitCount > 0) {
          // Simple heuristic: if HEAD commit changed, a commit was made
          // We'll track by counting indexed changes going to 0
          const indexedNow = repo.state.indexChanges.length;
          if (indexedNow === 0 && this._prevCommitCount > 0) {
            this._totalCommits++;
            this._sendMessage(this._pick(GIT_COMMITTED), 'Idle');
            this._setMood('happy');
            this._checkAchievement('commit', this._totalCommits);
          }
        }
        this._prevCommitCount = repo.state.indexChanges.length;

        // Track uncommitted changes
        const changes = repo.state.workingTreeChanges.length + repo.state.indexChanges.length;
        if (changes > 10 && Math.random() < 0.3) {
          this._sendMessage(
            this._pick(GIT_MANY_CHANGES).replace('{count}', String(changes))
          );
        } else if (changes > 5 && Math.random() < 0.2) {
          this._sendMessage(this._pick(GIT_REMIND));
        }

        // Merge conflicts
        if (repo.state.mergeChanges.length > 0) {
          this._sendMessage(this._pick(GIT_CONFLICT), 'TapBody');
          this._setMood('angry');
        }
      } catch { /* Git not available */ }
    }, 3 * 60 * 1000); // Every 3 minutes

    this._disposables.push({ dispose: () => clearInterval(gitCheck) });
  }

  // ── 12. Mood / Animation State System ──────────────────────────────
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
            this._sendMessage(this._pick(MOOD_SLEEPY), 'Idle');
          }
        }
        return;
      }

      // Angry: many errors
      if (this._prevErrorCount >= 5) {
        if (this._currentMood !== 'angry') {
          this._setMood('angry');
          if (Math.random() < 0.5) {
            this._sendMessage(this._pick(MOOD_ANGRY), 'TapBody');
          }
        }
        return;
      }

      // Happy: no errors and recently active
      if (this._prevErrorCount === 0 && idleTime < 60 * 1000) {
        if (this._currentMood !== 'happy') {
          this._setMood('happy');
          if (Math.random() < 0.2) {
            this._sendMessage(this._pick(MOOD_HAPPY), 'Idle');
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

  // ── 4. Time Awareness ─────────────────────────────────────────────
  private _sendTimeGreeting() {
    const hour = new Date().getHours();
    let period: string;
    if (hour >= 5 && hour < 12) period = 'morning';
    else if (hour >= 12 && hour < 17) period = 'afternoon';
    else if (hour >= 17 && hour < 22) period = 'evening';
    else period = 'night';

    const msgs = TIME_GREETINGS[period];
    if (msgs) {
      // Delay so it doesn't overlap with the greeting
      setTimeout(() => {
        this._sendMessage(this._pick(msgs));
      }, 8000);
    }
  }

  // ── 11. Achievements ──────────────────────────────────────────────
  private _checkAchievement(type: string, count: number) {
    const checks: [string, number][] = [
      ['save50', 50], ['save100', 100],
      ['error_fix_10', 10], ['error_fix_50', 50],
    ];
    for (const [key, threshold] of checks) {
      if (key.startsWith(type) && count >= threshold && !this._achievements.has(key)) {
        this._achievements.add(key);
        const msg = ACHIEVEMENT_MSGS[key];
        if (msg) this._sendMessage(msg);
      }
    }
    // Special: coding time achievements
    if (type.startsWith('coding') && !this._achievements.has(type)) {
      this._achievements.add(type);
      const msg = ACHIEVEMENT_MSGS[type];
      if (msg) this._sendMessage(msg);
    }
  }
}
