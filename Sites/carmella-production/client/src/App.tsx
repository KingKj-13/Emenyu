import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AppProvider } from './context/AppContext';
import { CartProvider } from './context/CartContext';
import { MenuProvider } from './context/MenuContext';
import { MenuPage } from './pages/MenuPage';
import { LandingPage } from './pages/LandingPage';
import { Spinner } from './components/ui/Spinner';
import { ErrorBoundary } from './components/ErrorBoundary';

const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));

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
          <MenuProvider>
            <Routes>
              {/* No auth anywhere (product decision) — the Admin panel is reachable
                  by anyone who has the URL, same as every other route. */}
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
              <Route path="/menu" element={<MenuPage />} />
              <Route path="/:tableId/menu" element={<MenuPage />} />
              <Route path="/:tableId" element={<LandingPage />} />
              <Route path="/" element={<Navigate to="/table1" replace />} />
              <Route path="*" element={<Navigate to="/table1" replace />} />
            </Routes>
          </MenuProvider>
        </CartProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}
