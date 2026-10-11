#!/usr/bin/env node
"use strict";
// Checks that every level can be won, and searches for the cheapest design (to set `par`).
//
//   node check-levels.js                 check every level
//   node check-levels.js smart-timing    check one level
//   node check-levels.js --draw          also print the best design found, hour by hour
//   node check-levels.js --top           also list the next-best mixes
//
// The search tries every mix of generators (up to what fits on the map), puts each
// machine on the best spot for it, then finds the fewest batteries that keep the lights
// on. Flexible jobs are moved hour by hour to wherever they help most.

const { loadGameScript } = require("../load-game.cjs");
const Grid = loadGameScript("grid-manager", "grid.js");
const LEVELS = loadGameScript("grid-manager", "levels.js");

const args = process.argv.slice(2);
const DRAW = args.includes("--draw");
const TOP = args.includes("--top");
const only = args.find((a) => !a.startsWith("--"));

function tilesOf(level) {
  const tiles = [];
  level.map.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      const t = Grid.TERRAIN[ch];
      if (t && t.allows.length) tiles.push({ key: Grid.tileKey(r, c), t });
    });
  });
  return tiles;
}

// Puts each machine on the best free spot for it: wind where it's windiest, solar where
// it's sunniest (keeping windy hills for turbines), and storage and gas on whatever is
// least useful for generating.
function layout(level, tiles, n) {
  const used = new Set();
  const design = { tiles: {}, flex: {} };
  const take = (item, count, score) => {
    const free = tiles.filter((x) => !used.has(x.key) && x.t.allows.includes(item)).sort((a, b) => score(b.t) - score(a.t));
    if (free.length < count) return false;
    for (const x of free.slice(0, count)) {
      used.add(x.key);
      design.tiles[x.key] = item;
    }
    return true;
  };
  const ok =
    take("wind", n.wind, (t) => t.wind * 10 - t.sun) &&
    take("solar", n.solar, (t) => t.sun * 10 - t.wind) &&
    take("hydro", n.hydro, () => 0) &&
    take("battery", n.battery, (t) => -(Math.max(t.sun, t.wind) * 10 + t.wind)) &&
    take("gas", n.gas, (t) => -(Math.max(t.sun, t.wind) * 10 + t.wind));
  return ok ? design : null;
}

const maxOf = (tiles, item, cap) => Math.min(cap, tiles.filter((x) => x.t.allows.includes(item)).length);

// Lower is better: blackouts first, then CO2 over the limit, then fuel.
function badness(level, e) {
  const over = level.co2Limit === undefined ? 0 : Math.max(0, e.co2 - level.co2Limit);
  return e.sim.totals.unmet * 1e4 + over * 1e3 + e.fuel;
}

// Moves each flexible job to its best start hour, one job at a time, until nothing improves.
function bestFlex(level, design) {
  let best = Grid.evaluate(level, design);
  if (!level.flex?.length) return best;
  design.flex = { ...Grid.flexStarts(level, design) };
  best = Grid.evaluate(level, design);
  for (let pass = 0; pass < 4; pass++) {
    let improved = false;
    for (const job of level.flex) {
      for (let s = job.earliest; s + job.hours <= job.latest; s++) {
        const was = design.flex[job.id];
        if (s === was) continue;
        design.flex[job.id] = s;
        const e = Grid.evaluate(level, design);
        if (badness(level, e) < badness(level, best) - 1e-9) {
          best = e;
          improved = true;
        } else {
          design.flex[job.id] = was;
        }
      }
    }
    if (!improved) break;
  }
  return best;
}

