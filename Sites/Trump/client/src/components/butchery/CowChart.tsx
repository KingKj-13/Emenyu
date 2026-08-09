import { memo, useCallback, useRef, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  SILHOUETTE, MEND, SEAMS, REGIONS, LABELS, CUT_BY_ID,
  cutAccessibleName, type NamingScheme,
} from './cutCatalog';
import styles from './CowChart.module.css';

export interface CowChartProps {
  /** Carcass plate (a flat silhouette in the tenant's hide tone). */
  plateSrc: string;
  scheme: NamingScheme;
  /** The lifted cut — filled solid and left lit while everything else recedes. */
  selectedCut: string | null;
  /** Pointer/focus preview, ignored while a cut is lifted. */
  hoverCut: string | null;
  /** False for the decorative teaser: no hit regions, no focus stops. */
  interactive?: boolean;
  /** Chart labels don't fit under ~560px of width; the caller decides. */
  showLabels?: boolean;
  onHoverCut?: (cutId: string | null) => void;
  onSelectCut?: (cutId: string, el: SVGPathElement) => void;
  /** Warm the cut photograph before the tap lands. */
  onWarmCut?: (cutId: string) => void;
  /** The <svg> that owns chart space — the selector measures through its CTM. */
  svgRef?: React.RefObject<SVGSVGElement | null>;
  /** First region element per cut, so a cut chosen from the rail still flies
   *  off the right part of the animal. */
  primaryRegionsRef?: React.MutableRefObject<Map<string, SVGPathElement>>;
  plateLoaded: boolean;
  onPlateError: () => void;
}

/**
 * The chart itself: silhouette, seams, fills, labels and hit regions, all in
 * 1200x720 chart space. Stateless — every visual state arrives as a prop, so
 * the same component draws the full selector and the menu teaser.
 */
