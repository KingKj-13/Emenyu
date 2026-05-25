import { useState, useCallback } from 'react';
import { getFavorites, toggleFavorite as storagToggle } from '../services/storage';

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(getFavorites);

  const toggle = useCallback((itemName: string) => {
    setFavorites(storagToggle(itemName));
  }, []);

  const isFavorite = useCallback((itemName: string) => favorites.includes(itemName), [favorites]);

  return { favorites, toggle, isFavorite };
}
