import * as vscode from 'vscode';
import { log } from '../log';
import { getSelectedModel } from '../models';
import { ChatSecrets, ProviderId } from './secrets';
import { ConversationStore, ConversationFile, StoredMessage } from './conversation-store';
import { getProvider, PROVIDER_INFO, ChatMessage } from './llm-provider';
import { resolveSystemPrompt } from './persona';
import { buildContext, ContextRequest, searchWorkspaceFiles } from './context-builder';
import { detectSentiment } from './sentiment';
import { getMessageBank } from '../messages';
import { AchievementDef, buildAchievementPanelData, QuestDef, StatsStore } from '../stats';

export interface ChatHost {
  postMessage(msg: any): void;
}

// Best-effort heuristic to spot obvious provider/model mismatches before they
// reach the wire and come back as a raw 4xx in the bubble. Used by the
// transient quick-chat path where falling back to the provider's default is
// safer than showing a cryptic API error. Conservative — only rejects when
// the model name clearly belongs to a different vendor's family.
function isModelCompatibleWithProvider(model: string, providerId: ProviderId): boolean {
  const m = (model || '').toLowerCase().trim();
  if (!m) return false;
  switch (providerId) {
    case 'anthropic': return m.includes('claude');
    case 'openai':    return m.includes('gpt') || /^o[1-9]/.test(m);
    case 'gemini':    return m.includes('gemini') || m.includes('gemma');
    case 'xai':       return m.includes('grok');
    case 'deepseek':  return m.includes('deepseek');
    case 'openrouter':return m.includes('/');
    case 'ollama':    return true;
    case 'copilot':   return true;
    default:          return true;
  }
}

interface CopilotAccountPreference {
  id?: string;
  label?: string;
}

export class ChatManager {
  private static readonly COPILOT_ACCOUNT_KEY = 'chat.copilotAccountPreference';
  private static readonly PROVIDER_STATE_KEY = 'chat.providerSelection';
  private static readonly MODEL_STATE_KEY = 'chat.modelSelection';
  private static readonly GITHUB_AUTH_PROVIDER = 'github';
  private static readonly GITHUB_AUTH_SCOPES = ['read:user'];
  private static readonly MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

