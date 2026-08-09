import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { LOCALES, localeDefinition, searchLocales, type LocaleCode } from '../../i18n/locales';
import { track } from '../../lib/engagement';
import styles from './LanguageMenu.module.css';

/**
 * The language switch: a dropdown hung off the header's locale button.
 *
 * There is deliberately no full-screen language step before the menu. A guest
 * scanning a QR code wants the food; the language is a control they reach for
 * only if English is not theirs, so it lives in the chrome rather than in front
 * of the door.
 *
 * Anchored to its trigger and positioned in the viewport (fixed), because the
 * header sits in a stacking context that would otherwise clip it.
 */
export function LanguageMenu({ anchorRef, open, onClose }: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
}) {
  const { locale, setLocale, t } = useI18n();
  const [query, setQuery] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  const results = useMemo(() => searchLocales(query), [query]);
  const showSearch = LOCALES.length > 8;

  // Measure the trigger each time it opens: the header is sticky, so a position
  // captured once goes stale the moment the page scrolls.
  useEffect(() => {
    if (!open) { setQuery(''); return; }
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    }
    function onPointer(e: PointerEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;   // the trigger toggles itself
      onClose();
    }
    // A scroll or resize invalidates the anchor measurement; close rather than
    // let the menu drift away from the button it belongs to.
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !pos) return null;

  function choose(code: LocaleCode) {
    setLocale(code);
    track({ eventType: 'LANGUAGE_SELECT', locale: code, label: localeDefinition(code).english });
    onClose();
  }

  return (
    <div
      ref={menuRef}
      className={styles.menu}
      style={{ top: pos.top, insetInlineEnd: pos.right }}
      role="listbox"
      aria-label={t('lang.title')}
    >
      {showSearch && (
        <label className={styles.searchWrap}>
          <Search size={14} aria-hidden />
          <input
            className={styles.search}
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('lang.search')}
            aria-label={t('lang.search')}
            dir="ltr"
            autoFocus
          />
        </label>
      )}

      <ul className={styles.list}>
        {results.length === 0 && <li className={styles.empty}>{t('lang.none')}</li>}
        {results.map(l => {
          const active = l.code === locale;
          return (
            <li key={l.code} role="option" aria-selected={active}>
              <button
                type="button"
                className={`${styles.item} ${active ? styles.itemOn : ''}`}
                onClick={() => choose(l.code)}
                lang={l.code}
              >
                {/* The endonym leads — a guest scans for "Français", not "French".
                    Isolated so an RTL name cannot reorder the row around it. */}
                <span className={styles.native} dir={l.dir} data-script={l.script}>{l.native}</span>
                <span className={styles.english} dir="ltr">{l.english}</span>
                {active && <Check size={14} className={styles.tick} aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
