import { useState, useEffect, useRef, useMemo } from 'react';
import type { MenuSection } from '../../types/menu';
import styles from './CategoryTabBar.module.css';

interface CategoryTabBarProps {
  sections: MenuSection[];
}

// Collapse the long category list into 4 top-level groups. Tapping a group opens
// a sub-bar of just that group's sections. Sushi lives under Mains (per spec).
type Group = 'Starters' | 'Mains' | 'Dessert' | 'Drinks';
const GROUP_ORDER: Group[] = ['Starters', 'Mains', 'Dessert', 'Drinks'];

function groupOf(title: string): Group {
  const t = title.toLowerCase();
  if (/wine|beer|cider|spirit|liqueur|cocktail|mocktail|champagne|sparkling|beverage|whisk|gin|vodka|\brum\b|tequila|brandy|cognac|coffee|\btea\b|juice|water|shake|tiser|cordial|soft\s*&?\s*hot|after-dinner|draught/.test(t)) return 'Drinks';
  if (/dessert|cake|\bsweet\b|ice cream|gelato/.test(t)) return 'Dessert';
  if (/start|salad|tempura|meze|snack|biltong|appetiser|appetizer/.test(t)) return 'Starters';
  return 'Mains';
}

const sid = (title: string) => `section-${title.toLowerCase().replace(/\s+/g, '-')}`;

export function CategoryTabBar({ sections }: CategoryTabBarProps) {
  const [activeId, setActiveId] = useState<string>('');
  const [openGroup, setOpenGroup] = useState<Group | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const subStripRef = useRef<HTMLDivElement>(null);

  // Group the sections, preserving menu order within each group.
  const grouped = useMemo(() => {
    const map = new Map<Group, MenuSection[]>();
    for (const s of sections) {
      const g = groupOf(s.title);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(s);
    }
    return GROUP_ORDER.filter(g => map.has(g)).map(g => ({ group: g, items: map.get(g)! }));
  }, [sections]);

  const activeGroup: Group | null = useMemo(() => {
    const s = sections.find(x => sid(x.title) === activeId);
    return s ? groupOf(s.title) : (grouped[0]?.group ?? null);
  }, [activeId, sections, grouped]);

  // The sub-bar follows the group you're scrolled into, unless you've tapped another.
  const shownGroup = openGroup ?? activeGroup;
  const shownItems = grouped.find(g => g.group === shownGroup)?.items ?? [];

  useEffect(() => {
    if (sections.length <= 1) return;
    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      entries => { for (const e of entries) if (e.isIntersecting) { setActiveId(e.target.id); break; } },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    );
    for (const s of sections) { const el = document.getElementById(sid(s.title)); if (el) observerRef.current.observe(el); }
    return () => observerRef.current?.disconnect();
  }, [sections]);

  // Keep the active sub-pill in view as you scroll.
  useEffect(() => {
    if (!activeId || !subStripRef.current) return;
    const btn = subStripRef.current.querySelector(`[data-id="${activeId}"]`) as HTMLElement | null;
    if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeId, shownGroup]);

  if (sections.length <= 1) return null;

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <nav className={styles.bar} aria-label="Jump to menu section">
      <div className={styles.groupStrip}>
        {grouped.map(({ group, items }) => (
          <button
            key={group}
            className={`${styles.groupPill} ${shownGroup === group ? styles.groupActive : ''}`}
            onClick={() => { setOpenGroup(group); scrollTo(sid(items[0].title)); }}
            aria-current={shownGroup === group ? 'true' : undefined}
          >
            {group}
          </button>
        ))}
      </div>
      {shownItems.length > 0 && (
        <div className={styles.strip} ref={subStripRef}>
          {shownItems.map(s => {
            const id = sid(s.title);
            const active = activeId === id;
            return (
              <button
                key={id}
                data-id={id}
                className={`${styles.pill} ${active ? styles.pillActive : ''}`}
                onClick={() => scrollTo(id)}
                aria-current={active ? 'location' : undefined}
              >
                {s.title}
              </button>
            );
          })}
        </div>
      )}
    </nav>
  );
}
