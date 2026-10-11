"use strict";
/* Grid Manager engine: an hour-by-hour model of a town's electricity.

   Every hour:
     1. Solar farms and wind turbines make what the weather allows.
     2. If that is more than the town needs, the spare charges the batteries (then pumped
        hydro), and anything left over is wasted.
     3. If it is less, the batteries help as much as they can (then pumped hydro), gas
        plants fill the rest, and anything still missing is a blackout.

   The level's days are assumed to repeat, so storage starts with whatever it has left at
   the end of them. That stops a design from "borrowing" energy it never made.

   No page code here: the same file runs in the browser and in Node (check-levels.js). */

const Grid = (() => {
  const EPS = 1e-6;

  // power in MW, store in MWh, cost in £ per day (paying for it and running it), fuel in £ per MWh.
  const ITEMS = {
    solar: { name: "Solar farm", short: "Solar", power: 4, cost: 30 },
    wind: { name: "Wind turbine", short: "Wind", power: 3, cost: 40 },
    battery: { name: "Battery", short: "Battery", power: 2, store: 8, efficiency: 0.9, cost: 30 },
    hydro: { name: "Pumped hydro", short: "Hydro", power: 4, store: 60, efficiency: 0.75, cost: 60 },
    gas: { name: "Gas plant", short: "Gas", power: 4, cost: 10, fuel: 2, co2: 0.4 },
  };
  const ITEM_ORDER = ["solar", "wind", "battery", "hydro", "gas"];

  // sun and wind: how much of a farm's or turbine's full output this spot gets.
  const BUILD = ["solar", "wind", "battery", "gas"];
  const TERRAIN = {
    f: { id: "field", name: "Field", sun: 1, wind: 0.5, allows: BUILD },
    h: { id: "hill", name: "Hilltop", sun: 1, wind: 1, allows: BUILD },
    v: { id: "valley", name: "Valley", sun: 0.6, wind: 0.3, allows: BUILD },
    y: { id: "yard", name: "Industrial yard", sun: 0, wind: 0, allows: ["battery", "gas"] },
    o: { id: "sea", name: "Sea", sun: 0, wind: 1.4, allows: ["wind"] },
    r: { id: "reservoir", name: "Hill lake", sun: 0, wind: 0, allows: ["hydro"] },
    t: { id: "town", name: "Houses", sun: 0, wind: 0, allows: [] },
    s: { id: "school", name: "School", sun: 0, wind: 0, allows: [] },
    F: { id: "forest", name: "Protected forest", sun: 0, wind: 0, allows: [] },
    w: { id: "lake", name: "Lake", sun: 0, wind: 0, allows: [] },
    P: { id: "pumps", name: "Water pumping station", sun: 0, wind: 0, allows: [] },
    B: { id: "depot", name: "Bus depot", sun: 0, wind: 0, allows: [] },
    K: { id: "factory", name: "Factory", sun: 0, wind: 0, allows: [] },
  };

  const tileKey = (r, c) => `${r},${c}`;
  const parseKey = (key) => key.split(",").map(Number);
  const periodHours = (level) => level.days.length * 24;

  function terrainAt(level, r, c) {
    const row = level.map[r];
    return row && c >= 0 && c < row.length ? TERRAIN[row[c]] ?? null : null;
  }

  // How good a spot is for an item (1 = full output). Storage and gas don't care.
  function rating(terrain, item) {
    if (item === "solar") return terrain.sun;
    if (item === "wind") return terrain.wind;
    return 1;
  }

  // Why an item can't go on a tile (a short code), or null if it can.
  function placeProblem(level, r, c, item) {
    const t = terrainAt(level, r, c);
    if (!t) return "outside";
    if (!level.items.includes(item)) return "locked";
    return t.allows.includes(item) ? null : t.id;
  }

  function placementText(problem, item) {
    const name = ITEMS[item]?.name.toLowerCase() ?? "that";
    switch (problem) {
      case "forest":
        return "This forest is protected. Build somewhere else.";
      case "town":
        return "People live here! Build on the fields, hills or yards.";
      case "school":
        return "That's the school. Build on the fields around it.";
      case "lake":
        return "You can't build on the lake.";
      case "sea":
        return "Only wind turbines can go out at sea.";
      case "yard":
        return `The yard has no room for a ${name}. Put batteries or gas plants here.`;
      case "reservoir":
        return "This hill lake is for pumped hydro only.";
      case "locked":
        return `There's no ${name} in this level.`;
      default:
        return item === "hydro" ? "Pumped hydro needs a hill lake to pump water up into." : "You can't build there.";
    }
  }

  // ---------- weather and demand ----------

  const perHour = (value, h) => (Array.isArray(value) ? value[h] : value ?? 0);

  // Sunshine on a clear day: zero at night, rising to `peak` at midday.
  function clearSun(day, h) {
    const x = (h + 0.5 - day.rise) / (day.set - day.rise);
    return x <= 0 || x >= 1 ? 0 : (day.peak ?? 1) * Math.sin(Math.PI * x);
  }

  // Fraction of a solar farm's full output in hour h of a day (clouds block some sun).
  const sunAt = (day, h) => clearSun(day, h) * (1 - perHour(day.cloud, h));

  // ---------- designs ----------

  // A design is { tiles: Map or object of "r,c" -> item, flex: { id: start hour } }.
  function tileEntries(level, design) {
    const tiles = design?.tiles ?? {};
    const entries = tiles instanceof Map ? [...tiles] : Object.entries(tiles);
    return entries.filter(([key, item]) => {
      const [r, c] = parseKey(key);
      return ITEMS[item] && !placeProblem(level, r, c, item);
    });
  }

  // Where each flexible job runs: the design's choice if it fits the job's window.
  function flexStarts(level, design) {
    const starts = {};
    for (const job of level.flex ?? []) {
      const wanted = Number(design?.flex?.[job.id]);
      const ok = Number.isInteger(wanted) && wanted >= job.earliest && wanted + job.hours <= job.latest;
      starts[job.id] = ok ? wanted : job.start;
    }
    return starts;
  }

  function counts(level, design) {
    const n = Object.fromEntries(ITEM_ORDER.map((item) => [item, 0]));
    for (const [, item] of tileEntries(level, design)) n[item]++;
    return n;
  }

  // Hour-by-hour demand and renewable output, plus what storage and gas can do.
  function curves(level, design) {
    const hours = periodHours(level);
    let sunShare = 0;
    const windSites = new Map(); // site rating -> number of turbines there
    const n = counts(level, design);
    for (const [key, item] of tileEntries(level, design)) {
      const t = terrainAt(level, ...parseKey(key));
      if (item === "solar") sunShare += t.sun;
      if (item === "wind") windSites.set(t.wind, (windSites.get(t.wind) ?? 0) + 1);
    }
    const starts = flexStarts(level, design);
    const base = [];
    const demand = [];
    const solar = [];
    const wind = [];
    for (let h = 0; h < hours; h++) {
      const day = level.days[Math.floor(h / 24)];
      const hh = h % 24;
      base.push(day.demand[hh]);
      let extra = 0;
      for (const job of level.flex ?? []) if (h >= starts[job.id] && h < starts[job.id] + job.hours) extra += job.power;
      demand.push(day.demand[hh] + extra);
      solar.push(ITEMS.solar.power * sunAt(day, hh) * sunShare);
      let w = 0;
      for (const [site, count] of windSites) w += count * ITEMS.wind.power * Math.min(1, perHour(day.wind, hh) * site);
      wind.push(w);
    }
    const pool = (item) => ({
      cap: n[item] * ITEMS[item].store,
      power: n[item] * ITEMS[item].power,
      eff: ITEMS[item].efficiency,
    });
    return { hours, base, demand, solar, wind, starts, counts: n, battery: pool("battery"), hydro: pool("hydro"), gasPower: n.gas * ITEMS.gas.power };
  }

  // ---------- the simulation ----------

  // Runs the period from the given stored energy. With `record`, keeps every hour's numbers.
  function runPeriod(c, startBattery, startHydro, record) {
    const B = c.battery;
    const P = c.hydro;
    let b = startBattery;
    let p = startHydro;
    const rec = record
      ? { charge: [], wasted: [], batteryOut: [], hydroOut: [], gas: [], unmet: [], batteryFull: [], hydroFull: [], batteryLevel: [b], hydroLevel: [p] }
      : null;
    for (let h = 0; h < c.hours; h++) {
      let spare = c.solar[h] + c.wind[h] - c.demand[h];
      let charge = 0;
      let wasted = 0;
      let bOut = 0;
      let pOut = 0;
      let gas = 0;
      let unmet = 0;
      if (spare >= 0) {
        // Energy that goes in is charged at the input; efficiency losses happen on the way in.
        const intoB = Math.max(0, Math.min(spare, B.power, (B.cap - b) / B.eff || 0));
        b = Math.min(B.cap, b + intoB * B.eff);
        spare -= intoB;
        const intoP = Math.max(0, Math.min(spare, P.power, (P.cap - p) / P.eff || 0));
        p = Math.min(P.cap, p + intoP * P.eff);
        spare -= intoP;
        charge = intoB + intoP;
        wasted = spare;
      } else {
        let need = -spare;
        bOut = Math.min(need, B.power, b);
        b = Math.max(0, b - bOut);
        need -= bOut;
        pOut = Math.min(need, P.power, p);
        p = Math.max(0, p - pOut);
        need -= pOut;
        gas = Math.min(need, c.gasPower);
        need -= gas;
        unmet = need > EPS ? need : 0;
      }
      if (rec) {
        rec.charge.push(charge);
        rec.wasted.push(wasted);
        rec.batteryOut.push(bOut);
        rec.hydroOut.push(pOut);
        rec.gas.push(gas);
        rec.unmet.push(unmet);
        rec.batteryFull.push(B.power > 0 && bOut >= B.power - EPS);
        rec.hydroFull.push(P.power > 0 && pOut >= P.power - EPS);
        rec.batteryLevel.push(b);
        rec.hydroLevel.push(p);
      }
    }
    return record ? rec : [b, p];
  }

  // Finds how full storage is at the start, so that it ends the period just as full.
  // Starting fuller never ends emptier, and never gains more than it started with, so
  // "end minus start" only falls as the start rises: a bisection finds where it hits zero.
  function settle(c) {
    const fixBattery = (p0) => {
      if (c.battery.cap <= 0 || runPeriod(c, 0, p0)[0] <= EPS) return 0;
      let lo = 0;
      let hi = c.battery.cap;
      for (let i = 0; i < 44; i++) {
        const mid = (lo + hi) / 2;
        if (runPeriod(c, mid, p0)[0] > mid) lo = mid;
        else hi = mid;
      }
      return hi;
    };
    if (c.hydro.cap <= 0) return [fixBattery(0), 0];
    const gain = (p0) => runPeriod(c, fixBattery(p0), p0)[1] - p0;
    if (gain(0) <= EPS) return [fixBattery(0), 0];
    let lo = 0;
    let hi = c.hydro.cap;
    for (let i = 0; i < 36; i++) {
      const mid = (lo + hi) / 2;
      if (gain(mid) > 0) lo = mid;
      else hi = mid;
    }
    return [fixBattery(hi), hi];
  }

  function simulate(level, design) {
    const c = curves(level, design);
    const [b0, p0] = settle(c);
    const rec = runPeriod(c, b0, p0, true);
    const sum = (a) => a.reduce((s, v) => s + v, 0);
    const totals = {
      demand: sum(c.demand),
      solar: sum(c.solar),
      wind: sum(c.wind),
      charge: sum(rec.charge),
      wasted: sum(rec.wasted),
      storageOut: sum(rec.batteryOut) + sum(rec.hydroOut),
      gas: sum(rec.gas),
      unmet: sum(rec.unmet),
    };
    totals.co2 = totals.gas * ITEMS.gas.co2;
    // Share of the town's electricity that didn't come from gas (or wasn't missing).
    totals.renewableShare = totals.demand > 0 ? Math.max(0, (totals.demand - totals.gas - totals.unmet) / totals.demand) : 1;
    return { ...c, ...rec, totals };
  }

  // Groups blackout hours into runs and says what was going on in each one.
  function blackouts(sim) {
    const runs = [];
    for (let h = 0; h < sim.hours; h++) {
      if (sim.unmet[h] <= EPS) continue;
      let run = runs[runs.length - 1];
      if (!run || run.to !== h) {
        run = { from: h, to: h, missing: 0, worst: 0, power: false, empty: false, gasFull: false };
        runs.push(run);
      }
      run.to = h + 1;
      run.missing += sim.unmet[h];
      run.worst = Math.max(run.worst, sim.unmet[h]);
      const hasStorage = sim.battery.cap + sim.hydro.cap > 0;
      const storageLeft = sim.batteryLevel[h + 1] + sim.hydroLevel[h + 1];
      if (hasStorage && storageLeft > 0.05) run.power = true; // energy left but couldn't get it out fast enough
      if (hasStorage && storageLeft <= 0.05) run.empty = true;
      if (sim.gasPower > 0) run.gasFull = true;
    }
    return runs;
  }

  // ---------- scoring ----------

  function evaluate(level, design) {
    const sim = simulate(level, design);
    const n = sim.counts;
    const build = ITEM_ORDER.reduce((s, item) => s + n[item] * ITEMS[item].cost, 0);
    // Fuel is averaged over the level's days, so it's a cost per day like the machines.
    const fuel = Math.round((sim.totals.gas * ITEMS.gas.fuel) / level.days.length);
    const cost = build + fuel;
    const co2 = Math.round(sim.totals.co2 * 10) / 10;
    const checks = [{ id: "lights", ok: sim.totals.unmet <= EPS * sim.hours, value: sim.totals.unmet }];
    if (level.co2Limit !== undefined) checks.push({ id: "co2", ok: co2 <= level.co2Limit + EPS, value: co2, limit: level.co2Limit });
    const passed = checks.every((check) => check.ok);
    const stars = !passed ? 0 : cost <= level.par ? 3 : cost <= level.budget ? 2 : 1;
    return { sim, counts: n, build, fuel, cost, co2, checks, passed, stars, blackouts: blackouts(sim) };
  }

  return {
    EPS,
    ITEMS,
    ITEM_ORDER,
    TERRAIN,
    tileKey,
    parseKey,
    periodHours,
    terrainAt,
    rating,
    placeProblem,
    placementText,
    clearSun,
    sunAt,
    perHour,
    tileEntries,
    flexStarts,
    counts,
    curves,
    runPeriod,
    settle,
    simulate,
    blackouts,
    evaluate,
  };
})();

if (typeof module !== "undefined") module.exports = Grid;
