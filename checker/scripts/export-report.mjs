#!/usr/bin/env node
/**
 * Exports checker predictions + ground-truth labels into an Excel-ready CSV file
 * (UTF-8 with BOM so Microsoft Excel displays Vietnamese/Unicode cleanly).
 *
 * Usage:
 *   node checker/scripts/export-report.mjs --data <dataset_dir> --predictions <predictions.jsonl> --out <report.csv>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--data') out.data = argv[++i];
    else if (a === '--predictions') out.predictions = argv[++i];
    else if (a === '--out' || a === '-o') out.out = argv[++i];
    else if (a === '-h' || a === '--help') {
      console.log(
        'Usage: node checker/scripts/export-report.mjs --data <dataset_dir> --predictions <predictions.jsonl> --out <report.csv>'
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  if (!out.data || !out.predictions || !out.out) {
    throw new Error('--data, --predictions, and --out are required');
  }
  return out;
}

function csvCell(value) {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

function readJsonl(filePath) {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function evaluateRowStatus(label, verdict, evList, expectedLines) {
  if (verdict === 'unsure') return 'UNSURE';
  if (label === 'pass' && verdict === 'violation') return 'WRONGFUL_DEDUCTION';
  if (label === 'violation' && verdict === 'pass') return 'MISSED_VIOLATION';
  if (label === 'violation' && verdict === 'violation') {
    const matched = evList.some((e) => expectedLines.includes(e.line));
    return matched ? 'CAUGHT' : 'WRONG_EVIDENCE_LINE';
  }
  return 'OK';
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const dataRoot = resolve(opts.data);
  const labelsPath = join(dataRoot, 'labels.jsonl');
  const predsPath = resolve(opts.predictions);

  if (!existsSync(labelsPath)) throw new Error(`labels.jsonl not found at ${labelsPath}`);
  if (!existsSync(predsPath)) throw new Error(`predictions file not found at ${predsPath}`);

  const labels = readJsonl(labelsPath);
  const preds = readJsonl(predsPath);
  const predMap = new Map(preds.map((p) => [`${p.solution}\u0000${p.constraint}`, p]));

  const constraintTextCache = new Map();
  function getConstraintText(problemId, constraintCode) {
    if (!constraintTextCache.has(problemId)) {
      const cpath = join(dataRoot, 'problems', problemId, 'constraints.json');
      const map = new Map();
      if (existsSync(cpath)) {
        for (const c of JSON.parse(readFileSync(cpath, 'utf8'))) {
          map.set(c.id, c.text);
        }
      }
      constraintTextCache.set(problemId, map);
    }
    return constraintTextCache.get(problemId).get(constraintCode) ?? '';
  }

  const headers = [
    'solution',
    'constraint',
    'constraint_text',
    'tags',
    'expected_label',
    'expected_lines',
    'predicted_verdict',
    'predicted_evidence',
    'result_status'
  ];

  const rows = [headers.map(csvCell).join(',')];
  const counts = { wrongful: 0, caught: 0, totalViol: 0, unsure: 0 };

  for (const l of labels) {
    const [pid] = l.solution.split('/');
    const pred = predMap.get(`${l.solution}\u0000${l.constraint}`);
    const verdict = pred?.verdict ?? 'unsure';
    const evList = pred?.evidence ?? [];
    const evStr = evList.map((e) => `L${e.line}: ${e.text}`).join(' | ');
    const status = evaluateRowStatus(l.label, verdict, evList, l.evidence ?? []);

    if (l.label === 'violation') counts.totalViol += 1;
    if (status === 'UNSURE') counts.unsure += 1;
    if (status === 'WRONGFUL_DEDUCTION') counts.wrongful += 1;
    if (status === 'CAUGHT') counts.caught += 1;

    rows.push(
      [
        l.solution,
        l.constraint,
        getConstraintText(pid, l.constraint),
        (l.tags ?? []).join(';'),
        l.label,
        (l.evidence ?? []).join(';'),
        verdict,
        evStr,
        status
      ]
        .map(csvCell)
        .join(',')
    );
  }

  const outFile = resolve(opts.out);
  mkdirSync(dirname(outFile), { recursive: true });
  // UTF-8 BOM (\uFEFF) ensures Microsoft Excel opens Unicode/Vietnamese text properly.
  writeFileSync(outFile, '\uFEFF' + rows.join('\r\n') + '\r\n', 'utf8');

  console.log(
    `Exported ${labels.length} rows to ${outFile} (wrongful=${counts.wrongful}, caught=${counts.caught}/${counts.totalViol}, unsure=${counts.unsure}/${labels.length})`
  );
}

main();
