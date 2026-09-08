import type * as THREE from 'three';

/* Stacking shader injections onto one material.

   A material gets exactly ONE `onBeforeCompile`, and three's own caching keys
   off `customProgramCacheKey`. Anything that wants to patch a stock shader has
   to go through both, and the obvious way to write that - assign a function -
   means the second thing to do it silently throws away the first.

   That is not a hypothetical. The drilled block is `mat().clone()` followed by
   `displaceLikeRock()`, and while displacement assigned rather than chained,
   the clone's propagated lighting was discarded on the spot: one block in the
   whole world, lit differently from the rock it was carved out of, with
   nothing failing anywhere. It was found by eye, which is the expensive way.

   So every injection in the game goes through here instead. They compose in
   the order they are applied, and the tags compose into the cache key so two
   differently-patched materials never share a compiled program. */
export function chainCompile<T extends THREE.Material>(
  m: T,
  patch: (shader: Parameters<THREE.Material['onBeforeCompile']>[0]) => void,
  tag: string
): T {
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = function (shader, renderer) {
    prev.call(this, shader, renderer);
    patch(shader);
  };
  m.customProgramCacheKey = function () { return prevKey.call(this) + '|' + tag; };
  return m;
}
