import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Suspense, lazy, useEffect, type ReactElement } from 'react';
import { AppProvider } from './context/AppContext';
import { MenuProvider } from './context/MenuContext';
import { FavoritesProvider } from './context/FavoritesContext';
import { I18nProvider, useI18n } from './i18n';
import { bindEngagementLifecycle, setEngagementContext, track } from './lib/engagement';
import { MenuPage } from './pages/MenuPage';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { Spinner } from './components/ui/Spinner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAuth } from './hooks/useAuth';
import type { Role } from './types/auth';

const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard').then(m => ({ default: m.OwnerDashboard })));
// The waiter and kitchen applications were removed here (2026-08-08). The
// restaurant's differentiator is its wait staff, and the QR menu no longer
// takes orders, so there is nothing for either screen to receive. Their code
// is archived under backups/removed-features/ and the server still holds the
// modules (five non-waiter services import them) behind
// TRUMP_WAITER_APP_ENABLED, which is off.
const ReservationPage = lazy(() => import('./pages/ReservationPage').then(m => ({ default: m.ReservationPage })));
// Split out: the chart geometry + selector is ~20 KB of JS nobody browsing the
// menu grid needs until they actually walk into the butchery.
const ButcheryPage = lazy(() => import('./pages/ButcheryPage').then(m => ({ default: m.ButcheryPage })));

function LoadingFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <Spinner size={40} />
    </div>
  );
}

/**
 * Every guest-facing route.
 *
 * A scan goes straight to the menu. There is no login, no account step and no
 * language screen in the way — the language is a dropdown in the header, which
 * is where a control belongs. English is the default; a guest who needs another
 * changes it in one tap and the choice is remembered on the device.
 */
function Guest({ children }: { children: ReactElement }) {
  const { locale } = useI18n();
  const { tableId } = useParams<{ tableId: string }>();

  useEffect(() => { bindEngagementLifecycle(); }, []);
  useEffect(() => {
    setEngagementContext({ locale, tableId: tableId || '' });
  }, [locale, tableId]);

  return children;
}

function ProtectedRoute({ roles, children }: { roles: Role[]; children: ReactElement }) {
  const { user, authLoading } = useAuth();

  if (authLoading) return <LoadingFallback />;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) {
    // Waiter and kitchen no longer have an app to land on. Their accounts are
    // deliberately NOT deleted (rota history, audit trail, shift records all
    // reference them), so they are sent to the login screen rather than to a
    // route that would 404.
    const dest = user.role === 'owner' ? '/Owner' : (user.role === 'manager' ? '/Admin' : '/login');
    return <Navigate to={dest} replace />;
  }

  return children;
}

export default function App() {
  return (
    <ErrorBoundary>
    <AppProvider>
      <I18nProvider>
        <FavoritesProvider>
        <MenuProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/Login" element={<LoginPage />} />
            <Route path="/Admin" element={
              <ProtectedRoute roles={['owner', 'manager']}>
                <Suspense fallback={<LoadingFallback />}>
                  <AdminPage />
                </Suspense>
              </ProtectedRoute>
            } />
            <Route path="/admin" element={
              <ProtectedRoute roles={['owner', 'manager']}>
                <Suspense fallback={<LoadingFallback />}>
                  <AdminPage />
                </Suspense>
              </ProtectedRoute>
            } />
            <Route path="/Owner" element={
              <ProtectedRoute roles={['owner']}>
                <Suspense fallback={<LoadingFallback />}>
                  <OwnerDashboard />
                </Suspense>
              </ProtectedRoute>
            } />
                                                <Route path="/reserve" element={
              <Suspense fallback={<LoadingFallback />}>
                <ReservationPage />
              </Suspense>
            } />
            <Route path="/menu" element={<Guest><MenuPage /></Guest>} />
            <Route path="/:tableId/menu" element={<Guest><MenuPage /></Guest>} />
            <Route path="/:tableId/drinks" element={<Guest><MenuPage sectionFilter="drinks" /></Guest>} />
            <Route path="/:tableId/setmenu" element={<Guest><MenuPage sectionFilter="setmenu" /></Guest>} />
            <Route path="/:tableId/butchery" element={
              <Guest>
                <Suspense fallback={<LoadingFallback />}>
                  <ButcheryPage />
                </Suspense>
              </Guest>
            } />
            <Route path="/:tableId" element={<Guest><LandingPage /></Guest>} />
            <Route path="/" element={<Navigate to="/table1" replace />} />
            <Route path="*" element={<Navigate to="/table1" replace />} />
          </Routes>
        </MenuProvider>
        </FavoritesProvider>
      </I18nProvider>
    </AppProvider>
    </ErrorBoundary>
  );
}
