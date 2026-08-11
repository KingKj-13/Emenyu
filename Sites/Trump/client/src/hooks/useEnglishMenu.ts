import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { flattenMenu } from '../lib/menuUtils';
import type { MenuData, MenuItem } from '../types/menu';

/**
 * The menu's English item list, regardless of the guest's chosen language.
 *
 * `dbId` is the only thing that survives translation intact, so anything that
 * needs to reason about an item independent of locale — matching a dish name
 * against an English regex, cross-referencing two fetches of the same menu —
 * needs this alongside the localized list, not instead of it.
 *
 * Originally written once, inline, inside the admin content editor (which
 * needs to show "here is the untranslated source text" next to each
 * translation field). Extracted here because a second, unrelated consumer
 * turned up: the butchery chart's client-side cut matching is pure English
 * regex (cutMenuMap.ts) run against `item.name` — which is silently blank in
 * every language whose translated dish names carry no English substring, so
 * without this the whole chart disappears in, for a concrete example,
 * Japanese and Arabic. See CowMeatSelector's cutIndex and MenuPage's
 * showButchery, both of which resolve the English name back out by dbId
 * before matching.
 */
export function useEnglishMenu(): MenuItem[] {
  const [menu, setMenu] = useState<MenuData>({});
  useEffect(() => {
    let cancelled = false;
    api.getMenu('en')
      .then(d => { if (!cancelled) setMenu(d); })
      .catch(() => { /* the list simply stays empty */ });
    return () => { cancelled = true; };
  }, []);
  return useMemo(() => flattenMenu(menu).filter(i => i.dbId != null), [menu]);
}

/** dbId -> English name, for O(1) lookup from a localized item. */
export function useEnglishNameByDbId(): Map<number, string> {
  const englishItems = useEnglishMenu();
  return useMemo(() => {
    const map = new Map<number, string>();
    for (const item of englishItems) {
      if (item.dbId != null) map.set(item.dbId, item.name);
    }
    return map;
  }, [englishItems]);
}
