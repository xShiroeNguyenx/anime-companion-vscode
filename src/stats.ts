import * as vscode from 'vscode';

export type AchievementMetric =
  | 'save'
  | 'commit'
  | 'error_fix'
  | 'coding_minutes'
  | 'chat_prompt'
  | 'pomodoro_completed';

export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type QuestPeriod = 'daily' | 'weekly';

interface RewardGrant {
  gems: number;
  tickets: number;
  cosmetics: string[];
  voicePacks: string[];
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  metric?: AchievementMetric;
  threshold?: number;
  seriesId?: string;
  seriesTitle?: string;
  tier?: number;
  parentId?: string;
  secret: boolean;
  hint?: string;
  rarity: AchievementRarity;
}

export interface QuestDef {
  id: string;
  period: QuestPeriod;
  title: string;
  description: string;
  metric: AchievementMetric;
  target: number;
}

export interface MemoryEntry {
  id: string;
  text: string;
  source: 'achievement' | 'quest';
  createdAt: number;
}

export interface AchievementNodeView {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  secret: boolean;
  statusText: string;
  tier: number;
  parentId?: string;
  rarity: AchievementRarity;
  rarityLabel: string;
  isShowcased: boolean;
}

export interface AchievementChainView {
  id: string;
  title: string;
  unlockedCount: number;
  totalCount: number;
  nodes: AchievementNodeView[];
}

export interface SecretAchievementView {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  secret: true;
  statusText: string;
  hint?: string;
  rarity: AchievementRarity;
  rarityLabel: string;
  isShowcased: boolean;
}

export interface ShowcaseView {
  id: string;
  title: string;
  rarity: AchievementRarity;
  rarityLabel: string;
}

export interface QuestView {
  id: string;
  period: QuestPeriod;
  title: string;
  description: string;
  progress: number;
  target: number;
  completed: boolean;
  statusText: string;
}

export interface AchievementPanelData {
  summary: {
    unlocked: number;
    total: number;
    normalUnlocked: number;
    normalTotal: number;
    secretUnlocked: number;
    secretTotal: number;
    dailyCompleted: number;
    dailyTotal: number;
    weeklyCompleted: number;
    weeklyTotal: number;
  };
  chains: AchievementChainView[];
  secrets: SecretAchievementView[];
  quests: {
    daily: QuestView[];
    weekly: QuestView[];
  };
  memories: MemoryEntry[];
  showcaseId: string | null;
  showcase: ShowcaseView | null;
}

export interface AchievementQuickPickRow {
  id: string;
  label: string;
  description: string;
  detail: string;
}

export interface UnlockedAchievementSummary {
  id: string;
  title: string;
  description: string;
  rarity: AchievementRarity;
}

export interface CompanionProfileData {
  title: string;
  level: number;
  affinityPercent: number;
  topAchievementId: string | null;
  topAchievementTitle: string;
  topAchievementRarity: AchievementRarity | null;
  unlockedAchievements: UnlockedAchievementSummary[];
  achievementUnlocked: number;
  achievementTotal: number;
  dailyQuestCompleted: number;
  weeklyQuestCompleted: number;
  inventory: {
    gems: number;
    tickets: number;
    cosmetics: string[];
    voicePacks: string[];
  };
  summary: {
    saves: number;
    commits: number;
    errorsFixed: number;
    codingHours: number;
    chatPrompts: number;
    pomodoroCompleted: number;
    memories: number;
  };
  badgeLine: string;
}

interface MetricSnapshot {
  save: number;
  commit: number;
  error_fix: number;
  coding_minutes: number;
  chat_prompt: number;
  pomodoro_completed: number;
}

interface QuestPeriodState {
  key: string;
  baselines: MetricSnapshot;
  completedIds: string[];
}

export interface PersistedStats {
  saves: number;
  commits: number;
  errorsFixed: number;
  codingMillisToday: number;
  codingDayKey: string;
  codingMillisAllTime: number;
  achievements: string[];
  chatPrompts: number;
  quickChatPrompts: number;
  pomodoroStarts: number;
  pomodoroCompleted: number;
  pokeCount: number;
  headpatCount: number;
  multiClickCount: number;
  spamClickCount: number;
  chatProvidersUsed: string[];
  dailyQuestState: QuestPeriodState;
  weeklyQuestState: QuestPeriodState;
  memories: MemoryEntry[];
  gems: number;
  tickets: number;
  unlockedCosmetics: string[];
  unlockedVoicePacks: string[];
  rewardLedger: string[];
  showcaseAchievementId: string | null;
}

const SAVE_SERIES = 'save';
const BUG_SERIES = 'bugfix';
const COMMIT_SERIES = 'commit';
const CODING_SERIES = 'coding';
const CHAT_SERIES = 'chat';
const POMODORO_SERIES = 'pomodoro';

function rarityLabel(rarity: AchievementRarity): string {
  switch (rarity) {
    case 'common': return 'Common';
    case 'rare': return 'Rare';
    case 'epic': return 'Epic';
    case 'legendary': return 'Legendary';
    case 'mythic': return 'Mythic';
  }
}

function emptyGrant(): RewardGrant {
  return { gems: 0, tickets: 0, cosmetics: [], voicePacks: [] };
}

function questRewardLabel(period: QuestPeriod): string {
  return period === 'daily' ? '+10 gems' : '+60 gems • +1 ticket';
}

