/**
 * cut -> menu item wiring.
 *
 * There is deliberately NO new database table, column or API here. The chart's
 * anatomy (cutCatalog.ts) is static reference data; the dishes are whatever the
 * tenant's real menu already holds, fetched once by MenuContext from
 * GET <base>/api/menu. This module is the only place that knows how to get from
 * one to the other, and it does it by matching item names — the only cut
 * information the menu data actually carries.
 *
 * A rule set is per-restaurant so the component stays reusable: pick one with
 * `getCutMenuMapping(RESTAURANT_ID)`, which falls back to the generic
 * steakhouse rules rather than failing.
 */
import type { MenuItem } from '../../types/menu';

export interface CutRelatedRule {
  /** Heading shown above the group — say plainly why these are here. */
  label: string;
  match: RegExp[];
  exclude?: RegExp[];
}

export interface CutMenuRule {
  /** Items genuinely cut from this primal. */
  match: RegExp[];
  exclude?: RegExp[];
  /** Items the kitchen makes FROM this primal without being the cut itself
   *  (mince, patties, a bone-in steak that carries the lobe). Always labelled
   *  so it never reads as "this is that cut". */
  related?: CutRelatedRule;
}

export interface CutMenuMapping {
  /** Category title used by the "browse everything" fallback when a cut has
   *  nothing on tonight's menu. Must match a real MenuCategory.title. */
  browseCategory: string;
  /** Applied to every rule: words that mean "this is not beef" even though the
   *  name contains a beef cut word (LAMB RUMP, PORK TOMAHAWK, KINGKLIP FILLET). */
  notBeef: RegExp;
  rules: Record<string, CutMenuRule>;
}

// A steakhouse's carcass-to-menu wiring. Written against Trump's live item
// names (see `Trumps Premium Steaks`, `Oxtail & Beef Ribs`, `Burgers`), and
// generic enough to be the default for any other grillhouse tenant.
const STEAKHOUSE: CutMenuMapping = {
  browseCategory: 'Trumps Premium Steaks',
  notBeef: /\b(lamb|pork|chicken|ostrich|springbok|kudu|venison|kingklip|salmon|hake|sole|prawn|calamari|veg|halloumi|tofu)\b/i,
  // Every pattern is anchored on word boundaries. Without them a bare /rump/i
  // matches "T-RUMP-S SALAD", and this restaurant's own name puts that trap in
  // roughly a dozen item names.
  rules: {
    rib: {
      // Ribeye in every grade, plus the tomahawk (a ribeye with the bone left
      // long) and the short ribs cut off the same section.
      match: [/\bribeye\b/i, /\btomahawk\b/i, /\bbeef ribs\b/i],
    },
    sirloin: {
      // The strip loin itself, and the T-bone, whose larger lobe is strip.
      match: [/\bsirloin\b/i, /\bt-?bone\b/i],
    },
    fillet: {
      match: [/\bfillet\b/i],
      related: {
        label: 'Carries a fillet lobe',
        match: [/\bt-?bone\b/i],
      },
    },
    rump: {
      match: [/\brump\b/i, /\bpicanha\b/i],
    },
    chuck: {
      // Chuckeye and Denver are both cut from the shoulder.
      match: [/\bchuckeye\b/i, /\bdenver\b/i, /\bchuck\b/i],
      related: {
        label: 'Ground for our patties',
        match: [/\bburgers?\b/i],
        // Poultry/veg patties obviously are not beef chuck.
        exclude: [/\bchicken\b|\bveg\b|\bhalloumi\b/i],
      },
    },
    silverside: {
      // Biltong is cured silverside — the one cut on this chart that South
      // African menus name by its product rather than its primal.
      match: [/\bbiltong\b/i, /\bsilverside\b/i],
    },
    neck: {
      match: [/\bneck\b/i],
      related: {
        label: 'Minced and slow-cooked here',
        match: [/\bbolognese\b/i, /\brag[uù]\b/i],
      },
    },
    shin: {
      match: [/\bosso ?buco\b/i, /\bshin\b/i, /\bshank\b/i],
      related: {
        label: 'Braised the same way',
        match: [/^\s*oxtail\s*$/i],
      },
    },
    brisket: { match: [/\bbrisket\b/i] },
    thinflank: { match: [/\bflank steak\b/i, /\bthin flank\b/i] },
    thickflank: { match: [/\bthick flank\b/i, /\bknuckle\b/i] },
    topside: { match: [/\btopside\b/i] },
  },
};

const CUT_MENU_MAPPINGS: Record<string, CutMenuMapping> = {
  trump: STEAKHOUSE,
  demo: STEAKHOUSE,
};

export function getCutMenuMapping(restaurantId: string): CutMenuMapping {
  return CUT_MENU_MAPPINGS[restaurantId] ?? STEAKHOUSE;
}

export interface CutMenuMatch {
  /** Items genuinely from this primal, in menu order. */
  primary: MenuItem[];
  /** Optional secondary group, only when the rule defines one and it matched. */
  related: { label: string; items: MenuItem[] } | null;
}

const EMPTY: CutMenuMatch = { primary: [], related: null };

function test(name: string, patterns: RegExp[]): boolean {
  return patterns.some(re => re.test(name));
}

/**
 * Resolve one cut against the tenant's live menu. Pure and cheap — memoize the
 * whole table once per menu load rather than calling this per render.
 */
export function matchCutItems(
  cutId: string,
  items: MenuItem[],
  mapping: CutMenuMapping
): CutMenuMatch {
  const rule = mapping.rules[cutId];
  if (!rule) return EMPTY;

  const primary: MenuItem[] = [];
  const relatedItems: MenuItem[] = [];
  const claimed = new Set<MenuItem>();

  for (const item of items) {
    const name = String(item.name || '');
    if (!name || mapping.notBeef.test(name)) continue;
    if (rule.exclude && test(name, rule.exclude)) continue;
    if (test(name, rule.match)) {
      primary.push(item);
      claimed.add(item);
    }
  }

  if (rule.related) {
    for (const item of items) {
      if (claimed.has(item)) continue;
      const name = String(item.name || '');
      if (!name || mapping.notBeef.test(name)) continue;
      if (rule.related.exclude && test(name, rule.related.exclude)) continue;
      if (test(name, rule.related.match)) relatedItems.push(item);
    }
  }

  return {
    primary,
    related: rule.related && relatedItems.length > 0
      ? { label: rule.related.label, items: relatedItems }
      : null,
  };
}

/**
 * Does this menu have anything the chart can point at? Lets a caller hide the
 * butchery entirely for a tenant whose menu has no beef primals, without that
 * caller needing to know anything about cuts. Early-exits on the first hit.
 */
export function hasCutMenuMatches(items: MenuItem[], mapping: CutMenuMapping): boolean {
  for (const rule of Object.values(mapping.rules)) {
    if (rule.match.length === 0) continue;
    for (const item of items) {
      const name = String(item.name || '');
      if (!name || mapping.notBeef.test(name)) continue;
      if (rule.exclude && test(name, rule.exclude)) continue;
      if (test(name, rule.match)) return true;
    }
  }
  return false;
}

/** Every cut resolved in one pass — build this once per menu payload. */
export function buildCutMenuIndex(
  cutIds: string[],
  items: MenuItem[],
  mapping: CutMenuMapping
): Record<string, CutMenuMatch> {
  const index: Record<string, CutMenuMatch> = {};
  for (const id of cutIds) index[id] = matchCutItems(id, items, mapping);
  return index;
}