  private _abort?: AbortController;
  private _inFlight = false;
  private _streamingMessageId = 0;
  // Independent abort + in-flight guard for transient pet quick-chat. Lives
  // alongside the panel chat's _abort/_inFlight so the two surfaces never
  // cancel each other — user typing in the panel and right-clicking the pet
  // for a quick reply at the same time both work.
  private _quickAbort?: AbortController;
  private _quickInFlight = false;
  // Cached dynamic model lists keyed by provider id. Refetched when stale so
  // the dropdown shows whatever the provider actually supports for this key
  // (e.g. Gemini 2.5/3.x families appear without a code release).
  private _modelListCache = new Map<ProviderId, { models: string[]; ts: number }>();
  // Selection captured by the askSelection command. Cleared after the user
  // submits the next message so it doesn't leak into unrelated turns.
  private _stagedSelection?: { filePath: string; text: string; languageId?: string };

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _secrets: ChatSecrets,
    private readonly _store: ConversationStore,
    private readonly _hostRef: () => ChatHost | undefined,
    private readonly _stats: StatsStore
  ) {
    void this._context;
  }

  // ───────────────────────────────────── public API ─────────────────────────────────────

  async sendUserMessage(prompt: string, contextReq?: ContextRequest): Promise<void> {
    const text = (prompt ?? '').trim();
    if (!text) return;

    if (this._inFlight) {
      this._post({ command: 'chat:error', message: 'A reply is already in flight. Cancel it first.' });
      return;
    }

    const cfg = vscode.workspace.getConfiguration('animeCompanion');
    const providerId = this._resolveActiveProvider();
    const provider = getProvider(providerId);
    if (!provider) {
      this._post({ command: 'chat:error', message: `Unknown chat provider "${providerId}".` });
      return;
    }

    if (providerId === 'copilot') {
      await this._ensureCopilotAccountAccess();
    }

    let apiKey = '';
    if (provider.requiresApiKey) {
      const stored = await this._secrets.get(providerId);
      if (!stored) {
        this._post({
          command: 'chat:error',
          code: 'no-api-key',
          provider: providerId,
          message: `No API key for ${providerId}. Click 🔑 to add one, or switch to Copilot.`,
        });
        return;
      }
      apiKey = stored;
    }

    const model = this._resolveActiveModel(providerId) || provider.defaultModel;
    await this._recordChatProgress(false);

    // Resolve context attachments before saving the turn so the user's
    // stored message includes everything that was sent to the model.
    const effectiveContext: ContextRequest = {
      ...(contextReq ?? {}),
      stagedSelection: contextReq?.stagedSelection ?? this._stagedSelection,
      fileMentions: [
        ...(contextReq?.fileMentions ?? []),
        ...extractMentions(text),
      ],
    };
    const built = await buildContext(effectiveContext);
    this._stagedSelection = undefined; // consumed

    const userContent = built.prefix ? `${built.prefix}${text}` : text;

    // Load or create the active conversation. A user typing into an empty
    // panel implicitly starts a new conversation — no need for a separate
    // "new chat" click before sending.
    const conv = await this._loadActiveOrCreate(providerId, model);
    conv.meta.providerId = providerId;
    conv.meta.model = model;

    const now = Date.now();
    const userMsg: StoredMessage = { role: 'user', content: userContent, ts: now };
    conv.messages.push(userMsg);
    await this._store.save(conv);
    await this._store.setActiveId(conv.meta.id);

    this._post({
      command: 'chat:userMessage',
      conversationId: conv.meta.id,
      message: userMsg,
      title: conv.meta.title,
      attachedContext: built.attached,
    });

    // Chat replies live in the panel, so the persona should track the panel's
    // active Live2D model even when the desktop companion is enabled.
    const modelName = getSelectedModel('panel').name;
    const systemPrompt = resolveSystemPrompt(modelName);
    const providerMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this._store.toProviderMessages(conv),
    ];

    this._abort = new AbortController();
    this._inFlight = true;
    const streamMsgId = ++this._streamingMessageId;
    this._post({
      command: 'chat:assistantStart',
      conversationId: conv.meta.id,
      streamId: streamMsgId,
    });

    let accumulated = '';
    try {
      const maxTokens = cfg.get<number>('chat.maxTokens', 2048);
      const temperature = cfg.get<number>('chat.temperature', 0.7);

      const { stream, result } = provider.sendStream({
        apiKey,
        model,
        messages: providerMessages,
        maxTokens,
        temperature,
        signal: this._abort.signal,
      });

      for await (const chunk of stream) {
        accumulated += chunk;
        this._post({
          command: 'chat:assistantDelta',
          conversationId: conv.meta.id,
          streamId: streamMsgId,
          delta: chunk,
        });
      }

      const assistantMsg: StoredMessage = {
        role: 'assistant',
        content: accumulated || '(empty response)',
        ts: Date.now(),
      };
      conv.messages.push(assistantMsg);
      await this._store.save(conv);

      this._post({
        command: 'chat:assistantEnd',
        conversationId: conv.meta.id,
        streamId: streamMsgId,
        message: assistantMsg,
        usage: result.usage,
        title: conv.meta.title,
      });

      await this._recordSuccessfulProvider(providerId);
      this._reactToReply(assistantMsg.content);
    } catch (err) {
      const aborted =
        (err instanceof Error && err.name === 'AbortError') ||
        (err instanceof Error && /aborted|cancell?ed/i.test(err.message));
      const msg = aborted ? 'Cancelled.' : err instanceof Error ? err.message : String(err);
      log(`ChatManager: send failed (${providerId}/${model}): ${msg}`);

      // Persist whatever streamed before the failure so the user keeps the
      // partial answer instead of losing it on the next reload.
      if (accumulated) {
        conv.messages.push({
          role: 'assistant',
          content: accumulated + (aborted ? '\n\n_(cancelled)_' : ''),
          ts: Date.now(),
        });
        await this._store.save(conv);
      }

      this._post({
        command: 'chat:assistantEnd',
        conversationId: conv.meta.id,
        streamId: streamMsgId,
        error: msg,
        aborted,
        message: accumulated
          ? { role: 'assistant', content: accumulated, ts: Date.now() }
          : undefined,
        title: conv.meta.title,
      });
    } finally {
      this._inFlight = false;
      this._abort = undefined;
    }
  }

  cancel(): void {
    if (this._abort) {
      this._abort.abort();
    }
  }

  // Transient quick-chat used by the pet right-click overlay. Does NOT touch
  // ConversationStore or broadcast `chat:*` messages — caller drives the
  // bubble via the supplied callbacks instead. `maxTokens` defaults low (200)
  // because the speech bubble has limited room.
  async sendQuickChat(
    prompt: string,
    opts: {
      maxTokens?: number;
      onDelta: (chunk: string) => void;
      onEnd: (full: string) => void;
      onError: (message: string, aborted: boolean) => void;
    }
  ): Promise<void> {
    const text = (prompt ?? '').trim();
    if (!text) {
      opts.onError('Empty prompt.', false);
      return;
    }
    if (this._quickInFlight) {
      opts.onError('A quick-chat reply is already in flight.', false);
      return;
    }

    const providerId = this._resolveActiveProvider();
    const provider = getProvider(providerId);
    if (!provider) {
      opts.onError(`Unknown chat provider "${providerId}".`, false);
      return;
    }

    if (providerId === 'copilot') {
      try {
        await this._ensureCopilotAccountAccess();
      } catch (err) {
        opts.onError(err instanceof Error ? err.message : String(err), false);
        return;
      }
    }

    let apiKey = '';
    if (provider.requiresApiKey) {
      const stored = await this._secrets.get(providerId);
      if (!stored) {
        opts.onError(`No API key for ${providerId}. Configure it in chat panel first.`, false);
        return;
      }
      apiKey = stored;
    }

    // Defensive provider/model pairing. The chat panel lets users pick a
    // provider and model independently — a stale combo (e.g. provider=gemini
    // with a leftover model=claude-haiku-4.5) hits the API and crashes with a
    // raw "model not found for v1beta" error in the pet's bubble. For the
    // transient quick-chat surface, silently fall back to the provider's
    // default model when the configured model name doesn't look like a fit.
    const requestedModel = this._resolveActiveModel(providerId) || provider.defaultModel;
    const model = isModelCompatibleWithProvider(requestedModel, providerId)
      ? requestedModel
      : provider.defaultModel;
    const modelName = getSelectedModel('panel').name;
    const systemPrompt = resolveSystemPrompt(modelName);

    const providerMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ];

    this._quickAbort = new AbortController();
    this._quickInFlight = true;
    const cfg = vscode.workspace.getConfiguration('animeCompanion');
    const maxTokens = opts.maxTokens ?? 200;
    const temperature = cfg.get<number>('chat.temperature', 0.7);
    await this._recordChatProgress(true);

    let accumulated = '';
    try {
      const { stream } = provider.sendStream({
        apiKey,
        model,
        messages: providerMessages,
        maxTokens,
        temperature,
        signal: this._quickAbort.signal,
      });

      for await (const chunk of stream) {
        accumulated += chunk;
        opts.onDelta(chunk);
      }

      opts.onEnd(accumulated || '(empty response)');
      await this._recordSuccessfulProvider(providerId);
      this._reactToReply(accumulated);
    } catch (err) {
      const aborted =
        (err instanceof Error && err.name === 'AbortError') ||
        (err instanceof Error && /aborted|cancell?ed/i.test(err.message));
      const msg = aborted ? 'Cancelled.' : err instanceof Error ? err.message : String(err);
      log(`ChatManager: quick-chat failed (${providerId}/${model}): ${msg}`);
      opts.onError(msg, aborted);
    } finally {
      this._quickInFlight = false;
      this._quickAbort = undefined;
    }
  }

  cancelQuickChat(): void {
    if (this._quickAbort) this._quickAbort.abort();
  }

  async newConversation(): Promise<void> {
    if (this._inFlight) this.cancel();
    const providerId = this._resolveActiveProvider();
    const model = this._resolveActiveModel(providerId);

    // If the user already sits in an empty unsent conversation, reuse it
    // instead of stacking up another identical "New chat" entry. Also clean
    // up any *other* empty conversations so the sidebar list doesn't grow
    // by one every time the user pokes the "+ New chat" button.
    const activeId = this._store.getActiveId();
    const active = activeId ? await this._store.get(activeId) : undefined;
    if (active && active.messages.length === 0) {
      active.meta.providerId = providerId;
      active.meta.model = model;
      await this._store.save(active);
      await this._cleanupOtherEmptyConversations(active.meta.id);
      await this.sendSnapshot();
      this._post({ command: 'chat:focus' });
      return;
    }

    await this._cleanupOtherEmptyConversations(activeId);
    const conv = await this._store.create(providerId, model);
    await this._store.setActiveId(conv.meta.id);
    await this.sendSnapshot();
    this._post({ command: 'chat:focus' });
  }

  private async _cleanupOtherEmptyConversations(keepId?: string): Promise<void> {
    const list = await this._store.list();
    for (const meta of list) {
      if (meta.id === keepId) continue;
      const file = await this._store.get(meta.id);
      if (file && file.messages.length === 0) {
        await this._store.delete(meta.id);
      }
    }
  }

  async loadConversation(id: string): Promise<void> {
    if (this._inFlight) this.cancel();
    const conv = await this._store.get(id);
    if (!conv) return;
    await this._store.setActiveId(id);
    await this.sendSnapshot();
  }

  async deleteConversation(id: string): Promise<void> {
    const wasActive = this._store.getActiveId() === id;
    if (wasActive && this._inFlight) this.cancel();
    await this._store.delete(id);
    await this.sendSnapshot();
  }

  async renameConversation(id: string, title: string): Promise<void> {
    await this._store.rename(id, title);
    await this.sendSnapshot();
  }

  // Browser-side `prompt()` is blocked in VS Code webviews. The webview signals
  // intent here, we drive the native InputBox, then perform the rename so the
  // user actually has a way to change titles.
  async requestRename(id: string, currentTitle: string): Promise<void> {
    const next = await vscode.window.showInputBox({
      prompt: 'Rename conversation',
      value: currentTitle,
      ignoreFocusOut: true,
      validateInput: (v) => (v && v.trim() ? null : 'Title cannot be empty'),
    });
    if (next === undefined) return;
    const trimmed = next.trim();
    if (!trimmed) return;
    await this.renameConversation(id, trimmed);
  }

  // Same reason — `confirm()` is blocked. Modal warning here lets the user
  // confirm before the conversation file is deleted.
  async requestDelete(id: string, title: string): Promise<void> {
    const choice = await vscode.window.showWarningMessage(
      `Delete conversation "${title}"? This can't be undone.`,
      { modal: true },
      'Delete'
    );
    if (choice !== 'Delete') return;
    await this.deleteConversation(id);
  }

  async clearAll(): Promise<void> {
    if (this._inFlight) this.cancel();
    await this._store.clearAll();
    await this.sendSnapshot();
  }

  async sendSnapshot(): Promise<void> {
    const providerId = this._resolveActiveProvider();
    const provider = getProvider(providerId);
    const requiresKey = provider?.requiresApiKey ?? true;
    const hasKey = requiresKey ? !!(await this._secrets.get(providerId)) : true;
    const resolvedModel = this._resolveActiveModel(providerId);

    const conversations = await this._store.list();
    const activeId = this._store.getActiveId();
    const active = activeId ? await this._store.get(activeId) : undefined;

    // Deep-copy PROVIDER_INFO so we can mutate Copilot's modelExamples with
    // whatever the user's installed Copilot subscription actually exposes,
    // without leaking that state into the shared default.
    const providersForUi = PROVIDER_INFO.map((p) => ({ ...p, modelExamples: [...p.modelExamples] }));
    const copilot = providersForUi.find((p) => p.id === 'copilot');
    const copilotAccounts = await this._getCopilotAccounts();
    const preferredCopilotAccount = this._getStoredCopilotAccountPreference();
    if (copilot) {
      try {
        const lm = await vscode.lm.selectChatModels({ vendor: 'copilot' });
        const dynamic = Array.from(new Set(lm.map((m) => m.family))).filter(Boolean);
        if (dynamic.length > 0) {
          copilot.modelExamples = dynamic;
        }
      } catch {
        // User likely doesn't have Copilot installed/signed in. Leave the
        // hardcoded examples as a fallback so the UI still shows something.
      }
    }

    // Provider-specific dynamic model lists. Fetched lazily and cached so the
    // dropdown reflects whatever the user's API key actually supports — the
    // hardcoded examples in PROVIDER_INFO are stale the moment a vendor ships
    // a new model family.
    if (providerId === 'gemini' && hasKey) {
      const key = await this._secrets.get('gemini');
      if (key) {
        const dynamic = await this._fetchProviderModels('gemini', key);
        if (dynamic && dynamic.length > 0) {
          const entry = providersForUi.find((p) => p.id === 'gemini');
          if (entry) entry.modelExamples = dynamic;
        }
      }
    }

    this._post({
      command: 'chat:snapshot',
      providerId,
      model: resolvedModel,
      requiresApiKey: requiresKey,
      hasApiKey: hasKey,
      providers: providersForUi,
      copilotAccounts,
      selectedCopilotAccountId: preferredCopilotAccount.id,
      selectedCopilotAccountLabel: preferredCopilotAccount.label,
      conversations,
      activeId: active?.meta.id,
      messages: active?.messages ?? [],
    });
  }

  async setProvider(providerId: ProviderId): Promise<void> {
    if (!PROVIDER_INFO.some((p) => p.id === providerId)) return;
    // Persist into workspaceState first — that's the source of truth the
    // snapshot reads from. The VS Code config write is mirrored so the value
    // is still visible/editable in the Settings UI, but if it ever fails or
    // gets overridden, the dropdown survives the next reload.
    await this._context.workspaceState.update(ChatManager.PROVIDER_STATE_KEY, providerId);
    const cfg = vscode.workspace.getConfiguration('animeCompanion');
    try {
      await cfg.update('chat.provider', providerId, this._chatConfigTarget());
    } catch (err) {
      log(`ChatManager: failed to mirror provider to settings.json: ${err instanceof Error ? err.message : String(err)}`);
    }
    // Invalidate the model list cache — provider switched, the old list is
    // for a different vendor and would mislead the dropdown.
    this._modelListCache.clear();
    await this.sendSnapshot();
  }

  async setModel(model: string): Promise<void> {
    await this._context.workspaceState.update(ChatManager.MODEL_STATE_KEY, model);
    const cfg = vscode.workspace.getConfiguration('animeCompanion');
    try {
      await cfg.update('chat.model', model, this._chatConfigTarget());
    } catch (err) {
      log(`ChatManager: failed to mirror model to settings.json: ${err instanceof Error ? err.message : String(err)}`);
    }
    await this.sendSnapshot();
  }

  // Resolve the current provider/model with workspaceState as the durable
  // source. cfg is consulted as a fallback for users who edited settings.json
  // by hand. The published default ('copilot' / '') only kicks in when both
  // sources are empty.
  private _resolveActiveProvider(): ProviderId {
    const stored = this._context.workspaceState.get<string>(ChatManager.PROVIDER_STATE_KEY);
    if (stored && PROVIDER_INFO.some((p) => p.id === stored)) return stored as ProviderId;
    const cfg = vscode.workspace.getConfiguration('animeCompanion');
    const fromCfg = cfg.get<string>('chat.provider', 'copilot');
    return (PROVIDER_INFO.some((p) => p.id === fromCfg) ? fromCfg : 'copilot') as ProviderId;
  }

  private async _fetchProviderModels(providerId: ProviderId, apiKey: string): Promise<string[] | undefined> {
    const cached = this._modelListCache.get(providerId);
    if (cached && Date.now() - cached.ts < ChatManager.MODEL_CACHE_TTL_MS) {
      return cached.models;
    }
    let models: string[] | undefined;
    try {
      if (providerId === 'gemini') {
        models = await this._fetchGeminiModels(apiKey);
      }
    } catch (err) {
      log(`ChatManager: model list fetch failed for ${providerId}: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
    if (models && models.length > 0) {
      this._modelListCache.set(providerId, { models, ts: Date.now() });
    }
    return models;
  }

  private async _fetchGeminiModels(apiKey: string): Promise<string[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=200`;
    const resp = await fetch(url, { method: 'GET' });
    if (!resp.ok) {
      log(`Gemini ListModels: HTTP ${resp.status}`);
      return [];
    }
    const json = (await resp.json()) as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> };
    const out: string[] = [];
    for (const m of json.models ?? []) {
      if (!m.name) continue;
      const methods = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
      // Only models that can answer a streaming chat are useful here. Skip
      // embedding / vision-only entries so the dropdown doesn't get noisy.
      if (!methods.includes('generateContent') && !methods.includes('streamGenerateContent')) continue;
      const id = m.name.replace(/^models\//, '');
      // Drop legacy 1.x families — they're deprecated and clutter the picker.
      if (/^gemini-1\./.test(id)) continue;
      out.push(id);
    }
    // Sort newest-first by version number when possible so 3.x/2.5 land above
    // the older 2.0 entries, then alphabetical within a version.
    out.sort((a, b) => {
      const va = parseFloat(a.match(/gemini-(\d+\.\d+)/)?.[1] ?? '0');
      const vb = parseFloat(b.match(/gemini-(\d+\.\d+)/)?.[1] ?? '0');
      if (va !== vb) return vb - va;
      return a.localeCompare(b);
    });
    return out;
  }

  private _resolveActiveModel(providerId: ProviderId): string {
    const stored = this._context.workspaceState.get<string>(ChatManager.MODEL_STATE_KEY);
    if (stored && stored.trim()) return stored.trim();
    const cfg = vscode.workspace.getConfiguration('animeCompanion');
    const fromCfg = (cfg.get<string>('chat.model', '') || '').trim();
    if (fromCfg) return fromCfg;
    return PROVIDER_INFO.find((p) => p.id === providerId)?.defaultModel || '';
  }

  async pickCopilotAccount(): Promise<void> {
    let accounts = await this._getCopilotAccounts();
    if (accounts.length === 0) {
      try {
        await vscode.authentication.getSession(
          ChatManager.GITHUB_AUTH_PROVIDER,
          ChatManager.GITHUB_AUTH_SCOPES,
          {
            createIfNone: {
              detail: 'Sign in to GitHub to choose which Copilot account Anime Companion should use.',
            },
          }
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showWarningMessage(`Couldn't sign in to GitHub: ${msg}`);
        return;
      }

      accounts = await this._getCopilotAccounts();
      if (accounts.length === 0) {
        vscode.window.showWarningMessage('No GitHub accounts are signed in inside VS Code yet.');
        return;
      }
    }

    const preferred = this._getStoredCopilotAccountPreference();
    const picks: Array<vscode.QuickPickItem & {
      account?: vscode.AuthenticationSessionAccountInformation;
      reset?: boolean;
    }> = [
      {
        label: 'Use VS Code default account',
        description: !preferred.id ? 'Current' : undefined,
        detail: 'Clear the Anime Companion-specific Copilot account preference.',
        reset: true,
      },
      ...accounts.map((account) => ({
        label: account.label,
        description: account.id === preferred.id ? 'Current' : undefined,
        detail: account.id,
        account,
      })),
    ];

    const pick = await vscode.window.showQuickPick(picks, {
      title: 'Anime Companion: Choose GitHub Copilot Account',
      placeHolder: 'Select the GitHub account this extension should use for Copilot',
      ignoreFocusOut: true,
    });
    if (!pick) return;

    if (pick.reset) {
      await this._clearStoredCopilotAccountPreference();
      try {
        await vscode.authentication.getSession(
          ChatManager.GITHUB_AUTH_PROVIDER,
          ChatManager.GITHUB_AUTH_SCOPES,
          { clearSessionPreference: true }
        );
      } catch {
        // Best-effort: clearing our own stored preference is the important bit.
      }
      await this.sendSnapshot();
      vscode.window.showInformationMessage(
        'Anime Companion will use the VS Code default GitHub account for Copilot.'
      );
      return;
    }

    if (!pick.account) return;

    await this._storeCopilotAccountPreference({
      id: pick.account.id,
      label: pick.account.label,
    });

    try {
      await vscode.authentication.getSession(
        ChatManager.GITHUB_AUTH_PROVIDER,
        ChatManager.GITHUB_AUTH_SCOPES,
        {
          account: pick.account,
          createIfNone: {
            detail: `Anime Companion will use ${pick.account.label} for GitHub Copilot in this workspace.`,
          },
        }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showWarningMessage(
        `Saved the account choice, but GitHub auth permission failed: ${msg}`
      );
    }

    await this.sendSnapshot();
  }

  // Stage a code selection for the next message. The askSelection command
  // captures the current selection, opens the chat panel, and parks the
  // snapshot here until the user submits their question.
  stageSelection(filePath: string, text: string, languageId?: string): void {
    this._stagedSelection = { filePath, text, languageId };
    this._post({
      command: 'chat:stagedSelection',
      filePath,
      languageId,
      preview: text.length > 200 ? text.slice(0, 200) + '…' : text,
      size: text.length,
    });
  }

  clearStagedSelection(): void {
    this._stagedSelection = undefined;
    this._post({ command: 'chat:stagedSelection', filePath: null });
  }

  async searchFiles(query: string): Promise<void> {
    const results = await searchWorkspaceFiles(query);
    this._post({ command: 'chat:fileSearchResults', query, results });
  }

  // ───────────────────────────────────── helpers ─────────────────────────────────────

  private _reactToReply(replyText: string) {
    const cfg = vscode.workspace.getConfiguration('animeCompanion');
    if (!cfg.get<boolean>('chat.reactionsEnabled', true)) return;
    const { webviewMood, motion } = detectSentiment(replyText);
    this._post({ command: 'setMood', mood: webviewMood });
    if (motion !== 'Idle') {
      this._post({ command: 'playMotion', group: motion });
    }
  }

  private async _loadActiveOrCreate(providerId: ProviderId, model: string): Promise<ConversationFile> {
    const activeId = this._store.getActiveId();
    if (activeId) {
      const existing = await this._store.get(activeId);
      if (existing) return existing;
    }
    return this._store.create(providerId, model);
  }

  private _post(msg: any) {
    this._hostRef()?.postMessage(msg);
  }

  private async _recordChatProgress(quick: boolean): Promise<void> {
    await this._stats.recordChatPrompt(quick);
    const unlocked = await this._stats.tryUnlockByMetric('chat_prompt');
    const quests = await this._stats.tryCompleteQuestsByMetric('chat_prompt');
    await this._stats.tryUnlockNightOwl().then((def) => this._announceUnlocks(def ? [def] : []));
    this._announceUnlocks(unlocked);
    this._announceQuestCompletions(quests);
    this._refreshAchievementsData();
  }

  private async _recordSuccessfulProvider(providerId: ProviderId): Promise<void> {
    await this._stats.recordSuccessfulChatProvider(providerId);
    const polyglot = await this._stats.tryUnlockProviderPolyglot();
    this._announceUnlocks(polyglot ? [polyglot] : []);
    this._refreshAchievementsData();
  }

  private _announceUnlocks(unlocked: AchievementDef[]): void {
    if (!unlocked.length) return;
    for (const def of unlocked) {
      const template = getMessageBank().pickAchievement(def.id) ?? `🏆 ${def.title}`;
      this._post({ command: 'showMessage', text: template, speakText: template });
      this._post({ command: 'achievementUnlocked', achievement: { id: def.id, title: def.title, rarity: def.rarity, secret: def.secret } });
    }
  }

  private _announceQuestCompletions(quests: QuestDef[]): void {
    if (!quests.length) return;
    for (const quest of quests) {
      const text = `✅ ${quest.period === 'daily' ? 'Daily' : 'Weekly'} quest cleared: ${quest.title}`;
      this._post({ command: 'showMessage', text, speakText: text });
      this._post({ command: 'achievementUnlocked', quest: { id: quest.id, title: quest.title, period: quest.period, rarity: quest.period === 'daily' ? 'rare' : 'epic' } });
    }
  }

  private _refreshAchievementsData(): void {
    this._post({
      command: 'setAchievementsData',
      achievements: buildAchievementPanelData(this._stats.getStats()),
    });
  }

  private _chatConfigTarget(): vscode.ConfigurationTarget {
    return vscode.workspace.workspaceFolders?.length
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
  }

  private async _ensureCopilotAccountAccess(): Promise<void> {
    const preferred = this._getStoredCopilotAccountPreference();
    if (!preferred.id) return;

    const accounts = await this._getCopilotAccounts();
    const account = accounts.find((item) => item.id === preferred.id);
    if (!account) {
      await this._clearStoredCopilotAccountPreference();
      return;
    }

    await vscode.authentication.getSession(
      ChatManager.GITHUB_AUTH_PROVIDER,
      ChatManager.GITHUB_AUTH_SCOPES,
      {
        account,
        createIfNone: {
          detail: `Anime Companion will use ${account.label} for GitHub Copilot in this workspace.`,
        },
      }
    );
  }

  private async _getCopilotAccounts(): Promise<readonly vscode.AuthenticationSessionAccountInformation[]> {
    try {
      return await vscode.authentication.getAccounts(ChatManager.GITHUB_AUTH_PROVIDER);
    } catch {
      return [];
    }
  }

  private _getStoredCopilotAccountPreference(): CopilotAccountPreference {
    return this._context.workspaceState.get<CopilotAccountPreference>(
      ChatManager.COPILOT_ACCOUNT_KEY,
      {}
    );
  }

  private async _storeCopilotAccountPreference(value: CopilotAccountPreference): Promise<void> {
    await this._context.workspaceState.update(ChatManager.COPILOT_ACCOUNT_KEY, value);
  }

  private async _clearStoredCopilotAccountPreference(): Promise<void> {
    await this._context.workspaceState.update(ChatManager.COPILOT_ACCOUNT_KEY, undefined);
  }
}

// Pulls `#filename` tokens out of the user's prompt. The picker UI may already
// have added them to fileMentions explicitly, but plain text references like
// "what does #package.json mean" should also work.
function extractMentions(prompt: string): string[] {
  const out: string[] = [];
  const re = /(^|\s)#([\w./\\-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt)) !== null) {
    const value = m[2];
    if (value) out.push(value);
  }
  return out;
}

// Interactive command flow: pick a provider, then either paste an API key
// (BYOK providers) or set an endpoint URL (Ollama). Copilot is omitted because
// it authenticates through vscode.lm — no configuration step on our side.
export async function runSetApiKeyCommand(secrets: ChatSecrets): Promise<void> {
  const configurable = PROVIDER_INFO.filter((p) => p.id !== 'copilot').map((p) => ({
    label: p.label,
    description: p.keyHint,
    id: p.id,
  }));

  const pick = await vscode.window.showQuickPick(configurable, {
    placeHolder: 'Pick the provider you want to configure',
    title: 'Anime Companion: Configure Chat Provider',
  });
  if (!pick) return;

  if (pick.id === 'ollama') {
    await configureOllamaEndpoint();
    return;
  }

  const value = await vscode.window.showInputBox({
    prompt: `Paste your ${pick.label} API key. It will be stored in VS Code's encrypted secret storage.`,
    placeHolder: pick.description,
    password: true,
    ignoreFocusOut: true,
    validateInput: (v) => (v && v.trim().length >= 8 ? null : 'Key looks too short.'),
  });
  if (value === undefined) return;

  const trimmed = value.trim();
  if (!trimmed) {
    await secrets.clear(pick.id);
    vscode.window.showInformationMessage(`Cleared API key for ${pick.label}.`);
    return;
  }

  await secrets.set(pick.id, trimmed);
  // Don't auto-switch the active provider. The user's default is Copilot
  // (since every VS Code user already has a GitHub account); they should
  // pick the BYOK provider explicitly from the chat dropdown when they
  // want to use it. Auto-switching here would silently move them off
  // Copilot the first time they curiously paste a key.
  vscode.window.showInformationMessage(
    `Saved API key for ${pick.label}. Pick "${pick.label}" from the chat panel's provider dropdown when you want to use it.`
  );
}

async function configureOllamaEndpoint(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('animeCompanion');
  const current = cfg.get<string>('chat.ollamaEndpoint', 'http://localhost:11434');

  const next = await vscode.window.showInputBox({
    prompt: 'Ollama server endpoint. Do NOT include /api/chat — the path is appended automatically.',
    value: current,
    placeHolder: 'http://localhost:11434',
    ignoreFocusOut: true,
    validateInput: (v) =>
      v && /^https?:\/\/.+/.test(v.trim()) ? null : 'Must start with http:// or https://',
  });
  if (next === undefined) return;

  const normalized = next.trim().replace(/\/+$/, '');
  await cfg.update('chat.ollamaEndpoint', normalized, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(
    `Ollama endpoint saved: ${normalized}. Pick "Ollama" from the chat panel's provider dropdown to use it.`
  );
}
