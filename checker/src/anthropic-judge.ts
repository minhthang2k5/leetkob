import Anthropic from '@anthropic-ai/sdk';
import type { ModelCallLog, SemanticJudge, SemanticRequest } from '@leetkob/shared';
import {
  buildAnonymizedPrompt,
  isAbortTimeoutError,
  parseJsonResponseText,
  SYSTEM_PROMPT
} from './prompt';

export { buildAnonymizedPrompt } from './prompt';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250929';
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

interface ModelPricing {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-5-20250929': { inputPerMillionUsd: 3, outputPerMillionUsd: 15 },
  'claude-sonnet-4-20250514': { inputPerMillionUsd: 3, outputPerMillionUsd: 15 },
  'claude-haiku-4-5-20251001': { inputPerMillionUsd: 1, outputPerMillionUsd: 5 },
  'claude-opus-4-5-20251101': { inputPerMillionUsd: 5, outputPerMillionUsd: 25 }
};

export interface AnthropicMessagesResponse {
  id?: string | null;
  _request_id?: string | null;
  content: Array<{ type: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export interface AnthropicClientLike {
  messages: {
    create(
      params: {
        model: string;
        max_tokens: number;
        temperature?: number;
        system: string;
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      },
      options?: { signal?: AbortSignal }
    ): Promise<AnthropicMessagesResponse>;
  };
}

export interface AnthropicJudgeOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  client?: AnthropicClientLike;
}

export function calculateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING[DEFAULT_ANTHROPIC_MODEL];
  const cost =
    (inputTokens / 1_000_000) * pricing.inputPerMillionUsd +
    (outputTokens / 1_000_000) * pricing.outputPerMillionUsd;
  return Number(cost.toFixed(8));
}

/**
 * Anthropic Claude adapter implementing `SemanticJudge`.
 * Builds an anonymized prompt, enforces `timeoutMs` via `AbortController`,
 * and records token usage, `requestId`, and `costUsd` in `ModelCallLog`.
 */
export class AnthropicJudge implements SemanticJudge {
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly client: AnthropicClientLike;

  constructor(opts: AnthropicJudgeOptions = {}) {
    this.model = opts.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
    this.maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;

    if (opts.client) {
      this.client = opts.client;
    } else {
      const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is required when using AnthropicJudge');
      }
      this.client = new Anthropic({ apiKey }) as unknown as AnthropicClientLike;
    }
  }

  async judge(
    req: SemanticRequest,
    opts: { timeoutMs: number }
  ): Promise<{ raw: unknown; call: ModelCallLog }> {
    const start = Date.now();
    const prompt = buildAnonymizedPrompt(req);
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: this.maxTokens,
          temperature: 0,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }]
        },
        { signal: controller.signal }
      );

      const inputTokens = response.usage?.input_tokens ?? 0;
      const outputTokens = response.usage?.output_tokens ?? 0;
      const requestId = response._request_id ?? response.id ?? null;
      const text = response.content
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text as string)
        .join('\n');

      return {
        raw: parseJsonResponseText(text),
        call: {
          provider: 'anthropic',
          model: this.model,
          requestId,
          inputTokens,
          outputTokens,
          ms: Date.now() - start,
          costUsd: calculateCostUsd(this.model, inputTokens, outputTokens),
          status: 'OK',
          prompt
        }
      };
    } catch (err) {
      return {
        raw: null,
        call: {
          provider: 'anthropic',
          model: this.model,
          requestId: null,
          inputTokens: 0,
          outputTokens: 0,
          ms: Date.now() - start,
          costUsd: 0,
          status: isAbortTimeoutError(err, controller) ? 'TIMEOUT' : 'API_ERROR',
          prompt
        }
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
