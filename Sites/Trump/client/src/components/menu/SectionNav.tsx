import { useState, useEffect, useRef } from 'react';
import type { MenuSection } from '../../types/menu';
import styles from './SectionNav.module.css';

interface SectionNavProps {
  sections: MenuSection[];
}

export function SectionNav({ sections }: SectionNavProps) {
  const [activeId, setActiveId] = useState<string>('');
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (sections.length <= 2) return;

    const ids = sections.map(s => `section-${s.title.toLowerCase().replace(/\s+/g, '-')}`);

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
      { rootMargin: '-30% 0px -60% 0px', threshold: 0 }
    );

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observerRef.current.observe(el);
    }

    return () => observerRef.current?.disconnect();
  }, [sections]);

  if (sections.length <= 2) return null;

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <nav className={styles.nav} aria-label="Jump to section">
      {sections.map(s => {
        const id = `section-${s.title.toLowerCase().replace(/\s+/g, '-')}`;
        const active = activeId === id;
        return (
          <button
            key={id}
            className={`${styles.dot} ${active ? styles.dotActive : ''}`}
            onClick={() => scrollTo(id)}
            aria-label={s.title}
            title={s.title}
          />
        );
      })}
    </nav>
  );
}