export const CowChart = memo(function CowChart({
  plateSrc, scheme, selectedCut, hoverCut, interactive = true, showLabels = true,
  onHoverCut, onSelectCut, onWarmCut, svgRef, primaryRegionsRef,
  plateLoaded, onPlateError,
}: CowChartProps) {
  const regionsRef = useRef<SVGPathElement[]>([]);

  const registerRegion = useCallback((el: SVGPathElement | null, index: number, cutId: string) => {
    if (!el) return;
    regionsRef.current[index] = el;
    if (primaryRegionsRef && !primaryRegionsRef.current.has(cutId)) {
      primaryRegionsRef.current.set(cutId, el);
    }
  }, [primaryRegionsRef]);

  // Arrow keys walk the chart the way the animal is laid out rather than in
  // DOM order: pick the nearest region in the pressed direction, preferring
  // straight ahead over sideways.
  const handleKeyDown = useCallback((e: ReactKeyboardEvent<SVGPathElement>, cutId: string) => {
    const target = e.currentTarget;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelectCut?.(cutId, target);
      return;
    }
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const all = regionsRef.current.filter(Boolean);
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      (e.key === 'Home' ? all[0] : all[all.length - 1])?.focus();
      return;
    }
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const centre = (el: SVGPathElement) => {
      const b = el.getBBox();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const from = centre(target);
    let best: SVGPathElement | null = null;
    let score = Infinity;
    for (const el of all) {
      if (el === target) continue;
      const to = centre(el);
      const along = (to.x - from.x) * d[0] + (to.y - from.y) * d[1];
      if (along <= 4) continue;
      const across = Math.abs((to.x - from.x) * d[1] - (to.y - from.y) * d[0]);
      const s = along + across * 2.5;
      if (s < score) { score = s; best = el; }
    }
    best?.focus();
  }, [onSelectCut]);

  const handleEnter = useCallback((e: ReactPointerEvent<SVGPathElement>, cutId: string) => {
    void e;
    onWarmCut?.(cutId);
    onHoverCut?.(cutId);
  }, [onHoverCut, onWarmCut]);

  return (
    <div className={`${styles.plate} ${selectedCut ? styles.isOpen : ''} ${plateLoaded ? '' : styles.noPlate}`}>
      <img className={styles.cow} src={plateSrc} alt="" decoding="async" onError={onPlateError} />

      {/* The plate's alpha leaves a notch between belly and hind leg; this
          patch closes it so the flank reads as one continuous animal. */}
      <svg className={`${styles.layer} ${styles.mend}`} viewBox="0 0 1200 720" aria-hidden="true" focusable="false">
        <path d={MEND} />
      </svg>

      <svg
        ref={svgRef}
        className={styles.layer}
        viewBox="0 0 1200 720"
        role={interactive ? 'group' : 'img'}
        aria-labelledby="cow-title cow-desc"
        /* Stable hook for the guest-experience suite: the chart is otherwise
           only identifiable through hashed CSS-module class names. */
        data-cow-chart=""
      >
        <title id="cow-title">Side view of a beef carcass divided into twelve primal cuts</title>
        <desc id="cow-desc">
          The animal faces left, drawn as a pale silhouette on a dark ground. Rules
          divide it into twelve primal cuts, each labelled inside its own region.
          Select any cut to lift it off the carcass and see what it is, how it eats
          and which dishes on the menu are cut from it.
        </desc>

        <defs>
          <clipPath id="cowBodyClip"><path d={SILHOUETTE} /></clipPath>
        </defs>

        {/* Drawn only when the plate image fails — the chart still works. */}
        <path className={styles.silhouette} d={SILHOUETTE} />

        <g className={styles.fillLayer} clipPath="url(#cowBodyClip)">
          {REGIONS.map(([id, cut, d]) => (
            <path
              key={`fill-${id}`}
              d={d}
              className={
                cut === selectedCut ? styles.fillOn
                  : (!selectedCut && cut === hoverCut) ? styles.fillHover
                    : undefined
              }
            />
          ))}
        </g>

        <g className={styles.seams} clipPath="url(#cowBodyClip)" aria-hidden="true">
          {SEAMS.map(([bounds, d]) => <path key={bounds} d={d} />)}
        </g>

        {showLabels && (
          <g className={styles.labels} aria-hidden="true">
            {LABELS.map((l, i) => {
              const cut = CUT_BY_ID.get(l.cut);
              if (!cut) return null;
              return (
                <text
                  key={`${l.cut}-${i}`}
                  x={l.x}
                  y={l.y}
                  fontSize={l.size}
                  transform={l.rot ? `rotate(${l.rot} ${l.x} ${l.y})` : undefined}
                  className={l.cut === selectedCut ? styles.labelOn : undefined}
                >
                  {cut.tag[scheme]}
                </text>
              );
            })}
          </g>
        )}

        {interactive && (
          <g className={styles.regions} clipPath="url(#cowBodyClip)">
            {REGIONS.map(([id, cut, d], i) => {
              const def = CUT_BY_ID.get(cut);
              const label = def ? cutAccessibleName(def, scheme) : cut;
              return (
                <path
                  key={id}
                  id={id}
                  d={d}
                  ref={el => registerRegion(el, i, cut)}
                  role="button"
                  tabIndex={selectedCut ? -1 : 0}
                  aria-label={label}
                  onPointerEnter={e => handleEnter(e, cut)}
                  onPointerDown={() => onWarmCut?.(cut)}
                  onPointerLeave={() => onHoverCut?.(null)}
                  onFocus={() => { onWarmCut?.(cut); onHoverCut?.(cut); }}
                  onBlur={() => onHoverCut?.(null)}
                  onClick={e => onSelectCut?.(cut, e.currentTarget)}
                  onKeyDown={e => handleKeyDown(e, cut)}
                >
                  <title>{label}</title>
                </path>
              );
            })}
          </g>
        )}
      </svg>
    </div>
  );
});
