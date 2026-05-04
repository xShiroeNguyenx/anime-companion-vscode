import * as vscode from 'vscode';

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  type: 'save' | 'commit' | 'error_fix' | 'coding';
  threshold: number;
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { id: 'save50',       title: '🌸 Người Save Cẩn Thận',      description: 'Save file 50 lần',         type: 'save',      threshold: 50 },
  { id: 'save100',      title: '💖 Bậc Thầy Ctrl+S',          description: 'Save file 100 lần',        type: 'save',      threshold: 100 },
  { id: 'error_fix_10', title: '🔧 Thợ Sửa Bug Tập Sự',       description: 'Fix 10 lỗi',               type: 'error_fix', threshold: 10 },
  { id: 'error_fix_50', title: '⚙️ Bug Hunter',                description: 'Fix 50 lỗi',               type: 'error_fix', threshold: 50 },
  { id: 'commit10',     title: '📦 Commit Đều Đặn',           description: 'Tạo 10 commit',            type: 'commit',    threshold: 10 },
  { id: 'coding_1h',    title: '⏰ Một Giờ Tập Trung',         description: 'Code liên tục 1 tiếng',     type: 'coding',    threshold: 60 },
  { id: 'coding_3h',    title: '🔥 Marathon 3 Tiếng',          description: 'Code liên tục 3 tiếng',     type: 'coding',    threshold: 180 },
];

export interface PersistedStats {
  saves: number;
  commits: number;
  errorsFixed: number;
  codingMillisToday: number;
  codingDayKey: string;
  codingMillisAllTime: number;
  achievements: string[];
}

const KEY = 'animeCompanion.stats.v1';

const DEFAULT_STATS: PersistedStats = {
  saves: 0,
  commits: 0,
  errorsFixed: 0,
  codingMillisToday: 0,
  codingDayKey: '',
  codingMillisAllTime: 0,
  achievements: [],
};

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export class StatsStore {
  private _ctx: vscode.ExtensionContext;
  private _data: PersistedStats;

  constructor(context: vscode.ExtensionContext) {
    this._ctx = context;
    const raw = context.globalState.get<PersistedStats>(KEY);
    this._data = { ...DEFAULT_STATS, ...(raw ?? {}) };
    this._rolloverDay();
  }

  private _rolloverDay() {
    const key = todayKey();
    if (this._data.codingDayKey !== key) {
      this._data.codingDayKey = key;
      this._data.codingMillisToday = 0;
    }
  }

  private async _flush() {
    await this._ctx.globalState.update(KEY, this._data);
  }

  public getStats(): PersistedStats {
    this._rolloverDay();
    return { ...this._data };
  }

  public getAchievements(): string[] {
    return [...this._data.achievements];
  }

  public hasAchievement(id: string): boolean {
    return this._data.achievements.includes(id);
  }

  public async incSave(): Promise<number> {
    this._data.saves++;
    await this._flush();
    return this._data.saves;
  }

  public async incCommit(): Promise<number> {
    this._data.commits++;
    await this._flush();
    return this._data.commits;
  }

  public async incErrorsFixed(n: number): Promise<number> {
    if (n <= 0) return this._data.errorsFixed;
    this._data.errorsFixed += n;
    await this._flush();
    return this._data.errorsFixed;
  }

  public async addCodingTime(ms: number): Promise<void> {
    if (ms <= 0) return;
    this._rolloverDay();
    this._data.codingMillisToday += ms;
    this._data.codingMillisAllTime += ms;
    await this._flush();
  }

  // Returns the AchievementDef if this call newly unlocked it, else null.
  public async tryUnlockByThreshold(type: AchievementDef['type'], count: number): Promise<AchievementDef | null> {
    for (const def of ACHIEVEMENT_DEFS) {
      if (def.type !== type) continue;
      if (count < def.threshold) continue;
      if (this._data.achievements.includes(def.id)) continue;
      this._data.achievements.push(def.id);
      await this._flush();
      return def;
    }
    return null;
  }

  public async unlockById(id: string): Promise<AchievementDef | null> {
    if (this._data.achievements.includes(id)) return null;
    const def = ACHIEVEMENT_DEFS.find(d => d.id === id);
    if (!def) return null;
    this._data.achievements.push(id);
    await this._flush();
    return def;
  }
}
