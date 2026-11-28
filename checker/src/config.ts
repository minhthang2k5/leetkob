export type CheckerProvider = 'anthropic' | 'gemini' | 'auto';

export interface CheckerConfig {
  /** 'anthropic' | 'gemini' | 'auto' (auto picks based on available API key) */
  provider: CheckerProvider;
  /** True when MODEL_OFF=1 (offline mode: hard rules only, semantic -> UNSURE) */
  modelOff: boolean;
  /** Maximum spend per lab in USD before blocking further model calls */
  labCapUsd: number;
  /** Timeout per model call in milliseconds */
  timeoutMs: number;
  /** Delay between CLI model calls in milliseconds (helps avoid free-tier 429) */
  delayMs: number | undefined;
  /** Max retries on HTTP 429 for Gemini CLI runs */
  maxRetries: number;
  /** Base retry delay in milliseconds on HTTP 429 */
  retryDelayMs: number;
  anthropicApiKey: string | undefined;
  anthropicModel: string;
  geminiApiKey: string | undefined;
  geminiModel: string;
}

export const DEFAULT_LAB_COST_CAP_USD = 3.0;
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250929';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const DEFAULT_GEMINI_CLI_DELAY_MS = 6_500;
export const DEFAULT_GEMINI_CLI_TIMEOUT_MS = 120_000;
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_RETRY_DELAY_MS = 15_000;

function parsePositiveNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseNonNegativeNumber(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function parseProvider(raw: string | undefined): CheckerProvider {
  const val = raw?.trim().toLowerCase();
  if (val === 'anthropic' || val === 'gemini') return val;
  return 'auto';
}

/**
 * Reads all checker configuration from environment variables with safe defaults.
 * Explicit function options (`opts.*`) or CLI flags always take precedence over env vars.
 */
export function loadCheckerConfig(env: NodeJS.ProcessEnv = process.env): CheckerConfig {
  return {
    provider: parseProvider(env.CHECKER_PROVIDER),
    modelOff: env.MODEL_OFF === '1',
    labCapUsd: parsePositiveNumber(
      env.CHECKER_LAB_COST_CAP_USD,
      DEFAULT_LAB_COST_CAP_USD
    ),
    timeoutMs: parsePositiveNumber(env.CHECKER_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    delayMs: parseNonNegativeNumber(env.CHECKER_DELAY_MS),
    maxRetries: parseNonNegativeNumber(env.CHECKER_MAX_RETRIES) ?? DEFAULT_MAX_RETRIES,
    retryDelayMs: parsePositiveNumber(env.CHECKER_RETRY_DELAY_MS, DEFAULT_RETRY_DELAY_MS),
    anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
    anthropicModel: env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
    geminiApiKey: env.GEMINI_API_KEY || undefined,
    geminiModel: env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
  };
}
