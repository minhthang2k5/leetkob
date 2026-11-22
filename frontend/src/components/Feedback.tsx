import { describeProblem } from '../api';

export function ErrorNote({ error, title }: { error: unknown; title?: string }) {
  if (!error) return null;
  return (
    <div className="note note-error" role="alert">
      {title && <strong>{title}</strong>}
      <p>{describeProblem(error)}</p>
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return (
    <p className="loading" aria-live="polite">
      Đang tải {what}…
    </p>
  );
}
