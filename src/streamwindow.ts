/* The size of the streamed terrain window, in one place.

   `blocks.ts` builds a moving window of this many rows and columns around the
   ship rather than the whole 61-column world, and `scene.ts` has to know it:
   the camera may not frame more columns than are streamed, or the player sees
   the void where the ground stops. That was a real fault - the clamp in
   `resize()` was written against the WORLD width (63) instead of the window
   (21), so it never fired, and on anything wider than about 7:6 the terrain
   ended mid-screen. Measured at 40 visible columns on a phone held sideways.

   A leaf module with no imports of its own, because the obvious home for these
   - `blocks.ts` - cannot be imported by `scene.ts`: blocks imports growth and
   growth imports scene, so it would close a cycle. Import cycles in this repo
   have form. One silently made `VAULT_CORE_X` NaN and deleted the Vault, and
   it was caught by reading a golden diff rather than by anything failing.

   Not in `sim/` either: how much terrain is streamed is a renderer budget, and
   the simulation has no window. */

/* Rows tall. The frame shows eighteen at the design aspect, so the window has
   to exceed it or terrain pops in at the edges as the camera moves. */
export const WINDOW_ROWS = 29;

/* Columns wide. Eight are on screen at the design aspect; twenty-one is
   comfortably wider than anything framed and still a third of a wide world. */
export const WINDOW_COLS = 21;
