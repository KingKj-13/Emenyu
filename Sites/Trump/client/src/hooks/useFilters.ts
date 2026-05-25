import { useState, useCallback } from 'react';
import { FILTER_OPTIONS } from '../constants/filters';
import type { MenuItem } from '../types/menu';

export function useFilters() {
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const toggleFilter = useCallback((key: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setActiveFilters(new Set());
    setSearchQuery('');
  }, []);

  const shouldHideItem = useCallback((item: MenuItem): boolean => {
    if (activeFilters.size === 0) return false;
    const allergens = String(item.allergens || '').toLowerCase();
    const fullText = [item.name, item.description, item.allergens, item.types].join(' ').toLowerCase();
    for (const filter of activeFilters) {
      const lower = filter.toLowerCase();
      if (lower === 'vegan' || lower === 'vegetarian') {
        if (!fullText.includes(lower)) return true;
        continue;
      }
      if (allergens.includes(lower) || fullText.includes(lower)) return true;
    }
    return false;
  }, [activeFilters]);

  const matchesSearch = useCallback((item: MenuItem): boolean => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return [item.name, item.description, item.allergens, item.types]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
  }, [searchQuery]);

  return {
    activeFilters,
    searchQuery,
    setSearchQuery,
    toggleFilter,
    clearFilters,
    shouldHideItem,
    matchesSearch,
    filterOptions: FILTER_OPTIONS,
  };
}
