import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, onUnauthorized, session } from '../api';
import type { Me } from '../api';

interface AuthState {
  me: Me | null;
  loading: boolean;
  signIn(username: string, password: string): Promise<void>;
  signOut(): void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState<boolean>(() => session.get() !== null);
  const queryClient = useQueryClient();

  const signOut = useCallback(() => {
    session.set(null);
    setMe(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => onUnauthorized(signOut), [signOut]);

  useEffect(() => {
    if (!session.get()) return;
    let alive = true;
    api
      .me()
      .then((m) => alive && setMe(m))
      .catch(() => alive && signOut())
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [signOut]);

  const signIn = useCallback(async (username: string, password: string) => {
    const { token } = await api.login(username, password);
    session.set(token);
    try {
      setMe(await api.me());
    } catch (err) {
      session.set(null);
      throw err;
    }
  }, []);

  const value = useMemo(
    () => ({ me, loading, signIn, signOut }),
    [me, loading, signIn, signOut]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** For screens that render only after sign-in. */
export function useMe(): Me {
  const { me } = useAuth();
  if (!me) throw new Error('useMe used before sign-in');
  return me;
}
