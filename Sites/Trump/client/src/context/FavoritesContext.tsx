import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { getFavorites, toggleFavorite as storageToggle } from '../services/storage';

interface FavoritesContextValue {
  favorites: string[];
  toggle: (itemName: string) => void;
  isFavorite: (itemName: string) => boolean;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<string[]>(getFavorites);

  const toggle = useCallback((itemName: string) => {
    setFavorites(storageToggle(itemName));
  }, []);

  const isFavorite = useCallback((itemName: string) => favorites.includes(itemName), [favorites]);

  // Keep favorites in sync across tabs/windows.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key && e.key.includes('favorites')) setFavorites(getFavorites());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <FavoritesContext.Provider value={{ favorites, toggle, isFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within a FavoritesProvider');
  return ctx;
}
