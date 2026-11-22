import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './auth/AuthContext';
import type { Role } from './api';
import { Layout } from './components/Layout';
import { Loading } from './components/Feedback';
import { LoginPage } from './pages/LoginPage';
import { HomePage, NotFoundPage } from './pages/HomePage';
import { ClassPage } from './pages/ClassPage';
import { LabPage } from './pages/LabPage';
import { CreateLabPage } from './pages/ta/CreateLabPage';
import { ReviewQueuePage } from './pages/ta/ReviewQueuePage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading what="phiên đăng nhập" />;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/** Hides screens a role cannot use. The server still refuses on its own; this is not the guard. */
function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { me } = useAuth();
  if (!me || !roles.includes(me.user.role)) return <NotFoundPage />;
  return <>{children}</>;
}

const STAFF: Role[] = ['TA', 'ADMIN'];

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="classes/:classId" element={<ClassPage />} />
        <Route
          path="classes/:classId/labs/new"
          element={
            <RequireRole roles={STAFF}>
              <CreateLabPage />
            </RequireRole>
          }
        />
        <Route path="labs/:labId" element={<LabPage />} />
        <Route
          path="labs/:labId/review"
          element={
            <RequireRole roles={STAFF}>
              <ReviewQueuePage />
            </RequireRole>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
