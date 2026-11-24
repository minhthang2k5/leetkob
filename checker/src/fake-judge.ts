import type { ModelCallLog, SemanticJudge, SemanticRequest } from '@leetkob/shared';
import { splitLines } from './preprocess';

export type FakeJudgeMode = 'valid' | 'invalid-json' | 'slow' | 'wrong-evidence';

export interface FakeJudgeOptions {
  mode: FakeJudgeMode;
  /** Delay in ms used in 'slow' mode (defaults to timeoutMs + 50). */
  delayMs?: number;
}

/**
 * Deterministic test double for `SemanticJudge` supporting the 4 modes specified
 * in `docs/contract/pa3-interfaces.md` (A.3): `valid`, `invalid-json`, `slow`, `wrong-evidence`.
 */
export class FakeJudge implements SemanticJudge {
  private readonly mode: FakeJudgeMode;
  private readonly delayMs?: number;
  public callsCount = 0;

  constructor(opts: FakeJudgeOptions) {
    this.mode = opts.mode;
    this.delayMs = opts.delayMs;
  }

  async judge(
    req: SemanticRequest,
    opts: { timeoutMs: number }
  ): Promise<{ raw: unknown; call: ModelCallLog }> {
    this.callsCount += 1;
    const start = Date.now();
    const prompt = JSON.stringify({
      statement: req.statement,
      constraints: req.constraints.map((c) => ({ code: c.code, text: c.text })),
      code: req.code
    });

    if (this.mode === 'slow') {
      const waitMs = this.delayMs ?? opts.timeoutMs + 50;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return {
        raw: null,
        call: {
          provider: 'fake',
          model: 'fake-judge-slow',
          requestId: null,
          inputTokens: 0,
          outputTokens: 0,
          ms: Date.now() - start,
          costUsd: 0,
          status: 'TIMEOUT',
          prompt
        }
      };
    }

    if (this.mode === 'invalid-json') {
      return {
        raw: '{ invalid json or missing schema fields',
        call: {
          provider: 'fake',
          model: 'fake-judge-invalid',
          requestId: 'fake-req-invalid',
          inputTokens: 10,
          outputTokens: 5,
          ms: Date.now() - start,
          costUsd: 0,
          status: 'OK',
          prompt
        }
      };
    }

    const lines = splitLines(req.code);
    const firstNonEmptyIdx = lines.findIndex((l) => l.trim().length > 0);
    const validLineNum = firstNonEmptyIdx >= 0 ? firstNonEmptyIdx + 1 : 1;
    const validLineText = (lines[validLineNum - 1] ?? '').trim();

    if (this.mode === 'wrong-evidence') {
      return {
        raw: {
          verdicts: req.constraints.map((c) => ({
            constraintCode: c.code,
            verdict: 'VIOLATION',
            evidence: [
              {
                line: lines.length + 10,
                text: 'non_existent_code_line();'
              }
            ],
            reason: 'Fake wrong evidence'
          }))
        },
        call: {
          provider: 'fake',
          model: 'fake-judge-wrong-evidence',
          requestId: 'fake-req-wrong-ev',
          inputTokens: 15,
          outputTokens: 10,
          ms: Date.now() - start,
          costUsd: 0,
          status: 'OK',
          prompt
        }
      };
    }

    // 'valid' mode: return valid PASS verdicts with real evidence from `req.code`
    return {
      raw: {
        verdicts: req.constraints.map((c) => ({
          constraintCode: c.code,
          verdict: 'PASS',
          evidence: validLineText ? [{ line: validLineNum, text: validLineText }] : [],
          reason: null
        }))
      },
      call: {
        provider: 'fake',
        model: 'fake-judge-valid',
        requestId: 'fake-req-valid',
        inputTokens: 20,
        outputTokens: 12,
        ms: Date.now() - start,
        costUsd: 0,
        status: 'OK',
        prompt
      }
    };
  }
}
