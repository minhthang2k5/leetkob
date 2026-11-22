import type { Submission, VerdictValue } from '../api';
import { resultLabel, statusLabel, verdictLabel } from '../lib/format';

export function SubmissionState({ s }: { s: Submission }) {
  if (s.status !== 'JUDGED') {
    const busy = s.status === 'QUEUED' || s.status === 'RUNNING';
    return (
      <span className={`state state-${s.status.toLowerCase()}`} aria-live="polite">
        {busy && <span className="pulse" aria-hidden="true" />}
        {statusLabel[s.status]}
      </span>
    );
  }
  const ok = s.result === 'ACCEPTED';
  return (
    <span className={`state ${ok ? 'state-ok' : 'state-bad'}`}>
      {s.result ? resultLabel[s.result] : statusLabel[s.status]}
      {s.testsTotal !== null && (
        <span className="state-tests">
          {' '}
          {s.testsPassed}/{s.testsTotal} test
        </span>
      )}
    </span>
  );
}

export function VerdictMark({ v }: { v: VerdictValue }) {
  return <span className={`verdict tone-${v.toLowerCase()}`}>{verdictLabel[v]}</span>;
}
