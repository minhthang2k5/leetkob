import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import { api } from '../../api';
import type {
  PublishReceipt,
  ReviewDecision,
  ReviewItem,
  ReviewQueue,
  Verdict
} from '../../api';
import { CodeListing } from '../../components/CodeListing';
import type { Mark } from '../../components/CodeListing';
import { ErrorNote, Loading } from '../../components/Feedback';
import { VerdictMark } from '../../components/Badges';
import {
  decisionLabel,
  effectiveDeduction,
  formatTime,
  sourceLabel
} from '../../lib/format';

type Filter = 'pending' | 'all';

const needsReview = (v: Verdict) => v.requiresReview && !v.isReviewed;

export function ReviewQueuePage() {
  const { labId = '' } = useParams();
  const queryClient = useQueryClient();
  const lab = useQuery({ queryKey: ['lab', labId], queryFn: () => api.getLab(labId) });
  const queue = useQuery({
    queryKey: ['review-queue', labId],
    queryFn: () => api.getReviewQueue(labId),
    refetchInterval: 5000
  });

  const [filter, setFilter] = useState<Filter>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items = useMemo(() => {
    const all = queue.data?.items ?? [];
    return filter === 'pending' ? all.filter((i) => i.verdicts.some(needsReview)) : all;
  }, [queue.data, filter]);

  const selected =
    items.find((i) => i.submission.id === selectedId) ??
    queue.data?.items.find((i) => i.submission.id === selectedId) ??
    items[0];

  // j / k walk the queue, the way a TA reads 80 submissions in a row.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key !== 'j' && e.key !== 'k') return;
      const idx = items.findIndex((i) => i.submission.id === selected?.submission.id);
      const next =
        items[Math.max(0, Math.min(items.length - 1, idx + (e.key === 'j' ? 1 : -1)))];
      if (next) setSelectedId(next.submission.id);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, selected]);

  const publish = useMutation({
    mutationFn: () => api.publish(labId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-queue', labId] });
      queryClient.invalidateQueries({ queryKey: ['lab', labId] });
      queryClient.invalidateQueries({ queryKey: ['labs'] });
    }
  });

  if (queue.isPending || lab.isPending) return <Loading what="hàng đợi review" />;
  if (queue.error)
    return <ErrorNote error={queue.error} title="Không mở được hàng đợi review" />;
  if (lab.error) return <ErrorNote error={lab.error} />;

  const q = queue.data;
  const published = q.labStatus === 'PUBLISHED';

  return (
    <div className="review">
      <header className="page-head">
        <div>
          <p className="crumb">
            <Link to={`/labs/${labId}`}>{lab.data.title}</Link>
          </p>
          <h1>Hàng đợi review</h1>
        </div>
        <PublishBox queue={q} published={published} publish={publish} />
      </header>

      <div className="review-grid">
        <nav className="queue" aria-label="Bài nộp cần review">
          <div className="queue-filter" role="radiogroup" aria-label="Lọc">
            {(['pending', 'all'] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={filter === f}
                className={filter === f ? 'is-on' : ''}
                onClick={() => setFilter(f)}
              >
                {f === 'pending' ? 'Cần review' : `Tất cả (${q.items.length})`}
              </button>
            ))}
          </div>
          {items.length === 0 ? (
            <p className="hint queue-empty">
              {q.items.length === 0
                ? 'Chưa có bài Accepted nào được kiểm tra ràng buộc.'
                : 'Bạn đã review hết. Chuyển sang “Tất cả” để xem lại.'}
            </p>
          ) : (
            <ol>
              {items.map((it) => (
                <QueueRow
                  key={it.submission.id}
                  item={it}
                  active={it.submission.id === selected?.submission.id}
                  onSelect={() => setSelectedId(it.submission.id)}
                />
              ))}
            </ol>
          )}
          <p className="kbd-hint">
            Phím <kbd>j</kbd> và <kbd>k</kbd> để chuyển bài
          </p>
        </nav>

        {selected ? (
          <SubmissionReview
            key={selected.submission.id}
            item={selected}
            labId={labId}
            locked={published}
          />
        ) : (
          <section className="empty">
            <h2>Chọn một bài nộp</h2>
            <p>Chọn bài ở cột bên trái để xem verdict và các dòng bằng chứng.</p>
          </section>
        )}
      </div>
    </div>
  );
}

