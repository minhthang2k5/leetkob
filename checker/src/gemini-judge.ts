import type { ModelCallLog, SemanticJudge, SemanticRequest } from '@leetkob/shared';
import {
  buildAnonymizedPrompt,
  isAbortTimeoutError,
  parseJsonResponseText,
  SYSTEM_PROMPT
} from './prompt';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    verdicts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          constraintCode: { type: 'STRING' },
          verdict: { type: 'STRING', enum: ['PASS', 'VIOLATION', 'UNSURE'] },
          evidence: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                line: { type: 'INTEGER' },
                text: { type: 'STRING' }
              },
              required: ['line', 'text']
            }
          },
          reason: { type: 'STRING', nullable: true }
        },
        required: ['constraintCode', 'verdict', 'evidence', 'reason']
      }
    }
  },
  required: ['verdicts']
};

interface GeminiPricing {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

const GEMINI_PRICING: Record<string, GeminiPricing> = {
  'gemini-2.5-flash': { inputPerMillionUsd: 0.3, outputPerMillionUsd: 2.5 },
  'gemini-2.5-flash-lite': { inputPerMillionUsd: 0.1, outputPerMillionUsd: 0.4 },
  'gemini-2.0-flash': { inputPerMillionUsd: 0.1, outputPerMillionUsd: 0.4 }
};

export interface GeminiApiResponse {
  responseId?: string;
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

export type FetchLike = typeof fetch;

export interface GeminiJudgeOptions {
  apiKey?: string;
  model?: string;
  maxOutputTokens?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  fetchFn?: FetchLike;
}

export function calculateGeminiCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = GEMINI_PRICING[model] ?? GEMINI_PRICING[DEFAULT_GEMINI_MODEL];
  const cost =
    (inputTokens / 1_000_000) * pricing.inputPerMillionUsd +
    (outputTokens / 1_000_000) * pricing.outputPerMillionUsd;
  return Number(cost.toFixed(8));
}

/**
 * Google Gemini REST adapter implementing `SemanticJudge` (zero extra dependencies).
 * Works with free-tier Google AI Studio API keys (`GEMINI_API_KEY`).
 */
export class GeminiJudge implements SemanticJudge {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxOutputTokens: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly fetchFn: FetchLike;

  constructor(opts: GeminiJudgeOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required when using GeminiJudge');
    }
    this.apiKey = apiKey;
    this.model = opts.model ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
    this.maxOutputTokens = opts.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
    this.maxRetries = opts.maxRetries ?? 0;
    this.retryDelayMs = opts.retryDelayMs ?? 10_000;
    this.fetchFn = opts.fetchFn ?? globalThis.fetch;
  }

  private async fetchWithRetry(
    url: string,
    body: string,
    signal: AbortSignal,
    attempt: number
  ): Promise<Response> {
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body
    });

    if (res.status !== 429 || attempt >= this.maxRetries) {
      if (!res.ok && process.env.NODE_ENV !== 'test') {
        const errText = await res.text().catch(() => '');
        console.error(
          `[gemini] HTTP ${res.status}: ${errText.slice(0, 160).replaceAll(/\s+/g, ' ')}`
        );
      }
      return res;
    }

    const retryAfterSec = Number(res.headers.get('retry-after') ?? '0');
    const waitMs =
      retryAfterSec > 0 ? retryAfterSec * 1000 : this.retryDelayMs * (attempt + 1);
    if (process.env.NODE_ENV !== 'test') {
      console.error(
        `[gemini] HTTP 429 rate-limit, waiting ${Math.round(waitMs / 1000)}s (retry ${attempt + 1}/${this.maxRetries})...`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return this.fetchWithRetry(url, body, signal, attempt + 1);
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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: this.maxOutputTokens,
        responseMimeType: 'application/json',
        responseSchema: GEMINI_RESPONSE_SCHEMA
      }
    });

    try {
      const res = await this.fetchWithRetry(url, body, controller.signal, 0);

      if (!res.ok) {
        return {
          raw: null,
          call: {
            provider: 'gemini',
            model: this.model,
            requestId: res.headers.get('x-goog-request-id') ?? null,
            inputTokens: 0,
            outputTokens: 0,
            ms: Date.now() - start,
            costUsd: 0,
            status: 'API_ERROR',
            prompt
          }
        };
      }

      const data = (await res.json()) as GeminiApiResponse;
      const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
      const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
      const requestId = data.responseId ?? res.headers.get('x-goog-request-id') ?? null;
      const text =
        data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('\n') ?? '';

      return {
        raw: parseJsonResponseText(text),
        call: {
          provider: 'gemini',
          model: this.model,
          requestId,
          inputTokens,
          outputTokens,
          ms: Date.now() - start,
          costUsd: calculateGeminiCostUsd(this.model, inputTokens, outputTokens),
          status: 'OK',
          prompt
        }
      };
    } catch (err) {
      return {
        raw: null,
        call: {
          provider: 'gemini',
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
