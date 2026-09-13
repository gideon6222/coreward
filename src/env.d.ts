/* Ambient declarations. No imports or exports in this file, so everything
   here is global. */

/* Replaced by Vite's `define` at build time; see buildSha() in vite.config.js.
   The game reads these through typeof guards so it stays harmless unbuilt. */
declare const __BUILD_SHA__: string;
declare const __BUILD_TIME__: string;

interface Window {
  /* Safari's prefixed constructor. audio.ts falls back to it before giving up
     on sound entirely. */
  webkitAudioContext?: typeof AudioContext;
}

/* Vite rewrites an asset import to the hashed, base-relative URL of the emitted
   file. Declared here rather than by pulling in `vite/client`, which would also
   drag in every other ambient Vite type for the sake of one module shape. */
declare module '*.webp' {
  const src: string;
  export default src;
}

/* `?raw` inlines the file's text. The credits screen reads assets/CREDITS.md
   this way so the file `POLISH.md` requires is the same one the game shows,
   rather than a copy of it that goes stale the first time a texture lands. */
declare module '*.md?raw' {
  const text: string;
  export default text;
}
