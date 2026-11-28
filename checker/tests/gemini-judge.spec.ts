import { describe, expect, it } from 'vitest';
import type { SemanticRequest } from '@leetkob/shared';
import {
  calculateGeminiCostUsd,
  DEFAULT_GEMINI_MODEL,
  GeminiJudge,
  stripCommentsKeepLines
} from '../src';
import type { FetchLike } from '../src';

function makeRequest(): SemanticRequest {
  const rawCode = [
    '// Student: Le Van C - 23121234',
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

describe('GeminiJudge (mocked fetch, no network)', () => {
  it('parses JSON response, records requestId, tokens, and costUsd', async () => {
    let capturedBody = '';
    const mockFetch: FetchLike = async (_url, init) => {
      capturedBody = String(init?.body ?? '');
      return new Response(
        JSON.stringify({
          responseId: 'gem_resp_001',
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '{"verdicts":[{"constraintCode":"C1","verdict":"PASS","evidence":[{"line":4,"text":"return fib(n - 1) + fib(n - 2);"}],"reason":null}]}'
                  }
                ]
              }
            }
          ],
          usageMetadata: { promptTokenCount: 400, candidatesTokenCount: 80 }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const judge = new GeminiJudge({
      apiKey: 'test-gemini-key',
      model: DEFAULT_GEMINI_MODEL,
      fetchFn: mockFetch
    });

    const { raw, call } = await judge.judge(makeRequest(), { timeoutMs: 5000 });

    expect(capturedBody).not.toContain('Le Van C');
    expect(capturedBody).toContain('UNTRUSTED DATA');
    expect(call.provider).toBe('gemini');
    expect(call.model).toBe(DEFAULT_GEMINI_MODEL);
    expect(call.requestId).toBe('gem_resp_001');
    expect(call.inputTokens).toBe(400);
    expect(call.outputTokens).toBe(80);
    expect(call.costUsd).toBe(calculateGeminiCostUsd(DEFAULT_GEMINI_MODEL, 400, 80));
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

  it('returns status TIMEOUT when fetch is aborted by timeoutMs', async () => {
    const mockFetch: FetchLike = (_url, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });

    const judge = new GeminiJudge({
      apiKey: 'test-gemini-key',
      fetchFn: mockFetch
    });
    const { raw, call } = await judge.judge(makeRequest(), { timeoutMs: 20 });

    expect(raw).toBeNull();
    expect(call.status).toBe('TIMEOUT');
    expect(call.costUsd).toBe(0);
  });

  it('returns status API_ERROR on non-OK HTTP response without crashing', async () => {
    const mockFetch: FetchLike = async () =>
      new Response('Quota exceeded', {
        status: 429,
        headers: { 'x-goog-request-id': 'req-429' }
      });

    const judge = new GeminiJudge({
      apiKey: 'test-gemini-key',
      fetchFn: mockFetch
    });
    const { raw, call } = await judge.judge(makeRequest(), { timeoutMs: 5000 });

    expect(raw).toBeNull();
    expect(call.status).toBe('API_ERROR');
    expect(call.requestId).toBe('req-429');
  });
});
