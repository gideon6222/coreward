/* Tiny helpers with no dependencies. */

export const key = (x: number, d: number) => x + ',' + d;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
