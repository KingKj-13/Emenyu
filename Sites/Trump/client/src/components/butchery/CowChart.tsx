import { memo, useCallback, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  SILHOUETTE, MEND, SEAMS, REGIONS, LABELS, CUT_BY_ID,
  cutAccessibleName, type NamingScheme,
} from './cutCatalog';
import { useI18n } from '../../i18n';
import { resolveCutCopy } from '../../i18n/butchery';
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
  // memo() still re-renders on a context change, which is what we want: the
  // chart's in-animal labels are localised.
  const { locale } = useI18n();
  const regionsRef = useRef<SVGPathElement[]>([]);
  const labelRefs = useRef<(SVGTextElement | null)[]>([]);

  /**
   * Keep every label inside its own primal, in any language.
   *
   * The English tags were picked to fit by eye. A translation has no such
   * guarantee — in chart units the Spanish "LOMO ALTO" renders 240 against
   * English's widest at 144 — and character count does not predict it, because
   * glyph widths differ wildly between scripts.
   *
   * A single global budget is not enough either: 150 units fits the rump but
   * spills out of the rib, so a capped label still crossed the seam into its
   * neighbour. The budget therefore comes from the primal the label sits in.
   * An upright label is bounded by that region's width, a rotated one by its
   * height, since rotated labels run along the animal.
   */
  useLayoutEffect(() => {
    const svg = labelRefs.current.find(Boolean)?.ownerSVGElement;
    if (!svg) return;

    /**
     * How much room the primal actually gives this label, measured at the
     * label's own position rather than from the region's bounding box.
     *
     * A bbox lies here: the primals are slanted quadrilaterals, so the rib's
     * box is 172 units wide while the band under the label is nearer 110. A
     * budget from the box let "LOMO ALTO" spill across the seam. Walking
     * outwards with isPointInFill until we leave the shape gives the true
     * width of the band at that height.
     */
    const roomAt = (cut: string, x: number, y: number, along: 'x' | 'y') => {
      const paths = [...svg.querySelectorAll<SVGPathElement>(`path[data-cut="${cut}"]`)];
      if (!paths.length) return 0;
      const inside = (px: number, py: number) => {
        const pt = new DOMPoint(px, py);
        return paths.some(p => p.isPointInFill(pt));
      };
      const STEP = 4, LIMIT = 420;
      let back = 0, fwd = 0;
      for (let d = STEP; d <= LIMIT; d += STEP) {
        if (!inside(along === 'x' ? x - d : x, along === 'x' ? y : y - d)) break;
        back = d;
      }
      for (let d = STEP; d <= LIMIT; d += STEP) {
        if (!inside(along === 'x' ? x + d : x, along === 'x' ? y : y + d)) break;
        fwd = d;
      }
      return back + fwd;
    };

    labelRefs.current.forEach((el, i) => {
      if (!el) return;
      const l = LABELS[i];
      el.removeAttribute('textLength');
      el.removeAttribute('lengthAdjust');
      if (!l) return;

      // y is the text baseline; sample slightly above it, through the glyphs.
      const probeY = l.y - l.size * 0.3;
      const room = roomAt(l.cut, l.x, probeY, l.rot ? 'y' : 'x');
      // 0.88 keeps a sliver of the primal visible either side of the word.
      const budget = room > 0 ? Math.max(44, room * 0.88) : (l.rot ? 210 : 150);

      if (el.getComputedTextLength() > budget) {
        el.setAttribute('textLength', String(Math.round(budget)));
        el.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      }
    });
  }, [locale, scheme, showLabels, plateLoaded]);

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
              /* Lets the label auto-fit measure the primal it has to sit
                 inside. On the fill layer rather than the hit regions because
                 the teaser renders with interactive={false} and has none. */
              data-cut={cut}
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
                  ref={el => { labelRefs.current[i] = el; }}
                  x={l.x}
                  y={l.y}
                  fontSize={l.size}
                  transform={l.rot ? `rotate(${l.rot} ${l.x} ${l.y})` : undefined}
                  className={l.cut === selectedCut ? styles.labelOn : undefined}
                >
                  {resolveCutCopy(cut, locale, scheme).tag}
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
