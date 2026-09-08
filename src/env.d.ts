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
