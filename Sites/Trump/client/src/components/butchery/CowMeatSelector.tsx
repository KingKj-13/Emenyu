import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { X, ArrowRight, Ban, ChevronRight } from 'lucide-react';
import { CowChart } from './CowChart';
import {
  CUTS, CUT_BY_ID, cutAltName, cutName, SILHOUETTE,
  type CutDefinition, type NamingScheme,
} from './cutCatalog';
import {
  buildCutMenuIndex, getCutMenuMapping, type CutMenuMapping, type CutMenuMatch,
} from './cutMenuMap';
import { useEnglishNameByDbId } from '../../hooks/useEnglishMenu';
import { serverCutToMatch, type ServerCut } from './useButcheryCuts';
import { formatPrice } from '../../lib/menuUtils';
import { resolveImage, FALLBACK_IMAGE } from '../../lib/imageResolver';
import { useI18n } from '../../i18n';
import { resolveCutCopy } from '../../i18n/butchery';
import { track } from '../../lib/engagement';
import { BASE_PATH, RESTAURANT_ID } from '../../constants/api';
import type { MenuItem } from '../../types/menu';
import styles from './CowMeatSelector.module.css';

/* ── the lift-off, in numbers ───────────────────────────────────────────── */
const T = {
  FLIGHT: 460,      // ms, First -> Last
  ROT_WINDOW: 340,  // rotation returns to zero before any crossfade starts
  ROT_PEAK: 6,      // degrees
  FADE_AT: 340,
  FADE: 250,
  // The settle. The cut arrives at (1 - GROW) and eases UP to exactly 1 — it
  // never exceeds its own layout size, because any scale above 1 re-rasterises
  // the photograph at a higher resolution and costs a ~270ms frame on a
  // throttled tablet. Visually identical; measurably cheaper.
  GROW: 0.08,
  // Where the cut comes to rest, as a fraction of the stage. It lands LOW and
  // no wider than half the stage on purpose: filling the stage buried the
  // animal, and with the carcass hidden the guest loses both the highlighted
  // primal and the whole point of the screen — seeing where their steak sat.
  LAND_Y: 0.72,
  LAND_W: 0.54,
  LAND_H: 0.52,
};
const TOTAL = T.FADE_AT + T.FADE;

const NAMING_KEY = 'butchery.naming';

/* ── easing (Newton-solved cubic bezier, same curves as the prototype) ──── */
function clamp(v: number, a: number, b: number) { return v < a ? a : v > b ? b : v; }
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-6) break;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    return sy(clamp(t, 0, 1));
  };
}
const EASE_FLY = cubicBezier(0.16, 0.84, 0.34, 1);
const EASE_GROW = cubicBezier(0.33, 0, 0.2, 1);

/* ── cut photographs ─────────────────────────────────────────────────────
   Module-scoped so the decoded set survives a remount (route change, drawer
   toggle) instead of being refetched. Bounded by the catalogue: 11 images. */
interface Art { url: string; aspect: number }
const artPending = new Map<string, Promise<Art | null>>();
const artReady = new Map<string, Art>();

/**
 * True while a cut is flying. Decoding a 1400px WebP costs real main-thread
 * time — measured at a 250ms stall mid-flight on a 4x-throttled tablet — so
 * the background warm-up stands aside while an animation is on screen.
 */
let flightActive = false;

/** Resolve after the browser has had a chance to paint. */
function yieldToBrowser(): Promise<void> {
  return new Promise(resolve => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve(), { timeout: 500 });
    } else {
      window.setTimeout(resolve, 32);
    }
  });
}

function loadArt(url: string): Promise<Art | null> {
  if (artReady.has(url)) return Promise.resolve(artReady.get(url)!);
  const existing = artPending.get(url);
  if (existing) return existing;
  const job = (async () => {
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      if (!img.naturalWidth) return null;
      const rec: Art = { url, aspect: img.naturalWidth / img.naturalHeight };
      artReady.set(url, rec);
      return rec;
    } catch {
      return null;
    }
  })();
  artPending.set(url, job);
  return job;
}

/* ── geometry helpers ───────────────────────────────────────────────────── */
interface Box { left: number; top: number; width: number; height: number; scale?: number }
interface RegionBox extends Box { bbox: DOMRect }

function fitBox(cx: number, cy: number, maxW: number, maxH: number, aspect: number): Box {
  const w = Math.min(maxW, maxH * aspect);
  const h = w / aspect;
  return { left: cx - w / 2, top: cy - h / 2, width: w, height: h };
}

/**
 * Below the 900px breakpoint the detail panel stops being a side column and
 * becomes a bottom sheet covering 52dvh (see CowMeatSelector.module.css). The
 * desktop resting place — 72% down the stage — then sits right on the sheet's
 * lip, so on a short phone the cut reads as tucked behind the description.
 *
 * On those viewports the cut rests higher, and takes the width the vanished
 * side column freed up so it does not just get smaller and further away.
 */
function landingMetrics(): { y: number; w: number; h: number } {
  const compact = typeof window !== 'undefined' && window.innerWidth < 900;
  return compact
    ? { y: 0.50, w: 0.62, h: 0.46 }
    : { y: T.LAND_Y, w: T.LAND_W, h: T.LAND_H };
}

/** Where the cut rests: centred horizontally, low in the stage, sized so the
 *  carcass and its lit primal stay readable behind and above it. */
