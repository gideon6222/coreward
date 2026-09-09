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

export const VERSION = '0.14.1';

export const CHANGELOG: Release[] = [
  {
    version: '0.14.1', date: '2026-09-08', title: 'Instruments',
    notes: [
      'Fuel, hull and cargo are lit segmented gauges behind glass now, not progress bars.',
      'Each one carries its own number, so fuel is a reading rather than a guess.',
      'Fuel and hull share a row at double the width; cargo sits under them, full width.',
      'The heat stripe still runs along the bottom of the hull gauge, and still tells you the rate.'
    ]
  },
  {
    version: '0.14.0', date: '2026-09-08', title: 'Machined',
    notes: [
      'The ship is a dark machine with its own lamps on it, instead of a bright shape with light shining on it.',
      'Two headlamp housings on the nose - the thing that has been lighting the whole cave finally looks like it.',
      'Every button, gauge and panel is stamped steel now: grain, hard corners, a bevelled edge.',
      'Pressing a control reads as pushing it in rather than lighting it up.',
      'The landing pad has worn metal and proper hazard striping, and it goes dark as you drop below it.'
    ]
  },
  {
    version: '0.13.0', date: '2026-09-08', title: 'Two lights',
    notes: [
      'Tunnel light and rock light are separate now. Rock faces no longer have shadows cut across them.',
      'Light spreads through every tunnel you have opened. The one you are facing is the brightest.',
      'A branch the beam passes is still in shadow, but it keeps enough ambient light to read as a tunnel.',
      'The lamp reaches further ahead than to the side, and fades out instead of ending at an edge.'
    ]
  },
  {
    version: '0.12.3', date: '2026-09-08', title: 'Three layers deep',
    notes: [
      'Rock no longer casts a shadow on itself. Angled shadows now only come from actual tunnels.',
      'Three layers of rock read either side of a tunnel, and anything past that is black.',
      'You can no longer tell what a mineral is through four cells of unlit rock.',
      'The glow behind the ship reaches further and fades away instead of ending at an edge.',
      'The light in a tunnel now spills onto the rock at its edge, so nothing pokes through it.'
    ]
  },
  {
    version: '0.12.1', date: '2026-09-08', title: 'The lamp points somewhere',
    notes: [
      'The lamp shines out of the front of the ship. Whichever way you are drilling is the way you can see.',
      'Behind you stays dim rather than dark, so the way back up is always readable.',
      'Corners throw real shadows now. A tunnel crossing your path is in shadow except where the light can actually reach it.',
      'That shadow closes over the crossing tunnel as you move away from it, and opens up as you come level with it.',
      'Fixed rock poking through the glow in a tunnel.'
    ]
  },
  {
    version: '0.12.0', date: '2026-09-08', title: 'Light travels',
    notes: [
      'Your lamp lights the tunnel, not a circle: light runs down the shafts you have dug.',
      'Turn a corner and the branch behind you goes dark - the light had to go the long way.',
      'Rock more than a cell or two from open ground is black. There is nothing out there until you cut to it.',
      'Open tunnels near the ship glow, so a shaft reads as a space with light in it rather than a hole.',
      'The headlight cone is gone. The light is real now and does not need a triangle drawn on it.',
      'The Scanner Array buys reach in all of this, so a bigger lamp opens up more of the ground.'
    ]
  },
  {
    version: '0.11.1', date: '2026-09-08', title: 'Read the room',
    notes: [
      'Every display case has a name plate, so you can see what is what without tapping.',
      'A strip of light on each case: cyan means you can buy it, amber means not yet.',
      'Locked cases are shuttered and stamped with the depth that opens them.',
      'When a mineral is what you are missing, the plate names the mineral, not the price.'
    ]
  },
  {
    version: '0.11.0', date: '2026-09-08', title: 'The Outfitter is a place',
    notes: [
      'The shop is a hangar bay you dock in, not a list - your ship is parked in the middle of it.',
      'Every upgrade sits in its own display case. Tap one to inspect it, and buy from there.',
      'The part in the case is the part that gets bolted on, so what you see is what you fly out with.',
      'The ship on the deck is the real one: buy something and it changes in front of you.'
    ]
  },
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
