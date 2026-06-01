import { useMemo, useState } from 'react';
import { Sparkles, Play, Plus } from 'lucide-react';
import { resolveImage, resolveVideo } from '../../lib/imageResolver';
import { matchShowcaseSlug } from '../../lib/demoMedia';
import { formatPrice } from '../../lib/menuUtils';
import {
  journeyForSlug,
  showcaseBySlug,
  waiterLine,
  story,
  COURSE_LABEL,
  type Course,
  type ShowcaseItem,
} from '../../config/trumpDemoConfig';
import type { MenuItem } from '../../types/menu';
import styles from './FeaturedExperience.module.css';

interface FeaturedExperienceProps {
  item: MenuItem;
  onRequestItem?: (name: string) => void;
  onOpenItem?: (item: MenuItem) => void;
  onAddSuggestion?: (item: MenuItem) => void;
}

const COURSE_ORDER: Course[] = ['drink', 'starter', 'main', 'dessert', 'wine'];

/** Build a lightweight MenuItem from a showcase catalog entry. */
function showcaseToItem(sc: ShowcaseItem): MenuItem {
  return { name: sc.name, price: sc.price, description: sc.blurb, category: sc.course };
}

/**
 * The Featured Dish Experience shown when a showcase dish is opened: the AI
 * waiter's recommendation plus the full curated journey (drink → starter →
 * main → dessert → wine) as large, swipeable media cards.
 */
export function FeaturedExperience({ item, onRequestItem, onOpenItem, onAddSuggestion }: FeaturedExperienceProps) {
  const anchorSlug = matchShowcaseSlug(item);
  const [playing, setPlaying] = useState<string | null>(null);

  const courses = useMemo(() => {
    if (!anchorSlug) return [];
    const journey = journeyForSlug(anchorSlug);
    return COURSE_ORDER
      .map(course => ({ course, sc: showcaseBySlug(journey[course]) }))
      .filter((entry): entry is { course: Course; sc: ShowcaseItem } => Boolean(entry.sc));
  }, [anchorSlug]);

  if (!anchorSlug || courses.length === 0) return null;

  return (
    <section className={styles.experience}>
      <div className={styles.header}>
        <Sparkles size={14} className={styles.headerIcon} />
        <span className={styles.headerLabel}>Your AI Waiter Recommends</span>
      </div>

      <p className={styles.waiterLine}>{waiterLine(anchorSlug)}</p>

      <div className={styles.gallery} data-noswipe>
        {courses.map(({ course, sc }) => {
          const suggestion = showcaseToItem(sc);
          const img = resolveImage(suggestion);
          const video = resolveVideo(suggestion);
          const isAnchor = sc.slug === anchorSlug;
          const isPlaying = playing === sc.slug;
          const open = () => { if (onOpenItem) onOpenItem(suggestion); else onRequestItem?.(sc.name); };

          return (
            <article
              key={sc.slug}
              className={`${styles.card} ${isAnchor ? styles.cardAnchor : styles.cardClickable}`}
              onClick={isAnchor ? undefined : open}
              role={isAnchor ? undefined : 'button'}
              tabIndex={isAnchor ? undefined : 0}
              onKeyDown={isAnchor ? undefined : (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } })}
              aria-label={isAnchor ? `${sc.name} (your choice)` : `View ${sc.name} and its pairing`}
            >
              <div className={styles.media}>
                {isPlaying && video ? (
                  <video
                    className={styles.mediaVideo}
                    src={video}
                    autoPlay
                    muted
                    loop
                    playsInline
                  />
                ) : (
                  <img className={styles.mediaImg} src={img} alt={sc.name} loading="lazy" />
                )}
                <span className={styles.courseChip}>{COURSE_LABEL[course]}</span>
                {isAnchor && <span className={styles.anchorChip}>Your choice</span>}
                {video && !isPlaying && (
                  <button
                    type="button"
                    className={styles.playBtn}
                    aria-label={`Play ${sc.name} video`}
                    onClick={e => { e.stopPropagation(); setPlaying(sc.slug); }}
                  >
                    <Play size={18} fill="currentColor" />
                  </button>
                )}
              </div>

              <div className={styles.cardBody}>
                <h4 className={styles.cardName}>{sc.name}</h4>
                <p className={styles.cardBlurb}>{story(sc.slug)}</p>
                <div className={styles.cardFooter}>
                  <span className={styles.cardPrice}>{formatPrice(sc.price)}</span>
                  <button
                    type="button"
                    className={styles.addBtn}
                    onClick={e => { e.stopPropagation(); onAddSuggestion?.(suggestion); }}
                    aria-label={`Add ${sc.name} to cart`}
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
