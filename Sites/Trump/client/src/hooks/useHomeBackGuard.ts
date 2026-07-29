import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from './useAuth';

/**
 * Hardware/browser Back behaviour for the staff consoles and the landing.
 *
 * - On a staff console (isHome = false): Back returns to the app home (landing)
 *   instead of dumping the user onto the customer menu.
 * - On the home page (isHome = true): for a logged-in staff member, Back asks to
 *   exit and signs them out. Guests keep normal back behaviour.
 *
 * Uses a re-pushed history sentinel so the trap survives repeated Back presses.
 */
export function useHomeBackGuard({ isHome = false }: { isHome?: boolean } = {}) {
  const navigate = useNavigate();
  const { tableId, user } = useApp();
  const { logout } = useAuth();

  useEffect(() => {
    // On the home page only guard for staff; guests keep normal Back.
    if (isHome && !user) return;

    const home = `/${tableId || 'table1'}`;
    window.history.pushState({ emenyuHomeGuard: true }, '');

    function onPop() {
      if (isHome) {
        if (window.confirm('Exit and sign out?')) {
          window.removeEventListener('popstate', onPop);
          Promise.resolve(logout()).finally(() => navigate('/login'));
          return;
        }
        window.history.pushState({ emenyuHomeGuard: true }, '');
      } else {
        navigate(home);
        window.history.pushState({ emenyuHomeGuard: true }, '');
      }
    }

    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [isHome, navigate, tableId, user, logout]);
}
