import * as vscode from 'vscode';

export type PomodoroState = 'idle' | 'work' | 'break';

export type PomodoroTick = (state: PomodoroState, secondsLeft: number, totalSeconds: number) => void;

export class PomodoroManager {
  private _state: PomodoroState = 'idle';
  private _timer?: NodeJS.Timeout;
  private _timeLeft: number = 0;
  private _totalSeconds: number = 0;
  private _onStateChange: (state: PomodoroState) => void;
  private _onTick?: PomodoroTick;

  constructor(
    onStateChange: (state: PomodoroState) => void,
    onTick?: PomodoroTick
  ) {
    this._onStateChange = onStateChange;
    this._onTick = onTick;
  }

  // Reads work/break minutes. Workspace settings.json overrides global because
  // VS Code config layering already does that for us — we just read whatever
  // config returns.
  private _readMinutes(key: 'pomodoroWorkTime' | 'pomodoroBreakTime', fallback: number): number {
    const config = vscode.workspace.getConfiguration('animeCompanion');
    const raw = config.get<number>(key, fallback);
    if (typeof raw !== 'number' || !isFinite(raw) || raw <= 0) return fallback;
    return Math.floor(raw);
  }

  public start() {
    this.stop();
    const workMins = this._readMinutes('pomodoroWorkTime', 25);

    this._state = 'work';
    this._totalSeconds = workMins * 60;
    this._timeLeft = this._totalSeconds;
    this._onStateChange(this._state);
    this._startTick();
  }

  public stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
    this._state = 'idle';
    this._timeLeft = 0;
    this._totalSeconds = 0;
    this._onStateChange(this._state);
    this._onTick?.(this._state, 0, 0);
  }

  private startBreak() {
    const breakMins = this._readMinutes('pomodoroBreakTime', 5);

    this._state = 'break';
    this._totalSeconds = breakMins * 60;
    this._timeLeft = this._totalSeconds;
    this._onStateChange(this._state);
    this._startTick();
  }

  private _startTick() {
    if (this._timer) clearInterval(this._timer);
    this._onTick?.(this._state, this._timeLeft, this._totalSeconds);

    this._timer = setInterval(() => {
      this._timeLeft--;
      if (this._timeLeft <= 0) {
        clearInterval(this._timer!);
        this._timer = undefined;

        if (this._state === 'work') {
          vscode.window.showInformationMessage('🍅 Hết giờ làm việc! Nghỉ ngơi nhé~');
          this.startBreak();
        } else if (this._state === 'break') {
          vscode.window.showInformationMessage('🍅 Hết giờ nghỉ! Quay lại làm việc nào~', 'Bắt đầu tiếp').then(selection => {
            if (selection === 'Bắt đầu tiếp') {
              this.start();
            } else {
              this.stop();
            }
          });
          this.stop();
        }
      } else {
        this._onTick?.(this._state, this._timeLeft, this._totalSeconds);
      }
    }, 1000);
  }

  public dispose() {
    this.stop();
  }
}
