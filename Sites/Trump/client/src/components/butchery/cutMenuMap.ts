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
  /**
   * Other primals a guest who liked THIS one would likely also like — similar
   * texture, similar cooking method, not the same cut. Ordered nearest-first.
   * Only consulted when tonight's menu has nothing from this cut AND no
   * `related` group either — a real, if approximate, answer beats "ask your
   * waiter" when one exists. The first candidate with something on the menu
   * wins; the rest are never checked.
   */
  similarCuts?: string[];
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
      similarCuts: ['sirloin', 'fillet'],
    },
    sirloin: {
      // The strip loin itself, and the T-bone, whose larger lobe is strip.
      match: [/\bsirloin\b/i, /\bt-?bone\b/i],
      similarCuts: ['rib', 'rump', 'fillet'],
    },
    fillet: {
      match: [/\bfillet\b/i],
      related: {
        label: 'Carries a fillet lobe',
        match: [/\bt-?bone\b/i],
      },
      similarCuts: ['sirloin', 'rib'],
    },
    rump: {
      match: [/\brump\b/i, /\bpicanha\b/i],
      similarCuts: ['sirloin', 'silverside', 'topside'],
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
      similarCuts: ['brisket', 'neck', 'shin'],
    },
    silverside: {
      // Biltong is cured silverside — the one cut on this chart that South
      // African menus name by its product rather than its primal.
      match: [/\bbiltong\b/i, /\bsilverside\b/i],
      similarCuts: ['topside', 'rump', 'thickflank'],
    },
    neck: {
      match: [/\bneck\b/i],
      related: {
        label: 'Minced and slow-cooked here',
        match: [/\bbolognese\b/i, /\brag[uù]\b/i],
      },
      similarCuts: ['shin', 'chuck', 'brisket'],
    },
    shin: {
      match: [/\bosso ?buco\b/i, /\bshin\b/i, /\bshank\b/i],
      related: {
        label: 'Braised the same way',
        match: [/^\s*oxtail\s*$/i],
      },
      similarCuts: ['neck', 'chuck', 'brisket'],
    },
    brisket: { match: [/\bbrisket\b/i], similarCuts: ['chuck', 'neck', 'shin'] },
    thinflank: { match: [/\bflank steak\b/i, /\bthin flank\b/i], similarCuts: ['thickflank', 'silverside', 'rump'] },
    thickflank: { match: [/\bthick flank\b/i, /\bknuckle\b/i], similarCuts: ['rump', 'silverside', 'topside'] },
    topside: { match: [/\btopside\b/i], similarCuts: ['silverside', 'rump', 'thickflank'] },
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
  /**
   * Set only when `primary` and `related` are both empty: the nearest
   * `similarCuts` entry that DOES have something on tonight's menu, so the
   * panel can say "not this cut, but here's Rump" instead of a dead end.
   */
  similar: { cutId: string; items: MenuItem[] } | null;
}

const EMPTY: CutMenuMatch = { primary: [], related: null, similar: null };

function test(name: string, patterns: RegExp[]): boolean {
  return patterns.some(re => re.test(name));
}

/**
 * The string a rule is tested against. Defaults to the item's own `.name`,
 * which is correct as long as that name is English.
 *
 * It stops being correct the moment a caller's items carry LOCALIZED names —
 * `GET /api/menu?locale=ja` overwrites `item.name` with the Japanese
 * translation, and every rule above is an English regex. A menu whose dishes
 * are fully translated (no Latin substrings survive — this menu's own
 * "T-Bone"/"Tomahawk" happen to stay Latin, which is why German silently
 * kept working while Japanese and Arabic went dark: neither retains an
 * English word anywhere) then matches nothing, `hasCutMenuMatches` returns
 * false, and the whole chart disappears — not just fails to translate.
 *
 * A caller whose items may be localized should pass a resolver that looks up
 * the item's ENGLISH name (by the locale-invariant `dbId`) instead of using
 * the localized `.name` directly. See hooks/useEnglishNameByDbId.
 */
