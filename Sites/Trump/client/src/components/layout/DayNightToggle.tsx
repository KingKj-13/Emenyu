import { AnimatePresence, motion } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import styles from './DayNightToggle.module.css';

// Carmella-only (Header gates rendering on dayParts.length > 0). Replaces the
// book-view icon in that same nav slot -- see MenuContext.tsx for how the
// chosen mode actually filters the menu, and AppContext.tsx for how it also
// drives the whole app's theme.
export function DayNightToggle() {
  const { menuMode, toggleMenuMode } = useApp();
  const isNight = menuMode === 'night';
  const label = isNight ? 'Night Menu' : 'Day Menu';

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggleMenuMode}
      aria-label={`Switch to ${isNight ? 'Day' : 'Night'} Menu — currently showing the ${label}`}
      title={label}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isNight ? 'night' : 'day'}
          className={styles.iconWrap}
          initial={{ opacity: 0, rotate: -35, scale: 0.72 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 35, scale: 0.72 }}
          transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {isNight ? <Moon size={18} /> : <Sun size={18} />}
        </motion.span>
      </AnimatePresence>
      <span className={styles.tooltip} role="tooltip">{label}</span>
    </button>
  );
}