function achievementRewardLabel(def: AchievementDef): string {
  const grant = rewardGrantForAchievement(def);
  const parts = [];
  if (grant.gems) parts.push(`+${grant.gems} gems`);
  if (grant.tickets) parts.push(`+${grant.tickets} ticket${grant.tickets > 1 ? 's' : ''}`);
  if (grant.cosmetics.length) parts.push(`cosmetic: ${grant.cosmetics.join(', ')}`);
  if (grant.voicePacks.length) parts.push(`voice pack: ${grant.voicePacks.join(', ')}`);
  return parts.join(' • ');
}

function rewardGrantForAchievement(def: AchievementDef): RewardGrant {
  const grant = emptyGrant();
  switch (def.rarity) {
    case 'common':
      grant.gems += 12;
      break;
    case 'rare':
      grant.gems += 28;
      break;
    case 'epic':
      grant.gems += 60;
      grant.tickets += 1;
      break;
    case 'legendary':
      grant.gems += 120;
      grant.tickets += 2;
      break;
    case 'mythic':
      grant.gems += 180;
      grant.tickets += 3;
      break;
  }

  switch (def.id) {
    case 'save250':
      grant.cosmetics.push('Ctrl+S Trail');
      break;
    case 'error_fix_100':
      grant.cosmetics.push('Bug Hunter Cape');
      break;
    case 'pomodoro_25':
      grant.cosmetics.push('Focus Crown');
      break;
    case 'save_storm':
      grant.cosmetics.push('Thunder Ribbon');
      break;
    case 'pet_chaos':
      grant.cosmetics.push('Mischief Halo');
      break;
    case 'coding_12h':
      grant.voicePacks.push('Endurance Cheer Pack');
      break;
    case 'chat_100':
      grant.voicePacks.push('Oracle Whisper Pack');
      break;
    case 'night_owl':
      grant.voicePacks.push('Moonlight Whisper Pack');
      break;
    case 'provider_polyglot':
      grant.voicePacks.push('Polyglot Greetings Pack');
      break;
  }

  return grant;
}

