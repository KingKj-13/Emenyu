import { BASE_PATH } from '../constants/api';
import type { MenuItem } from '../types/menu';

// A file that actually exists in this tenant's Images set.
export const FALLBACK_IMAGE = `${BASE_PATH}/Images/placeholder.webp`;

export function resolveImage(item: MenuItem): string {
  if (item.imageVisible === false) return '';

  const raw = item.img;
  if (raw && raw.trim()) {
    if (/^https?:\/\//.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) {
      return raw;
    }
    if (raw.startsWith('/uploads/')) return `${BASE_PATH}${raw}`;
    if (raw.startsWith(`${BASE_PATH}/`)) return raw;
    if (raw.startsWith('/')) return `${BASE_PATH}${raw}`;
    return `${BASE_PATH}/${raw}`;
  }

  return FALLBACK_IMAGE;
}

// 300px card thumbnail for a resolved image URL. The upload pipeline emits
// Images/thumbnails/<stem>.webp and uploads/thumbnails/<stem>.webp next to
// every full-size asset; anything that doesn't follow that layout just uses
// its full image. Callers should fall back to resolveImage() output onError
// (thumbnails are derived, not guaranteed to exist).
export function resolveThumbnail(item: MenuItem): string {
  const full = resolveImage(item);
  const basePattern = BASE_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = full.match(new RegExp(`^(${basePattern}/(?:Images|uploads))/([^/]+)\\.(?:jpe?g|png|webp)$`, 'i'));
  if (!match) return full;
  const stem = match[2];
  return `${match[1]}/thumbnails/${stem}.webp`;
}

export function resolveAssetPath(path: string): string {
  const raw = String(path || '').trim();
  if (!raw) return raw;
  if (/^(?:[a-z]+:)?\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  if (raw.startsWith(`${BASE_PATH}/`)) return raw;
  if (raw.startsWith('/')) return `${BASE_PATH}${raw}`;
  return `${BASE_PATH}/${raw}`;
}