function PublishBox({
  queue,
  published,
  publish
}: {
  queue: ReviewQueue;
  published: boolean;
  publish: UseMutationResult<PublishReceipt, Error, void>;
}) {
  const [confirming, setConfirming] = useState(false);
  if (published) return <p className="publish-done">Điểm đã được công bố.</p>;

  const pending = queue.pendingCount;
  return (
    <div className="publish">
      {pending > 0 ? (
        <p className="publish-status">
          Còn <strong>{pending}</strong> verdict cần review trước khi công bố
        </p>
      ) : (
        <p className="publish-status">Đã review đủ. Có thể công bố điểm.</p>
      )}
      {!confirming ? (
        <button
          type="button"
          className="btn"
          disabled={pending > 0}
          onClick={() => setConfirming(true)}
        >
          Công bố điểm
        </button>
      ) : (
        <div className="confirm" role="alertdialog" aria-label="Xác nhận công bố">
          <p>
            Sau khi công bố, sinh viên thấy điểm và muốn sửa phải mở lại điểm. Công bố
            ngay?
          </p>
          <button
            type="button"
            className="btn btn-danger"
            disabled={publish.isPending}
            onClick={() =>
              publish.mutate(undefined, { onSettled: () => setConfirming(false) })
            }
          >
            {publish.isPending ? 'Đang công bố…' : 'Công bố'}
          </button>
          <button
            type="button"
            className="btn-quiet"
            onClick={() => setConfirming(false)}
          >
            Huỷ
          </button>
        </div>
      )}
      <ErrorNote error={publish.error} />
    </div>
  );
}

function QueueRow({
  item,
  active,
  onSelect
}: {
  item: ReviewItem;
  active: boolean;
  onSelect: () => void;
}) {
  const open = item.verdicts.filter(needsReview).length;
  return (
    <li>
      <button
        type="button"
        className={`queue-row${active ? ' is-active' : ''}`}
        onClick={onSelect}
        aria-current={active}
      >
        <span className="queue-name">{item.submission.studentName ?? 'Ẩn danh'}</span>
        <span className="queue-time num">{formatTime(item.submission.createdAt)}</span>
        <span className="queue-ticks">
          {item.verdicts.map((v) => (
            <span
              key={v.id}
              className={`tick tone-${v.verdict.toLowerCase()}${v.isReviewed ? ' is-done' : ''}`}
              title={`${v.constraintCode}: ${v.verdict}${v.isReviewed ? ', đã review' : ''}`}
            >
              {v.constraintCode}
            </span>
          ))}
        </span>
        {open > 0 && <span className="queue-open">{open} cần review</span>}
      </button>
    </li>
  );
}