function rewardGrantForQuest(quest: QuestDef): RewardGrant {
  return quest.period === 'daily'
    ? { gems: 10, tickets: 0, cosmetics: [], voicePacks: [] }
    : { gems: 60, tickets: 1, cosmetics: [], voicePacks: [] };
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { id: 'save50', title: 'Save Steward', description: 'Save file 50 times', metric: 'save', threshold: 50, seriesId: SAVE_SERIES, seriesTitle: 'Save Chain', tier: 1, secret: false, rarity: 'common' },
  { id: 'save100', title: 'Ctrl+S Virtuoso', description: 'Save file 100 times', metric: 'save', threshold: 100, seriesId: SAVE_SERIES, seriesTitle: 'Save Chain', tier: 2, parentId: 'save50', secret: false, rarity: 'rare' },
  { id: 'save250', title: 'Save Storm Tamer', description: 'Save file 250 times', metric: 'save', threshold: 250, seriesId: SAVE_SERIES, seriesTitle: 'Save Chain', tier: 3, parentId: 'save100', secret: false, rarity: 'epic' },
  { id: 'error_fix_10', title: 'Bug Squire', description: 'Fix 10 errors', metric: 'error_fix', threshold: 10, seriesId: BUG_SERIES, seriesTitle: 'Bug Fix Chain', tier: 1, secret: false, rarity: 'common' },
  { id: 'error_fix_50', title: 'Bug Hunter', description: 'Fix 50 errors', metric: 'error_fix', threshold: 50, seriesId: BUG_SERIES, seriesTitle: 'Bug Fix Chain', tier: 2, parentId: 'error_fix_10', secret: false, rarity: 'rare' },
  { id: 'error_fix_100', title: 'Debug Exorcist', description: 'Fix 100 errors', metric: 'error_fix', threshold: 100, seriesId: BUG_SERIES, seriesTitle: 'Bug Fix Chain', tier: 3, parentId: 'error_fix_50', secret: false, rarity: 'epic' },
  { id: 'commit10', title: 'Commit Cadet', description: 'Create 10 commits', metric: 'commit', threshold: 10, seriesId: COMMIT_SERIES, seriesTitle: 'Commit Chain', tier: 1, secret: false, rarity: 'common' },
  { id: 'commit25', title: 'Git Courier', description: 'Create 25 commits', metric: 'commit', threshold: 25, seriesId: COMMIT_SERIES, seriesTitle: 'Commit Chain', tier: 2, parentId: 'commit10', secret: false, rarity: 'rare' },
  { id: 'commit50', title: 'Orbit Pusher', description: 'Create 50 commits', metric: 'commit', threshold: 50, seriesId: COMMIT_SERIES, seriesTitle: 'Commit Chain', tier: 3, parentId: 'commit25', secret: false, rarity: 'epic' },
  { id: 'coding_1h', title: 'One-Hour Focus', description: 'Accumulate 1 hour of active coding', metric: 'coding_minutes', threshold: 60, seriesId: CODING_SERIES, seriesTitle: 'Coding Chain', tier: 1, secret: false, rarity: 'common' },
  { id: 'coding_3h', title: 'Marathon Spark', description: 'Accumulate 3 hours of active coding', metric: 'coding_minutes', threshold: 180, seriesId: CODING_SERIES, seriesTitle: 'Coding Chain', tier: 2, parentId: 'coding_1h', secret: false, rarity: 'rare' },
  { id: 'coding_6h', title: 'Moonlit Coder', description: 'Accumulate 6 hours of active coding', metric: 'coding_minutes', threshold: 360, seriesId: CODING_SERIES, seriesTitle: 'Coding Chain', tier: 3, parentId: 'coding_3h', secret: false, rarity: 'epic' },
  { id: 'coding_12h', title: 'Sovereign of Stamina', description: 'Accumulate 12 hours of active coding', metric: 'coding_minutes', threshold: 720, seriesId: CODING_SERIES, seriesTitle: 'Coding Chain', tier: 4, parentId: 'coding_6h', secret: false, rarity: 'legendary' },
  { id: 'chat_10', title: 'AI Apprentice', description: 'Ask the AI 10 times', metric: 'chat_prompt', threshold: 10, seriesId: CHAT_SERIES, seriesTitle: 'AI Chat Chain', tier: 1, secret: false, rarity: 'common' },
  { id: 'chat_25', title: 'Context Weaver', description: 'Ask the AI 25 times', metric: 'chat_prompt', threshold: 25, seriesId: CHAT_SERIES, seriesTitle: 'AI Chat Chain', tier: 2, parentId: 'chat_10', secret: false, rarity: 'rare' },
  { id: 'chat_100', title: 'Oracle Whisperer', description: 'Ask the AI 100 times', metric: 'chat_prompt', threshold: 100, seriesId: CHAT_SERIES, seriesTitle: 'AI Chat Chain', tier: 3, parentId: 'chat_25', secret: false, rarity: 'epic' },
  { id: 'pomodoro_1', title: 'Focus Sprout', description: 'Complete 1 Pomodoro session', metric: 'pomodoro_completed', threshold: 1, seriesId: POMODORO_SERIES, seriesTitle: 'Pomodoro Chain', tier: 1, secret: false, rarity: 'common' },
  { id: 'pomodoro_5', title: 'Rhythm Keeper', description: 'Complete 5 Pomodoro sessions', metric: 'pomodoro_completed', threshold: 5, seriesId: POMODORO_SERIES, seriesTitle: 'Pomodoro Chain', tier: 2, parentId: 'pomodoro_1', secret: false, rarity: 'rare' },
  { id: 'pomodoro_25', title: 'Fortress of Focus', description: 'Complete 25 Pomodoro sessions', metric: 'pomodoro_completed', threshold: 25, seriesId: POMODORO_SERIES, seriesTitle: 'Pomodoro Chain', tier: 3, parentId: 'pomodoro_5', secret: false, rarity: 'epic' },
  { id: 'night_owl', title: 'Night Owl', description: 'Do something with your companion between 03:00 and 03:59', secret: true, hint: 'Stay awake together in the deep night.', rarity: 'mythic' },
  { id: 'save_storm', title: 'Save Storm', description: 'Save 20 times in 60 seconds', secret: true, hint: 'Your Ctrl+S key might survive this combo.', rarity: 'legendary' },
  { id: 'pet_chaos', title: 'Pet Chaos', description: 'Make the companion dizzy with spam clicks', secret: true, hint: 'Too much affection can cause dizziness.', rarity: 'legendary' },
  { id: 'provider_polyglot', title: 'Provider Polyglot', description: 'Finish chats with 3 different AI providers', secret: true, hint: 'Sample a few different AI voices.', rarity: 'mythic' },
];

const QUEST_DEFS: QuestDef[] = [
  { id: 'daily_save_15', period: 'daily', title: 'Daily Save Stretch', description: 'Save 15 times today', metric: 'save', target: 15 },
  { id: 'daily_chat_5', period: 'daily', title: 'Daily AI Check-in', description: 'Ask the AI 5 times today', metric: 'chat_prompt', target: 5 },
  { id: 'daily_pomodoro_1', period: 'daily', title: 'Daily Focus Seed', description: 'Finish 1 Pomodoro today', metric: 'pomodoro_completed', target: 1 },
  { id: 'weekly_commit_5', period: 'weekly', title: 'Weekly Git Pulse', description: 'Create 5 commits this week', metric: 'commit', target: 5 },
  { id: 'weekly_coding_300', period: 'weekly', title: 'Weekly Deep Work', description: 'Accumulate 5 hours of coding this week', metric: 'coding_minutes', target: 300 },
  { id: 'weekly_bugfix_15', period: 'weekly', title: 'Weekly Bug Sweep', description: 'Fix 15 errors this week', metric: 'error_fix', target: 15 },
];

export const ACHIEVEMENT_COUNT = ACHIEVEMENT_DEFS.length;

const SERIES_ORDER = [SAVE_SERIES, BUG_SERIES, COMMIT_SERIES, CODING_SERIES, CHAT_SERIES, POMODORO_SERIES];
const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENT_DEFS.map((def) => [def.id, def]));
const QUEST_BY_ID = new Map(QUEST_DEFS.map((quest) => [quest.id, quest]));
const EMPTY_SNAPSHOT: MetricSnapshot = { save: 0, commit: 0, error_fix: 0, coding_minutes: 0, chat_prompt: 0, pomodoro_completed: 0 };
const MAX_MEMORIES = 12;

const KEY = 'animeCompanion.stats.v4';
const LEGACY_KEYS = ['animeCompanion.stats.v3', 'animeCompanion.stats.v2', 'animeCompanion.stats.v1'];

