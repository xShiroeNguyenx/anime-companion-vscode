import type { ProviderId } from './secrets';

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface SendOptions {
  // Empty string is fine for providers that don't need a key (Copilot).
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface StreamUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface StreamResult {
  // Reported by providers that send usage in a trailing event (Anthropic
  // message_delta, OpenAI final chunk with usage, Gemini usageMetadata).
  usage?: StreamUsage;
}

export interface LLMProvider {
  readonly id: ProviderId;
  readonly defaultModel: string;
  // True for cloud BYOK providers; false for Copilot which authenticates
  // through VS Code's built-in language model API and uses the user's
  // existing Copilot subscription instead of a per-call API key.
  readonly requiresApiKey: boolean;

  // Yields response text fragments as they arrive. The returned object is
  // populated with usage info (when available) once the stream ends — read
  // it after the consumer's `for await` finishes.
  sendStream(opts: SendOptions): { stream: AsyncIterable<string>; result: StreamResult };
}

import { AnthropicProvider } from './providers/anthropic';
import { OpenAIProvider } from './providers/openai';
import { GeminiProvider } from './providers/gemini';
import { CopilotProvider } from './providers/copilot';

const PROVIDERS: Record<ProviderId, LLMProvider> = {
  anthropic: new AnthropicProvider(),
  openai: new OpenAIProvider(),
  gemini: new GeminiProvider(),
  copilot: new CopilotProvider(),
};

export function getProvider(id: ProviderId): LLMProvider {
  return PROVIDERS[id];
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  defaultModel: string;
  modelExamples: string[];
  keyHint: string;
  requiresApiKey: boolean;
  notes?: string;
}

export const PROVIDER_INFO: ProviderInfo[] = [
  {
    id: 'copilot',
    label: 'GitHub Copilot (Recommend)',
    defaultModel: 'gpt-4o',
    modelExamples: ['gpt-4o', 'gpt-4o-mini', 'claude-3.5-sonnet', 'claude-3.7-sonnet', 'gemini-1.5-pro', 'o1-mini'],
    keyHint: 'Uses your existing Copilot subscription via VS Code',
    requiresApiKey: false,
    notes: 'Requires GitHub Copilot subscription and being signed in. VS Code will ask for permission on first use.',
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude) — BYOK',
    defaultModel: 'claude-haiku-4-5-20251001',
    modelExamples: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    keyHint: 'sk-ant-… — generate at console.anthropic.com',
    requiresApiKey: true,
  },
  {
    id: 'openai',
    label: 'OpenAI (GPT) — BYOK',
    defaultModel: 'gpt-4o-mini',
    modelExamples: ['gpt-4o', 'gpt-4o-mini', 'o1-mini'],
    keyHint: 'sk-… — generate at platform.openai.com',
    requiresApiKey: true,
  },
  {
    id: 'gemini',
    label: 'Google Gemini — BYOK (free tier available)',
    defaultModel: 'gemini-2.5-flash',
    modelExamples: [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash',
    ],
    keyHint: 'AIza… — generate at aistudio.google.com/apikey',
    requiresApiKey: true,
  },
];
