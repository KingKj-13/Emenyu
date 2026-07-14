import { type ReactNode } from 'react';
import { Header } from './Header';
import type { Role } from '../../types/auth';

interface AppShellProps {
  children: ReactNode;
  requireRole?: Role | Role[];
  hideHeader?: boolean;
}

export function AppShell({ children, requireRole, hideHeader = false }: AppShellProps) {
  void requireRole;

  return (
    <div style={{ minHeight: '100vh' }}>
      {!hideHeader && <Header />}
      <main style={{ paddingTop: hideHeader ? 0 : 'var(--header-h)' }}>
        {children}
      </main>
    </div>
  );
}