const DEFAULT_STATS: PersistedStats = {
  saves: 0,
  commits: 0,
  errorsFixed: 0,
  codingMillisToday: 0,
  codingDayKey: '',
  codingMillisAllTime: 0,
  achievements: [],
  chatPrompts: 0,
  quickChatPrompts: 0,
  pomodoroStarts: 0,
  pomodoroCompleted: 0,
  pokeCount: 0,
  headpatCount: 0,
  multiClickCount: 0,
  spamClickCount: 0,
  chatProvidersUsed: [],
  dailyQuestState: { key: '', baselines: { ...EMPTY_SNAPSHOT }, completedIds: [] },
  weeklyQuestState: { key: '', baselines: { ...EMPTY_SNAPSHOT }, completedIds: [] },
  memories: [],
  gems: 0,
  tickets: 0,
  unlockedCosmetics: [],
  unlockedVoicePacks: [],
  rewardLedger: [],
  showcaseAchievementId: null,
};

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function uniqueStrings(value: unknown): string[] {
  return isStringArray(value) ? [...new Set(value)] : [];
}

function isMemoryArray(value: unknown): value is MemoryEntry[] {
  return Array.isArray(value) && value.every((item) =>
    item &&
    typeof item === 'object' &&
    typeof (item as MemoryEntry).id === 'string' &&
    typeof (item as MemoryEntry).text === 'string' &&
    typeof (item as MemoryEntry).createdAt === 'number'
  );
}

function isAchievementUnlocked(stats: Pick<PersistedStats, 'achievements'>, id: string): boolean {
  return stats.achievements.includes(id);
}

function normalizeQuestState(value: unknown): QuestPeriodState {
  if (!value || typeof value !== 'object') {
    return { key: '', baselines: { ...EMPTY_SNAPSHOT }, completedIds: [] };
  }
  const state = value as Partial<QuestPeriodState>;
  const baselines = state.baselines && typeof state.baselines === 'object'
    ? { ...EMPTY_SNAPSHOT, ...(state.baselines as Partial<MetricSnapshot>) }
    : { ...EMPTY_SNAPSHOT };
  return {
    key: typeof state.key === 'string' ? state.key : '',
    baselines,
    completedIds: isStringArray(state.completedIds) ? [...new Set(state.completedIds)] : [],
  };
}

function normalizeStats(raw: unknown): PersistedStats {
  const source = raw && typeof raw === 'object' ? (raw as Partial<PersistedStats>) : {};
  return {
    ...DEFAULT_STATS,
    ...source,
    achievements: uniqueStrings(source.achievements),
    chatProvidersUsed: uniqueStrings(source.chatProvidersUsed),
    dailyQuestState: normalizeQuestState(source.dailyQuestState),
    weeklyQuestState: normalizeQuestState(source.weeklyQuestState),
    memories: isMemoryArray(source.memories) ? [...source.memories].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_MEMORIES) : [],
    unlockedCosmetics: uniqueStrings(source.unlockedCosmetics),
    unlockedVoicePacks: uniqueStrings(source.unlockedVoicePacks),
    rewardLedger: uniqueStrings(source.rewardLedger),
    showcaseAchievementId: typeof source.showcaseAchievementId === 'string' ? source.showcaseAchievementId : null,
  };
}

function formatThreshold(metric: AchievementMetric, threshold: number): string {
  if (metric === 'coding_minutes') {
    if (threshold % 60 === 0) return `${threshold / 60}h active coding`;
    return `${threshold}m active coding`;
  }
  if (metric === 'pomodoro_completed') return `${threshold} Pomodoro completed`;
  if (metric === 'chat_prompt') return `${threshold} AI prompts`;
  return `Threshold ${threshold}`;
}

function getMetricValueFromStats(stats: PersistedStats, metric: AchievementMetric): number {
  switch (metric) {
    case 'save': return stats.saves;
    case 'commit': return stats.commits;
    case 'error_fix': return stats.errorsFixed;
    case 'coding_minutes': return Math.floor(stats.codingMillisAllTime / 60000);
    case 'chat_prompt': return stats.chatPrompts;
    case 'pomodoro_completed': return stats.pomodoroCompleted;
  }
}

function getMetricSnapshot(stats: PersistedStats): MetricSnapshot {
  return {
    save: stats.saves,
    commit: stats.commits,
    error_fix: stats.errorsFixed,
    coding_minutes: Math.floor(stats.codingMillisAllTime / 60000),
    chat_prompt: stats.chatPrompts,
    pomodoro_completed: stats.pomodoroCompleted,
  };
}

function buildMemoryForAchievement(def: AchievementDef): string {
  if (def.secret) {
    return `Remember when we uncovered the secret "${def.title}" together?`;
  }
  return `Remember when we unlocked "${def.title}" together?`;
}

function buildMemoryForQuest(quest: QuestDef, periodKey: string): MemoryEntry {
  return {
    id: `quest:${quest.period}:${quest.id}:${periodKey}`,
    text: `We cleared the ${quest.period} quest "${quest.title}" together.`,
    source: 'quest',
    createdAt: Date.now(),
  };
}

function cloneMemories(memories: MemoryEntry[]): MemoryEntry[] {
  return memories.map((item) => ({ ...item }));
}

export function getAchievementDef(id: string): AchievementDef | undefined {
  return ACHIEVEMENT_BY_ID.get(id);
}

