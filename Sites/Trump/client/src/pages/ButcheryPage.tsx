import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { SideDrawer } from '../components/layout/SideDrawer';
import { CowMeatSelector } from '../components/butchery/CowMeatSelector';
import { useButcheryCuts } from '../components/butchery/useButcheryCuts';
import { ItemModal } from '../components/menu/ItemModal';
import { Spinner } from '../components/ui/Spinner';
import { useMenu } from '../hooks/useMenu';
import { useFilters } from '../hooks/useFilters';
import { useFavorites } from '../hooks/useFavorites';
import { useT, useI18n } from '../i18n';
import { useApp } from '../context/AppContext';
import { flattenMenu } from '../lib/menuUtils';
import { MAINS_CATEGORY_TITLE } from '../constants/api';
import type { MenuItem } from '../types/menu';
import styles from './ButcheryPage.module.css';

/**
 * The butchery: the interactive carcass chart wired to the live menu.
 *
 * The page owns nothing but plumbing — menu data in, cart/modal out. Everything
 * visual and interactive lives in <CowMeatSelector>, which is tenant-agnostic
 * (see components/butchery/), so a second grillhouse gets this screen by
 * pointing the same component at its own menu and cut rules.
 */
export function ButcheryPage() {
  const { tableId: paramTableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setTableId } = useApp();
  const { menuData, loading, error } = useMenu();
  const { favorites, toggle: toggleFavorite } = useFavorites();
  const { activeFilters, searchQuery, setSearchQuery, toggleFilter, clearFilters, filterOptions } = useFilters();

  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const t = useT();
  const { locale } = useI18n();
  // Curated cuts, media and dish links. Null until loaded, or if the
  // restaurant has curated nothing — the chart falls back to its catalogue.
  const serverCuts = useButcheryCuts(locale);
  const tableId = paramTableId || 'table1';

  useEffect(() => {
    if (paramTableId) setTableId(paramTableId);
    // setTableId is stable from context; intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramTableId]);

  const items = useMemo(() => flattenMenu(menuData), [menuData]);

  const browseAll = useCallback(() => {
    navigate(`/${tableId}/menu?section=${encodeURIComponent(MAINS_CATEGORY_TITLE)}`);
  }, [navigate, tableId]);

  return (
    <AppShell>
      <SideDrawer
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeFilters={activeFilters}
        onToggleFilter={toggleFilter}
        onClearAll={clearFilters}
        filterOptions={filterOptions}
      />

      <div className={styles.page}>
        <header className={styles.topbar}>
          <button
            type="button"
            className={styles.back}
            onClick={() => navigate(`/${tableId}/menu`)}
            aria-label={t('nav.back')}
          >
            <ChevronLeft size={16} /> {t('nav.menu')}
          </button>
          <div className={styles.titleBlock}>
            <p className={styles.eyebrow}>{t('cut.eyebrow')}</p>
            <h1 className={styles.title}>{t('cut.title')}</h1>
          </div>
        </header>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.state}><Spinner size={40} /></div>
          ) : error ? (
            <div className={styles.state}>
              <p>{t('menu.error')}</p>
            </div>
          ) : (
            <CowMeatSelector
              items={items}
              initialCut={searchParams.get('cut')}
              onOpenItem={setSelectedItem}
              onBrowseAll={browseAll}
              serverCuts={serverCuts}
              browseAllLabel={t('cut.browseSteaks')}
            />
          )}
        </div>
      </div>

      <ItemModal
        item={selectedItem}
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        isFavorite={selectedItem ? favorites.includes(selectedItem.name) : false}
        onFavoriteToggle={toggleFavorite}
      />

    </AppShell>
  );
}
