import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import type { LoginPayload } from '../types/auth';

export function useAuth() {
  const { user, setUser, authLoading } = useApp();

  async function login(payload: LoginPayload) {
    const result = await api.login(payload);
    if (result.ok && result.user) {
      setUser(result.user);
    }
    return result;
  }

  async function logout() {
    await api.logout().catch(() => {});
    setUser(null);
  }

  const isOwnerOrManager = user?.role === 'owner' || user?.role === 'manager';
  const isWaiter = user?.role === 'waiter';
  const isStaff = Boolean(user);

  return { user, authLoading, login, logout, isOwnerOrManager, isWaiter, isStaff };
}