function buildQuestViews(stats: PersistedStats, period: QuestPeriod): QuestView[] {
  const state = period === 'daily' ? stats.dailyQuestState : stats.weeklyQuestState;
  return QUEST_DEFS
    .filter((quest) => quest.period === period)
    .map((quest) => {
      const current = getMetricValueFromStats(stats, quest.metric);
      const baseline = state.baselines[quest.metric];
      const progress = Math.max(0, current - baseline);
      const completed = state.completedIds.includes(quest.id);
      return {
        id: quest.id,
        period,
        title: quest.title,
        description: quest.description,
        progress: Math.min(progress, quest.target),
        target: quest.target,
        completed,
        statusText: completed ? 'Completed' : `${Math.min(progress, quest.target)}/${quest.target}`,
      };
    });
}

function highestUnlockedAchievement(stats: PersistedStats): AchievementDef | null {
  const unlocked = ACHIEVEMENT_DEFS.filter((def) => stats.achievements.includes(def.id));
  if (!unlocked.length) return null;
  const rank = { common: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 } satisfies Record<AchievementRarity, number>;
  unlocked.sort((a, b) => {
    const rarityDiff = rank[b.rarity] - rank[a.rarity];
    if (rarityDiff !== 0) return rarityDiff;
    return (b.threshold ?? 0) - (a.threshold ?? 0);
  });
  return unlocked[0];
}

function deriveProfileTitle(stats: PersistedStats, topAchievement: AchievementDef | null): string {
  if (topAchievement?.id === 'provider_polyglot') return 'AI Multiverse Ambassador';
  if (topAchievement?.id === 'night_owl') return 'Moonlit Debug Partner';
  switch (topAchievement?.rarity) {
    case 'mythic': return 'Mythic Bond';
    case 'legendary': return 'Legend Bloom';
    case 'epic': return 'Orbit Dreamer';
    case 'rare': return 'Rising Spark';
    case 'common': return 'Companion Rookie';
    default: return 'Fresh Pair';
  }
}

export function buildCompanionProfile(stats: PersistedStats): CompanionProfileData {
  const daily = buildQuestViews(stats, 'daily');
  const weekly = buildQuestViews(stats, 'weekly');
  const achievementUnlocked = stats.achievements.length;
  const topAchievement = highestUnlockedAchievement(stats);
  const codingHours = Math.floor(stats.codingMillisAllTime / 3600000);
  const profileScore =
    stats.saves +
    (stats.commits * 3) +
    (stats.errorsFixed * 2) +
    Math.floor(stats.codingMillisAllTime / 600000) +
    (stats.chatPrompts * 2) +
    (stats.pomodoroCompleted * 4) +
    (daily.filter((quest) => quest.completed).length * 6) +
    (weekly.filter((quest) => quest.completed).length * 15) +
    (achievementUnlocked * 18) +
    (stats.unlockedCosmetics.length * 12) +
    (stats.unlockedVoicePacks.length * 16);
  const level = Math.max(1, Math.floor(Math.sqrt(profileScore / 18)) + 1);
  const affinityBase =
    (achievementUnlocked * 4) +
    (daily.filter((quest) => quest.completed).length * 3) +
    (weekly.filter((quest) => quest.completed).length * 7) +
    Math.floor(stats.codingMillisAllTime / 3600000) +
    stats.headpatCount +
    Math.floor(stats.chatPrompts / 5);
  const affinityPercent = Math.max(0, Math.min(100, 20 + affinityBase));

  const rarityRank: Record<AchievementRarity, number> = { common: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
  const unlockedAchievements: UnlockedAchievementSummary[] = ACHIEVEMENT_DEFS
    .filter((def) => stats.achievements.includes(def.id))
    .map((def) => ({ id: def.id, title: def.title, description: def.description, rarity: def.rarity }))
    .sort((a, b) => rarityRank[b.rarity] - rarityRank[a.rarity] || a.title.localeCompare(b.title));

  return {
    title: deriveProfileTitle(stats, topAchievement),
    level,
    affinityPercent,
    topAchievementId: topAchievement?.id ?? null,
    topAchievementTitle: topAchievement?.title ?? 'No major title yet',
    topAchievementRarity: topAchievement?.rarity ?? null,
    unlockedAchievements,
    achievementUnlocked,
    achievementTotal: ACHIEVEMENT_COUNT,
    dailyQuestCompleted: daily.filter((quest) => quest.completed).length,
    weeklyQuestCompleted: weekly.filter((quest) => quest.completed).length,
    inventory: {
      gems: stats.gems,
      tickets: stats.tickets,
      cosmetics: [...stats.unlockedCosmetics],
      voicePacks: [...stats.unlockedVoicePacks],
    },
    summary: {
      saves: stats.saves,
      commits: stats.commits,
      errorsFixed: stats.errorsFixed,
      codingHours,
      chatPrompts: stats.chatPrompts,
      pomodoroCompleted: stats.pomodoroCompleted,
      memories: stats.memories.length,
    },
    badgeLine: `Lv.${level} • ${topAchievement ? rarityLabel(topAchievement.rarity) : 'Growing'} • Affinity ${affinityPercent}%`,
  };
}

export function buildAchievementPanelData(stats: PersistedStats): AchievementPanelData {
  const normalDefs = ACHIEVEMENT_DEFS.filter((def) => !def.secret);
  const secretDefs = ACHIEVEMENT_DEFS.filter((def) => def.secret);
  const showcase = resolveShowcase(stats);
  const showcaseId = showcase?.id ?? null;

  const chains = SERIES_ORDER.map((seriesId) => {
    const defs = normalDefs
      .filter((def) => def.seriesId === seriesId)
      .sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0));
    const nodes = defs.map((def) => {
      const unlocked = isAchievementUnlocked(stats, def.id);
      return {
        id: def.id,
        title: def.title,
        description: def.description,
        unlocked,
        secret: false,
        statusText: unlocked ? `${rarityLabel(def.rarity)} unlocked` : formatThreshold(def.metric!, def.threshold!),
        tier: def.tier ?? 0,
        parentId: def.parentId,
        rarity: def.rarity,
        rarityLabel: rarityLabel(def.rarity),
        isShowcased: showcaseId === def.id,
      };
    });

    return {
      id: seriesId,
      title: defs[0]?.seriesTitle ?? seriesId,
      unlockedCount: nodes.filter((node) => node.unlocked).length,
      totalCount: nodes.length,
      nodes,
    };
  });

  const secrets = secretDefs.map((def) => {
    const unlocked = isAchievementUnlocked(stats, def.id);
    return {
      id: def.id,
      title: unlocked ? def.title : '???',
      description: unlocked ? def.description : def.hint ?? 'Secret achievement',
      unlocked,
      secret: true as const,
      hint: def.hint,
      statusText: unlocked ? `${rarityLabel(def.rarity)} unlocked` : 'Locked secret',
      rarity: def.rarity,
      rarityLabel: rarityLabel(def.rarity),
      isShowcased: showcaseId === def.id,
    };
  });

  const daily = buildQuestViews(stats, 'daily');
  const weekly = buildQuestViews(stats, 'weekly');
  const normalUnlocked = normalDefs.filter((def) => isAchievementUnlocked(stats, def.id)).length;
  const secretUnlocked = secretDefs.filter((def) => isAchievementUnlocked(stats, def.id)).length;

  return {
    summary: {
      unlocked: normalUnlocked + secretUnlocked,
      total: ACHIEVEMENT_DEFS.length,
      normalUnlocked,
      normalTotal: normalDefs.length,
      secretUnlocked,
      secretTotal: secretDefs.length,
      dailyCompleted: daily.filter((quest) => quest.completed).length,
      dailyTotal: daily.length,
      weeklyCompleted: weekly.filter((quest) => quest.completed).length,
      weeklyTotal: weekly.length,
    },
    chains,
    secrets,
    quests: { daily, weekly },
    memories: cloneMemories(stats.memories).slice(0, 5),
    showcaseId,
    showcase,
  };
}

