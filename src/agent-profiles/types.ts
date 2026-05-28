export interface ProfileSnapshotMeta {
  dir: string;
  files: string[];
  capturedAt: number;
}

export interface AgentProfile {
  id: string;
  name: string;
  tool: string;            // backend id, e.g. 'claude'
  claudeSnapshot?: ProfileSnapshotMeta;
  createdAt: number;
  updatedAt: number;
}

export interface ProfileStoreShape {
  profiles: AgentProfile[];
  activeId?: string;
}

export const DEFAULT_TOOL_ID = 'claude';
export const AGENT_PROFILE_STATE_KEY = 'agentProfiles.store';
export const AGENT_PROFILE_DIR = 'agent-profiles';
export const MAX_BACKUPS = 3;
