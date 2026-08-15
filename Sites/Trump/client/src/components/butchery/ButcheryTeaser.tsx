import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { CowChart } from './CowChart';
import { CUT_BY_ID, cutName, type NamingScheme } from './cutCatalog';
import { BASE_PATH } from '../../constants/api';
import { useT } from '../../i18n';
import styles from './ButcheryTeaser.module.css';

export interface ButcheryTeaserProps {
  /** Opens the full experience, optionally on a specific cut. */
  onOpen: (cutId?: string) => void;
  assetBase?: string;
  scheme?: NamingScheme;
  eyebrow?: string;
  title?: string;
  body?: string;
  cta?: string;
}

/**
 * The steak section's opener: the same chart, at banner scale, sitting at the
 * head of the meat chapter so the animal is the first thing a guest meets when
 * they arrive there. Tapping any primal deep-links straight into that cut.
 *
 * Deliberately light — no lift-off, no photographs, no panel. It costs one
 * 14 KB silhouette and ~40 SVG paths, so it can live inside the scrolling menu
 * without touching scroll performance.
 */
export function ButcheryTeaser({
  onOpen,
  assetBase = `${BASE_PATH}/butchery`,
  scheme = 'za',
  eyebrow,
  title,
  body,
  cta,
}: ButcheryTeaserProps) {
  const t = useT();
  const [hoverCut, setHoverCut] = useState<string | null>(null);
  const [plateOk, setPlateOk] = useState(true);
  const plateSrc = useMemo(() => `${assetBase}/cow.webp`, [assetBase]);

  const hovered = hoverCut ? CUT_BY_ID.get(hoverCut) ?? null : null;

  return (
    <section className={styles.teaser} aria-labelledby="butchery-teaser-title">
      <div className={styles.chart}>
        <CowChart
          plateSrc={plateSrc}
          scheme={scheme}
          selectedCut={null}
          hoverCut={hoverCut}
          showLabels={false}
          onHoverCut={setHoverCut}
          onSelectCut={cutId => onOpen(cutId)}
          plateLoaded={plateOk}
          onPlateError={() => setPlateOk(false)}
        />
        <p className={styles.hint} aria-live="polite">
          {hovered ? cutName(hovered, scheme) : t('cut.primal')}
        </p>
      </div>

      <div className={styles.copy}>
        <p className={styles.eyebrow}>{eyebrow ?? t('cut.eyebrow')}</p>
        <h3 className={styles.title} id="butchery-teaser-title">{title ?? t('cut.knowYourCut')}</h3>
        <p className={styles.body}>{body ?? t('cut.teaserBody')}</p>
        <button type="button" className={styles.cta} onClick={() => onOpen()}>
          {cta ?? t('cut.openButchery')} <ArrowRight size={15} />
        </button>
      </div>
    </section>
  );
}
