import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import type { NewLab } from '../../api';
import { useMe } from '../../auth/AuthContext';
import { ErrorNote } from '../../components/Feedback';

interface DraftConstraint {
  text: string;
  deduction: string;
}

const BAN = /^do not (use|call)\b/i;

export function CreateLabPage() {
  const { classId = '' } = useParams();
  const me = useMe();
  const cls = me.classes.find((c) => c.id === classId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [statement, setStatement] = useState('');
  const [tests, setTests] = useState([{ input: '', expectedOutput: '' }]);
  const [constraints, setConstraints] = useState<DraftConstraint[]>([
    { text: '', deduction: '' }
  ]);
  const [touched, setTouched] = useState(false);

  const create = useMutation({
    mutationFn: (lab: NewLab) => api.createLab(classId, lab),
    onSuccess: (lab) => {
      queryClient.invalidateQueries({ queryKey: ['labs', classId] });
      navigate(`/labs/${lab.id}`);
    }
  });

  const problems: string[] = [];
  if (!title.trim()) problems.push('Nhập tên lab.');
  if (!statement.trim()) problems.push('Nhập đề bài.');
  if (!tests.some((t) => t.expectedOutput.trim()))
    problems.push('Cần ít nhất một test có output.');
  constraints.forEach((c, i) => {
    if (!c.text.trim()) problems.push(`Ràng buộc C${i + 1} chưa có nội dung.`);
    const d = Number(c.deduction);
    if (c.deduction === '' || !Number.isFinite(d) || d < 0) {
      problems.push(`Ràng buộc C${i + 1} cần mức trừ là một số không âm.`);
    }
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (problems.length) return;
    create.mutate({
      title: title.trim(),
      statement: statement.trim(),
      tests: tests.filter((t) => t.input || t.expectedOutput),
      constraints: constraints.map((c, i) => ({
        code: `C${i + 1}`,
        text: c.text.trim(),
        deduction: Number(c.deduction)
      }))
    });
  }

  return (
    <form className="form-page" onSubmit={onSubmit} noValidate>
      <header className="page-head">
        <div>
          <p className="crumb">{cls?.code}</p>
          <h1>Tạo lab mới</h1>
        </div>
      </header>

      <fieldset className="block">
        <legend>Đề bài</legend>
        <label className="field">
          <span>Tên lab</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Sắp xếp: merge sort"
          />
        </label>
        <label className="field">
          <span>Đề bài</span>
          <textarea
            rows={7}
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            placeholder="Đọc n rồi n số nguyên, in ra dãy đã sắp xếp tăng dần…"
          />
        </label>
      </fieldset>

      <fieldset className="block">
        <legend>Test</legend>
        <p className="hint">
          Sinh viên không thấy test. Bài nộp phải qua hết test mới được kiểm tra ràng
          buộc.
        </p>
        {tests.map((t, i) => (
          <div className="pair" key={i}>
            <label className="field mono">
              <span>Input {i + 1}</span>
              <textarea
                rows={3}
                value={t.input}
                onChange={(e) =>
                  setTests(
                    tests.map((x, k) => (k === i ? { ...x, input: e.target.value } : x))
                  )
                }
              />
            </label>
            <label className="field mono">
              <span>Output mong đợi {i + 1}</span>
              <textarea
                rows={3}
                value={t.expectedOutput}
                onChange={(e) =>
                  setTests(
                    tests.map((x, k) =>
                      k === i ? { ...x, expectedOutput: e.target.value } : x
                    )
                  )
                }
              />
            </label>
            {tests.length > 1 && (
              <button
                type="button"
                className="btn-quiet"
                onClick={() => setTests(tests.filter((_, k) => k !== i))}
              >
                Xoá test {i + 1}
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setTests([...tests, { input: '', expectedOutput: '' }])}
        >
          Thêm test
        </button>
      </fieldset>

      <fieldset className="block">
        <legend>Ràng buộc</legend>
        <p className="hint">
          Ràng buộc bắt đầu bằng “Do not use” hoặc “Do not call”, với tên bị cấm đặt trong
          dấu backtick (ví dụ <code>`std::sort`</code>), được luật cứng kiểm tra. Các ràng
          buộc còn lại do model đánh giá, và bạn review kết quả trước khi công bố. Model
          không bao giờ chọn mức trừ.
        </p>
        {constraints.map((c, i) => (
          <div className="constraint-edit" key={i}>
            <span className="constraint-code">C{i + 1}</span>
            <label className="field grow">
              <span>Nội dung</span>
              <input
                value={c.text}
                onChange={(e) =>
                  setConstraints(
                    constraints.map((x, k) =>
                      k === i ? { ...x, text: e.target.value } : x
                    )
                  )
                }
                placeholder={
                  i === 0
                    ? 'Do not use `std::sort` or `std::stable_sort`.'
                    : 'The sort must be a recursive merge sort.'
                }
              />
              <small className="kind">
                {c.text.trim()
                  ? BAN.test(c.text.trim())
                    ? 'Luật cứng kiểm tra'
                    : 'Model đánh giá'
                  : ' '}
              </small>
            </label>
            <label className="field narrow">
              <span>Trừ (điểm)</span>
              <input
                inputMode="decimal"
                value={c.deduction}
                onChange={(e) =>
                  setConstraints(
                    constraints.map((x, k) =>
                      k === i ? { ...x, deduction: e.target.value } : x
                    )
                  )
                }
              />
            </label>
            {constraints.length > 1 && (
              <button
                type="button"
                className="btn-quiet"
                onClick={() => setConstraints(constraints.filter((_, k) => k !== i))}
              >
                Xoá C{i + 1}
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setConstraints([...constraints, { text: '', deduction: '' }])}
        >
          Thêm ràng buộc
        </button>
      </fieldset>

      {touched && problems.length > 0 && (
        <div className="note note-error" role="alert">
          <strong>Chưa tạo được lab</strong>
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      <ErrorNote error={create.error} title="Máy chủ từ chối" />

      <div className="actions">
        <button className="btn" type="submit" disabled={create.isPending}>
          {create.isPending ? 'Đang tạo…' : 'Tạo lab'}
        </button>
        <button type="button" className="btn-quiet" onClick={() => navigate(-1)}>
          Huỷ
        </button>
      </div>
    </form>
  );
}
