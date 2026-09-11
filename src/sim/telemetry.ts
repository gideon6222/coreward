/* The run log: numbers to balance the game against, rather than to show off.

   Playtest: *"is there a way for you to add some kind of log to see how fast
   certain things drain, if the cost is worth the benefit, or if certain
   abilities don't really seem to be necessary? ... I would only want to do it if
   it has very little impact on the game running and is actually helpful."*

   Both conditions are taken literally.

   **Very little impact.** Everything recorded here is a `+=` on a number in a
   flat object. No arrays, no strings, no objects allocated per frame, nothing
   that can grow without bound, and no work at all until a panel is opened -
   `summarise()` runs on the click, never in the loop. The measured cost is in
   NOTES.md.

   **Actually helpful.** A pile of raw counters is not; the question is never
   "how much fuel did I burn" but "is a tank the right size", so the panel shows
   RATES and RATIOS derived from the counters. The three questions he asked map
   to three things this can actually answer:

   - *how fast things drain* -> fuel per second split by what spent it, hull per
     second split by what took it, and how long a full tank of each lasts.
   - *whether a cost is worth the benefit* -> credits per minute and per metre,
     and where the time in a run actually goes.
   - *whether an ability is necessary* -> how many times it was used at all. An
     ability that reads "never used" across a dozen runs has answered the
     question, and no amount of tuning its numbers is the fix.

   Counters are split into this run and all time. All time is what balance is
   decided on; this run is what makes the panel worth opening mid-game. */

export interface Log {
  /* seconds, in play only - the clock does not run in a menu or at the shop */
  sec: number; secDig: number; secFly: number;
  /* fuel spent, by what spent it */
  fuelDig: number; fuelFly: number;
  /* Burned doing nothing, which is a real cost now - see FUEL_IDLE. */
  fuelIdle: number;
  /* hull lost, by what took it */
  hullHeat: number; hullGas: number;
  /* credits banked at the pad, and what was dug to earn them */
  /* `metres` is distance travelled, not depth: summed over many runs a depth
     would mean nothing, and effort is the thing earnings should be divided by */
  earned: number; blocks: number; oreBlocks: number; metres: number;
  /* ordnance: fired, what it cleared, what it cost */
  bombFired: number; laserFired: number; ordBlocks: number; powerSpent: number;
  /* supplies: bought against used is the whole point - a supply bought and
     never spent is either priced wrong or answering a threat that is not real */
  supBought: number; supUsed: number;
  /* the two ways a run can end badly, and the one that costs money */
  towed: number; autoUsed: number; runs: number;
}

export function blankLog(): Log {
  return {
    sec: 0, secDig: 0, secFly: 0,
    fuelDig: 0, fuelFly: 0, fuelIdle: 0, hullHeat: 0, hullGas: 0,
    earned: 0, blocks: 0, oreBlocks: 0, metres: 0,
    bombFired: 0, laserFired: 0, ordBlocks: 0, powerSpent: 0,
    supBought: 0, supUsed: 0, towed: 0, autoUsed: 0, runs: 0
  };
}

/* Every field defaults, so a save written before the log existed loads with a
   zeroed one rather than with holes that read as NaN in the panel. */
export function loadLog(raw: unknown): Log {
  const out = blankLog();
  if (raw && typeof raw === 'object') {
    const src = raw as Record<string, unknown>;
    for (const k of Object.keys(out) as (keyof Log)[]) {
      const v = src[k];
      if (typeof v === 'number' && isFinite(v)) out[k] = v;
    }
  }
  return out;
}

/* Fold a finished run into the all-time totals. */
export function mergeLog(all: Log, run: Log) {
  for (const k of Object.keys(all) as (keyof Log)[]) all[k] += run[k];
}

export interface Row { label: string; value: string; note: string }

const per = (n: number, d: number) => (d > 0 ? n / d : 0);
const one = (n: number) => (Math.round(n * 10) / 10).toLocaleString();
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0) + '%';
const secs = (n: number) => (n >= 60 ? Math.round(n / 60) + 'm ' + Math.round(n % 60) + 's'
                                     : Math.round(n) + 's');

/* Turn counters into the sentences a balance decision is actually made from.

   Pure, and tested: the derivations are the part with judgement in them, and
   the part that silently starts lying if a counter is ever wired to the wrong
   event. Divisions are all guarded, because every one of them is zero on the
   first frame of a new game. */
export function summarise(log: Log, fuelCap: number, hullMax: number): Row[] {
  const rows: Row[] = [];
  const fuel = log.fuelDig + log.fuelFly + log.fuelIdle;
  const hull = log.hullHeat + log.hullGas;

  rows.push({
    label: 'Fuel',
    value: one(per(fuel, log.sec)) + '/s',
    note: fuel > 0
      ? pct(log.fuelDig, fuel) + ' of it drilling, ' + pct(log.fuelFly, fuel) + ' flying, '
        + pct(log.fuelIdle, fuel) + ' idling'
        + (log.secDig > 0 ? ' · a full tank is ' + secs(per(fuelCap, per(log.fuelDig, log.secDig))) + ' of drilling' : '')
      : 'nothing burned yet'
  });

  rows.push({
    label: 'Hull',
    value: one(per(hull, log.sec)) + '/s',
    note: hull > 0
      ? pct(log.hullHeat, hull) + ' heat, ' + pct(log.hullGas, hull) + ' gas'
        + (log.hullHeat > 0 ? ' · heat alone empties a full hull in ' + secs(per(hullMax, per(log.hullHeat, log.sec))) : '')
      : 'undamaged'
  });

  rows.push({
    label: 'Where the time goes',
    value: secs(log.sec),
    note: pct(log.secDig, log.sec) + ' drilling, ' + pct(log.secFly, log.sec) + ' flying, '
      + pct(Math.max(0, log.sec - log.secDig - log.secFly), log.sec) + ' still'
  });

  rows.push({
    label: 'Earnings',
    value: '◈ ' + one(per(log.earned, log.sec / 60)) + '/min',
    note: log.metres > 0
      ? '◈ ' + one(per(log.earned, log.metres)) + ' per metre flown · '
        + one(per(log.oreBlocks, log.blocks) * 100) + '% of blocks worth keeping'
      : 'nothing sold yet'
  });

  /* The "is this necessary" rows. Phrased so that never having used a thing is
     a statement rather than a blank: that IS the finding. */
  const ord = log.bombFired + log.laserFired;
  rows.push({
    label: 'Ordnance',
    value: ord ? ord + ' fired' : 'never used',
    note: ord
      ? log.bombFired + ' charges, ' + log.laserFired + ' lasers · '
        + one(per(log.ordBlocks, ord)) + ' blocks each, '
        + one(per(log.powerSpent, ord)) + ' power each'
      : 'if this stays empty, the meter is not worth what it costs'
  });

  rows.push({
    label: 'Supplies',
    value: log.supUsed + ' used',
    note: log.supBought
      ? log.supBought + ' bought, ' + log.supUsed + ' spent'
        + (log.supUsed < log.supBought / 2
          ? ' · stocked far more than needed' : '')
      : 'none bought'
  });

  rows.push({
    label: 'Runs',
    value: String(log.runs),
    note: log.runs
      ? pct(log.towed, log.runs) + ' ended in a tow · autopilot used ' + log.autoUsed + ' times'
      : 'no completed runs yet'
  });

  return rows;
}
