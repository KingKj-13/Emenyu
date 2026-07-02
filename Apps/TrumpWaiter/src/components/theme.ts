// Visual theme — dark, gold-accented, matching the Trump web admin/waiter consoles.
export const theme = {
  colors: {
    bg: '#0b0b0c',
    surface: '#151517',
    surfaceAlt: '#1d1d20',
    border: '#2a2a2e',
    text: '#f4f4f5',
    textDim: '#a1a1aa',
    gold: '#c9a24a',
    goldDim: '#8a6f33',
    green: '#3fa66a',
    red: '#d6584f',
    amber: '#d99a2b',
    blue: '#4a7fc9'
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 8, md: 12, lg: 16, pill: 999 },
  font: { sm: 13, md: 15, lg: 18, xl: 22, xxl: 28 }
} as const;

// Priority (1 urgent … 5 info) → accent colour, mirroring PUSH-ARCHITECTURE.md.
export function priorityColor(priority: number): string {
  if (priority <= 2) return theme.colors.red;
  if (priority === 3) return theme.colors.amber;
  return theme.colors.textDim;
}
