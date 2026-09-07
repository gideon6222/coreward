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