function landingBox(stg: Box, first: Box, aspect: number): Box {
  const m = landingMetrics();
  const box = fitBox(
    stg.left + stg.width / 2,
    stg.top + stg.height * m.y,
    stg.width * m.w,
    stg.height * m.h,
    aspect
  );
  // Never let the cut run off the bottom of the stage.
  box.top = Math.min(box.top, stg.top + stg.height - box.height);
  box.scale = box.width / first.width;
  return box;
}

interface FlightState {
  el: SVGPathElement;
  mode: 'meat' | 'hide';
  first: Box;
  last: Box;
  ready: boolean;
  art: Art | null;
}

/* ── props ──────────────────────────────────────────────────────────────── */
export interface CowMeatSelectorProps {
  /** The tenant's flattened menu — the only source of dish data. */
  items: MenuItem[];
  /** Which restaurant's cut->item rules to use. Defaults to the build's tenant. */
  restaurantId?: string;
  mapping?: CutMenuMapping;
  /** Where the chart artwork lives. Defaults to `<base>/butchery`. */
  assetBase?: string;
  /** Open on this cut on first paint (deep link: ?cut=rib). */
  initialCut?: string | null;
  onOpenItem?: (item: MenuItem) => void;
  /** "See every steak" escape hatch, shown when a cut has nothing tonight. */
  onBrowseAll?: () => void;
  browseAllLabel?: string;
  /** Fired whenever the lifted cut changes, so a page can sync the URL. */
  onCutChange?: (cutId: string | null) => void;
  /**
   * The restaurant's curated cuts, keyed by slug. When a cut appears here its
   * copy, its dishes and its photograph come from the database — which is what
   * makes an owner's edit in the admin panel visible to guests. Cuts absent
   * from the map fall back to the built-in catalogue, per cut.
   */
  serverCuts?: Map<string, ServerCut> | null;
  /**
   * Below 900px, collapse to a 64px trigger row instead of mounting the full
   * chart inline. Tapping it reveals the exact same experience as an overlay.
   *
   * Off by default so every EXISTING call site (the dedicated /butchery route,
   * whose whole purpose is showing this) is untouched. The guest-menu embed,
   * where the chart used to sit inline above the dish grid, opts in.
   */
  mobileEntry?: boolean;
}

