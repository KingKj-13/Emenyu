/**
 * Demo media resolution for the Trump showcase experience.
 *
 * - Matches live menu items to showcase slugs.
 * - Builds image/video URLs under /Trump/media/trump/.
 * - Caches the server's auto-detected media manifest so the UI knows exactly
 *   which assets exist (image, video, both, or neither → placeholder).
 *
 * The resolver is synchronous so it can be called from `imageResolver`. Until
 * the manifest has loaded it falls back to the naming convention
 * (`<slug>.jpg` / `<slug>.mp4`), which is correct for every shipped asset.
 */
import { BASE_PATH } from '../constants/api';
import { DEMO_MODE, SHOWCASE_ITEMS, DEMO_MEDIA_BASE } from '../config/trumpDemoConfig';
import type { MenuItem } from '../types/menu';

function normalize(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Flatten every (slug, matcher) pair and sort by matcher length descending so
// the most specific fragment wins regardless of catalog order.
const MATCHERS: { slug: string; matcher: string }[] = SHOWCASE_ITEMS
  .flatMap(item => item.matchers.map(matcher => ({ slug: item.slug, matcher })))
  .sort((a, b) => b.matcher.length - a.matcher.length);

/** Returns the showcase slug a menu item maps to, or null. */
export function matchShowcaseSlug(item: Pick<MenuItem, 'name'> | string | null | undefined): string | null {
  if (!item) return null;
  const name = typeof item === 'string' ? item : item.name;
  const norm = normalize(name);
  if (!norm) return null;
  for (const { slug, matcher } of MATCHERS) {
    if (norm.includes(matcher)) return slug;
  }
  return null;
}

export function isShowcaseItem(item: Pick<MenuItem, 'name'> | string | null | undefined): boolean {
  return matchShowcaseSlug(item) !== null;
}

const PLACEHOLDER = `${BASE_PATH}/Images/Tomahawk.jpg`;

// ── Manifest cache (populated from GET /api/demo-media) ──────────────────────

export interface DemoManifestItem {
  slug: string;
  name: string;
  course: string;
  hasImage: boolean;
  hasVideo: boolean;
  image: string | null; // filename, e.g. "tomahawk.jpg"
  video: string | null; // filename, e.g. "tomahawk.mp4"
  priority: number;      // 1 = image+video … 4 = neither
}

export interface DemoManifestExtra {
  base: string;
  image: string | null;
  video: string | null;
}

export interface DemoManifest {
  folder: string;
  servedFrom: string;
  supportedFormats: { image: string[]; video: string[] };
  counts: { images: number; videos: number; slugs: number; complete: number; partial: number; missing: number };
  items: DemoManifestItem[];
  extras: DemoManifestExtra[];
  files: { images: string[]; videos: string[] };
}

let manifest: DemoManifest | null = null;
let manifestBySlug = new Map<string, DemoManifestItem>();
let loadPromise: Promise<DemoManifest | null> | null = null;

export function setDemoManifest(next: DemoManifest | null): void {
  manifest = next;
  manifestBySlug = new Map((next?.items || []).map(i => [i.slug, i]));
}

/** Loads the auto-detected media manifest once and caches it. */
export function loadDemoManifest(): Promise<DemoManifest | null> {
  if (manifest) return Promise.resolve(manifest);
  if (loadPromise) return loadPromise;
  loadPromise = fetch(`${BASE_PATH}/api/demo-media`)
    .then(res => (res.ok ? res.json() : null))
    .then((data: DemoManifest | null) => {
      if (data) setDemoManifest(data);
      return manifest;
    })
    .catch(() => null);
  return loadPromise;
}

function mediaUrl(file: string): string {
  return `${BASE_PATH}/${DEMO_MEDIA_BASE}/${file}`;
}

/** Whether an image asset exists for the slug (optimistic before manifest load). */
export function hasDemoImage(slug: string): boolean {
  const entry = manifestBySlug.get(slug);
  if (entry) return entry.hasImage;
  return MATCHERS.some(m => m.slug === slug); // shipped slug → assume yes
}

export function hasDemoVideo(slug: string): boolean {
  const entry = manifestBySlug.get(slug);
  if (entry) return entry.hasVideo;
  return MATCHERS.some(m => m.slug === slug);
}

/** Image URL for a showcase slug, or null when none exists. */
export function demoImageUrl(slug: string): string | null {
  const entry = manifestBySlug.get(slug);
  if (entry) return entry.image ? mediaUrl(entry.image) : null;
  return hasDemoImage(slug) ? mediaUrl(`${slug}.jpg`) : null;
}

/** Video URL for a showcase slug, or null when none exists. */
export function demoVideoUrl(slug: string): string | null {
  const entry = manifestBySlug.get(slug);
  if (entry) return entry.video ? mediaUrl(entry.video) : null;
  return hasDemoVideo(slug) ? mediaUrl(`${slug}.mp4`) : null;
}

/** Image URL for a menu item if it is a showcase item, else null. */
export function resolveDemoImage(item: Pick<MenuItem, 'name'>): string | null {
  if (!DEMO_MODE) return null;
  const slug = matchShowcaseSlug(item);
  return slug ? demoImageUrl(slug) : null;
}

/** Video URL for a menu item if it is a showcase item, else null. */
export function resolveDemoVideo(item: Pick<MenuItem, 'name'>): string | null {
  if (!DEMO_MODE) return null;
  const slug = matchShowcaseSlug(item);
  return slug ? demoVideoUrl(slug) : null;
}

/**
 * Warm the device cache with the (small) showcase images during idle time so
 * the gallery and dish cards render instantly on first open. Videos are left to
 * load on demand (they are large and HTTP-cached for repeat views).
 */
let prefetched = false;
export function prefetchShowcaseImages(): void {
  if (prefetched || typeof window === 'undefined') return;
  prefetched = true;
  const run = () => {
    for (const { slug } of MATCHERS.filter((m, i, a) => a.findIndex(x => x.slug === m.slug) === i)) {
      const url = demoImageUrl(slug);
      if (url) { const img = new Image(); img.src = url; }
    }
  };
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (ric) ric(run); else setTimeout(run, 1200);
}

export { PLACEHOLDER as DEMO_PLACEHOLDER };
