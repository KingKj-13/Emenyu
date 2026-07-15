import { useState, useCallback } from 'react';
import { FILTER_OPTIONS } from '../constants/filters';
import { shouldHideItemForFilters } from '../lib/menuUtils';
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

  const shouldHideItem = useCallback((item: MenuItem): boolean => shouldHideItemForFilters(item, activeFilters), [activeFilters]);

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
