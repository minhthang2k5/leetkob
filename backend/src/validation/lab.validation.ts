import { ProblemErrorDetail } from '../types/problem';

// Limits from docs/contract/pa3-interfaces.md, B.4 and B.5.
export const LAB_LIMITS = {
  title: 200,
  statement: 50_000,
  tests: 50,
  testFieldBytes: 64 * 1024,
  constraints: 20,
  constraintCode: 16,
  constraintText: 2_000,
  deduction: 100
} as const;

export const SUBMISSION_CODE_BYTES = 64 * 1024;

export interface NewLab {
  title: string;
  statement: string;
  tests: { input: string; expectedOutput: string }[];
  constraints: { code: string; text: string; deduction: number }[];
}

type Result<T> = { ok: true; value: T } | { ok: false; errors: ProblemErrorDetail[] };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function text(
  errors: ProblemErrorDetail[],
  pointer: string,
  value: unknown,
  min: number,
  max: number
): string {
  if (typeof value !== 'string') {
    errors.push({ pointer, detail: 'Must be a string.' });
    return '';
  }
  if (value.trim().length < min) errors.push({ pointer, detail: 'Must not be empty.' });
  else if (value.length > max)
    errors.push({ pointer, detail: `At most ${max} characters.` });
  return value;
}

function bytes(
  errors: ProblemErrorDetail[],
  pointer: string,
  value: unknown,
  max: number
) {
  if (typeof value !== 'string') {
    errors.push({ pointer, detail: 'Must be a string.' });
    return '';
  }
  if (Buffer.byteLength(value, 'utf8') > max) {
    errors.push({ pointer, detail: `At most ${max / 1024} KB.` });
  }
  return value;
}

function list(
  errors: ProblemErrorDetail[],
  pointer: string,
  value: unknown,
  max: number
): unknown[] {
  if (!Array.isArray(value)) {
    errors.push({ pointer, detail: 'Must be an array.' });
    return [];
  }
  if (value.length < 1) errors.push({ pointer, detail: 'Must have at least 1 item.' });
  if (value.length > max) errors.push({ pointer, detail: `At most ${max} items.` });
  return value.slice(0, max);
}

export function validateNewLab(body: unknown): Result<NewLab> {
  if (!isObject(body)) {
    return {
      ok: false,
      errors: [{ pointer: '', detail: 'Body must be a JSON object.' }]
    };
  }
  const errors: ProblemErrorDetail[] = [];
  const L = LAB_LIMITS;

  const title = text(errors, '/title', body.title, 1, L.title);
  const statement = text(errors, '/statement', body.statement, 1, L.statement);

  const tests = list(errors, '/tests', body.tests, L.tests).map((t, i) => {
    const p = `/tests/${i}`;
    if (!isObject(t)) {
      errors.push({ pointer: p, detail: 'Must be an object.' });
      return { input: '', expectedOutput: '' };
    }
    return {
      input: bytes(errors, `${p}/input`, t.input, L.testFieldBytes),
      expectedOutput: bytes(
        errors,
        `${p}/expectedOutput`,
        t.expectedOutput,
        L.testFieldBytes
      )
    };
  });

  const seen = new Set<string>();
  const constraints = list(errors, '/constraints', body.constraints, L.constraints).map(
    (c, i) => {
      const p = `/constraints/${i}`;
      if (!isObject(c)) {
        errors.push({ pointer: p, detail: 'Must be an object.' });
        return { code: '', text: '', deduction: 0 };
      }
      const code = text(errors, `${p}/code`, c.code, 1, L.constraintCode);
      if (code && seen.has(code)) {
        errors.push({ pointer: `${p}/code`, detail: `Code "${code}" is used twice.` });
      }
      seen.add(code);
      const d = c.deduction;
      if (typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > L.deduction) {
        errors.push({
          pointer: `${p}/deduction`,
          detail: `Must be an integer from 0 to ${L.deduction}.`
        });
      }
      return {
        code,
        text: text(errors, `${p}/text`, c.text, 1, L.constraintText),
        deduction: typeof d === 'number' ? d : 0
      };
    }
  );

  return errors.length
    ? { ok: false, errors }
    : { ok: true, value: { title, statement, tests, constraints } };
}

export function validateNewSubmission(body: unknown): Result<{ code: string }> {
  if (!isObject(body)) {
    return {
      ok: false,
      errors: [{ pointer: '', detail: 'Body must be a JSON object.' }]
    };
  }
  const errors: ProblemErrorDetail[] = [];
  const code = body.code;
  if (typeof code !== 'string' || code.trim().length === 0) {
    errors.push({ pointer: '/code', detail: 'Must be a non-blank string.' });
  } else if (Buffer.byteLength(code, 'utf8') > SUBMISSION_CODE_BYTES) {
    errors.push({ pointer: '/code', detail: 'At most 64 KB.' });
  }
  return errors.length
    ? { ok: false, errors }
    : { ok: true, value: { code: code as string } };
}