function SubmissionReview({
  item,
  labId,
  locked
}: {
  item: ReviewItem;
  labId: string;
  locked: boolean;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const codeLines = item.code.split('\n');

  const marks: Mark[] = item.verdicts.flatMap((v) =>
    v.evidence.map((e) => ({
      line: e.line,
      label: v.constraintCode,
      tone: v.verdict,
      matches: (codeLines[e.line - 1] ?? '').trimEnd() === e.text.trimEnd()
    }))
  );
  const total = item.verdicts.reduce((sum, v) => sum + effectiveDeduction(v), 0);

  return (
    <section
      className="sheet"
      aria-label={`Bài của ${item.submission.studentName ?? 'sinh viên'}`}
    >
      <div className="sheet-head">
        <h2>{item.submission.studentName ?? 'Ẩn danh'}</h2>
        <p className="sheet-total">
          Tổng trừ hiện tại <strong className="num">{total}</strong> điểm
        </p>
      </div>
      <div className="sheet-body">
        <CodeListing
          code={item.code}
          marks={marks}
          focus={focus}
          caption="Bài nộp, đúng như sinh viên gửi"
        />
        <ul className="verdicts">
          {item.verdicts.map((v) => (
            <VerdictCard
              key={v.id}
              v={v}
              labId={labId}
              locked={locked}
              focused={focus === v.constraintCode}
              onFocus={() =>
                setFocus(focus === v.constraintCode ? null : v.constraintCode)
              }
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function VerdictCard({
  v,
  labId,
  locked,
  focused,
  onFocus
}: {
  v: Verdict;
  labId: string;
  locked: boolean;
  focused: boolean;
  onFocus: () => void;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState(v.reviewNote ?? '');
  const [editing, setEditing] = useState(false);
  const review = useMutation({
    mutationFn: (d: ReviewDecision) => api.review(v.id, d, note),
    onSuccess: () => {
      setEditing(false);
      return queryClient.invalidateQueries({ queryKey: ['review-queue', labId] });
    }
  });
  const showActions = v.requiresReview && !locked && (!v.isReviewed || editing);

  const jump = (line: number) => {
    onFocus();
    document
      .getElementById(`L${line}`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  return (
    <li
      className={`verdict-card tone-${v.verdict.toLowerCase()}${focused ? ' is-focused' : ''}${v.isReviewed ? ' is-reviewed' : ''}`}
    >
      <div className="verdict-top">
        <button
          type="button"
          className="constraint-code as-button"
          onClick={onFocus}
          aria-pressed={focused}
        >
          {v.constraintCode}
        </button>
        <p className="verdict-text">{v.constraintText}</p>
        <VerdictMark v={v.verdict} />
      </div>
      <p className="verdict-meta">
        {sourceLabel[v.source]}
        {v.isSampled && ', mẫu ngẫu nhiên 10%'}, trừ {v.deduction} điểm nếu vi phạm
      </p>
      {v.reason && <p className="verdict-reason">{v.reason}</p>}
      {v.evidence.length > 0 ? (
        <ul className="evidence">
          {v.evidence.map((e) => (
            <li key={`${e.line}-${e.text}`}>
              <button
                type="button"
                className="evidence-line"
                onClick={() => jump(e.line)}
              >
                <span className="num">dòng {e.line}</span>
                <code>{e.text}</code>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        v.verdict !== 'PASS' && <p className="hint">Không có dòng bằng chứng.</p>
      )}

      {!v.requiresReview ? (
        <p className="hint">Không thuộc diện phải review.</p>
      ) : v.isReviewed && v.decision ? (
        <p className="reviewed">
          Đã review: {decisionLabel[v.decision]}
          {v.reviewNote && <>. Ghi chú: {v.reviewNote}</>}
          {!locked && !editing && (
            <>
              {' '}
              <button
                type="button"
                className="btn-quiet"
                onClick={() => setEditing(true)}
              >
                Sửa quyết định
              </button>
            </>
          )}
        </p>
      ) : null}

      {showActions && (
        <div className="review-actions">
          <label className="field">
            <span>Ghi chú cho quyết định (sinh viên phúc khảo sẽ dựa vào đây)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="actions">
            <button
              type="button"
              className="btn"
              disabled={review.isPending}
              onClick={() => review.mutate('CONFIRMED')}
            >
              Giữ nguyên
            </button>
            {v.verdict !== 'PASS' && (
              <button
                type="button"
                className="btn-ghost"
                disabled={review.isPending}
                onClick={() => review.mutate('OVERRIDDEN_PASS')}
              >
                Đổi thành đạt
              </button>
            )}
            {v.verdict !== 'VIOLATION' && (
              <button
                type="button"
                className="btn-ghost"
                disabled={review.isPending}
                onClick={() => review.mutate('OVERRIDDEN_VIOLATION')}
              >
                Đổi thành vi phạm
              </button>
            )}
          </div>
          <ErrorNote error={review.error} />
        </div>
      )}
    </li>
  );
}