export type MatchNameResolver = (item: MenuItem) => string;
const defaultNameResolver: MatchNameResolver = item => String(item.name || '');

/**
 * Resolve one cut against the tenant's live menu. Pure and cheap — memoize the
 * whole table once per menu load rather than calling this per render.
 */
export function matchCutItems(
  cutId: string,
  items: MenuItem[],
  mapping: CutMenuMapping,
  matchName: MatchNameResolver = defaultNameResolver
): CutMenuMatch {
  const rule = mapping.rules[cutId];
  if (!rule) return EMPTY;

  const primary: MenuItem[] = [];
  const relatedItems: MenuItem[] = [];
  const claimed = new Set<MenuItem>();

  for (const item of items) {
    const name = matchName(item);
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
      const name = matchName(item);
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
    // Filled in by buildCutMenuIndex, which alone has every cut's result to
    // draw a fallback from — a single cut's own match can't see its siblings.
    similar: null,
  };
}

/**
 * Does this menu have anything the chart can point at? Lets a caller hide the
 * butchery entirely for a tenant whose menu has no beef primals, without that
 * caller needing to know anything about cuts. Early-exits on the first hit.
 */
export function hasCutMenuMatches(
  items: MenuItem[],
  mapping: CutMenuMapping,
  matchName: MatchNameResolver = defaultNameResolver
): boolean {
  for (const rule of Object.values(mapping.rules)) {
    if (rule.match.length === 0) continue;
    for (const item of items) {
      const name = matchName(item);
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
  mapping: CutMenuMapping,
  matchName: MatchNameResolver = defaultNameResolver
): Record<string, CutMenuMatch> {
  const index: Record<string, CutMenuMatch> = {};
  for (const id of cutIds) index[id] = matchCutItems(id, items, mapping, matchName);

  // Second pass: a cut with nothing of its own (and no related group) borrows
  // the nearest similarCuts entry that DOES have something tonight. Needs
  // every cut resolved first, which is exactly what this function alone has.
  for (const id of cutIds) {
    const match = index[id];
    if (match.primary.length > 0 || match.related) continue;
    const candidates = mapping.rules[id]?.similarCuts;
    if (!candidates) continue;
    for (const candidateId of candidates) {
      const candidate = index[candidateId];
      if (candidate && candidate.primary.length > 0) {
        index[id] = { ...match, similar: { cutId: candidateId, items: candidate.primary } };
        break;
      }
    }
  }

  return index;
}

export interface ItemCutMatch {
  cutId: string;
  relation: 'primary' | 'related';
  /** Only set when relation === 'related' — the rule's own label (e.g. "Ground for our patties"). */
  relatedLabel?: string;
}

/**
 * The inverse of buildCutMenuIndex: which cut (if any) does a given menu item
 * come from? Built from the SAME index the chart itself displays (pass the
 * post-serverCuts-overlay index, not a freshly-derived one) so a dish's "From
 * the Ribeye" link can never disagree with what the chart shows for that cut.
 *
 * Keyed by object reference — correct as long as both indexes are built from
 * the same `items` array for one menu load, which every call site does.
 * `primary` wins over `related` when an item somehow matches both.
 */
export function buildItemToCutIndex(cutIndex: Record<string, CutMenuMatch>): Map<MenuItem, ItemCutMatch> {
  const index = new Map<MenuItem, ItemCutMatch>();
  for (const [cutId, match] of Object.entries(cutIndex)) {
    if (match.related) {
      for (const item of match.related.items) {
        if (!index.has(item)) index.set(item, { cutId, relation: 'related', relatedLabel: match.related.label });
      }
    }
  }
  for (const [cutId, match] of Object.entries(cutIndex)) {
    for (const item of match.primary) index.set(item, { cutId, relation: 'primary' });
  }
  return index;
}
