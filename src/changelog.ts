/* What changed, in the player's terms.

   The build stamp answers "did my update land". It cannot answer "what is
   actually different", which after a few sessions of work is the question that
   matters more. A commit log is the wrong shape for that - it is written for
   whoever has to maintain the code, and there are eighty of them.

   Rules for entries: describe what the player can now do or see, not what was
   refactored; one line each; newest first. If an entry cannot be written that
   way it probably did not need a version. */

export interface Release {
  version: string;
  date: string;
  title: string;
  notes: string[];
}

export const VERSION = '0.10.0';

export const CHANGELOG: Release[] = [
  {
    version: '0.10.0', date: '2026-09-08', title: 'Real rock, real ship',
    notes: [
      'The rock is photographed stone now - grain, cracks and roughness, lit properly.',
      'It is much darker down there, and the lamp is what you see by.',
      'The ship is a machine instead of a bubble: hard edges, gunmetal, a proper canopy.',
      'Upgrades bolt visible hardware onto the ship - tanks, radiators, a cargo pod, a sensor dish.',
      'A bigger drill for every drill tier, so the tier is something you can see.'
    ]
  },
  {
    version: '0.9.4', date: '2026-09-07', title: 'Smoother stop',
    notes: [
      'The ship eases to a stop instead of bouncing, and only lines up when you change direction.',
      'Fixed the drill nosing into the rock it was cutting, which was the jerk after every block.',
      'A RUN LOG in the pause menu: what drains how fast, what you earn, and what you never use.',
      'The d-pad and the supply buttons sit a little higher, clear of the system gesture bar.'
    ]
  },
  {
    version: '0.9.3', date: '2026-09-07', title: 'Under the hood',
    notes: [
      'Nothing you can see - the game can now be driven far faster than real time for testing.',
      'Tremors are proven to actually fire deep down, which had never been checked before.'
    ]
  },
  {
    version: '0.9.2', date: '2026-09-07', title: 'Real rock',
    notes: [
      'The rock is photographed stone now, not flat panels - the lamp catches the surface as you fly.',
      'The detail runs continuously through the walls instead of restarting at every block.'
    ]
  },
  {
    version: '0.9.1', date: '2026-09-07', title: 'Flying straight',
    notes: [
      'The ship follows the tunnels again - it keeps its momentum but stops drifting off line.',
      'Fixed the drill refusing to bite when the ship was not quite lined up.',
      'Fixed the ship snagging on the edge of its own shaft.',
      'The ship no longer twists out of shape when it banks flying sideways.',
      'Letting go now parks you neatly in a cell instead of half in two.'
    ]
  },
  {
    version: '0.9.0', date: '2026-09-07', title: 'Free flight',
    notes: [
      'The ship flies freely instead of hopping cell to cell.',
      'Half-drilled blocks stay half-drilled - come back and finish them off.',
      'The dark is much darker, and the edges of the screen fall away to nothing.',
      'The Outfitter is a station you dock at, with a window onto the planet.',
      'A proper typeface, and this list.'
    ]
  },
  {
    version: '0.8.0', date: '2026-09-07', title: 'Seams, ordnance and relics',
    notes: [
      'The drill never refuses: ore you cannot carry waits where it falls.',
      'Flecked rock is a mineral seam and worth stopping for; plain rock is spoil.',
      'The Scanner Array decides how much of the world you can see.',
      'Seismic Charge and Cutting Laser, sharing one Power Cell meter.',
      'The Outfitter has counters, and stock that unlocks with depth.',
      'One relic buried on every planet, kept forever, marked on nothing.'
    ]
  },
  {
    version: '0.7.0', date: '2026-09-07', title: 'Depth and consequence',
    notes: [
      'Tremors past 85 m collapse the tunnel behind you.',
      'Upgrades past level three cost minerals as well as credits.',
      'Supply caches, left by whoever was here before.',
      'The score gains layers for the heat zone, the unstable band and danger.',
      'A marker across the rock at your deepest reach.',
      'Umbrite and Solmarrow, and twelve planets instead of six.',
      'A headlight, and rock in the distance behind the tunnels.'
    ]
  },
  {
    version: '0.6.0', date: '2026-09-07', title: 'Heat, read properly',
    notes: [
      'Heat has its own colour, its own gauge and its own number.',
      'The hull bar shows what is draining it and how fast.'
    ]
  },
  {
    version: '0.5.0', date: '2026-09-06', title: 'Pockets and pressure',
    notes: [
      'Gas pockets, geodes and cave systems.',
      'Coolant, patches and fuel cells, bought at the pad and spent below.',
      'Every planet has a trait that changes how its ground behaves.',
      'Heat soak: how long you stay matters as much as how deep you go.'
    ]
  }
];
