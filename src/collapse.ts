/* When a region comes down, and when it is shored back up.

   `unrest.ts` decides WHETHER; this does it to the world. The split is the
   same one every system in this repo has: the thing that decides has no
   renderer in it and can be walked by a golden test, and the thing that
   changes meshes has no rules in it.

   ---------- what a collapse actually does ----------

   Every tunnel in that region fills in. Not "is blocked" - fills in, so the
   cells go back to being rock and the map redraws with a hole punched in your
   own history. That is the whole stake: the research is blunt that a base
   earns stakes by being losable, and the only thing in this game that was ever
   really yours is the shape you cut.

   Three things survive it on purpose:

     WHAT YOU FOUND      the devices are on the ship. The ground taking them
                         back would be a hazard taking the run, which
                         `CRAFT.md` forbids outright
     WHERE YOU FOUND IT  the marks stay on the map. They are a record of
                         something that happened, and it did happen
     THE SURVEY          the wash stays too. You still remember what the place
                         looked like; you simply cannot get back into it

   So a collapsed region reads on the map as ground you know, marked, with
   every tunnel gone - which is exactly what it is. */

import { g, padRegion } from './sim/state';
import { collapse, shore, isCollapsed, BALLAST_SHORE_COST } from './sim/unrest';
import { regionAt, regionName } from './sim/region';
import { meshes, dropBlock, syncBlocks, resetBlockCache } from './blocks';
import { resetLight } from './lightmap';
import { syncDrops } from './drops';
import { toast, flash } from './ui';
import { R } from './sim/runtime';
import { sfx } from './audio';
import { hap } from './haptics';
import { save } from './sim/state';

/* Walk the per-cell maps and drop everything inside one region.

   Iterating `dug` rather than the region's bounding box, because a region
   boundary WANDERS - the edges are seeded, not ruled - so a box would take a
   stripe of the neighbour with it and leave a stripe of this one standing. */
function fillIn(region: number) {
  for (const k of Array.from(g.dug)) {
    const i = k.indexOf(',');
    if (regionAt(+k.slice(0, i), +k.slice(i + 1)) !== region) continue;
    g.dug.delete(k);
    g.rubble.delete(k);
    delete g.damage[k];
    delete g.drops[k];
  }
}

/* A region chosen while the player was underground, applied now that they are
   not. Called on the frame the ship touches the pad. */
export function landCollapse() {
  const region = g.ground.pending;
  if (region < 0 || isCollapsed(g.ground, region)) { g.ground.pending = -1; return; }
  /* Two last checks, here rather than only at the choice, because the choice
     may have been made several minutes and a save-and-reload ago. */
  if (region === padRegion()) { g.ground.pending = -1; return; }

  collapse(g.ground, region);
  fillIn(region);
  rebuild();

  /* One event, four channels - the POLISH.md rule, and this is the loudest
     thing that happens in the game outside losing the ship. */
  R.shake = Math.max(R.shake, 1.5);
  flash('rgba(120,80,60,.30)', 700);
  sfx.collapse();
  hap.quake();
  toast(regionName(region).toUpperCase() + ' has come down');
  save();
}

/* And the other direction, from the pad's own panel. Returns the region
   reopened, or -1 if the Ballast could not pay for it. */
export function shoreUp(): number {
  const region = shore(g.ground);
  if (region < 0) return -1;
  /* Nothing is restored except access. The tunnels are still gone - you shored
     the ground, you did not un-dig it - which is what stops "let it fall and
     shore it" being a cheap way to reset a worked-out region. */
  rebuild();
  sfx.sell();
  hap.buy();
  toast(regionName(region).toUpperCase() + ' is shored · ' +
        Math.round(BALLAST_SHORE_COST * 100) + '% of the Ballast spent');
  save();
  return region;
}

/* The world has changed underneath the instanced pools, so they go and come
   back. Same three calls a world change makes, and for the same reason: easing
   the old shadows into the new ground shows as light bleeding through fresh
   rock for a fifth of a second. */
function rebuild() {
  for (const k of Array.from(meshes.keys())) dropBlock(k);
  resetBlockCache();
  resetLight();
  syncDrops();
  syncBlocks(true);
}
