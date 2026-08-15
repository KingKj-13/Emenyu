export const FILTER_OPTIONS = [
  { key: 'Vegetarian',  label: 'Vegetarian',   mode: 'include' as const },
  { key: 'Vegan',       label: 'Vegan',        mode: 'include' as const },
  { key: 'Gluten',      label: 'Gluten Free',  mode: 'exclude' as const },
  { key: 'Dairy',       label: 'Dairy Free',   mode: 'exclude' as const },
  { key: 'Halal',       label: 'Halal',        mode: 'include' as const },
  { key: 'Nuts',        label: 'Nut Free',     mode: 'exclude' as const },
  { key: 'Egg',         label: 'Egg Free',     mode: 'exclude' as const },
  { key: 'Pork',        label: 'Pork Free',    mode: 'exclude' as const },
];
