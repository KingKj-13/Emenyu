import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AppProvider } from './context/AppContext';
import { CartProvider } from './context/CartContext';
import { MenuProvider } from './context/MenuContext';
import { FavoritesProvider } from './context/FavoritesContext';
import { MenuPage } from './pages/MenuPage';
import { LandingPage } from './pages/LandingPage';
import { Spinner } from './components/ui/Spinner';
import { ErrorBoundary } from './components/ErrorBoundary';

const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard').then(m => ({ default: m.OwnerDashboard })));
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

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <CartProvider>
          <FavoritesProvider>
            <MenuProvider>
              <Routes>
                <Route path="/login" element={<Navigate to="/table1" replace />} />
                <Route path="/Login" element={<Navigate to="/table1" replace />} />
                <Route path="/Admin" element={
                  <Suspense fallback={<LoadingFallback />}>
                    <AdminPage />
                  </Suspense>
                } />
                <Route path="/admin" element={
                  <Suspense fallback={<LoadingFallback />}>
                    <AdminPage />
                  </Suspense>
                } />
                <Route path="/Owner" element={
                  <Suspense fallback={<LoadingFallback />}>
                    <OwnerDashboard />
                  </Suspense>
                } />
                <Route path="/Waiter" element={
                  <Suspense fallback={<LoadingFallback />}>
                    <WaiterPage />
                  </Suspense>
                } />
                <Route path="/waiter" element={
                  <Suspense fallback={<LoadingFallback />}>
                    <WaiterPage />
                  </Suspense>
                } />
                <Route path="/Kitchen" element={
                  <Suspense fallback={<LoadingFallback />}>
                    <KitchenPage />
                  </Suspense>
                } />
                <Route path="/reserve" element={
                  <Suspense fallback={<LoadingFallback />}>
                    <ReservationPage />
                  </Suspense>
                } />
                <Route path="/menu" element={<MenuPage />} />
                <Route path="/:tableId/menu" element={<MenuPage />} />
                <Route path="/:tableId/book" element={<Navigate to="/Waiter" replace />} />
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
    </ErrorBoundary>
  );
}
