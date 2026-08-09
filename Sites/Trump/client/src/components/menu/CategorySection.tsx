import { useState, useEffect, useRef, memo } from 'react';
import { ChevronDown } from 'lucide-react';
import { MenuCard } from './MenuCard';
import type { MenuSection, MenuItem } from '../../types/menu';
import { track } from '../../lib/engagement';
import styles from './CategorySection.module.css';

interface CategorySectionProps {
  section: MenuSection;
  favorites: string[];
  onFavoriteToggle: (name: string) => void;
  onItemClick: (item: MenuItem) => void;
  onPairingClick?: (item: MenuItem) => void;
}

export const CategorySection = memo(function CategorySection({
  section, favorites, onFavoriteToggle, onItemClick, onPairingClick
}: CategorySectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const ref = useRef<HTMLElement>(null);

  // A chapter counts as "viewed" when a real part of it reaches the screen —
  // not when it is mounted, because the whole menu mounts at once and every
  // category would score identically. Once per mount: a guest scrolling up and
  // down past the steaks is one interest, not eight.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let sent = false;
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!sent && e.isIntersecting) {
          sent = true;
          track({ eventType: 'CATEGORY_VIEW', label: section.title, categoryName: section.title });
          io.disconnect();
        }
      }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [section.title]);

  return (
    <section ref={ref} className={styles.section} id={`section-${section.title.toLowerCase().replace(/\s+/g, '-')}`}>
      <button
        className={styles.titleRow}
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
        aria-controls={`section-body-${section.title.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <ChevronDown
          size={20}
          className={`${styles.chevron} ${collapsed ? styles.chevronCollapsed : ''}`}
        />
        <h2 className={styles.title} dir="auto">{section.title}</h2>
      </button>
      {section.intro && <p className={styles.intro} dir="auto">{section.intro}</p>}
      <div className={styles.divider} aria-hidden="true" />

      <div
        id={`section-body-${section.title.toLowerCase().replace(/\s+/g, '-')}`}
        className={styles.collapseOuter}
        style={{ gridTemplateRows: collapsed ? '0fr' : '1fr' }}
      >
        <div className={styles.collapseInner}>
          {section.items.length > 0 && (
            <div className={styles.grid}>
              {section.items.map((item, i) => (
                <MenuCard
                  key={`${item.name}-${i}`}
                  item={item}
                  isFavorite={favorites.includes(item.name)}
                  onFavoriteToggle={onFavoriteToggle}
                  onClick={onItemClick}
                  onPairingClick={onPairingClick}
                />
              ))}
            </div>
          )}

          {section.subSections.map(sub => (
            <SubSection
              key={sub.title}
              title={sub.title}
              items={sub.items}
              favorites={favorites}
              onFavoriteToggle={onFavoriteToggle}
              onItemClick={onItemClick}
              onPairingClick={onPairingClick}
            />
          ))}
        </div>
      </div>
    </section>
  );
});

function SubSection({ title, items, favorites, onFavoriteToggle, onItemClick, onPairingClick }: {
  title: string;
  items: MenuItem[];
  favorites: string[];
  onFavoriteToggle: (name: string) => void;
  onItemClick: (item: MenuItem) => void;
  onPairingClick?: (item: MenuItem) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={styles.subSection}>
      <button
        className={styles.subTitleRow}
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
      >
        <ChevronDown
          size={15}
          className={`${styles.chevron} ${collapsed ? styles.chevronCollapsed : ''}`}
        />
        <h3 className={styles.subTitle} dir="auto">{title}</h3>
      </button>
      <div
        className={styles.collapseOuter}
        style={{ gridTemplateRows: collapsed ? '0fr' : '1fr' }}
      >
        <div className={styles.collapseInner}>
          <div className={styles.grid}>
            {items.map((item, i) => (
              <MenuCard
                key={`${item.name}-${i}`}
                item={item}
                isFavorite={favorites.includes(item.name)}
                onFavoriteToggle={onFavoriteToggle}
                  onClick={onItemClick}
                onPairingClick={onPairingClick}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
