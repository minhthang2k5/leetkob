type ScanState =
  'NORMAL' | 'IN_STRING' | 'IN_CHAR' | 'IN_RAW_STRING' | 'LINE_COMMENT' | 'BLOCK_COMMENT';

const STRING_PREFIXES = new Set(['u8', 'u', 'U', 'L']);

function isIdentChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_]/.test(ch);
}

/**
 * Checks whether `code` at index `i` starts a C++ raw string literal (`R"delim(...)delim"`
 * or prefixed `u8R"..."`, `uR"..."`, `UR"..."`, `LR"..."`).
 * Returns the closing delimiter `)<delim>"` and index after the opening `(` if matched.
 */
function matchRawStringStart(
  code: string,
  i: number
): { endMarker: string; bodyStart: number } | null {
  if (code[i] !== 'R' || code[i + 1] !== '"') return null;

  // Verify `R` is not part of a larger identifier unless it is a valid string prefix.
  const prev1 = i >= 1 ? code[i - 1] : undefined;
  if (isIdentChar(prev1)) {
    const two = i >= 2 ? code.slice(i - 2, i) : '';
    const one = prev1 ?? '';
    const prefixLen =
      two === 'u8' && !isIdentChar(code[i - 3])
        ? 2
        : STRING_PREFIXES.has(one) && !isIdentChar(code[i - 2])
          ? 1
          : 0;
    if (prefixLen === 0) return null;
  }

  // C++ raw string delimiter: up to 16 chars, no whitespace, backslash, or parentheses.
  let j = i + 2;
  while (j < code.length && j - (i + 2) <= 16) {
    const c = code[j];
    if (c === '(') {
      const delim = code.slice(i + 2, j);
      return { endMarker: `)${delim}"`, bodyStart: j + 1 };
    }
    if (c === ')' || c === '\\' || /\s/.test(c)) {
      return null;
    }
    j += 1;
  }
  return null;
}

/**
 * Removes all C++ `//...` and `/*...*\/` comments while preserving string/char/raw-string
 * literals and keeping the exact number of lines and 1-based line positions.
 */
export function stripCommentsKeepLines(code: string): string {
  const out: string[] = [];
  let state: ScanState = 'NORMAL';
  let rawEndMarker = '';
  let blockHasNewline = false;
  let i = 0;

  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];

    if (state === 'NORMAL') {
      const raw = matchRawStringStart(code, i);
      if (raw) {
        out.push(code.slice(i, raw.bodyStart));
        rawEndMarker = raw.endMarker;
        state = 'IN_RAW_STRING';
        i = raw.bodyStart;
        continue;
      }

      if (ch === '/' && next === '/') {
        state = 'LINE_COMMENT';
        i += 2;
        continue;
      }

      if (ch === '/' && next === '*') {
        state = 'BLOCK_COMMENT';
        blockHasNewline = false;
        i += 2;
        continue;
      }

      if (ch === '"') {
        state = 'IN_STRING';
      } else if (ch === "'") {
        state = 'IN_CHAR';
      }

      out.push(ch);
      i += 1;
      continue;
    }

    if (state === 'IN_STRING' || state === 'IN_CHAR') {
      out.push(ch);
      if (ch === '\\' && next !== undefined) {
        out.push(next);
        i += 2;
        continue;
      }
      if ((state === 'IN_STRING' && ch === '"') || (state === 'IN_CHAR' && ch === "'")) {
        state = 'NORMAL';
      }
      i += 1;
      continue;
    }

    if (state === 'IN_RAW_STRING') {
      if (code.startsWith(rawEndMarker, i)) {
        out.push(rawEndMarker);
        i += rawEndMarker.length;
        state = 'NORMAL';
        continue;
      }
      out.push(ch);
      i += 1;
      continue;
    }

    if (state === 'LINE_COMMENT') {
      if (ch === '\r' && next === '\n') {
        out.push('\r\n');
        i += 2;
        state = 'NORMAL';
        continue;
      }
      if (ch === '\n') {
        out.push('\n');
        i += 1;
        state = 'NORMAL';
        continue;
      }
      i += 1;
      continue;
    }

    // BLOCK_COMMENT
    if (ch === '*' && next === '/') {
      // Avoid merging adjacent tokens on the same line (e.g., `int/*c*/x` -> `int x`).
      if (!blockHasNewline) {
        out.push(' ');
      }
      i += 2;
      state = 'NORMAL';
      continue;
    }
    if (ch === '\n') {
      out.push('\n');
      blockHasNewline = true;
    }
    i += 1;
  }

  return out.join('');
}

/**
 * Splits source code into 0-indexed lines (1-based line `n` is `lines[n - 1]`),
 * normalizing CRLF to LF.
 */
export function splitLines(code: string): string[] {
  return code.replace(/\r\n/g, '\n').split('\n');
}