function resolveShowcase(stats: PersistedStats): ShowcaseView | null {
  const id = stats.showcaseAchievementId;
  if (!id) return null;
  const def = ACHIEVEMENT_BY_ID.get(id);
  if (!def) return null;
  if (!stats.achievements.includes(id)) return null;
  return {
    id: def.id,
    title: def.title,
    rarity: def.rarity,
    rarityLabel: rarityLabel(def.rarity),
  };
}

export function buildAchievementQuickPickRows(stats: PersistedStats): AchievementQuickPickRow[] {
  const rows: AchievementQuickPickRow[] = [];

  for (const seriesId of SERIES_ORDER) {
    const defs = ACHIEVEMENT_DEFS
      .filter((def) => !def.secret && def.seriesId === seriesId)
      .sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0));

    for (const def of defs) {
      const unlocked = isAchievementUnlocked(stats, def.id);
      rows.push({
        id: def.id,
        label: `${unlocked ? '$(trophy)' : '$(lock)'} ${def.title}`,
        description: `[${def.seriesTitle}] ${def.description}`,
        detail: unlocked ? `${rarityLabel(def.rarity)} unlocked` : `${rarityLabel(def.rarity)} • ${formatThreshold(def.metric!, def.threshold!)}`,
      });
    }
  }

  for (const def of ACHIEVEMENT_DEFS.filter((item) => item.secret)) {
    const unlocked = isAchievementUnlocked(stats, def.id);
    rows.push({
      id: def.id,
      label: unlocked ? `$(trophy) ${def.title}` : '$(question) Secret Achievement',
      description: unlocked ? def.description : def.hint ?? 'Hidden unlock condition',
      detail: unlocked ? `${rarityLabel(def.rarity)} unlocked` : `${rarityLabel(def.rarity)} • Locked secret`,
    });
  }

  return rows;
}

export function buildQuestQuickPickRows(stats: PersistedStats): AchievementQuickPickRow[] {
  const rows: AchievementQuickPickRow[] = [];
  for (const period of ['daily', 'weekly'] as const) {
    for (const quest of buildQuestViews(stats, period)) {
      rows.push({
        id: quest.id,
        label: `${quest.completed ? '$(pass-filled)' : '$(checklist)'} ${period === 'daily' ? 'Daily' : 'Weekly'}: ${quest.title}`,
        description: quest.description,
        detail: `${quest.statusText} • Reward ${questRewardLabel(period)}`,
      });
    }
  }
  return rows;
}

export class StatsStore {
  private _ctx: vscode.ExtensionContext;
  private _data: PersistedStats;

