/* ---------- keeping the keyboard inside an open panel ----------

   Found by tabbing with the pause sheet open: focus walked straight past it
   into MENU, MANIFEST, MAP, BALLAST, SHOP and then the d-pad - every control
   of the game running behind the modal. The focus ring is the browser's own
   and perfectly visible, which makes it worse rather than better: a keyboard
   player watches the ring travel around a screen they cannot see, behind a
   panel they cannot leave.

   This game supports the keyboard on purpose - the Outfitter is drivable with
   the arrows and a confirm, and has a test saying so - and half-finished
   keyboard support is worse than none, because it invites use and then fails.

   `inert` is the whole fix: it removes a subtree from the tab order, from hit
   testing and from the accessibility tree in one attribute, which is exactly
   the set of things a covered UI should lose. Supported everywhere this game
   runs; on anything older the attribute is ignored and the behaviour is what
   it was before, which is the right way to fail.

   Driven by a MutationObserver on the panels' own `class` rather than by
   calling into this from every open and close site. There are six panels and
   they are opened from a dozen places - a hook at each one is a hook somebody
   forgets, and the observer cannot be forgotten because it watches the thing
   that actually changes. */

/* What is underneath. Not `body`, because the panels themselves live in it. */
const UNDER = ['hud', 'actions', 'ctrl', 'cluster', 'kit', 'ord'];

/* Every panel that covers the game. `shop` is a full screen rather than a
   modal and belongs here for the same reason. */
const PANELS = ['pause', 'manifest', 'map', 'ballast', 'event', 'shop'];

function anyOpen() {
  return PANELS.some((id) => {
    const el = document.getElementById(id);
    return !!el && !el.classList.contains('hidden');
  });
}

function apply() {
  const covered = anyOpen();
  for (const id of UNDER) {
    const el = document.getElementById(id);
    if (!el) continue;
    /* The property, not setAttribute: `inert` reflects, and assigning the
       property is what older TypeScript DOM libs and every current browser
       agree on. */
    (el as HTMLElement & { inert: boolean }).inert = covered;
  }
}

export function installModalFocus() {
  const obs = new MutationObserver(apply);
  for (const id of PANELS) {
    const el = document.getElementById(id);
    if (el) obs.observe(el, { attributes: true, attributeFilter: ['class'] });
  }
  apply();
}

/* For the test. */
export const gameIsInert = () =>
  UNDER.every((id) => {
    const el = document.getElementById(id) as (HTMLElement & { inert?: boolean }) | null;
    return !el || el.inert === true;
  });
