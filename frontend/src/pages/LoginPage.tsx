import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ErrorNote } from '../components/Feedback';
import { isMock } from '../api';
import { MOCK_ACCOUNTS, MOCK_PASSWORD } from '../api/mock';

const SPECIMEN = [
  'void mergeSort(vector<int>& a, int l, int r) {',
  '    if (l >= r) return;',
  '    int m = l + (r - l) / 2;',
  '    mergeSort(a, l, m);',
  '    mergeSort(a, m + 1, r);',
  '    merge(a, l, m, r);',
  '}'
];

export function LoginPage() {
  const { me, signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (me) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(username, password);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login-intro" aria-hidden="true">
        <div className="listing-paper specimen">
          {SPECIMEN.map((t, i) => (
            <div
              className={`listing-row${i === 3 || i === 4 ? ' is-marked tone-pass' : ''}`}
              key={i}
            >
              <span className="listing-no">{i + 15}</span>
              <code className="listing-text">{t}</code>
              <span className="listing-margin">
                {i === 3 && <span className="margin-note tone-pass">C2 đệ quy</span>}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="login-form">
        <h1 className="wordmark-lg">LeeTKOB</h1>
        <p className="lede">
          Kiểm tra ràng buộc của bài lab C++ trước khi công bố điểm. Mọi vi phạm đều có
          dòng code làm bằng chứng, và chỉ trợ giảng mới công bố được điểm.
        </p>

        <form onSubmit={onSubmit} noValidate>
          <label className="field">
            <span>Tên đăng nhập</span>
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label className="field">
            <span>Mật khẩu</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <ErrorNote error={error} />
          <button className="btn" type="submit" disabled={busy || !username || !password}>
            {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>

        {isMock && (
          <div className="note">
            <strong>Chế độ giả lập.</strong>
            <p>
              Mật khẩu của mọi tài khoản là <code>{MOCK_PASSWORD}</code>. Chọn một tài
              khoản để điền nhanh:
            </p>
            <ul className="mock-accounts">
              {MOCK_ACCOUNTS.map((a) => (
                <li key={a.username}>
                  <button
                    type="button"
                    className="btn-quiet"
                    onClick={() => {
                      setUsername(a.username);
                      setPassword(MOCK_PASSWORD);
                    }}
                  >
                    {a.username}
                  </button>
                  <span>{a.note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
