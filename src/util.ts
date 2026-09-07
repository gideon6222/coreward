/* Tiny helpers with no dependencies. */

export const key = (x: number, d: number) => x + ',' + d;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/* Blend two packed 0xRRGGBB colours. Lives here rather than in materials.ts
   because world generation needs it and materials.ts imports three.js - the
   pure layer must stay pure or the bundle guard's whole premise goes with it. */
export function mixHex(a: number, b: number, t: number) {
  const u = 1 - t;
  const r = ((a >> 16) & 255) * u + ((b >> 16) & 255) * t;
  const g = ((a >> 8) & 255) * u + ((b >> 8) & 255) * t;
  const bl = (a & 255) * u + (b & 255) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}
