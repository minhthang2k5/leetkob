import { describe, expect, it } from 'vitest';
import type { SemanticRequest } from '@leetkob/shared';
import {
  AnthropicJudge,
  buildAnonymizedPrompt,
  calculateCostUsd,
  DEFAULT_ANTHROPIC_MODEL,
  stripCommentsKeepLines
} from '../src';
import type { AnthropicClientLike } from '../src';

function makeRequest(): SemanticRequest {
  const rawCode = [
    '// Student: Tran Van B - 23129999',
    'int fib(int n) {',
    '  if (n <= 1) return n;',
    '  return fib(n - 1) + fib(n - 2);',
    '}'
  ].join('\n');

  return {
    statement: 'Implement Fibonacci recursively.',
    constraints: [{ id: 'c1', code: 'C1', text: 'Must use recursion.' }],
    code: stripCommentsKeepLines(rawCode)
  };
}

describe('AnthropicJudge (mocked SDK client, no network)', () => {
  it('builds anonymized prompt with numbered code and no comments', () => {
    const req = makeRequest();
    const prompt = buildAnonymizedPrompt(req);

    expect(prompt).not.toContain('Tran Van B');
    expect(prompt).not.toContain('23129999');
    expect(prompt).toContain('1: ');
    expect(prompt).toContain('2: int fib(int n) {');
    expect(prompt).toContain('- C1: Must use recursion.');
  });

  it('parses JSON response, records requestId, tokens, and costUsd', async () => {
    let capturedSystem = '';
    const mockClient: AnthropicClientLike = {
      messages: {
        create: async (params) => {
          capturedSystem = params.system;
          return {
            id: 'msg_01ABC123',
            content: [
              {
                type: 'text',
                text: '```json\n{"verdicts":[{"constraintCode":"C1","verdict":"PASS","evidence":[{"line":4,"text":"return fib(n - 1) + fib(n - 2);"}],"reason":null}]}\n```'
              }
            ],
            usage: { input_tokens: 500, output_tokens: 100 }
          };
        }
      }
    };

    const judge = new AnthropicJudge({
      client: mockClient,
      model: DEFAULT_ANTHROPIC_MODEL
    });

    const { raw, call } = await judge.judge(makeRequest(), { timeoutMs: 5000 });

    expect(capturedSystem).toContain('UNTRUSTED DATA');
    expect(call.provider).toBe('anthropic');
    expect(call.model).toBe(DEFAULT_ANTHROPIC_MODEL);
    expect(call.requestId).toBe('msg_01ABC123');
    expect(call.inputTokens).toBe(500);
    expect(call.outputTokens).toBe(100);
    expect(call.costUsd).toBe(calculateCostUsd(DEFAULT_ANTHROPIC_MODEL, 500, 100));
    expect(call.status).toBe('OK');
    expect(raw).toEqual({
      verdicts: [
        {
          constraintCode: 'C1',
          verdict: 'PASS',
          evidence: [{ line: 4, text: 'return fib(n - 1) + fib(n - 2);' }],
          reason: null
        }
      ]
    });
  });

  it('returns status TIMEOUT when request exceeds timeoutMs without throwing', async () => {
    const mockClient: AnthropicClientLike = {
      messages: {
        create: (_params, options) =>
          new Promise((_, reject) => {
            options?.signal?.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          })
      }
    };

    const judge = new AnthropicJudge({ client: mockClient });
    const { raw, call } = await judge.judge(makeRequest(), { timeoutMs: 20 });

    expect(raw).toBeNull();
    expect(call.status).toBe('TIMEOUT');
    expect(call.requestId).toBeNull();
    expect(call.costUsd).toBe(0);
  });

  it('returns status API_ERROR when SDK throws a provider error without crashing', async () => {
    const mockClient: AnthropicClientLike = {
      messages: {
        create: async () => {
          throw new Error('500 Internal Server Error');
        }
      }
    };

    const judge = new AnthropicJudge({ client: mockClient });
    const { raw, call } = await judge.judge(makeRequest(), { timeoutMs: 5000 });

    expect(raw).toBeNull();
    expect(call.status).toBe('API_ERROR');
    expect(call.requestId).toBeNull();
  });
});
