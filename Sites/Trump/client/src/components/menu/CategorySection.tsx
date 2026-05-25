import { useState, memo } from 'react';
import { ChevronDown } from 'lucide-react';
import { MenuCard } from './MenuCard';
import type { MenuSection, MenuItem } from '../../types/menu';
import styles from './CategorySection.module.css';

interface CategorySectionProps {
  section: MenuSection;
  favorites: string[];
  onFavoriteToggle: (name: string) => void;
  onAddToCart: (item: MenuItem) => void;
  onItemClick: (item: MenuItem) => void;
  onPairingClick?: (item: MenuItem) => void;
}

export const CategorySection = memo(function CategorySection({
  section, favorites, onFavoriteToggle, onAddToCart, onItemClick, onPairingClick
}: CategorySectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section className={styles.section} id={`section-${section.title.toLowerCase().replace(/\s+/g, '-')}`}>
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
        <h2 className={styles.title}>{section.title}</h2>
      </button>
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
                  onAddToCart={onAddToCart}
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
              onAddToCart={onAddToCart}
              onItemClick={onItemClick}
              onPairingClick={onPairingClick}
            />
          ))}
        </div>
      </div>
    </section>
  );
});

function SubSection({ title, items, favorites, onFavoriteToggle, onAddToCart, onItemClick, onPairingClick }: {
  title: string;
  items: MenuItem[];
  favorites: string[];
  onFavoriteToggle: (name: string) => void;
  onAddToCart: (item: MenuItem) => void;
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
        <h3 className={styles.subTitle}>{title}</h3>
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
                onAddToCart={onAddToCart}
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
