import { Search, X, SlidersHorizontal } from 'lucide-react';
import styles from './FilterBar.module.css';

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeFilters: Set<string>;
  onToggleFilter: (key: string) => void;
  onClearAll: () => void;
  filterOptions: Array<{ key: string; label: string; mode: 'include' | 'exclude' }>;
}

export function FilterBar({
  searchQuery, onSearchChange, activeFilters, onToggleFilter, onClearAll, filterOptions
}: FilterBarProps) {
  const hasActive = activeFilters.size > 0 || Boolean(searchQuery);

  return (
    <div className={styles.bar} role="search">
      <div className={styles.searchRow}>
        <div className={styles.searchWrap}>
          <Search size={16} className={styles.searchIcon} aria-hidden="true" />
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search menu…"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            aria-label="Search menu items"
          />
          {searchQuery && (
            <button className={styles.clearSearch} onClick={() => onSearchChange('')} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </div>
        {hasActive && (
          <button className={styles.clearAll} onClick={onClearAll} aria-label="Clear all filters">
            <SlidersHorizontal size={14} />
            Clear
          </button>
        )}
      </div>

      <div className={styles.chips} role="group" aria-label="Dietary filters">
        {filterOptions.map(opt => (
          <button
            key={opt.key}
            className={`${styles.chip} ${activeFilters.has(opt.key) ? styles.chipActive : ''} ${opt.mode === 'include' ? styles.chipInclude : ''}`}
            onClick={() => onToggleFilter(opt.key)}
            aria-pressed={activeFilters.has(opt.key)}
            aria-label={opt.label}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
