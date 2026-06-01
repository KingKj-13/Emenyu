import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy, type ReactElement } from 'react';
import { AppProvider } from './context/AppContext';
import { CartProvider } from './context/CartContext';
import { MenuProvider } from './context/MenuContext';
import { FavoritesProvider } from './context/FavoritesContext';
import { MenuPage } from './pages/MenuPage';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { Spinner } from './components/ui/Spinner';
import { useAuth } from './hooks/useAuth';
import type { Role } from './types/auth';

const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const WaiterPage = lazy(() => import('./pages/WaiterPage').then(m => ({ default: m.WaiterPage })));
const KitchenPage = lazy(() => import('./pages/KitchenPage').then(m => ({ default: m.KitchenPage })));
const ReservationPage = lazy(() => import('./pages/ReservationPage').then(m => ({ default: m.ReservationPage })));

function LoadingFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <Spinner size={40} />
    </div>
  );
}

function ProtectedRoute({ roles, children }: { roles: Role[]; children: ReactElement }) {
  const { user, authLoading } = useAuth();

  if (authLoading) return <LoadingFallback />;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) {
    const dest = user.role === 'waiter' ? '/Waiter' : user.role === 'kitchen' ? '/Kitchen' : '/Admin';
    return <Navigate to={dest} replace />;
  }

  return children;
}

export default function App() {
  return (
    <AppProvider>
      <CartProvider>
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
            <Route path="/Waiter" element={
              <ProtectedRoute roles={['owner', 'manager', 'waiter']}>
                <Suspense fallback={<LoadingFallback />}>
                  <WaiterPage />
                </Suspense>
              </ProtectedRoute>
            } />
            <Route path="/Kitchen" element={
              <ProtectedRoute roles={['owner', 'manager', 'kitchen']}>
                <Suspense fallback={<LoadingFallback />}>
                  <KitchenPage />
                </Suspense>
              </ProtectedRoute>
            } />
            <Route path="/reserve" element={
              <Suspense fallback={<LoadingFallback />}>
                <ReservationPage />
              </Suspense>
            } />
            <Route path="/:tableId/menu" element={<MenuPage />} />
            <Route path="/:tableId/book" element={<MenuPage sectionFilter="book" />} />
            <Route path="/:tableId/drinks" element={<MenuPage sectionFilter="drinks" />} />
            <Route path="/:tableId/setmenu" element={<MenuPage sectionFilter="setmenu" />} />
            <Route path="/:tableId" element={<LandingPage />} />
            <Route path="/" element={<Navigate to="/table1" replace />} />
            <Route path="*" element={<Navigate to="/table1" replace />} />
          </Routes>
        </MenuProvider>
        </FavoritesProvider>
      </CartProvider>
    </AppProvider>
  );
}
