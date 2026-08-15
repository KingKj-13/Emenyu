const NUMERALS: Array<[number, string]> = [
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

// Menus don't run past ten chapters; a small hand-built table reads more
// clearly here than pulling in a general-purpose roman-numeral library.
export function toRoman(n: number): string {
  let value = Math.max(1, Math.min(10, n));
  let out = '';
  for (const [amount, glyph] of NUMERALS) {
    while (value >= amount) {
      out += glyph;
      value -= amount;
    }
  }
  return out;
}
