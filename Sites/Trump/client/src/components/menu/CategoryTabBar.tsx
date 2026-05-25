import { useState, useEffect, useRef } from 'react';
import type { MenuSection } from '../../types/menu';
import styles from './CategoryTabBar.module.css';

interface CategoryTabBarProps {
  sections: MenuSection[];
}

export function CategoryTabBar({ sections }: CategoryTabBarProps) {
  const [activeId, setActiveId] = useState<string>('');
  const observerRef = useRef<IntersectionObserver | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const sectionIds = sections.map(s => `section-${s.title.toLowerCase().replace(/\s+/g, '-')}`);

  useEffect(() => {
    if (sections.length <= 1) return;

    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    );

    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el) observerRef.current.observe(el);
    }

    return () => observerRef.current?.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  useEffect(() => {
    if (!activeId || !stripRef.current) return;
    const btn = stripRef.current.querySelector(`[data-id="${activeId}"]`) as HTMLElement | null;
    if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeId]);

  if (sections.length <= 1) return null;

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <nav className={styles.bar} aria-label="Jump to menu section">
      <div className={styles.strip} ref={stripRef}>
        {sections.map((s, i) => {
          const id = sectionIds[i];
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
    </nav>
  );
}