function optimise(level) {
  const tiles = tilesOf(level);
  const has = (item) => level.items.includes(item);
  const range = (item, cap) => (has(item) ? maxOf(tiles, item, cap) : 0);
  const maxSolar = range("solar", 16);
  const maxWind = range("wind", 14);
  const maxHydro = range("hydro", 3);
  const maxGas = range("gas", 4);
  const maxBattery = range("battery", 24);
  const results = [];
  for (let wind = 0; wind <= maxWind; wind++) {
    for (let solar = 0; solar <= maxSolar; solar++) {
      for (let hydro = 0; hydro <= maxHydro; hydro++) {
        for (let gas = 0; gas <= maxGas; gas++) {
          // Fewest batteries that work; with gas, a few more might save enough fuel to pay for themselves.
          let firstPass = null;
          for (let battery = 0; battery <= maxBattery; battery++) {
            if (firstPass !== null && (gas === 0 || battery > firstPass + 4)) break;
            const n = { solar, wind, battery, hydro, gas };
            const design = layout(level, tiles, n);
            if (!design) break;
            const e = bestFlex(level, design);
            if (e.passed) {
              if (firstPass === null) firstPass = battery;
              results.push({ n, design: { tiles: design.tiles, flex: { ...design.flex } }, e });
            }
          }
        }
      }
    }
  }
  results.sort((a, b) => a.e.cost - b.e.cost || a.e.co2 - b.e.co2);
  return results;
}

const mix = (n) =>
  Grid.ITEM_ORDER.filter((item) => n[item])
    .map((item) => `${n[item]} ${Grid.ITEMS[item].short.toLowerCase()}`)
    .join(", ");

function draw(level, result) {
  const letters = { solar: "S", wind: "W", battery: "B", hydro: "H", gas: "G" };
  const rows = level.map.map((row, r) =>
    [...row].map((ch, c) => letters[result.design.tiles[Grid.tileKey(r, c)]] ?? ch.toLowerCase().replace(/[a-z]/, "·")).join(" ")
  );
  console.log(rows.map((row) => `      ${row}`).join("\n"));
  const sim = result.e.sim;
  const f = (v) => v.toFixed(1).padStart(5);
  console.log(`      hour  need  solar  wind  store+ store-   gas  waste  short  battery${sim.hydro.cap ? "  hydro" : ""}`);
  for (let h = 0; h < sim.hours; h++) {
    console.log(
      `      ${String(h % 24).padStart(4)} ${f(sim.demand[h])} ${f(sim.solar[h])} ${f(sim.wind[h])} ${f(sim.charge[h])} ${f(
        sim.batteryOut[h] + sim.hydroOut[h]
      )} ${f(sim.gas[h])} ${f(sim.wasted[h])} ${f(sim.unmet[h])}  ${f(sim.batteryLevel[h + 1])}${sim.hydro.cap ? ` ${f(sim.hydroLevel[h + 1])}` : ""}`
    );
  }
  if (level.flex?.length) console.log(`      flexible jobs start at: ${JSON.stringify(Grid.flexStarts(level, result.design))}`);
}

let failures = 0;
for (const level of LEVELS) {
  if (only && level.id !== only) continue;
  const t0 = Date.now();
  const results = optimise(level);
  const best = results[0];
  const ms = Date.now() - t0;
  if (!best) {
    failures++;
    console.log(`✗ ${level.id}: no working design found (${ms} ms)`);
    continue;
  }
  const { e } = best;
  const parOk = e.cost === level.par;
  const budgetOk = level.budget > level.par;
  if (!parOk || !budgetOk) failures++;
  const t = e.sim.totals;
  console.log(
    `${parOk && budgetOk ? "✓" : "✗"} ${level.id}: best £${e.cost} (par £${level.par}, budget £${level.budget})  ${mix(best.n)}` +
      `${e.fuel ? `, fuel £${e.fuel}` : ""}${level.co2Limit !== undefined ? `, CO2 ${e.co2} t (limit ${level.co2Limit})` : ""}` +
      `  wasted ${t.wasted.toFixed(0)} MWh  (${ms} ms)`
  );
  if (!parOk) console.log(`    par should be £${e.cost}`);
  if (!budgetOk) console.log("    budget must be more than par");
  if (TOP) {
    const seen = new Set();
    for (const r of results) {
      const id = mix(r.n);
      if (seen.has(id)) continue;
      seen.add(id);
      if (seen.size > 8) break;
      console.log(`      £${r.e.cost}  ${id}${r.e.fuel ? ` (fuel £${r.e.fuel})` : ""}${level.co2Limit !== undefined ? `  CO2 ${r.e.co2}` : ""}`);
    }
  }
  if (DRAW) draw(level, best);
}
process.exitCode = failures ? 1 : 0;
