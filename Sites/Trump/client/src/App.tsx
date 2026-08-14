import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Suspense, lazy, useEffect, type ReactElement, type ReactNode } from 'react';
import { AppProvider } from './context/AppContext';
import { MenuProvider } from './context/MenuContext';
import { FavoritesProvider } from './context/FavoritesContext';
import { CartProvider } from './context/CartContext';
import { I18nProvider, useI18n } from './i18n';
import { bindEngagementLifecycle, setEngagementContext, track } from './lib/engagement';
import { MenuPage } from './pages/MenuPage';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { Spinner } from './components/ui/Spinner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAuth } from './hooks/useAuth';
import { DEMO_MODE } from './constants/api';
import { GlobalButcheryModal } from './components/butchery/GlobalButcheryModal';
import type { Role } from './types/auth';

// The premium editorial redesign (Maison Lumière-inspired) lives entirely
// under src/premium/ and renders ONLY when VITE_DEMO_MODE=true — currently
// just the public "Demo Steakhouse" tenant build (Sites/Demo/.env.demo).
// Trump's own build never sets that flag, so DEMO_MODE is false and every
// route below resolves to exactly the components it always has. Lazy-loaded
// (like AdminPage/OwnerDashboard/ButcheryPage below) so Trump's own bundle
// never has to fetch this chunk at all.
const PremiumWelcome = lazy(() => import('./premium/PremiumWelcome').then(m => ({ default: m.PremiumWelcome })));
const PremiumMenuPage = lazy(() => import('./premium/PremiumMenuPage').then(m => ({ default: m.PremiumMenuPage })));
// Waiter + kitchen were retired for Trump on 2026-08-08 (server routes answer
// 410 Gone unless TRUMP_WAITER_APP_ENABLED=true — see server.js). Restored
// here for the Demo tenant only, reskinned onto the same premium tokens;
// Trump's own build never mounts these routes (DEMO_MODE is always false),
// and TRUMP_WAITER_APP_ENABLED stays unset in Trump's own .env, so even a
// stray request would still get 410 Gone from the server.
const PremiumWaiterPage = lazy(() => import('./premium/waiter/PremiumWaiterPage').then(m => ({ default: m.PremiumWaiterPage })));
const PremiumKitchenPage = lazy(() => import('./premium/kitchen/PremiumKitchenPage').then(m => ({ default: m.PremiumKitchenPage })));

const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard').then(m => ({ default: m.OwnerDashboard })));
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

// CartProvider joins a socket room and starts syncing on mount — a real side
// effect, not just inert JS — so it must only ever exist for the Demo tenant.
// Trump's own build (DEMO_MODE always false) never mounts it.
function CartGate({ children }: { children: ReactNode }) {
  return DEMO_MODE ? <CartProvider>{children}</CartProvider> : <>{children}</>;
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
        {!DEMO_MODE && <GlobalButcheryModal />}
        <CartGate>
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
            <Route path="/menu" element={<Guest>{DEMO_MODE ? <Suspense fallback={<LoadingFallback />}><PremiumMenuPage /></Suspense> : <MenuPage />}</Guest>} />
            <Route path="/:tableId/menu" element={<Guest>{DEMO_MODE ? <Suspense fallback={<LoadingFallback />}><PremiumMenuPage /></Suspense> : <MenuPage />}</Guest>} />
            <Route path="/:tableId/drinks" element={<Guest><MenuPage sectionFilter="drinks" /></Guest>} />
            <Route path="/:tableId/setmenu" element={<Guest><MenuPage sectionFilter="setmenu" /></Guest>} />
            <Route path="/:tableId/butchery" element={
              <Guest>
                <Suspense fallback={<LoadingFallback />}>
                  <ButcheryPage />
                </Suspense>
              </Guest>
            } />
            <Route path="/:tableId" element={<Guest>{DEMO_MODE ? <Suspense fallback={<LoadingFallback />}><PremiumWelcome /></Suspense> : <LandingPage />}</Guest>} />
            {DEMO_MODE && (
              <>
                <Route path="/Waiter" element={
                  <ProtectedRoute roles={['owner', 'manager', 'waiter']}>
                    <Suspense fallback={<LoadingFallback />}>
                      <PremiumWaiterPage />
                    </Suspense>
                  </ProtectedRoute>
                } />
                <Route path="/Kitchen" element={
                  <ProtectedRoute roles={['owner', 'manager', 'kitchen']}>
                    <Suspense fallback={<LoadingFallback />}>
                      <PremiumKitchenPage />
                    </Suspense>
                  </ProtectedRoute>
                } />
              </>
            )}
            <Route path="/" element={<Navigate to="/table1" replace />} />
            <Route path="*" element={<Navigate to="/table1" replace />} />
          </Routes>
        </CartGate>
        </MenuProvider>
        </FavoritesProvider>
      </I18nProvider>
    </AppProvider>
    </ErrorBoundary>
  );
}
