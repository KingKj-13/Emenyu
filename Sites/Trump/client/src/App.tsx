import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AppProvider } from './context/AppContext';
import { CartProvider } from './context/CartContext';
import { MenuProvider } from './context/MenuContext';
import { MenuPage } from './pages/MenuPage';
import { LoginPage } from './pages/LoginPage';
import { Spinner } from './components/ui/Spinner';

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

export default function App() {
  return (
    <AppProvider>
      <CartProvider>
        <MenuProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/Admin" element={
              <Suspense fallback={<LoadingFallback />}>
                <AdminPage />
              </Suspense>
            } />
            <Route path="/Waiter" element={
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
            <Route path="/:tableId/book" element={<MenuPage sectionFilter="book" />} />
            <Route path="/:tableId/drinks" element={<MenuPage sectionFilter="drinks" />} />
            <Route path="/:tableId/setmenu" element={<MenuPage sectionFilter="setmenu" />} />
            <Route path="/:tableId" element={<MenuPage />} />
            <Route path="/" element={<Navigate to="/table1" replace />} />
            <Route path="*" element={<Navigate to="/table1" replace />} />
          </Routes>
        </MenuProvider>
      </CartProvider>
    </AppProvider>
  );
}
