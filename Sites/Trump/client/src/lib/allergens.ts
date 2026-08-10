import type { MessageKey } from '../i18n/messages/en';

/**
 * The allergen column is a comma-separated list drawn from a closed vocabulary
 * of ten tokens. It is stored in English because it is data the kitchen keys
 * off, so it is translated at the point of display rather than in the database.
 *
 * A token we do not recognise is passed through untouched. That is deliberate:
 * for allergen information, showing the original English is safe, whereas
 * dropping or guessing at it is not.
 */
const KNOWN = new Set([
  'Beef', 'Chicken', 'Egg', 'Gluten', 'Lamb', 'Nuts', 'Pork', 'Seafood', 'Vegan', 'Vegetarian',
]);

export function localizeAllergens(raw: string, t: (key: MessageKey) => string): string {
  if (!raw) return '';
  return raw
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(token => (KNOWN.has(token) ? t(`allergen.${token}` as MessageKey) : token))
    .join(', ');
}