  constructor(context: vscode.ExtensionContext) {
    this._ctx = context;
    const current = context.globalState.get<unknown>(KEY);
    const legacy = current ? undefined : LEGACY_KEYS.map((item) => context.globalState.get<unknown>(item)).find(Boolean);
    this._data = normalizeStats(current ?? legacy);
    this._rolloverDay();
    this._syncQuestStates();
    this._reconcileRewards();
    void this._flush();
  }

  private _rolloverDay() {
    const key = todayKey();
    if (this._data.codingDayKey !== key) {
      this._data.codingDayKey = key;
      this._data.codingMillisToday = 0;
    }
  }

  private _syncQuestStates() {
    const snapshot = getMetricSnapshot(this._data);
    const dailyKey = todayKey();
    if (this._data.dailyQuestState.key !== dailyKey) {
      this._data.dailyQuestState = {
        key: dailyKey,
        baselines: { ...snapshot },
        completedIds: [],
      };
    }

    const weeklyKey = weekKey();
    if (this._data.weeklyQuestState.key !== weeklyKey) {
      this._data.weeklyQuestState = {
        key: weeklyKey,
        baselines: { ...snapshot },
        completedIds: [],
      };
    }
  }

  private async _flush() {
    await this._ctx.globalState.update(KEY, this._data);
  }

  private _applyGrant(sourceId: string, grant: RewardGrant): boolean {
    if (this._data.rewardLedger.includes(sourceId)) return false;
    this._data.rewardLedger.push(sourceId);
    this._data.gems += grant.gems;
    this._data.tickets += grant.tickets;
    for (const cosmetic of grant.cosmetics) {
      if (!this._data.unlockedCosmetics.includes(cosmetic)) {
        this._data.unlockedCosmetics.push(cosmetic);
      }
    }
    for (const voicePack of grant.voicePacks) {
      if (!this._data.unlockedVoicePacks.includes(voicePack)) {
        this._data.unlockedVoicePacks.push(voicePack);
      }
    }
    return true;
  }

  private _reconcileRewards() {
    for (const achievementId of this._data.achievements) {
      const def = ACHIEVEMENT_BY_ID.get(achievementId);
      if (!def) continue;
      this._applyGrant(`achievement:${def.id}`, rewardGrantForAchievement(def));
    }

    const questStates: Array<{ period: QuestPeriod; state: QuestPeriodState }> = [
      { period: 'daily', state: this._data.dailyQuestState },
      { period: 'weekly', state: this._data.weeklyQuestState },
    ];
    for (const { period, state } of questStates) {
      for (const completedId of state.completedIds) {
        const quest = QUEST_BY_ID.get(completedId);
        if (!quest || quest.period !== period) continue;
        this._applyGrant(`quest:${period}:${quest.id}:${state.key}`, rewardGrantForQuest(quest));
      }
    }
  }

