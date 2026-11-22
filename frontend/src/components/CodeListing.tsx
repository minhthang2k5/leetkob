import { Fragment } from 'react';
import type { VerdictValue } from '../api';

export interface Mark {
  line: number;
  /** Short margin note, e.g. the constraint code. */
  label: string;
  tone: VerdictValue;
  /** True when the evidence text the checker quoted matches this line exactly. */
  matches: boolean;
}

interface Props {
  code: string;
  marks?: Mark[];
  /** Constraint code currently selected: its marks are drawn stronger. */
  focus?: string | null;
  caption?: string;
}

/**
 * The submission printed like a line-printer listing: banded rows, line numbers, and the
 * grader's marks in the margin next to every evidence line.
 */
export function CodeListing({ code, marks = [], focus = null, caption }: Props) {
  const lines = code.replace(/\n$/, '').split('\n');
  const byLine = new Map<number, Mark[]>();
  for (const m of marks) byLine.set(m.line, [...(byLine.get(m.line) ?? []), m]);

  return (
    <figure className="listing">
      {caption && <figcaption className="listing-caption">{caption}</figcaption>}
      <div className="listing-paper" role="table" aria-label="Mã nguồn bài nộp">
        {lines.map((text, i) => {
          const n = i + 1;
          const here = byLine.get(n) ?? [];
          const strongest = here.find((m) => m.label === focus) ?? here[0];
          const cls = [
            'listing-row',
            strongest ? `is-marked tone-${strongest.tone.toLowerCase()}` : '',
            strongest && focus && strongest.label !== focus ? 'is-dim' : ''
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div className={cls} role="row" key={n} id={`L${n}`}>
              <span className="listing-no" role="cell">
                {n}
              </span>
              <code className="listing-text" role="cell">
                {text || ' '}
              </code>
              <span className="listing-margin" role="cell">
                {here.map((m, k) => (
                  <Fragment key={`${m.label}-${k}`}>
                    <span
                      className={`margin-note tone-${m.tone.toLowerCase()}`}
                      title={
                        m.matches ? undefined : 'Dòng được trích không khớp với code'
                      }
                    >
                      {m.label}
                      {!m.matches && <span aria-label="không khớp"> ≠</span>}
                    </span>
                  </Fragment>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}
