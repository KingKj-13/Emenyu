import { useNavigate } from 'react-router-dom';
import { DIRECT_ACCESS_USER, useApp } from '../context/AppContext';
import { api } from '../services/api';

export function useAuth() {
  const navigate = useNavigate();
  const { user, setUser, authLoading, tableId } = useApp();

  async function login() {
    setUser(DIRECT_ACCESS_USER);
    return { ok: true, user: DIRECT_ACCESS_USER, defaultPath: '/Admin' };
  }

  async function logout() {
    await api.logout().catch(() => {});
    try {
      sessionStorage.removeItem('emenyu_waiter_shift');
    } catch {}
    setUser(DIRECT_ACCESS_USER);
    navigate(`/${tableId || 'table1'}`, { replace: true });
  }

  const isOwnerOrManager = user?.role === 'owner' || user?.role === 'manager';
  const isWaiter = user?.role === 'waiter';
  const isStaff = Boolean(user);

  return { user, authLoading, login, logout, isOwnerOrManager, isWaiter, isStaff };
}
