import { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import type { MenuItem } from '../../types/menu';
import type { CutMenuMatch } from './cutMenuMap';

/**
 * The restaurant's own cut data, when it has curated any.
 *
 * The client ships a complete butchery chart — geometry, copy and name-matching
 * rules — so the screen works on day one for a tenant that has configured
 * nothing. This hook layers the DATABASE on top of that: once an owner edits a
 * cut or links a dish in the admin panel, what a guest sees comes from those
 * rows instead of the built-in catalogue.
 *
 * Falling back is per-cut, not all-or-nothing: a restaurant that has curated
 * three primals gets its three, and the catalogue for the rest.
 */

export interface ServerCutMedia {
  id: number;
  kind: 'IMAGE' | 'VIDEO';
  url: string;
  posterUrl: string;
  alt: string;
  caption: string;
  durationSec: number | null;
  featured: boolean;
}

export interface ServerCutItem {
  menuItemId: number;
  name: string;
  description: string;
  price: number;
  img: string;
  video: string;
  available: boolean;
  matchType: 'PRIMARY' | 'RELATED';
  label: string;
}

export interface ServerCut {
  id: number;
  slug: string;
  name: string;
  altName: string;
  description: string;
  texture: string;
  bestFor: string[];
  media: ServerCutMedia[];
  items: ServerCutItem[];
}

export function useButcheryCuts(locale: string): Map<string, ServerCut> | null {
  const [cuts, setCuts] = useState<ServerCut[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getButcheryCuts(locale)
      .then(res => {
        if (cancelled) return;
        const list = (res as { cuts: ServerCut[] }).cuts ?? [];
        // An empty list means "not curated", which is not the same as "failed".
        // Both land on null so the caller uses the built-in catalogue.
        setCuts(list.length > 0 ? list : null);
      })
      .catch(() => { if (!cancelled) setCuts(null); });
    return () => { cancelled = true; };
  }, [locale]);

  return useMemo(() => {
    if (!cuts) return null;
    return new Map(cuts.map(c => [c.slug, c]));
  }, [cuts]);
}

/**
 * Turn a curated cut's linked dishes into the same shape the name-matching
 * rules produce, so the panel renders one way regardless of where the data
 * came from.
 */
export function serverCutToMatch(cut: ServerCut): CutMenuMatch {
  const primary: MenuItem[] = [];
  const related: MenuItem[] = [];
  let relatedLabel = '';

  for (const link of cut.items) {
    const item: MenuItem = {
      dbId: link.menuItemId,
      name: link.name,
      description: link.description,
      price: link.price,
      img: link.img,
      video: link.video,
      available: link.available,
    };
    if (link.matchType === 'RELATED') {
      related.push(item);
      // The heading belongs to the group; the first link that carries one wins.
      if (!relatedLabel && link.label) relatedLabel = link.label;
    } else {
      primary.push(item);
    }
  }

  return {
    primary,
    related: related.length > 0 ? { label: relatedLabel || 'Also from this cut', items: related } : null,
  };
}
