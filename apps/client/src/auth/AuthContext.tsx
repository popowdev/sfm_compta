import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SessionUser } from '@rp-compta/shared';
import { SOCKET_EVENTS } from '@rp-compta/shared';
import { apiFetch, ApiError } from '@/lib/api';
import { getSocket } from '@/lib/socket';

interface AuthState {
  user: SessionUser | null;
  isLoading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await apiFetch<SessionUser>('/api/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    retry: false,
  });

  useEffect(() => {
    if (!data) return;
    const socket = getSocket();
    const onRevoked = () => queryClient.setQueryData(['me'], null);
    socket.on(SOCKET_EVENTS.sessionRevoked, onRevoked);
    return () => {
      socket.off(SOCKET_EVENTS.sessionRevoked, onRevoked);
    };
  }, [data, queryClient]);

  const logout = async () => {
    await apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
    queryClient.setQueryData(['me'], null);
  };

  return (
    <AuthContext.Provider value={{ user: data ?? null, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return ctx;
}
