import { useState, useCallback } from 'react';
import { getRecentlyViewed, addRecentlyViewed } from '../services/storage';
import type { MenuItem } from '../types/menu';

export function useRecentlyViewed() {
  const [recentlyViewed, setRecentlyViewed] = useState<MenuItem[]>(getRecentlyViewed);

  const addItem = useCallback((item: MenuItem) => {
    setRecentlyViewed(addRecentlyViewed(item));
  }, []);

  return { recentlyViewed, addItem };
}
