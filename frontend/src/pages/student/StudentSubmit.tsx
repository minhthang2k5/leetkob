import { useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import type { Lab, Submission } from '../../api';
import { ErrorNote, Loading } from '../../components/Feedback';
import { SubmissionState } from '../../components/Badges';
import { formatTime } from '../../lib/format';

const MAX_BYTES = 64 * 1024;

export function StudentSubmit({
  lab,
  subs,
  loading,
  error
}: {
  lab: Lab;
  subs?: Submission[];
  loading: boolean;
  error: unknown;
}) {
  const [code, setCode] = useState('');
  const queryClient = useQueryClient();
  const size = new Blob([code]).size;
  const closed = lab.status === 'PUBLISHED';

  const submit = useMutation({
    mutationFn: () => api.submit(lab.id, code),
    onSuccess: (s) => {
      queryClient.setQueryData<Submission[]>(['submissions', lab.id], (old) => [
        s,
        ...(old ?? [])
      ]);
      queryClient.invalidateQueries({ queryKey: ['submissions', lab.id] });
    }
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim() || size > MAX_BYTES || closed) return;
    submit.mutate();
  }

  // Tab inserts four spaces instead of leaving the editor; Esc then Tab still moves on.
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Tab' || e.shiftKey) return;
    e.preventDefault();
    const t = e.currentTarget;
    const { selectionStart: a, selectionEnd: b } = t;
    const next = `${code.slice(0, a)}    ${code.slice(b)}`;
    setCode(next);
    requestAnimationFrame(() => t.setSelectionRange(a + 4, a + 4));
  }

  return (
    <>
      <form className="block" onSubmit={onSubmit}>
        <h2>Nộp bài</h2>
        {closed ? (
          <p className="hint">Lab đã công bố điểm nên không nhận bài nữa.</p>
        ) : (
          <>
            <label className="field mono">
              <span>Mã nguồn C++</span>
              <textarea
                className="editor"
                rows={16}
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={'#include <iostream>\nint main() {\n    \n}'}
              />
            </label>
            <p className="hint">
              Bài Accepted sẽ được kiểm tra các ràng buộc của lab. Phần code gửi đi kiểm
              tra đã bỏ chú thích và không kèm tên hay mã số sinh viên của bạn.
            </p>
            {size > MAX_BYTES && (
              <p className="note note-error">Bài nộp vượt quá 64 KB.</p>
            )}
            <ErrorNote error={submit.error} title="Chưa nộp được" />
            <div className="actions">
              <button
                className="btn"
                type="submit"
                disabled={!code.trim() || submit.isPending || size > MAX_BYTES}
              >
                {submit.isPending ? 'Đang nộp…' : 'Nộp bài'}
              </button>
              {submit.isSuccess && (
                <span className="saved">Đã nộp. Bài đang vào hàng đợi chấm.</span>
              )}
            </div>
          </>
        )}
      </form>

      <section className="block">
        <h2>Bài bạn đã nộp</h2>
        {loading && <Loading what="bài nộp" />}
        <ErrorNote error={error} />
        {subs && subs.length === 0 && (
          <p className="hint">Bạn chưa nộp bài nào cho lab này.</p>
        )}
        {subs && subs.length > 0 && (
          <ol className="sub-list">
            {subs.map((s) => (
              <li key={s.id}>
                <span className="num">{formatTime(s.createdAt)}</span>
                <SubmissionState s={s} />
                {s.compileOutput && <pre className="compile-out">{s.compileOutput}</pre>}
              </li>
            ))}
          </ol>
        )}
        <p className="hint">
          Kết quả kiểm tra ràng buộc và mức trừ điểm chỉ hiện khi trợ giảng công bố điểm.
        </p>
      </section>
    </>
  );
}
