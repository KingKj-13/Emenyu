import { type ReactNode } from 'react';
import { Header } from './Header';

interface AppShellProps {
  children: ReactNode;
  hideHeader?: boolean;
}

export function AppShell({ children, hideHeader = false }: AppShellProps) {
  return (
    <div style={{ minHeight: '100vh' }}>
      {!hideHeader && <Header />}
      <main style={{ paddingTop: hideHeader ? 0 : 'var(--header-h)' }}>
        {children}
      </main>
    </div>
  );
}
