import { Navigate } from 'react-router-dom';
import { useMe } from '../auth/AuthContext';

export function HomePage() {
  const me = useMe();
  const first = me.classes[0];
  if (first) return <Navigate to={`/classes/${first.id}`} replace />;
  return (
    <section className="empty">
      <h1>Chưa có lớp nào</h1>
      <p>
        Tài khoản của bạn chưa thuộc lớp nào. Nhờ quản trị viên thêm bạn vào lớp, rồi tải
        lại trang.
      </p>
    </section>
  );
}

export function NotFoundPage() {
  return (
    <section className="empty">
      <h1>Không có trang này</h1>
      <p>Đường dẫn sai hoặc trang đã bị gỡ. Chọn một lớp ở cột bên trái.</p>
    </section>
  );
}
