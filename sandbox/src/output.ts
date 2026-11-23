/** Contract A.1: internal whitespace and line breaks remain significant. */
export function normalizeOutput(value: string): string {
  const lines = value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''));
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

export function outputsEqual(actual: string, expected: string): boolean {
  return normalizeOutput(actual) === normalizeOutput(expected);
}
