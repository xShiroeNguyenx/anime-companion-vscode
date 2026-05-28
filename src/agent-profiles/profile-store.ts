import * as vscode from 'vscode';
import {
  AgentProfile,
  ProfileStoreShape,
  AGENT_PROFILE_STATE_KEY,
  DEFAULT_TOOL_ID,
} from './types';

export class AgentProfileStore {
  constructor(private readonly _context: vscode.ExtensionContext) {}

  private _read(): ProfileStoreShape {
    const raw = this._context.globalState.get<ProfileStoreShape>(AGENT_PROFILE_STATE_KEY);
    if (!raw || !Array.isArray(raw.profiles)) {
      return { profiles: [], activeId: undefined };
    }
    // Migrate pre-multi-tool profiles: default missing tool to 'claude'.
    const profiles = raw.profiles.map((p) => p.tool ? p : { ...p, tool: DEFAULT_TOOL_ID });
    return { profiles, activeId: raw.activeId };
  }

  private async _write(shape: ProfileStoreShape): Promise<void> {
    await this._context.globalState.update(AGENT_PROFILE_STATE_KEY, shape);
  }

  list(): AgentProfile[] {
    return this._read().profiles;
  }

  get(id: string): AgentProfile | undefined {
    return this._read().profiles.find((p) => p.id === id);
  }

  getActiveId(): string | undefined {
    return this._read().activeId;
  }

  getActive(): AgentProfile | undefined {
    const { profiles, activeId } = this._read();
    if (!activeId) return undefined;
    return profiles.find((p) => p.id === activeId);
  }

  async upsert(profile: AgentProfile): Promise<void> {
    const shape = this._read();
    const idx = shape.profiles.findIndex((p) => p.id === profile.id);
    if (idx >= 0) {
      shape.profiles[idx] = profile;
    } else {
      shape.profiles.push(profile);
    }
    await this._write(shape);
  }

  async remove(id: string): Promise<void> {
    const shape = this._read();
    shape.profiles = shape.profiles.filter((p) => p.id !== id);
    if (shape.activeId === id) shape.activeId = undefined;
    await this._write(shape);
  }

  async setActive(id: string | undefined): Promise<void> {
    const shape = this._read();
    shape.activeId = id;
    await this._write(shape);
  }

  nameExists(name: string, exceptId?: string): boolean {
    const trimmed = name.trim().toLowerCase();
    return this._read().profiles.some(
      (p) => p.name.toLowerCase() === trimmed && p.id !== exceptId
    );
  }
}
