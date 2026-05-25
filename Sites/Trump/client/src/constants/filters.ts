export const FILTER_OPTIONS = [
  { key: 'Beef',        label: 'No Beef',          mode: 'exclude' as const },
  { key: 'Chicken',     label: 'No Chicken',        mode: 'exclude' as const },
  { key: 'Pork',        label: 'No Pork',           mode: 'exclude' as const },
  { key: 'Lamb',        label: 'No Lamb',           mode: 'exclude' as const },
  { key: 'Seafood',     label: 'No Seafood',        mode: 'exclude' as const },
  { key: 'Egg',         label: 'No Egg',            mode: 'exclude' as const },
  { key: 'Gluten',      label: 'No Gluten',         mode: 'exclude' as const },
  { key: 'Nuts',        label: 'No Nuts',           mode: 'exclude' as const },
  { key: 'Vegan',       label: 'Vegan Only',        mode: 'include' as const },
  { key: 'Vegetarian',  label: 'Vegetarian Only',   mode: 'include' as const },
];
