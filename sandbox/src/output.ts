function trimLineEnd(line: string): string {
  let end = line.length;
  while (end > 0 && (line[end - 1] === ' ' || line[end - 1] === '\t')) end--;
  return line.slice(0, end);
}

/** Contract A.1: internal whitespace and line breaks remain significant. */
export function normalizeOutput(value: string): string {
  const lines = value.replaceAll('\r\n', '\n').split('\n').map(trimLineEnd);
  while (lines.length && lines.at(-1) === '') lines.pop();
  return lines.join('\n');
}

export function outputsEqual(actual: string, expected: string): boolean {
  return normalizeOutput(actual) === normalizeOutput(expected);
}
