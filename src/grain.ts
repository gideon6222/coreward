/* Surface grain for the HUD, generated rather than shipped.

   The panels were flat translucent fills with soft corners - a clean sci-fi
   overlay, which is a perfectly good look and the wrong one for this game. The
   world underneath is photographed rock; the controls sitting on top of it were
   the only part of the screen with no material at all.

   What fixes that is not more geometry, it is a surface: a fine noise, a
   coarser mottle to break up large panels, and a horizontal brush direction so
   the plates read as rolled steel rather than as paper. Sixty-four pixels,
   tiled, built once at boot. As a data URL it is about 4 KB in memory and zero
   bytes on the wire, which is why it is drawn here rather than imported.

   Two channels of it are used: the alpha carries the grain and the CSS blends
   it over whatever colour the panel already is, so one texture serves the
   chips, the gauges, the d-pad and the buttons without any of them needing
   their own art. */
export function makePanelGrain(size = 64): string {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!;
  const img = x.createImageData(size, size);

  /* A deterministic hash rather than Math.random: the same grain every load
     means a screenshot taken today can be compared with one taken tomorrow. */
  const hash = (i: number, k: number) => {
    let n = Math.imul(i + 1, 374761393) ^ Math.imul(k + 7, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      /* Fine speckle, a coarse blotch on a quarter-scale grid, and a faint
         horizontal streak. The streak is what gives it a rolling direction -
         without it the noise reads as television static rather than as metal. */
      const fine = hash(px, py);
      const cx = px >> 2, cy = py >> 2;
      const coarse = hash(cx + 313, cy + 71);
      const streak = hash(0, py) * 0.55 + hash(1, py) * 0.45;

      const v = fine * 0.62 + coarse * 0.20 + streak * 0.18;
      const i = (py * size + px) * 4;
      /* Light grain is white, dark grain is black, and the alpha is how far
         from neutral this texel is - so blending it over a panel darkens and
         lightens rather than tinting. */
      const lit = v > 0.5;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = lit ? 255 : 0;
      /* 26, not 74. At full strength this reads as television static rather
         than as a machined surface - the tell is that you notice the texture
         before you notice the panel. It wants to be felt and not seen. */
      img.data[i + 3] = Math.round(Math.abs(v - 0.5) * 2 * 26);
    }
  }
  x.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

/* Hand it to the stylesheet. Everything that wants a machined surface uses
   `var(--grain)` as a background layer, so there is one texture and one place
   that decides what it looks like. */
export function installPanelGrain() {
  document.documentElement.style.setProperty('--grain', `url(${makePanelGrain()})`);
}