export function CowMeatSelector({
  items,
  restaurantId = RESTAURANT_ID,
  mapping,
  assetBase = `${BASE_PATH}/butchery`,
  initialCut = null,
  onOpenItem,
  onBrowseAll,
  browseAllLabel,
  onCutChange,
  serverCuts = null,
  mobileEntry = false,
}: CowMeatSelectorProps) {
  const { t, locale } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const primaryRegionsRef = useRef<Map<string, SVGPathElement>>(new Map());
  const flierRef = useRef<HTMLDivElement>(null);
  const flierImgRef = useRef<HTMLImageElement>(null);
  const flierSvgRef = useRef<SVGSVGElement>(null);
  const flierShapeRef = useRef<SVGPathElement>(null);
  const cutImgRef = useRef<HTMLImageElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const [scheme, setScheme] = useState<NamingScheme>(() => {
    try { return localStorage.getItem(NAMING_KEY) === 'us' ? 'us' : 'za'; } catch { return 'za'; }
  });
  const [activeCut, setActiveCut] = useState<CutDefinition | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hoverCut, setHoverCut] = useState<string | null>(null);
  const [plateOk, setPlateOk] = useState(true);
  const [artNote, setArtNote] = useState(false);

  const activeCutRef = useRef<CutDefinition | null>(null);
  const pendingRef = useRef<{ cut: CutDefinition; el: SVGPathElement } | null>(null);
  const animRef = useRef<{ dir: 1 | -1; t: number; at: number } | null>(null);
  const rafRef = useRef(0);
  const stateRef = useRef<FlightState | null>(null);
  const landedRef = useRef(false);

  const reduced = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduced.current = mq.matches;
    const on = () => { reduced.current = mq.matches; };
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  /**
   * The 900px breakpoint the stylesheet already uses for the bottom sheet
   * (see the "Under 900px the rail becomes a bottom sheet" comment on .root
   * below). Tracked as state, not read once, so rotating a tablet across the
   * line re-renders rather than leaving a phone-sized layout on a now-wide
   * screen.
   */
  const [compact, setCompact] = useState(
    () => mobileEntry && typeof window !== 'undefined' && window.innerWidth < 900
  );
  useEffect(() => {
    if (!mobileEntry) return;
    const mq = window.matchMedia('(max-width: 899.98px)');
    const on = () => setCompact(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [mobileEntry]);

  // Whether the trigger row has been tapped open. A deep link (initialCut)
  // bypasses the row entirely — a guest who followed a specific link expects
  // to see that cut, not one more tap standing between them and it.
  const [revealed, setRevealed] = useState(() => !!initialCut);
  const collapseMobile = useCallback(() => setRevealed(false), []);

  const artUrl = useCallback((cut: CutDefinition) => {
    // A photograph the restaurant uploaded for this cut wins over the shipped
    // plate — that is the whole point of being able to manage cut media.
    const server = serverCuts?.get(cut.id);
    const own = server?.media.find(m => m.kind === 'IMAGE' && m.featured)
      ?? server?.media.find(m => m.kind === 'IMAGE');
    if (own) return own.url;
    return cut.art ? `${assetBase}/${cut.art}.webp` : '';
  }, [assetBase, serverCuts]);

  /* ── cut -> menu, resolved once per menu payload ─────────────────────── */
  const resolvedMapping = useMemo(
    () => mapping ?? getCutMenuMapping(restaurantId),
    [mapping, restaurantId]
  );
  // The match rules are English regex; `items` carries whatever the guest's
  // locale translated dish names into. Matching against the localized name
  // directly works by ACCIDENT in a language that happens to leave enough of
  // the English cut word intact (this menu's own "T-Bone"/"Tomahawk" do), and
  // fails completely in one that translates everything — the whole chart
  // would then show every cut as empty rather than the real menu. Resolve the
  // English name back out by dbId and match against that instead; the
  // returned MenuItem objects are still the localized ones, so display is
  // unaffected.
  const englishNameByDbId = useEnglishNameByDbId();
  const matchName = useCallback(
    (item: MenuItem) => {
      const english = item.dbId != null ? englishNameByDbId.get(item.dbId) : undefined;
      return english ?? item.name;
    },
    [englishNameByDbId]
  );
  const cutIndex = useMemo(() => {
    const derived = buildCutMenuIndex(CUTS.map(c => c.id), items, resolvedMapping, matchName);
    if (!serverCuts) return derived;
    // A curated cut REPLACES the name-matched result rather than merging with
    // it: an owner who removed a link meant to remove it, and a merge would
    // quietly put it back.
    const merged: Record<string, CutMenuMatch> = { ...derived };
    for (const [slug, cut] of serverCuts) {
      if (cut.items.length > 0) merged[slug] = serverCutToMatch(cut);
    }
    return merged;
  }, [items, resolvedMapping, serverCuts, matchName]);

  /**
   * The cut's copy, resolved per field. Precedence, highest first:
   *   1. what the restaurant curated in the admin panel (`serverCuts`)
   *   2. the guest's language (`resolveCutCopy`)
   *   3. the English catalogue
   * Unlike before, this always returns a value: the locale overlay applies even
   * when the tenant has curated nothing, which is the normal case.
   */
  const cutCopy = useCallback((cut: CutDefinition) => {
    const local = resolveCutCopy(cut, locale, scheme);
    const server = serverCuts?.get(cut.id);

    /**
     * The server wins only when it actually says something the English
     * catalogue does not — an owner's edit, or a COW_CUT translation it has
     * already applied for this locale. When it merely echoes the English (the
     * normal case: a tenant with seeded cuts and no COW_CUT translation rows),
     * a guest reading Japanese should get our translated catalogue, not the
     * server's untranslated English.
     *
     * Comparing against the English catalogue is what makes that distinction
     * possible, and it keeps owner edits visible in every language.
     */
    const custom = (value: string | undefined, english: string) =>
      !!value && value !== english;

    const serverBestForIsCustom = !!server?.bestFor?.length
      && server.bestFor.join(' ') !== cut.bestFor.join(' ');

    return {
      name: custom(server?.name, cut.names[scheme]) ? server!.name : local.name,
      altName: custom(server?.altName, cutAltName(cut, scheme)) ? server!.altName : '',
      // The same cut under the OTHER naming convention, in the guest's
      // language — shown as "US - <name>" beneath the heading.
      altLocal: resolveCutCopy(cut, locale, scheme === 'za' ? 'us' : 'za').name,
      description: custom(server?.description, cut.description) ? server!.description : local.description,
      texture: custom(server?.texture, cut.texture) ? server!.texture : local.texture,
      bestFor: serverBestForIsCustom ? server!.bestFor : local.bestFor,
      dishes: local.dishes,
      tag: local.tag,
      usNote: local.usNote,
      media: server?.media,
    };
  }, [serverCuts, scheme, locale]);

  /* ── naming ──────────────────────────────────────────────────────────── */
  const applyScheme = useCallback((next: NamingScheme) => {
    setScheme(next);
    try { localStorage.setItem(NAMING_KEY, next); } catch { /* private mode */ }
  }, []);

  /* ── measurement (all boxes are root-local, so the overlays can be
        absolutely positioned inside the component rather than fixed) ────── */
  const localOffset = useCallback(() => {
    const r = rootRef.current?.getBoundingClientRect();
    return { x: r?.left ?? 0, y: r?.top ?? 0 };
  }, []);

  const rectOfRegion = useCallback((el: SVGPathElement): RegionBox | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const b = el.getBBox();
    const p = svg.createSVGPoint();
    p.x = b.x; p.y = b.y;
    const a = p.matrixTransform(m);
    p.x = b.x + b.width; p.y = b.y + b.height;
    const c = p.matrixTransform(m);
    const o = localOffset();
    return {
      bbox: b,
      left: a.x - o.x, top: a.y - o.y,
      width: c.x - a.x, height: c.y - a.y,
    };
  }, [localOffset]);

  const stageRect = useCallback((): Box => {
    const s = stageRef.current?.getBoundingClientRect();
    const o = localOffset();
    if (!s) return { left: 0, top: 0, width: 0, height: 0 };
    return { left: s.left - o.x, top: s.top - o.y, width: s.width, height: s.height };
  }, [localOffset]);

  /* ── the timeline. One function describes the whole open; closing plays
        the identical function with time running backwards. ──────────────── */
  const applyAt = useCallback((ms: number) => {
    const st = stateRef.current;
    const flier = flierRef.current;
    const cutImg = cutImgRef.current;
    if (!st || !flier || !cutImg) return;
    const meat = st.mode === 'meat';
    const e = EASE_FLY(clamp(ms / T.FLIGHT, 0, 1));
    const rot = T.ROT_PEAK * Math.sin(Math.PI * clamp(ms / T.ROT_WINDOW, 0, 1));
    const g = EASE_GROW(clamp((ms - T.FADE_AT) / T.FADE, 0, 1));
    const grow = (1 - T.GROW) + T.GROW * g;    // 0.92 -> 1, never above 1

    // The flier is SIZED at its landing box and only ever scales DOWN toward 1.
    // Scaling a small element up to ~3.8x forced the browser to re-rasterise
    // the photograph at increasing resolution mid-flight — a measured 250ms
    // stall on a throttled tablet. Rasterising once at final size and easing a
    // sub-1 scale up to 1 keeps the whole flight on the compositor.
    const shrink = st.last.width > 0 ? st.first.width / st.last.width : 1;
    const scale = (shrink + (1 - shrink) * e) * grow;
    // Offsets run from "at the region" back to zero as the cut arrives.
    const dx = (st.first.left + st.first.width / 2) - (st.last.left + st.last.width / 2);
    const dy = (st.first.top + st.first.height / 2) - (st.last.top + st.last.height / 2);
    flier.style.transform =
      `translate(${dx * (1 - e)}px, ${dy * (1 - e)}px) scale(${scale}) rotate(${rot}deg)`;
    // `filter` is deliberately NOT animated. A drop-shadow that changes every
    // frame re-rasterises the whole bitmap on every frame — measured at a 66ms
    // p95 (~15fps) on a 4x-throttled tablet, against 16ms with a static shadow.
    // transform and opacity are compositor-only, so the flight stays on the GPU.
    flier.style.opacity = meat ? '1' : (st.ready ? String(1 - g) : '1');
    cutImg.style.opacity = meat ? '0' : (st.ready ? String(g) : '0');
    cutImg.style.transform = `scale(${grow})`;
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
    animRef.current = null;
    flightActive = false;
  }, []);

  // settle() is authoritative about the landed state: the photograph can become
  // ready in the gap between the last frame and here, so don't trust applyAt.
  const settle = useCallback(() => {
    landedRef.current = true;
    const st = stateRef.current;
    const flier = flierRef.current;
    const cutImg = cutImgRef.current;
    if (!st || !flier || !cutImg) return;
    if (st.mode === 'meat') return;           // already showing the cut
    if (st.ready) {
      cutImg.style.opacity = '1';
      cutImg.style.transform = 'scale(1)';
      flier.style.opacity = '0';
      flier.style.visibility = 'hidden';
    } else {
      flier.style.visibility = 'visible';
      flier.style.opacity = '1';
      // Only when a photograph is expected. A cut the catalogue has no picture
      // for lands as a filled chart shape, which reads as deliberate.
      if (activeCutRef.current?.art) setArtNote(true);
    }
  }, []);

  const openRef = useRef<(cut: CutDefinition, el: SVGPathElement) => void>(() => {});

  const finishClose = useCallback(() => {
    const flier = flierRef.current;
    const cutImg = cutImgRef.current;
    if (flier) flier.style.visibility = 'hidden';
    if (cutImg) { cutImg.style.opacity = '0'; cutImg.removeAttribute('src'); }
    landedRef.current = false;
    stateRef.current = null;
    activeCutRef.current = null;
    setActiveCut(null);
    setArtNote(false);
    onCutChange?.(null);
    const next = pendingRef.current;
    if (next) {
      pendingRef.current = null;
      openRef.current(next.cut, next.el);
    }
  }, [onCutChange]);

  const step = useCallback((now: number) => {
    rafRef.current = requestAnimationFrame(step);
    const anim = animRef.current;
    if (!anim) { stop(); return; }
    // rAF's timestamp is the frame's start, which can predate the
    // performance.now() taken when the run was scheduled. An unclamped delta
    // goes negative on the first frame and drives the timeline back to zero.
    const d = Math.max(0, now - anim.at);
    anim.at = now;
    anim.t += d * anim.dir;
    if (anim.dir > 0 && anim.t >= TOTAL) { anim.t = TOTAL; applyAt(TOTAL); stop(); settle(); }
    else if (anim.dir < 0 && anim.t <= 0) { anim.t = 0; applyAt(0); stop(); finishClose(); }
    else applyAt(clamp(anim.t, 0, TOTAL));
  }, [applyAt, finishClose, settle, stop]);

  const run = useCallback((dir: 1 | -1) => {
    flightActive = true;
    animRef.current = { dir, t: dir > 0 ? 0 : TOTAL, at: performance.now() };
    if (!rafRef.current) rafRef.current = requestAnimationFrame(step);
  }, [step]);

  /* ── the flier: two modes ────────────────────────────────────────────────
     If the cut's photograph is already decoded, the photograph itself is what
     leaves the animal — no crossfade, one object throughout. Without one, the
     piece of carcass flies as a filled chart shape and the picture crosses in
     later if it arrives. */
  const prepFlier = useCallback((el: SVGPathElement, first: RegionBox | Box, last: Box, mode: 'meat' | 'hide') => {
    const flier = flierRef.current;
    if (!flier) return;
    flier.dataset.mode = mode;
    if (mode === 'hide') {
      const bbox = (first as RegionBox).bbox;
      flierSvgRef.current?.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
      flierShapeRef.current?.setAttribute('d', el.getAttribute('d') || '');
    }
    // Laid out at the LANDING box; applyAt() transforms it back to the region.
    Object.assign(flier.style, {
      left: `${last.left}px`, top: `${last.top}px`,
      width: `${last.width}px`, height: `${last.height}px`,
      visibility: 'visible',
      // Set once, never per frame — see applyAt().
      filter: 'drop-shadow(0 18px 26px rgba(0,0,0,.55))',
    });
  }, []);

  // hide mode only: the photograph was not warm when the tap landed, so the
  // piece of carcass flew instead. If it arrives now, cross into it.
  const lateSwap = useCallback(() => {
    setArtNote(false);
    const t0 = performance.now();
    const tick = (now: number) => {
      const flier = flierRef.current, cutImg = cutImgRef.current;
      if (!flier || !cutImg || !stateRef.current) return;
      const g = EASE_GROW(clamp((now - t0) / T.FADE, 0, 1));
      flier.style.opacity = String(1 - g);
      cutImg.style.opacity = String(g);
      if (g < 1) requestAnimationFrame(tick); else settle();
    };
    requestAnimationFrame(tick);
  }, [settle]);

  const arm = useCallback(async (cut: CutDefinition) => {
    const url = artUrl(cut);
    if (!url) return;                       // catalogue has no picture for this cut
    const rec = await loadArt(url);
    if (activeCutRef.current !== cut || !stateRef.current || stateRef.current.mode !== 'hide') return;
    if (!rec) { if (landedRef.current) setArtNote(true); return; }
    const cutImg = cutImgRef.current;
    if (!cutImg) return;
    cutImg.src = rec.url;
    try { await cutImg.decode(); } catch { /* raced a close */ }
    if (activeCutRef.current !== cut || !stateRef.current) return;
    stateRef.current.ready = true;
    if (landedRef.current) { if (reduced.current) settle(); else lateSwap(); }
  }, [artUrl, lateSwap, settle]);

  const open = useCallback((cut: CutDefinition, el: SVGPathElement) => {
    if (activeCutRef.current) return;
    activeCutRef.current = cut;
    setActiveCut(cut);
    setPanelOpen(true);
    setHoverCut(null);
    setArtNote(false);
    onCutChange?.(cut.id);
    track({ eventType: 'CUT_VIEW', cutSlug: cut.id, label: cutName(cut, scheme) });

    const region = rectOfRegion(el);
    const stg = stageRect();
    if (!region || stg.width === 0) return;

    const cutImg = cutImgRef.current;
    if (cutImg) { cutImg.removeAttribute('src'); cutImg.style.opacity = '0'; }
    landedRef.current = false;

    const art = artReady.get(artUrl(cut)) ?? null;
    let last: Box;
    if (art) {
      // The cut emerges from its own region at the size that fits there, then
      // flies out and grows — one object throughout, nothing has to match.
      const cx = region.left + region.width / 2, cy = region.top + region.height / 2;
      const first = fitBox(cx, cy, region.width, region.height, art.aspect);
      last = landingBox(stg, first, art.aspect);
      if (flierImgRef.current) flierImgRef.current.src = art.url;
      stateRef.current = { el, mode: 'meat', first, last, ready: true, art };
      prepFlier(el, { ...first, bbox: region.bbox }, last, 'meat');
    } else {
      last = landingBox(stg, region, region.width / region.height);
      stateRef.current = { el, mode: 'hide', first: region, last, ready: false, art: null };
      prepFlier(el, region, last, 'hide');
      void arm(cut);
    }

    // The landed photograph and the flier must occupy the same box, or the
    // late crossfade (picture arrived after the flight) visibly jumps.
    const viewer = viewerRef.current;
    if (viewer) {
      Object.assign(viewer.style, {
        left: `${last.left}px`, top: `${last.top}px`,
        width: `${last.width}px`, height: `${last.height}px`,
      });
    }

    if (reduced.current) { applyAt(TOTAL); settle(); } else run(1);
    panelRef.current?.focus({ preventScroll: true });
  }, [applyAt, arm, artUrl, onCutChange, prepFlier, rectOfRegion, run, settle, stageRect]);

  // open() and finishClose() are mutually recursive (a cut chosen while another
  // is lifted queues behind the return flight), so the call goes through a ref.
  useEffect(() => { openRef.current = open; }, [open]);

  const close = useCallback(() => {
    if (!activeCutRef.current) return;
    // Undim and drop the panel first: reversing mid-flight used to return
    // before this line, leaving the carcass dimmed with nothing selected.
    setArtNote(false);
    setPanelOpen(false);
    if (animRef.current) { animRef.current.dir = -1; return; }
    if (reduced.current) { applyAt(0); finishClose(); } else run(-1);
  }, [applyAt, finishClose, run]);

  const select = useCallback((cutId: string, el: SVGPathElement) => {
    const cut = CUT_BY_ID.get(cutId);
    if (!cut) return;
    if (activeCutRef.current) {
      if (activeCutRef.current.id === cutId) return;
      // A cut already lifted has to fly home before the next can be measured.
      pendingRef.current = { cut, el: primaryRegionsRef.current.get(cutId) ?? el };
      close();
      return;
    }
    open(cut, el);
  }, [close, open]);

  const selectById = useCallback((cutId: string) => {
    const el = primaryRegionsRef.current.get(cutId);
    if (el) select(cutId, el);
  }, [select]);

  const handleHover = useCallback((id: string | null) => {
    // Ignored while a cut is lifted: the chart is not interactive then, and a
    // hover must not relabel the caption out from under the open cut.
    if (!activeCutRef.current) setHoverCut(id);
  }, []);

  const warm = useCallback((cutId: string) => {
    const cut = CUT_BY_ID.get(cutId);
    const url = cut ? artUrl(cut) : '';
    if (url && !artReady.has(url)) void loadArt(url);
  }, [artUrl]);

  /* ── background warm-up, one at a time. These are full-quality alpha
        images; fetching eleven at once would saturate the link at exactly the
        moment someone is trying to tap their first cut. ──────────────────── */
  // Collapsed on mobile, nothing is on screen yet — spending bandwidth on
  // photographs for a widget the guest hasn't opened, and may never open on
  // this visit, is the wrong trade. Warm-up starts once the row is tapped.
  const shouldWarm = !compact || revealed;
  useEffect(() => {
    if (!shouldWarm) return;
    let cancelled = false;
    const warmAll = async () => {
      // Warm ONLY the cuts with something on tonight's menu, most-stocked
      // first. Eagerly fetching all eleven photographs cost 1.36 MB on a route
      // where a guest typically opens two or three — and the cuts with no
      // dishes are the least likely to be opened at all. The rest still load
      // on hover/tap, which is where `warm()` already handles them.
      const likely = [...CUTS].sort(
        (a, b) => (cutIndex[b.id]?.primary.length ?? 0) - (cutIndex[a.id]?.primary.length ?? 0)
      ).filter(c => (cutIndex[c.id]?.primary.length ?? 0) > 0);
      for (const c of likely) {
        if (cancelled) return;
        const url = artUrl(c);
        if (!url || artReady.has(url)) continue;
        // Never decode while a cut is in flight, and give the browser a frame
        // between images — a tight decode loop starves the animation.
        while (flightActive && !cancelled) await yieldToBrowser();
        if (cancelled) return;
        await loadArt(url);
        await yieldToBrowser();
      }
    };
    const hasIdle = typeof window.requestIdleCallback === 'function';
    const handle = hasIdle
      ? window.requestIdleCallback(() => { void warmAll(); })
      : window.setTimeout(() => { void warmAll(); }, 800);
    return () => {
      cancelled = true;
      if (hasIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [artUrl, cutIndex, shouldWarm]);

  /* ── deep link (?cut=rib) — runs once the regions have mounted ────────── */
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || !initialCut) return;
    if (!CUT_BY_ID.has(initialCut)) { deepLinked.current = true; return; }
    const el = primaryRegionsRef.current.get(initialCut);
    if (!el) return;
    deepLinked.current = true;
    // One frame so the chart has been laid out and measurement is meaningful.
    const id = requestAnimationFrame(() => selectById(initialCut));
    return () => cancelAnimationFrame(id);
  }, [initialCut, selectById]);

  /* ── escape closes, resize re-measures ───────────────────────────────── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (activeCutRef.current) { e.preventDefault(); close(); return; }
      // No cut lifted, but the mobile sheet is open on its idle content —
      // Escape steps back to the trigger row, same as tapping the backdrop.
      if (compact && revealed) { e.preventDefault(); collapseMobile(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, compact, revealed, collapseMobile]);

  useEffect(() => {
    function onResize() {
      const st = stateRef.current;
      if (!st || !activeCutRef.current || animRef.current) return;
      const stg = stageRect();
      const region = rectOfRegion(st.el);
      if (!region || stg.width === 0) return;
      if (st.mode === 'meat' && st.art) {
        const cx = region.left + region.width / 2, cy = region.top + region.height / 2;
        st.first = fitBox(cx, cy, region.width, region.height, st.art.aspect);
        st.last = landingBox(stg, st.first, st.art.aspect);
      } else {
        st.first = region;
        st.last = landingBox(stg, region, region.width / region.height);
      }
      const viewer = viewerRef.current;
      if (viewer) {
        Object.assign(viewer.style, {
          left: `${st.last.left}px`, top: `${st.last.top}px`,
          width: `${st.last.width}px`, height: `${st.last.height}px`,
        });
      }
      const flier = flierRef.current;
      if (flier) {
        Object.assign(flier.style, {
          left: `${st.last.left}px`, top: `${st.last.top}px`,
          width: `${st.last.width}px`, height: `${st.last.height}px`,
        });
      }
      applyAt(TOTAL);
      if (landedRef.current) settle();
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [applyAt, rectOfRegion, settle, stageRect]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  // Same lock Modal.tsx uses: freeze the page behind the overlay so the guest
  // can't scroll the menu underneath it, and — usefully here — so the page's
  // scrollTop is provably untouched by the time the sheet closes.
  useEffect(() => {
    if (!(compact && revealed)) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [compact, revealed]);


  /* ── render ──────────────────────────────────────────────────────────── */
  const match: CutMenuMatch | null = activeCut ? cutIndex[activeCut.id] ?? null : null;
  const copy = activeCut ? cutCopy(activeCut) : null;
  const similarCut = match?.similar ? CUT_BY_ID.get(match.similar.cutId) ?? null : null;
  const previewCut = hoverCut ? CUT_BY_ID.get(hoverCut) ?? null : null;
  const captionCut = activeCut ?? previewCut;
  const plateSrc = `${assetBase}/cow.webp`;
  // On mobile, revealing the sheet opens it straight to whatever it should
  // show — idle content if no cut is picked yet, or the lifted cut's detail —
  // rather than requiring a lifted cut before the sheet will show at all.
  const isOpen = (!!activeCut && panelOpen) || (compact && revealed);

  /* ── collapsed: a single 64px row, nothing else mounted ────────────────
     No stage, no panel, no chart SVG — the guest hasn't asked for any of it
     yet. Reveals the exact markup below, unchanged, as a fixed overlay. */
  if (compact && !revealed) {
    return (
      <button
        type="button"
        className={styles.triggerRow}
        onClick={() => setRevealed(true)}
        aria-label={`${t('cut.mobileTitle')} — ${t('cut.mobileSubtitle')}`}
      >
        <svg className={styles.triggerGlyph} viewBox="0 0 1200 720" aria-hidden="true" focusable="false">
          <path d={SILHOUETTE} />
        </svg>
        <span className={styles.triggerText}>
          <span className={styles.triggerTitle}>{t('cut.mobileTitle')}</span>
          <span className={styles.triggerSub}>{t('cut.mobileSubtitle')}</span>
        </span>
        <ChevronRight size={18} className={styles.triggerChevron} aria-hidden />
      </button>
    );
  }

  return (
    <>
      {compact && revealed && (
        <div className={styles.mobileBackdrop} onClick={collapseMobile} aria-hidden="true" />
      )}
      <div
        ref={rootRef}
        className={`${styles.root} ${isOpen ? styles.open : ''} ${compact && revealed ? styles.mobileSheet : ''}`}
      >
      <div className={styles.stageCol}>
        <div ref={stageRef} className={styles.stage}>
          <CowChart
            plateSrc={plateSrc}
            scheme={scheme}
            selectedCut={activeCut?.id ?? null}
            hoverCut={hoverCut}
            onHoverCut={handleHover}
            onSelectCut={select}
            onWarmCut={warm}
            svgRef={svgRef}
            primaryRegionsRef={primaryRegionsRef}
            plateLoaded={plateOk}
            onPlateError={() => setPlateOk(false)}
          />
        </div>

        <p className={styles.caption} aria-live="polite">
          {captionCut
            ? <><b>{cutCopy(captionCut).name}</b><span className={styles.captionAlt}> · {cutCopy(captionCut).altLocal}</span></>
            : t('cut.tapAnimal')}
        </p>

        <nav className={styles.rail} aria-label="Primal cuts">
          {CUTS.map(c => (
            <button
              key={c.id}
              type="button"
              className={styles.railBtn}
              aria-pressed={activeCut?.id === c.id}
              onPointerEnter={() => warm(c.id)}
              onPointerDown={() => warm(c.id)}
              onClick={() => selectById(c.id)}
            >
              {cutCopy(c).name}
              {cutIndex[c.id]?.primary.length ? <i className={styles.railDot} aria-hidden /> : null}
            </button>
          ))}
        </nav>
      </div>

      {/* Where a lifted cut lands. Positioned by script over the chart. */}
      <div ref={viewerRef} className={styles.viewer} aria-hidden="true">
        <img ref={cutImgRef} className={styles.cutImg} alt="" />
        <p className={`${styles.stageNote} ${artNote ? styles.stageNoteShown : ''}`}>{t('cut.loadingImage')}</p>
      </div>

      {/* The transition layer. */}
      <div className={styles.overlay} aria-hidden="true">
        <div ref={flierRef} className={styles.flier} data-mode="hide">
          <img ref={flierImgRef} className={styles.flierCut} alt="" />
          <svg ref={flierSvgRef} className={styles.flierSvg} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
            <path ref={flierShapeRef} className={styles.flierShape} d="M0 0" />
          </svg>
        </div>
      </div>

      <aside
        ref={panelRef}
        className={styles.panel}
        tabIndex={-1}
        aria-label={activeCut ? `${cutName(activeCut, scheme)} details` : 'Cut details'}
      >
        {activeCut ? (
          <>
            <button type="button" className={styles.close} onClick={close} aria-label={t('nav.close')}>
              <X size={13} /> {t('nav.close')}
            </button>
            <p className={styles.eyebrow}>{t('cut.primal')}</p>
            <h2 className={styles.cutName}>{copy?.name ?? cutName(activeCut, scheme)}</h2>
            <p className={styles.altName}>
              {copy?.altName
                ? `${scheme === 'za' ? 'US' : 'ZA'} · ${copy.altName}`
                : `${scheme === 'za' ? 'US' : 'ZA'} · ${copy?.altLocal ?? cutAltName(activeCut, scheme)}`}
            </p>

            {copy?.usNote && scheme === 'us' && (
              <p className={styles.note}>{copy.usNote}</p>
            )}

            <p className={styles.desc}>{copy?.description ?? activeCut.description}</p>

            <div className={styles.field}>
              <h3>{t('cut.texture')}</h3>
              <p>{copy?.texture ?? activeCut.texture}</p>
            </div>

            <div className={styles.field}>
              <h3>{t('cut.bestFor')}</h3>
              <ul className={styles.chips}>
                {(copy?.bestFor ?? activeCut.bestFor).map(b => <li key={b}>{b}</li>)}
              </ul>
            </div>

            {/* Extra photographs and any video the restaurant attached to this
                primal. The first image is already flying off the animal, so the
                strip shows what is left rather than repeating it. */}
            {copy?.media && copy.media.length > 1 && (
              <div className={styles.field}>
                <h3>{t('dish.photos')}</h3>
                <ul className={styles.cutMedia}>
                  {copy.media.slice(1).map(m => (
                    <li key={m.id}>
                      {m.kind === 'VIDEO' ? (
                        <video src={m.url} poster={m.posterUrl || undefined} muted loop playsInline
                          onMouseEnter={e => void e.currentTarget.play().catch(() => {})}
                          onMouseLeave={e => e.currentTarget.pause()} />
                      ) : (
                        <img src={m.url} alt={m.alt || copy.name} loading="lazy" decoding="async" />
                      )}
                      {m.caption && <span>{m.caption}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className={styles.field}>
              <h3>{t('cut.onMenu')}</h3>
              {match && match.primary.length > 0 ? (
                <ul className={styles.dishList}>
                  {match.primary.map((item, i) => (
                    <DishRow
                      key={`${item.name}-${i}`}
                      item={item}
                      onOpen={onOpenItem}
                    />
                  ))}
                </ul>
              ) : (
                <div className={styles.empty}>
                  <p>{t('cut.notOnMenu')}</p>
                  {onBrowseAll && (
                    <button type="button" className={styles.browseBtn} onClick={onBrowseAll}>
                      {browseAllLabel ?? t('cut.browseSteaks')} <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {match?.related && (
              <div className={styles.field}>
                <h3>{match.related.label}</h3>
                <ul className={styles.dishList}>
                  {match.related.items.map((item, i) => (
                    <DishRow
                      key={`rel-${item.name}-${i}`}
                      item={item}
                      onOpen={onOpenItem}
                    />
                  ))}
                </ul>
              </div>
            )}

            {/* Nothing genuinely from this primal tonight (and no related-dishes
                group either) -- offer the nearest cut that DOES have something,
                clearly labelled as a substitute, not this cut itself. */}
            {match?.similar && similarCut && (
              <div className={styles.field}>
                <h3>{t('cut.similarTo', { cut: cutCopy(similarCut).name })}</h3>
                <ul className={styles.dishList}>
                  {match.similar.items.map((item, i) => (
                    <DishRow
                      key={`sim-${item.name}-${i}`}
                      item={item}
                      onOpen={onOpenItem}
                    />
                  ))}
                </ul>
              </div>
            )}

            <div className={styles.field}>
              <h3>{t('cut.classically')}</h3>
              <ul className={styles.classics}>
                {(copy?.dishes ?? activeCut.dishes).map(d => (
                  <li key={d.name}><b>{d.name}</b><span>{d.blurb}</span></li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <div className={styles.idle}>
            {/* No cut lifted — nothing to reverse. This just collapses back
                to the trigger row, so it only makes sense once mobile has
                actually revealed the sheet; desktop's idle state is the
                permanent resting view and has nothing to close back to. */}
            {compact && revealed && (
              <button type="button" className={styles.close} onClick={collapseMobile} aria-label={t('nav.close')}>
                <X size={13} /> {t('nav.close')}
              </button>
            )}
            <p className={styles.eyebrow}>{t('nav.butchery')}</p>
            <h2 className={styles.idleTitle}>{t('cut.twelvePrimals')}</h2>
            <p className={styles.idleBody}>{t('cut.intro')}</p>
            <div className={styles.namingRow}>
              <span className={styles.namingLabel}>{t('cut.naming')}</span>
              <div className={styles.seg} role="group" aria-label="Naming convention">
                <button type="button" aria-pressed={scheme === 'za'} onClick={() => applyScheme('za')}>ZA</button>
                <button type="button" aria-pressed={scheme === 'us'} onClick={() => applyScheme('us')}>US</button>
              </div>
            </div>
            <ul className={styles.idleHints}>
              {CUTS.filter(c => (cutIndex[c.id]?.primary.length ?? 0) > 0).slice(0, 4).map(c => (
                <li key={c.id}>
                  <button type="button" onClick={() => selectById(c.id)}>
                    {cutCopy(c).name}
                    <span>{cutIndex[c.id].primary.length} {t('cut.onTheMenu')}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
      </div>
    </>
  );
}

/* ── one dish row: tap it to read the dish ─────────────────────────────────
   There is no add button. The guest learns what the cut becomes on the menu
   and orders it from their waiter — the row's whole job is to open the dish. */
function DishRow({ item, onOpen }: {
  item: MenuItem;
  onOpen?: (item: MenuItem) => void;
}) {
  const sold = item.available === false || item.availability === 'unavailable';
  const [imgError, setImgError] = useState(false);
  const thumbSrc = imgError ? FALLBACK_IMAGE : (resolveImage(item) || FALLBACK_IMAGE);
  return (
    <li className={styles.dish}>
      <img
        className={styles.dishThumb}
        src={thumbSrc}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setImgError(true)}
      />
      <button
        type="button"
        className={styles.dishMain}
        onClick={() => onOpen?.(item)}
        disabled={!onOpen}
      >
        <span className={styles.dishName} dir="auto">{item.name}</span>
        {item.description && <span className={styles.dishDesc} dir="auto">{item.description}</span>}
      </button>
      <span className={styles.dishPrice}>{formatPrice(item.price)}</span>
      {sold
        ? <span className={styles.dishSold} aria-label="Unavailable"><Ban size={14} /></span>
        : <span className={styles.dishGo} aria-hidden><ChevronRight size={16} /></span>}
    </li>
  );
}
