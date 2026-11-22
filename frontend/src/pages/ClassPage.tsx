import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useMe } from '../auth/AuthContext';
import { ErrorNote, Loading } from '../components/Feedback';
import { formatTime } from '../lib/format';

export function ClassPage() {
  const { classId = '' } = useParams();
  const me = useMe();
  const cls = me.classes.find((c) => c.id === classId);
  const staff = me.user.role !== 'STUDENT';
  const labs = useQuery({
    queryKey: ['labs', classId],
    queryFn: () => api.listLabs(classId)
  });

  return (
    <>
      <header className="page-head">
        <div>
          <p className="crumb">{cls?.code ?? 'Lớp'}</p>
          <h1>{cls?.name ?? 'Lớp học'}</h1>
        </div>
        {staff && (
          <Link className="btn" to={`/classes/${classId}/labs/new`}>
            Tạo lab
          </Link>
        )}
      </header>

      {labs.isPending && <Loading what="danh sách lab" />}
      <ErrorNote error={labs.error} />

      {labs.data && labs.data.length === 0 && (
        <section className="empty">
          <h2>Lớp này chưa có lab</h2>
          <p>
            {staff
              ? 'Tạo lab đầu tiên: nhập đề, các test và những ràng buộc kèm mức trừ điểm.'
              : 'Khi trợ giảng mở lab, lab sẽ hiện ở đây.'}
          </p>
        </section>
      )}

      {labs.data && labs.data.length > 0 && (
        <ul className="lab-list">
          {labs.data.map((lab) => (
            <li key={lab.id}>
              <Link to={`/labs/${lab.id}`} className="lab-row">
                <span className="lab-title">{lab.title}</span>
                <span
                  className={`lab-status ${lab.status === 'PUBLISHED' ? 'is-published' : ''}`}
                >
                  {lab.status === 'PUBLISHED'
                    ? `Đã công bố điểm ${formatTime(lab.publishedAt)}`
                    : 'Chưa công bố điểm'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
