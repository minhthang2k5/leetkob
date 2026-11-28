import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_LAB_COST_CAP_USD,
  DEFAULT_TIMEOUT_MS,
  loadCheckerConfig
} from '../src/config';

describe('loadCheckerConfig', () => {
  it('returns safe defaults when env vars are empty', () => {
    const cfg = loadCheckerConfig({});
    expect(cfg.provider).toBe('auto');
    expect(cfg.modelOff).toBe(false);
    expect(cfg.labCapUsd).toBe(DEFAULT_LAB_COST_CAP_USD);
    expect(cfg.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
    expect(cfg.delayMs).toBeUndefined();
    expect(cfg.maxRetries).toBe(3);
    expect(cfg.retryDelayMs).toBe(15_000);
    expect(cfg.anthropicModel).toBe(DEFAULT_ANTHROPIC_MODEL);
    expect(cfg.geminiModel).toBe(DEFAULT_GEMINI_MODEL);
  });

  it('reads custom values from env and ignores invalid numeric strings', () => {
    const cfg = loadCheckerConfig({
      MODEL_OFF: '1',
      CHECKER_PROVIDER: 'gemini',
      CHECKER_LAB_COST_CAP_USD: '5.5',
      CHECKER_TIMEOUT_MS: '45000',
      CHECKER_DELAY_MS: '2000',
      CHECKER_MAX_RETRIES: '2',
      CHECKER_RETRY_DELAY_MS: 'not-a-number',
      GEMINI_MODEL: 'gemini-2.5-flash-lite',
      ANTHROPIC_MODEL: 'claude-haiku-4-5-20251001'
    });

    expect(cfg.modelOff).toBe(true);
    expect(cfg.provider).toBe('gemini');
    expect(cfg.labCapUsd).toBe(5.5);
    expect(cfg.timeoutMs).toBe(45_000);
    expect(cfg.delayMs).toBe(2000);
    expect(cfg.maxRetries).toBe(2);
    expect(cfg.retryDelayMs).toBe(15_000);
    expect(cfg.geminiModel).toBe('gemini-2.5-flash-lite');
    expect(cfg.anthropicModel).toBe('claude-haiku-4-5-20251001');
  });
});
