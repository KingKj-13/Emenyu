import { useState, useCallback } from 'react';
import { FILTER_OPTIONS } from '../constants/filters';

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

  return {
    activeFilters,
    searchQuery,
    setSearchQuery,
    toggleFilter,
    clearFilters,
    filterOptions: FILTER_OPTIONS,
  };
}
