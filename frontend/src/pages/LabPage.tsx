import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { Lab, Submission } from '../api';
import { useMe } from '../auth/AuthContext';
import { ErrorNote, Loading } from '../components/Feedback';
import { SubmissionState } from '../components/Badges';
import { formatTime } from '../lib/format';
import { StudentSubmit } from './student/StudentSubmit';

const inFlight = (list?: Submission[]) =>
  !!list?.some((s) => s.status === 'QUEUED' || s.status === 'RUNNING');

export function LabPage() {
  const { labId = '' } = useParams();
  const me = useMe();
  const staff = me.user.role !== 'STUDENT';

  const lab = useQuery({ queryKey: ['lab', labId], queryFn: () => api.getLab(labId) });
  const subs = useQuery({
    queryKey: ['submissions', labId],
    queryFn: () => api.listSubmissions(labId),
    enabled: lab.isSuccess,
    // Results arrive from the worker; poll only while something is still in the queue.
    refetchInterval: (q) => (inFlight(q.state.data) ? 1500 : false)
  });

  if (lab.isPending) return <Loading what="lab" />;
  if (lab.error) return <ErrorNote error={lab.error} title="Không mở được lab" />;

  const cls = me.classes.find((c) => c.id === lab.data.classId);

  return (
    <>
      <header className="page-head">
        <div>
          <p className="crumb">
            <Link to={`/classes/${lab.data.classId}`}>{cls?.code ?? 'Lớp'}</Link>
          </p>
          <h1>{lab.data.title}</h1>
        </div>
        {staff && (
          <Link className="btn" to={`/labs/${labId}/review`}>
            Mở hàng đợi review
          </Link>
        )}
      </header>

      <div className="lab-layout">
        <div className="lab-main">
          <Statement lab={lab.data} />
          {staff ? (
            <StaffSubmissions
              subs={subs.data}
              loading={subs.isPending}
              error={subs.error}
            />
          ) : (
            <StudentSubmit
              lab={lab.data}
              subs={subs.data}
              loading={subs.isPending}
              error={subs.error}
            />
          )}
        </div>
        <ConstraintsAside lab={lab.data} staff={staff} />
      </div>
    </>
  );
}

function Statement({ lab }: { lab: Lab }) {
  return (
    <section className="block statement">
      <h2>Đề bài</h2>
      {lab.statement.split(/\n{2,}/).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </section>
  );
}

function ConstraintsAside({ lab, staff }: { lab: Lab; staff: boolean }) {
  return (
    <aside className="block constraints-aside" aria-label="Ràng buộc">
      <h2>Ràng buộc</h2>
      <ol className="constraint-list">
        {lab.constraints.map((c) => (
          <li key={c.id}>
            <span className="constraint-code">{c.code}</span>
            <div>
              <p>{c.text}</p>
              <p className="constraint-meta">
                Trừ {c.deduction} điểm nếu vi phạm
                {staff && (
                  <>; {c.kind === 'BAN_LIST' ? 'luật cứng kiểm tra' : 'model đánh giá'}</>
                )}
              </p>
            </div>
          </li>
        ))}
      </ol>
      {lab.status === 'PUBLISHED' ? (
        <p className="note">Điểm đã công bố lúc {formatTime(lab.publishedAt)}.</p>
      ) : (
        <p className="hint">
          Bài Accepted được kiểm tra các ràng buộc này. Điểm chỉ được công bố sau khi trợ
          giảng review.
        </p>
      )}
      {staff && <p className="hint">{lab.tests.length} test ẩn với sinh viên.</p>}
    </aside>
  );
}

function StaffSubmissions({
  subs,
  loading,
  error
}: {
  subs?: Submission[];
  loading: boolean;
  error: unknown;
}) {
  return (
    <section className="block">
      <h2>Bài nộp</h2>
      {loading && <Loading what="bài nộp" />}
      <ErrorNote error={error} />
      {subs && subs.length === 0 && (
        <p className="hint">Chưa có sinh viên nào nộp bài.</p>
      )}
      {subs && subs.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Sinh viên</th>
              <th scope="col">Nộp lúc</th>
              <th scope="col">Kết quả chấm</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id}>
                <td>{s.studentName ?? 'Ẩn danh'}</td>
                <td className="num">{formatTime(s.createdAt)}</td>
                <td>
                  <SubmissionState s={s} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