  private _addMemory(memory: MemoryEntry): boolean {
    if (this._data.memories.some((item) => item.id === memory.id)) return false;
    this._data.memories.unshift(memory);
    this._data.memories = this._data.memories
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_MEMORIES);
    return true;
  }

  private async _unlockAllMatching(metric: AchievementMetric): Promise<AchievementDef[]> {
    const value = getMetricValueFromStats(this._data, metric);
    const unlocked: AchievementDef[] = [];
    for (const def of ACHIEVEMENT_DEFS) {
      if (def.secret) continue;
      if (def.metric !== metric || typeof def.threshold !== 'number') continue;
      if (value < def.threshold) continue;
      if (this._data.achievements.includes(def.id)) continue;
      this._data.achievements.push(def.id);
      this._addMemory({
        id: `achievement:${def.id}`,
        text: buildMemoryForAchievement(def),
        source: 'achievement',
        createdAt: Date.now(),
      });
      this._applyGrant(`achievement:${def.id}`, rewardGrantForAchievement(def));
      unlocked.push(def);
    }
    if (unlocked.length > 0) {
      await this._flush();
    }
    return unlocked;
  }

  private async _evaluateQuestCompletions(metric: AchievementMetric): Promise<QuestDef[]> {
    this._syncQuestStates();
    const completed: QuestDef[] = [];
    const states: Array<{ period: QuestPeriod; state: QuestPeriodState }> = [
      { period: 'daily', state: this._data.dailyQuestState },
      { period: 'weekly', state: this._data.weeklyQuestState },
    ];

    for (const { period, state } of states) {
      for (const quest of QUEST_DEFS.filter((item) => item.period === period && item.metric === metric)) {
        if (state.completedIds.includes(quest.id)) continue;
        const current = getMetricValueFromStats(this._data, quest.metric);
        const progress = Math.max(0, current - state.baselines[quest.metric]);
        if (progress < quest.target) continue;
        state.completedIds.push(quest.id);
        this._addMemory(buildMemoryForQuest(quest, state.key));
        this._applyGrant(`quest:${period}:${quest.id}:${state.key}`, rewardGrantForQuest(quest));
        completed.push(quest);
      }
    }

    if (completed.length > 0) {
      await this._flush();
    }
    return completed;
  }

  public getStats(): PersistedStats {
    this._rolloverDay();
    this._syncQuestStates();
    return {
      ...this._data,
      achievements: [...this._data.achievements],
      chatProvidersUsed: [...this._data.chatProvidersUsed],
      dailyQuestState: {
        key: this._data.dailyQuestState.key,
        baselines: { ...this._data.dailyQuestState.baselines },
        completedIds: [...this._data.dailyQuestState.completedIds],
      },
      weeklyQuestState: {
        key: this._data.weeklyQuestState.key,
        baselines: { ...this._data.weeklyQuestState.baselines },
        completedIds: [...this._data.weeklyQuestState.completedIds],
      },
      memories: cloneMemories(this._data.memories),
      unlockedCosmetics: [...this._data.unlockedCosmetics],
      unlockedVoicePacks: [...this._data.unlockedVoicePacks],
      rewardLedger: [...this._data.rewardLedger],
    };
  }

  public getAchievements(): string[] {
    return [...this._data.achievements];
  }

  public getRecentMemories(limit = 5): MemoryEntry[] {
    return cloneMemories(this._data.memories).slice(0, limit);
  }

  public pickMemoryLine(): string | null {
    const pool = this._data.memories.slice(0, 8);
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)].text;
  }

  public getQuestViews(period: QuestPeriod): QuestView[] {
    return buildQuestViews(this.getStats(), period);
  }

  public getProfileData(): CompanionProfileData {
    return buildCompanionProfile(this.getStats());
  }

  public hasAchievement(id: string): boolean {
    return this._data.achievements.includes(id);
  }

  public getShowcase(): ShowcaseView | null {
    return resolveShowcase(this._data);
  }

  public async setShowcase(id: string | null): Promise<ShowcaseView | null> {
    if (id === null) {
      this._data.showcaseAchievementId = null;
      await this._flush();
      return null;
    }
    if (!ACHIEVEMENT_BY_ID.has(id)) return this.getShowcase();
    if (!this._data.achievements.includes(id)) return this.getShowcase();
    this._data.showcaseAchievementId = id;
    await this._flush();
    return this.getShowcase();
  }

  public async incSave(): Promise<number> {
    this._syncQuestStates();
    this._data.saves++;
    await this._flush();
    return this._data.saves;
  }

  public async incCommit(): Promise<number> {
    this._syncQuestStates();
    this._data.commits++;
    await this._flush();
    return this._data.commits;
  }

  public async incErrorsFixed(n: number): Promise<number> {
    if (n <= 0) return this._data.errorsFixed;
    this._syncQuestStates();
    this._data.errorsFixed += n;
    await this._flush();
    return this._data.errorsFixed;
  }

  public async addCodingTime(ms: number): Promise<void> {
    if (ms <= 0) return;
    this._rolloverDay();
    this._syncQuestStates();
    this._data.codingMillisToday += ms;
    this._data.codingMillisAllTime += ms;
    await this._flush();
  }

  public async recordChatPrompt(quick = false): Promise<{ total: number; quickTotal: number }> {
    this._syncQuestStates();
    this._data.chatPrompts++;
    if (quick) {
      this._data.quickChatPrompts++;
    }
    await this._flush();
    return {
      total: this._data.chatPrompts,
      quickTotal: this._data.quickChatPrompts,
    };
  }

  public async recordSuccessfulChatProvider(providerId: string): Promise<number> {
    if (providerId && !this._data.chatProvidersUsed.includes(providerId)) {
      this._data.chatProvidersUsed.push(providerId);
      await this._flush();
    }
    return this._data.chatProvidersUsed.length;
  }

  public async recordPomodoroStart(): Promise<number> {
    this._syncQuestStates();
    this._data.pomodoroStarts++;
    await this._flush();
    return this._data.pomodoroStarts;
  }

  public async recordPomodoroCompleted(): Promise<number> {
    this._syncQuestStates();
    this._data.pomodoroCompleted++;
    await this._flush();
    return this._data.pomodoroCompleted;
  }

  public async recordInteraction(kind: 'poke' | 'headpat' | 'multiClick' | 'spamClick'): Promise<number> {
    switch (kind) {
      case 'poke':
        this._data.pokeCount++;
        await this._flush();
        return this._data.pokeCount;
      case 'headpat':
        this._data.headpatCount++;
        await this._flush();
        return this._data.headpatCount;
      case 'multiClick':
        this._data.multiClickCount++;
        await this._flush();
        return this._data.multiClickCount;
      case 'spamClick':
        this._data.spamClickCount++;
        await this._flush();
        return this._data.spamClickCount;
    }
  }

  public async tryUnlockByMetric(metric: AchievementMetric): Promise<AchievementDef[]> {
    return this._unlockAllMatching(metric);
  }

  public async tryCompleteQuestsByMetric(metric: AchievementMetric): Promise<QuestDef[]> {
    return this._evaluateQuestCompletions(metric);
  }

  public async unlockById(id: string): Promise<AchievementDef | null> {
    if (this._data.achievements.includes(id)) return null;
    const def = ACHIEVEMENT_BY_ID.get(id);
    if (!def) return null;
    this._data.achievements.push(id);
    this._addMemory({
      id: `achievement:${def.id}`,
      text: buildMemoryForAchievement(def),
      source: 'achievement',
      createdAt: Date.now(),
    });
    this._applyGrant(`achievement:${def.id}`, rewardGrantForAchievement(def));
    await this._flush();
    return def;
  }

  public async tryUnlockNightOwl(): Promise<AchievementDef | null> {
    const hour = new Date().getHours();
    if (hour !== 3) return null;
    return this.unlockById('night_owl');
  }

  public async tryUnlockProviderPolyglot(): Promise<AchievementDef | null> {
    if (this._data.chatProvidersUsed.length < 3) return null;
    return this.unlockById('provider_polyglot');
  }
}
