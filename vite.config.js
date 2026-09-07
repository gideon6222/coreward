import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/* Build stamp, shown at the bottom of the pause menu.

   The point is on-device verification: after a deploy the phone can be one
   load behind, and the game is deliberately identical between builds, so
   there is otherwise nothing to look at to tell whether an update landed.
   Open the pause menu and read the line. */
function buildSha() {
  /* CI checks out a detached head; GITHUB_SHA is the authoritative commit */
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    const sha = execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    /* mark local builds with uncommitted changes, so a stamp on the phone is
       never mistaken for a commit that actually exists */
    const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim().length > 0;
    return dirty ? sha + '+' : sha;
  } catch (e) {
    return 'unknown';
  }
}

export default defineConfig({
  /* GitHub Pages serves this from /coreward/, not from the domain root, so
     every emitted URL must be relative. The manifest and icon already use
     './' for the same reason. */
  base: './',

  define: {
    __BUILD_SHA__: JSON.stringify(buildSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString())
  },

  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true
  },

  plugins: [
    VitePWA({
      /* Workbox generates the precache manifest from the real build output,
         hashed filenames and all. This is what retires the hand-written
         sw.js and the "bump CACHE or your change looks like it did nothing"
         trap: a changed file changes its hash, so it is a new precache entry
         and there is nothing left to remember to bump. */
      strategies: 'generateSW',
      registerType: 'autoUpdate',

      /* The old sw.js called skipWaiting() and clients.claim(); autoUpdate
         plus these two keeps that exact behaviour. */
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        /* cleanupOutdatedCaches only removes Workbox's own precaches. The
           pre-migration worker used a hand-rolled cache named coreward-v5,
           which Workbox cannot see and which measured 1.31 MB of orphaned
           data on a real upgrade. This script deletes it on activate. */
        importScripts: ['sw-legacy-cleanup.js'],
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
        /* the sourcemap is ~2 MB and only devtools ever asks for it */
        globIgnores: ['**/*.map'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//]
      },

      /* Keep public/manifest.webmanifest exactly as it is. The PWA already
         installed on the phone is keyed to its start_url and scope, so
         regenerating it risks the installed app rather than improving it. */
      manifest: false,

      /* index.html already registers the worker by hand, and that
         registration resolves to the same sw.js this plugin emits. Leave it
         owning registration rather than injecting a second one. */
      injectRegister: null,

      devOptions: {
        /* do not run a service worker during `vite dev`; a cache-first worker
           on localhost serves stale modules and wastes an afternoon */
        enabled: false
      }
    })
  ]
});
