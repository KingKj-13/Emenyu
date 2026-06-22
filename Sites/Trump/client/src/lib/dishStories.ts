// Waiter-facing dish stories — a short narrative a waiter can tell the table.
// One curated example for the demo; add more keys (normalized, no spaces) as needed.

export interface DishStory {
  title: string;
  story: string;
  tip?: string;
}

const STORIES: Record<string, DishStory> = {
  ribeye: {
    title: 'The Ribeye Story',
    story:
      'Our ribeye is cut from grain-finished beef and dry-aged in-house for 28 days, which concentrates the flavour and tenderises the marbling that runs through this cut. We sear it hard over open flame to lock in the juices, then rest it so every slice stays pink and full of that buttery, nutty richness the ribeye is famous for.',
    tip: 'Suggest it medium-rare with a peppercorn or red-wine jus, and a bold red like the Beyerskloof Reserve to match the marbling.',
  },
};

export function dishStory(name?: string): DishStory | null {
  const key = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!key) return null;
  for (const k of Object.keys(STORIES)) {
    if (key.includes(k)) return STORIES[k];
  }
  return null;
}
