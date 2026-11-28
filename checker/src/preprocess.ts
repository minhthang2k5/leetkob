type ScanState =
  'NORMAL' | 'IN_STRING' | 'IN_CHAR' | 'IN_RAW_STRING' | 'LINE_COMMENT' | 'BLOCK_COMMENT';

interface ScanCursor {
  code: string;
  out: string[];
  state: ScanState;
  rawEndMarker: string;
  blockHasNewline: boolean;
  i: number;
}

const STRING_PREFIXES = new Set(['u8', 'u', 'U', 'L']);

function isIdentChar(ch: string | undefined): boolean {
  return ch !== undefined && /\w/.test(ch);
}

function hasValidRawStringPrefix(code: string, i: number): boolean {
  const prev1 = i >= 1 ? code[i - 1] : undefined;
  if (!isIdentChar(prev1)) return true;

  if (i >= 2 && code.slice(i - 2, i) === 'u8' && !isIdentChar(code[i - 3])) {
    return true;
  }
  return prev1 !== undefined && STRING_PREFIXES.has(prev1) && !isIdentChar(code[i - 2]);
}

/**
 * Checks whether `code` at index `i` starts a C++ raw string literal (`R"delim(...)delim"`
 * or prefixed `u8R"..."`, `uR"..."`, `UR"..."`, `LR"..."`).
 */
function matchRawStringStart(
  code: string,
  i: number
): { endMarker: string; bodyStart: number } | null {
  if (code[i] !== 'R' || code[i + 1] !== '"') return null;
  if (!hasValidRawStringPrefix(code, i)) return null;

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

function stepNormal(cur: ScanCursor): void {
  const ch = cur.code[cur.i];
  const next = cur.code[cur.i + 1];

  const raw = matchRawStringStart(cur.code, cur.i);
  if (raw) {
    cur.out.push(cur.code.slice(cur.i, raw.bodyStart));
    cur.rawEndMarker = raw.endMarker;
    cur.state = 'IN_RAW_STRING';
    cur.i = raw.bodyStart;
    return;
  }

  if (ch === '/' && next === '/') {
    cur.state = 'LINE_COMMENT';
    cur.i += 2;
    return;
  }

  if (ch === '/' && next === '*') {
    cur.state = 'BLOCK_COMMENT';
    cur.blockHasNewline = false;
    cur.i += 2;
    return;
  }

  if (ch === '"') cur.state = 'IN_STRING';
  else if (ch === "'") cur.state = 'IN_CHAR';

  cur.out.push(ch);
  cur.i += 1;
}

function stepQuoted(cur: ScanCursor, quote: '"' | "'"): void {
  const ch = cur.code[cur.i];
  const next = cur.code[cur.i + 1];
  cur.out.push(ch);

  if (ch === '\\' && next !== undefined) {
    cur.out.push(next);
    cur.i += 2;
    return;
  }
  if (ch === quote) {
    cur.state = 'NORMAL';
  }
  cur.i += 1;
}

function stepRawString(cur: ScanCursor): void {
  if (cur.code.startsWith(cur.rawEndMarker, cur.i)) {
    cur.out.push(cur.rawEndMarker);
    cur.i += cur.rawEndMarker.length;
    cur.state = 'NORMAL';
    return;
  }
  cur.out.push(cur.code[cur.i]);
  cur.i += 1;
}

function stepLineComment(cur: ScanCursor): void {
  const ch = cur.code[cur.i];
  const next = cur.code[cur.i + 1];
  if (ch === '\r' && next === '\n') {
    cur.out.push('\r\n');
    cur.i += 2;
    cur.state = 'NORMAL';
    return;
  }
  if (ch === '\n') {
    cur.out.push('\n');
    cur.i += 1;
    cur.state = 'NORMAL';
    return;
  }
  cur.i += 1;
}

function stepBlockComment(cur: ScanCursor): void {
  const ch = cur.code[cur.i];
  const next = cur.code[cur.i + 1];
  if (ch === '*' && next === '/') {
    if (!cur.blockHasNewline) cur.out.push(' ');
    cur.i += 2;
    cur.state = 'NORMAL';
    return;
  }
  if (ch === '\n') {
    cur.out.push('\n');
    cur.blockHasNewline = true;
  }
  cur.i += 1;
}

/**
 * Removes all C++ `//...` and `/*...*\/` comments while preserving string/char/raw-string
 * literals and keeping the exact number of lines and 1-based line positions.
 */
export function stripCommentsKeepLines(code: string): string {
  const cur: ScanCursor = {
    code,
    out: [],
    state: 'NORMAL',
    rawEndMarker: '',
    blockHasNewline: false,
    i: 0
  };

  while (cur.i < code.length) {
    switch (cur.state) {
      case 'NORMAL':
        stepNormal(cur);
        break;
      case 'IN_STRING':
        stepQuoted(cur, '"');
        break;
      case 'IN_CHAR':
        stepQuoted(cur, "'");
        break;
      case 'IN_RAW_STRING':
        stepRawString(cur);
        break;
      case 'LINE_COMMENT':
        stepLineComment(cur);
        break;
      case 'BLOCK_COMMENT':
        stepBlockComment(cur);
        break;
    }
  }

  return cur.out.join('');
}

/**
 * Splits source code into 0-indexed lines (1-based line `n` is `lines[n - 1]`),
 * normalizing CRLF to LF.
 */
export function splitLines(code: string): string[] {
  return code.replaceAll('\r\n', '\n').split('\n');
}
