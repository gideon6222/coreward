/* ---------- applying a visuals tier ----------

   Apart from `visuals.ts` on purpose: that file is the table, and it has to
   stay importable without three.js so a unit test can assert the three tiers
   exist and cost in order. One import of `./scene` there would drag the whole
   renderer into it, textures and all.

   Everything here is live. No reload, no material rebuilt, nothing the player
   has to do twice - `POLISH.md` names a setting that needs a restart as the
   most common prototype tell.

   The imports are dynamic because `scene.ts` reads the table to set the pixel
   ratio before the first frame; a static import back into `scene.ts` would be
   a cycle, which is the class of fault that once quietly deleted the Vault. */
import { spec } from './visuals';
export async function applyVisuals() {
  const s = spec();
  const [{ applyPixelRatio, resize }, { setDustCount }, { setRelief }, { resetBlockCache }] =
    await Promise.all([
      import('./scene'), import('./dust'), import('./materials'), import('./blocks')
    ]);
  applyPixelRatio();
  resize();
  setDustCount(s.dust);
  setRelief(s.relief);
  /* Growth density is read per cell as the window is built, so the streaming
     cache has to be dropped for the change to reach what is already on screen.
     The next frame rebuilds the window around the ship. */
  resetBlockCache();
}
