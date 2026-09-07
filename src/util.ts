/* Tiny helpers with no dependencies. */

export const key = (x, d) => x + ',' + d;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
