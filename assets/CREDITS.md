# Credits

Every asset in this game that was not made here. `POLISH.md` requires this file and the repo
did not have one until 2026-09-10, so the four textures and two fonts below are backfilled
from the commits that added them rather than written by `scripts/assets.py` at fetch time.
Anything imported from now on is appended by that script automatically.

| Date | Source | Asset | License | Where it is |
|---|---|---|---|---|
| 2026-09-07 | ambientCG | `Rock035` — normal map only, 384×384 WebP | CC0 | `src/textures/rock-normal.webp` |
| 2026-09-07 | ambientCG | grayscale grit map (color × AO), 384×384 WebP | CC0 | `src/textures/rock-grit.webp` |
| 2026-09-07 | ambientCG | grayscale roughness map, 384×384 WebP | CC0 | `src/textures/rock-rough.webp` |
| 2026-09-10 | ambientCG | dirt normal map, 384×384 WebP | CC0 | `src/textures/dirt-normal.webp` |
| 2026-09-10 | ambientCG | dirt roughness map, 384×384 WebP | CC0 | `src/textures/dirt-rough.webp` |
| 2026-09-10 | ambientCG | gravel normal map, 384×384 WebP | CC0 | `src/textures/gravel-normal.webp` |
| 2026-09-10 | ambientCG | gravel roughness map, 384×384 WebP | CC0 | `src/textures/gravel-rough.webp` |
| 2026-09-06 | Google Fonts | Chakra Petch, weights 500 and 700 | OFL-1.1 | `public/fonts/chakrapetch-*.woff2` |

**The planet normal map is gone**, with the space scene it dressed: the way in
plays in the game's own world now (v0.33.0), and the file was deleted in the
same commit as the thing that replaced it. Its row is removed rather than left
standing, because a credits file that names an asset the game does not carry is
the same failure as one that omits an asset it does.

**Three rows do not name their exact ambientCG id**, and that is recorded rather than guessed.
`NOTES.md` names `Rock035` for `rock-normal.webp`; the grit, roughness and planet maps were
imported before this file existed and their commits describe what the maps are without saying
which material they came from. All four are CC0 from ambientCG, which is the part that matters
for shipping, and the ids should be confirmed the next time that folder is touched. Inventing
an id here would be worse than saying so.

**Everything else in the game is made here**: the ship, the pad, the Claim's structures, every
material, every shader, the whole audio graph and score. That is a decision rather than an
absence — see `ASSETS.md` in `gamedev-notes` for the rule, and `src/pad.ts` and
`src/claimyard.ts` for the argument about why imported station kits do not join flat-shaded
low-poly terrain cleanly.
