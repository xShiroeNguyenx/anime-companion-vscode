import * as vscode from 'vscode';

export type PomodoroState = 'idle' | 'work' | 'break';

export class PomodoroManager {
  private _state: PomodoroState = 'idle';
  private _timer?: NodeJS.Timeout;
  private _timeLeft: number = 0; // seconds
  private _onStateChange: (state: PomodoroState) => void;
  private _onTick?: (state: PomodoroState, secondsLeft: number) => void;

  constructor(
    onStateChange: (state: PomodoroState) => void,
    onTick?: (state: PomodoroState, secondsLeft: number) => void
  ) {
    this._onStateChange = onStateChange;
    this._onTick = onTick;
  }

  public start() {
    this.stop();
    const config = vscode.workspace.getConfiguration('animeCompanion');
    const workMins = config.get<number>('pomodoroWorkTime', 25);

    this._state = 'work';
    this._timeLeft = workMins * 60;
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
    this._onStateChange(this._state);
    this._onTick?.(this._state, 0);
  }

  private startBreak() {
    const config = vscode.workspace.getConfiguration('animeCompanion');
    const breakMins = config.get<number>('pomodoroBreakTime', 5);

    this._state = 'break';
    this._timeLeft = breakMins * 60;
    this._onStateChange(this._state);
    this._startTick();
  }

  private _startTick() {
    if (this._timer) clearInterval(this._timer);
    this._onTick?.(this._state, this._timeLeft);

    this._timer = setInterval(() => {
      this._timeLeft--;
      if (this._timeLeft <= 0) {
        clearInterval(this._timer!);
        this._timer = undefined;

        if (this._state === 'work') {
          vscode.window.showInformationMessage('🍅 Hết giờ làm việc! Nghỉ ngơi 5 phút nào~');
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
        this._onTick?.(this._state, this._timeLeft);
      }
    }, 1000);
  }

  public dispose() {
    this.stop();
  }
}
