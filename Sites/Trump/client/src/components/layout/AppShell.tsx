import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Header } from './Header';
import { useApp } from '../../context/AppContext';
import { Spinner } from '../ui/Spinner';
import type { Role } from '../../types/auth';

interface AppShellProps {
  children: ReactNode;
  requireRole?: Role | Role[];
  hideHeader?: boolean;
}

export function AppShell({ children, requireRole, hideHeader = false }: AppShellProps) {
  const { user, authLoading } = useApp();

  if (requireRole && authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <Spinner size={40} />
      </div>
    );
  }

  if (requireRole) {
    const roles = Array.isArray(requireRole) ? requireRole : [requireRole];
    if (!user || !roles.includes(user.role)) {
      return <Navigate to="/login" replace />;
    }
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      {!hideHeader && <Header />}
      <main style={{ paddingTop: hideHeader ? 0 : 'var(--header-h)' }}>
        {children}
      </main>
    </div>
  );
}
