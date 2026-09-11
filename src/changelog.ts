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

export const VERSION = '0.29.0';

export const CHANGELOG: Release[] = [
  {
    version: '0.29.0', date: '2026-09-10', title: 'The drawer under the counter',
    notes: [
      'The six supplies are gone from the bottom of the shop. You have to have held one before the Outfitter will sell you another.',
      'You get the first of each out of a supply cache in the ground - and a cache now hands over something you have never seen before anything you have.',
      'Finding one announces itself the way a device does, without stopping the game.',
      'What you have collected lives in a drawer under the counter. Pull the brass handle and it drops open with the crates lit inside; tap one to see what it does and buy another.',
      'Tap anywhere else to shut it.',
      'A Bulwark Field absorbs three impacts outright and used to be on sale to a first-hour player. Now it costs knowing it exists.',
      'The shop screen gave back 120 pixels of room when the grid left, and the framing picked it up on its own.',
      'The instrument dials no longer ghost through the bottom of the Outfitter.',
      'The swipe hint retires once you have walked the aisles once.',
      'Anything you could already buy stays buyable. A consumable you have spent still counts as one you have held.'
    ]
  },
  {
    version: '0.28.0', date: '2026-09-10', title: 'Dug up, not bought',
    notes: [
      'Seven upgrades are no longer for sale at any price. The Salvage Magnet, Deep Survey, Seismic Charge, Reactor Core, Repair Drone, Autopilot and Cutting Laser are sealed in crates buried in the rock, and the Outfitter can only improve one once you have found it.',
      'The first world holds three of them, at 20, 35 and 40 metres. The rest arrive with new worlds.',
      'Breaking a crate fits the device on the spot and tells you in one line what it does. It does not pause the game - you keep drilling.',
      'Leave one in the ground and it turns up on the next world. A device is never lost, only delayed.',
      'The Outfitter is four departments now - RIG, LIFE, SURVEY and ORDNANCE - and you walk between them. Swipe, or tap the arrows either side.',
      'Never more than five things in front of you at once, and the ship is parked at the pump at the end of the run instead of standing in front of the stock.',
      'ORDNANCE starts dark, because everything in it has to be dug up. The first time you find a charge, the whole aisle lights.',
      'Dock after finding something and the shop opens standing in front of it.',
      'Brass, copper and riveted iron throughout, with gauges whose needles read your claim, your record depth and your store. One terminal behind the counter, running code.',
      'Anything you were already carrying stays yours. A device you paid for is a device you found.'
    ]
  },
  {
    version: '0.27.0', date: '2026-09-10', title: 'The counter',
    notes: [
      'The Outfitter is a shop counter now. The expensive upgrades sit on the glass in front of you; the ordinary ones are racked on the wall behind.',
      'Nothing has to be tapped to see what is for sale. Where a thing stands is what tells you which kind it is.',
      'Every neon light is a real fitting - a tube in a metal housing with a lamp in it - so the colour lands on the counter and the floor instead of floating in front of the room.',
      'The four group plinths are gone. They named a filter that had been cut, so they did nothing.'
    ]
  },
  {
    version: '0.26.0', date: '2026-09-10', title: 'A room that digs for a living',
    notes: [
      'The Outfitter is a room now: a deck, a window onto the planet you are parked over, pipe runs, an ore skip with rock still in it, crates and samples on the floor.',
      'Four lit plinths across the front name the four groups of upgrades, each under its own neon and a cone of light.',
      'Three consoles on the back wall carry real readings: how strained the claim is, how deep you have ever been, and what is in the store shed.',
      'The camera stands back and looks down into the room instead of sitting level with a shelf.',
      'The ship in the intro flies with its drill leading, which is the direction it is going.',
      'Landing gives you the controls back sooner.'
    ]
  },
  {
    version: '0.25.2', date: '2026-09-10', title: 'A claim you can read',
    notes: [
      'Each building on the surface now has a lit sign, a window showing what is inside it, and something that moves when it is working.',
      'The refinery lights up with the hold you are carrying, the derrick pumps while your tank is filling, and the shed sits dark when it is empty.',
      'The Outfitter is sorted into four departments - rig, survival, instruments, ordnance - each under its own lit header and colour.',
      'The ship carries real hardware now: a drill collar at the nose from drill 3, generator blocks at the stern from thrust 2 and 6.',
      'Loose soil and gravel are their own surfaces instead of sharing one stone for the whole world.',
      'The ship flies with its drill forward in the intro instead of pitched nose-up while the worlds stream past.',
      'The cut from the crossing to the landing is hidden inside the atmosphere, and the descent onto the pad is long enough to watch.'
    ]
  },
  {
    version: '0.25.1', date: '2026-09-10', title: 'A way out of a bad boot',
    notes: [
      'If the game ever fails to start, the error screen now shows where it broke and offers a button to clear the save and reload.',
      'A hold carrying something the gift table cannot price no longer stops the game from starting.'
    ]
  },
  {
    version: '0.25.0', date: '2026-09-10', title: 'A claim you can lose',
    notes: [
      'You own a claim on the surface now: a refinery, a fuel derrick and a store shed beside the pad.',
      'Digging deep shakes the ground they stand on. When it gives, they take the damage - and you cannot fly them to safety.',
      'A damaged refinery pays less for every haul, a damaged derrick fills your tank short, a damaged shed spills what is in it.',
      'A quake also cracks the world open, and a shaken world pays more. Going deep is a bet, not a tax.',
      'Repairs need credits and a mineral that only exists below the line that breaks them.',
      'Breaking a core no longer opens a menu. The world starts closing from the bottom and you have ninety seconds to climb out of it.',
      'Miss the clock and you are towed. The world still breaks - it costs you the hold, never the run.',
      'The first world is a whole world now: heat at 38 m, tremors at 44, and a core at 58 that you can reach in one sitting.',
      'Every world has the same shape - danger in the bottom third - instead of two fixed depths that meant different things on every planet.',
      'The shop was repriced against the depth each row unlocks at, so the first sale no longer buys four upgrades.',
      'The hold is smaller and the drill is thirstier, so a seam of ore is worth more than you can carry and a corridor of dirt runs your tank dry.',
      'Every rock face is textured on its own plane. Tunnel floors, cavern ceilings and ledges were smeared and are stone now.',
      'The phone buzzes when you cut, strike ore, take a hit, or feel the ground go. There is a toggle in the pause screen.',
      'A run tells you what it paid, how it stood against your record, and the cheapest thing you still cannot afford.',
      'The pause screen keeps your fastest core, how many worlds you have broken, and the drive at n of five.',
      'The chart offers different worlds each day.',
      'Every trait changes a rule now: Stable pays for a clean run, a charge reaches further on Volatile, the lamp carries on Hollow, Crystalline pays more but fights back, and Searing cuts easier while it starts on you sooner.'
    ]
  },
  {
    version: '0.24.0', date: '2026-09-09', title: 'Ground of its own',
    notes: [
      'The ship flies nose-first now - you see it from behind, drill pointed at wherever it is going.',
      'It lowers itself onto the pad under its own thrust before you get the controls.',
      'Every world has its own ground: moss, frost, plants, oil, ash or salt, on rock that is rougher or glassier depending where you are.',
      'Continuing a run that was already underground puts you back where you were, not on the pad.'
    ]
  },
  {
    version: '0.23.0', date: '2026-09-09', title: 'Three ways in',
    notes: [
      'A first run watches the intro through - it only plays once, and it is the once that counts.',
      'Continue now takes off: the drive lights, the stars streak past, and the ship flies to the world you left.',
      'Beaten the game? A new run gives you a skip button - and taking it still flies you down to the planet.'
    ]
  },
  {
    version: '0.22.0', date: '2026-09-09', title: 'Flying in',
    notes: [
      'The intro is a flight now, not a slide show - worlds come up out of the dark, pass you, and fall behind.',
      'It says less. You are told what to look for and nothing else.',
      'Both the intro and CONTINUE end by flying down to a planet - CONTINUE takes you to the world you are actually on.',
      'CONTINUE is greyed out until you have a game to continue.',
      'The Outfitter only stocks what you can buy plus the next thing you cannot, so it starts at six cases instead of fifteen.',
      'Nothing on a display plate is cut off any more, and the supply chips have room for their names.',
      'Planets have real surface relief instead of being coloured spheres.'
    ]
  },
  {
    version: '0.21.0', date: '2026-09-09', title: 'A way in',
    notes: [
      'A title screen, with Continue, New Game, Settings and Notes.',
      'First time you play, a short intro tells you where you are and what you are trying to do.',
      'It says the thing the game never used to: five jump drive components, one on each kind of world, and they open a route to the Heart.',
      'Tap to move it along, or skip it entirely. It plays over the real starfield, with the real ship and real worlds.'
    ]
  },
  {
    version: '0.20.0', date: '2026-09-09', title: 'Every world has its own weather',
    notes: [
      'Volatile worlds vent gas out of the rock. Searing worlds send embers up from the deep.',
      'Crystalline worlds glint in the lamp; Hollow ones drop grit from a ceiling you cannot see.',
      'Stable worlds stay completely still - which is how you notice all the others.',
      'The deeper you go, the busier the air gets.',
      'And the crossing between planets can be skipped now.'
    ]
  },
  {
    version: '0.19.0', date: '2026-09-09', title: 'Five more ways to build the ship',
    notes: [
      'Hull Plating: the hull was stuck at 100 forever. Now it is a ladder like everything else.',
      'Salvage Magnet: ore you dropped when the hold filled now comes to you instead of needing a cell-perfect approach.',
      'Deep Survey: reads ore through solid rock, and points at what is buried down there.',
      'Repair Drone: slowly mends the hull underground, so a bad run can become a long one instead of a tow.',
      'Reactor Core: more power cells and a faster trickle, so the charge and the laser finally have a ladder of their own.',
      'And three new consumables that buy a window rather than fixing a bar: Overdrive, Bulwark Field and Survey Pulse.'
    ]
  },
  {
    version: '0.18.0', date: '2026-09-09', title: 'A chart, a crossing, and a way out',
    notes: [
      'Breaking a core now opens a navigation chart: three worlds, and you choose. Shallow and poor, or deep and rich.',
      'You actually fly there. The world you broke falls away in pieces and the next one comes up out of the dark.',
      'There is a goal now. Five Jump Drive components, one buried on each kind of world, and they open a route to the Heart of the Drift.',
      'A component left in the ground goes with the planet when its core breaks - so go and find it first.',
      'The manifest tracks the drive and tells you what kind of world each missing piece is on.'
    ]
  },
  {
    version: '0.17.0', date: '2026-09-09', title: 'Twelve worlds, twelve palettes',
    notes: [
      'Every planet now has its own rock, fog, haze, dust and skyline instead of the same cave with the horizon repainted.',
      'Rustmoor is rust, Cryon is blue ice, Ashvault is violet ash - you can tell where you are before you dig a metre.',
      'Ore keeps its own colour everywhere, so what a vein is worth still reads at a glance.'
    ]
  },
  {
    version: '0.16.0', date: '2026-09-08', title: 'Dust in the beam',
    notes: [
      'The lamp now throws a visible shaft of light through the air in front of the ship.',
      'Real dust drifts in that beam - it hangs in the world, so it rises past you as you dive.',
      'The air thickens the deeper you go, and the beam gets heavier with it.',
      'Autopilot flies you home nose-first instead of reversing up the shaft.'
    ]
  },
  {
    version: '0.15.7', date: '2026-09-08', title: 'One lamp, one shadow',
    notes: [
      'The light no longer splits into several separate cones - it is one lamp casting one shadow.',
      'Shadow edges now follow the wall the light actually meets instead of snapping to whole blocks.',
      'Most of the warmth taken out of the tunnels last version is back: that darkening was treating the symptom.'
    ]
  },
  {
    version: '0.15.6', date: '2026-09-08', title: 'The tunnels stop being cards',
    notes: [
      'The flat orange shapes that appeared as you came up on a side tunnel are gone.',
      'A branch the beam has already passed is dim lit air again, not a panel of colour.',
      'The glow in the air now sits where the drill is pointing instead of filling every tunnel evenly.'
    ]
  },
  {
    version: '0.15.5', date: '2026-09-08', title: 'A smoother fade into the rock',
    notes: [
      'Rock now darkens as a smooth gradient into the mass instead of in visible patches.',
      'The fade follows the shape of the tunnel rather than the shape of the grid.',
      'Fixed a shadow that could appear a fixed distance ahead of the ship with nothing casting it.'
    ]
  },
  {
    version: '0.15.4', date: '2026-09-08', title: 'Light that fits the rock',
    notes: [
      'The rounded blobs are gone. Light now changes at the edges of blocks, where the rock changes.',
      'A rock face is no longer half lit with a soft curve running across it.',
      'The lighting grid is three times finer, so nothing is smeared a whole block wide any more.'
    ]
  },
  {
    version: '0.15.3', date: '2026-09-08', title: 'The glow ends at the rock',
    notes: [
      'The light in a tunnel is now exactly the width of the tunnel, and stops at the wall.',
      'No more soft circle around the ship - that was the light grid being blurred a whole cell wide.',
      'A crossing reads as a cross, a shaft reads as a shaft.'
    ]
  },
  {
    version: '0.15.2', date: '2026-09-08', title: 'Light stays in the tunnel',
    notes: [
      'The glow in a tunnel stops at the rock now instead of washing over the faces around you.',
      'No circle around the ship: the lit shape is the tunnel you dug, whatever shape that is.',
      'Shadow edges are crisp again - nothing is painted over them.'
    ]
  },
  {
    version: '0.15.1', date: '2026-09-08', title: 'Nothing spare on the dial',
    notes: [
      'The fuel gauge lost its outer load ring. It was moving every time you did, which is not what a gauge is for.',
      'No more circle of light around the ship. The lamps on its nose are the source now, and rock stops the light like everything else.',
      'The Scanner grows those lamps instead, so the upgrade is still something you can see.'
    ]
  },
  {
    version: '0.15.0', date: '2026-09-08', title: 'The panel',
    notes: [
      'The status bars are gone. There are two brass dials in the bottom-left corner instead.',
      'The big one is fuel, with the drill load running round its outer ring like a tachometer.',
      'Cargo is a sub-dial let into its face, and it starts pulsing when the hold is nearly full.',
      'The small dial is hull, with heat eating down from the full end of the scale.',
      'The needles have weight - they swing and settle rather than snapping to a value.'
    ]
  },
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
