import { NavLink, Outlet } from 'react-router-dom';
import { useAuth, useMe } from '../auth/AuthContext';
import { isMock } from '../api';
import { roleLabel } from '../lib/format';

export function Layout() {
  const me = useMe();
  const { signOut } = useAuth();

  return (
    <div className="shell">
      <a className="skip" href="#main">
        Bỏ qua điều hướng
      </a>
      <aside className="rail">
        <NavLink to="/" className="wordmark" end>
          LeeTKOB
        </NavLink>
        <nav aria-label="Lớp học">
          <p className="rail-heading">
            {me.user.role === 'STUDENT' ? 'Lớp của bạn' : 'Lớp bạn phụ trách'}
          </p>
          {me.classes.length === 0 && (
            <p className="rail-empty">Bạn chưa được thêm vào lớp nào.</p>
          )}
          <ul>
            {me.classes.map((c) => (
              <li key={c.id}>
                <NavLink to={`/classes/${c.id}`}>
                  <span className="rail-code">{c.code}</span>
                  <span className="rail-name">{c.name}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="rail-foot">
          <p className="who">
            <strong>{me.user.name}</strong>
            <span>{roleLabel[me.user.role]}</span>
          </p>
          <button type="button" className="btn-quiet" onClick={signOut}>
            Đăng xuất
          </button>
          {isMock && <p className="mock-flag">Dữ liệu giả lập, chưa nối backend</p>}
        </div>
      </aside>
      <main id="main" className="page" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
