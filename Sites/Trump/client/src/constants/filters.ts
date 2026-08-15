import type { MessageKey } from '../i18n/messages/en';

/**
 * `key` is the dietary tag matched against the menu data and MUST stay English.
 * `labelKey` is what the guest reads; `label` is only the English fallback used
 * when a caller has no translator to hand.
 */
export const FILTER_OPTIONS: Array<{
  key: string;
  label: string;
  labelKey: MessageKey;
  mode: 'exclude' | 'include';
}> = [
  { key: 'Beef',        label: 'No Beef',          labelKey: 'diet.noBeef',          mode: 'exclude' },
  { key: 'Chicken',     label: 'No Chicken',       labelKey: 'diet.noChicken',       mode: 'exclude' },
  { key: 'Pork',        label: 'No Pork',          labelKey: 'diet.noPork',          mode: 'exclude' },
  { key: 'Lamb',        label: 'No Lamb',          labelKey: 'diet.noLamb',          mode: 'exclude' },
  { key: 'Seafood',     label: 'No Seafood',       labelKey: 'diet.noSeafood',       mode: 'exclude' },
  { key: 'Egg',         label: 'No Egg',           labelKey: 'diet.noEgg',           mode: 'exclude' },
  { key: 'Gluten',      label: 'No Gluten',        labelKey: 'diet.noGluten',        mode: 'exclude' },
  { key: 'Nuts',        label: 'No Nuts',          labelKey: 'diet.noNuts',          mode: 'exclude' },
  { key: 'Vegan',       label: 'Vegan Only',       labelKey: 'diet.veganOnly',       mode: 'include' },
  { key: 'Vegetarian',  label: 'Vegetarian Only',  labelKey: 'diet.vegetarianOnly',  mode: 'include' },
];
