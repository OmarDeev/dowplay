#!/usr/bin/env node
"use strict";
// Re-checks every number the teacher pack quotes against the game itself.
// Run it after changing Grid Manager's levels or machines:
//
//   node teacher-packs/grid-manager/check-numbers.cjs
//
//

const { loadGameScript } = require("../../games/load-game.cjs");
const Grid = loadGameScript("grid-manager", "grid.js");
const LEVELS = loadGameScript("grid-manager", "levels.js");

const level = (id) => LEVELS.find((l) => l.id === id);
const sum = (a) => a.reduce((s, v) => s + v, 0);
const round = (v, dp = 1) => Math.round(v * 10 ** dp) / 10 ** dp;
let failures = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}: ${actual}${ok ? "" : `  (the pack says ${expected})`}`);
}

// Puts machines on the best squares, the same way the level checker does.
function layout(lv, n) {
  const tiles = [];
  lv.map.forEach((row, r) => [...row].forEach((ch, c) => Grid.TERRAIN[ch]?.allows.length && tiles.push({ key: Grid.tileKey(r, c), t: Grid.TERRAIN[ch] })));
  const used = new Set();
  const design = {};
  const take = (item, count, score) => {
    const free = tiles.filter((x) => !used.has(x.key) && x.t.allows.includes(item)).sort((a, b) => score(b.t) - score(a.t));
    for (const x of free.slice(0, count)) {
      used.add(x.key);
      design[x.key] = item;
    }
  };
  const low = (t) => -(Math.max(t.sun, t.wind) * 10 + t.wind);
  take("wind", n.wind ?? 0, (t) => t.wind * 10 - t.sun);
  take("solar", n.solar ?? 0, (t) => t.sun * 10 - t.wind);
  take("hydro", n.hydro ?? 0, () => 0);
  take("battery", n.battery ?? 0, low);
  take("gas", n.gas ?? 0, low);
  return { tiles: design };
}

const solarDay = (day) => sum([...Array(24).keys()].map((h) => Grid.ITEMS.solar.power * Grid.sunAt(day, h)));
const windDay = (day, site) => sum(day.wind.map((w) => Grid.ITEMS.wind.power * Math.min(1, w * site)));

console.log("Machines");
check("solar farm MW", Grid.ITEMS.solar.power, 4);
check("wind turbine MW", Grid.ITEMS.wind.power, 3);
check("battery MW / MWh / efficiency", `${Grid.ITEMS.battery.power}/${Grid.ITEMS.battery.store}/${Grid.ITEMS.battery.efficiency}`, "2/8/0.9");
check("pumped hydro MW / MWh / efficiency", `${Grid.ITEMS.hydro.power}/${Grid.ITEMS.hydro.store}/${Grid.ITEMS.hydro.efficiency}`, "4/60/0.75");
check("costs solar/wind/battery/hydro/gas", ["solar", "wind", "battery", "hydro", "gas"].map((i) => Grid.ITEMS[i].cost).join("/"), "30/40/30/60/10");
check("gas fuel £/MWh and t CO2/MWh", `${Grid.ITEMS.gas.fuel}/${Grid.ITEMS.gas.co2}`, "2/0.4");

console.log("\n3-star targets (par)");
check("pars, levels 1–8", LEVELS.map((l) => l.par).join(" "), "90 300 230 370 390 409 280 366");

console.log("\nWorksheet 1");
const school = level("sunny-school").days[0];
check("Sunny School: one farm at 8 am (MW)", round(Grid.ITEMS.solar.power * Grid.sunAt(school, 8)), 2.1);
check("Sunny School: school needs at 8 am (MW)", school.demand[8], 5);
const dark = level("after-dark").days[0];
check("After Dark: one farm's energy in a day (MWh)", round(solarDay(dark)), 40.8);
check("After Dark: town's energy in a day (MWh)", sum(dark.demand), 120);
check("After Dark: 8 pm to 6 am (MWh)", sum(dark.demand.slice(20)) + sum(dark.demand.slice(0, 6)), 40);
const rush = level("evening-rush").days[0];
check("Evening Rush: demand at 6 pm (MW)", rush.demand[18], 14);
check("Evening Rush: hilltop turbine at 6 pm (MW)", round(Grid.ITEMS.wind.power * rush.wind[18], 2), 0.15);
check("Evening Rush: solar at 6 pm (MW)", round(Grid.sunAt(rush, 18)), 0);

// The chart in Part C: After Dark with 4 solar farms and 3 batteries
const sample = Grid.evaluate(level("after-dark"), {
  tiles: { "0,2": "solar", "0,3": "solar", "0,4": "solar", "0,5": "solar", "1,9": "battery", "1,10": "battery", "2,10": "battery" },
});
const s = sample.sim;
check("Part C chart: batteries start charging (hour)", s.charge.findIndex((v) => v > 0.01), 6);
check("Part C chart: batteries full by (hour)", s.batteryLevel.findIndex((v) => v >= s.battery.cap - 0.001), 13);
check("Part C chart: wasted from (hour)", s.wasted.findIndex((v) => v > 0.01), 9);
check("Part C chart: blackouts", sample.blackouts.map((b) => `${b.from}–${b.to}`).join(", "), "0–6, 23–24");
check("Part C chart: wasted (MWh)", Math.round(s.totals.wasted), 57);
check("Part C chart: short (MWh)", Math.round(s.totals.unmet), 17);
const windy = level("windy-hill").days[0];
check("Windy Hill: hilltop turbine in a day (MWh)", round(windDay(windy, 1)), 30);

console.log("\nWorksheet 2");
check("Windy Hill: field turbine in a day (MWh)", round(windDay(windy, 0.5)), 15);
const [mon, tue] = level("grey-skies").days;
check("Grey Skies: solar farm on Monday (MWh)", round(solarDay(mon)), 33.9);
check("Grey Skies: solar farm on Tuesday (MWh)", round(solarDay(tue)), 8.9);

const backup = level("backup-plan");
const noLimit = { ...backup, co2Limit: undefined };
const gasy = Grid.evaluate(noLimit, layout(backup, { wind: 3, gas: 3 }));
check("Backup Plan, no limit: 3 wind + 3 gas works", gasy.sim.totals.unmet < 1e-6, true);
check("Backup Plan, no limit: cost (£)", gasy.cost, 317);
check("Backup Plan, no limit: gas (MWh)", round(gasy.sim.totals.gas), 83.7);
check("Backup Plan, no limit: CO2 (t)", round(gasy.sim.totals.co2), 33.5);
const par6 = Grid.evaluate(backup, layout(backup, { wind: 6, battery: 5, gas: 1 }));
check("Backup Plan 3 stars: passes", par6.passed, true);
check("Backup Plan 3 stars: cost (£)", par6.cost, 409);
check("Backup Plan 3 stars: gas (MWh) / CO2 (t)", `${round(par6.sim.totals.gas)}/${par6.co2}`, "4.7/1.9");
const noGas = Grid.evaluate(backup, layout(backup, { wind: 6, battery: 6 }));
check("Backup Plan without gas: 6 wind + 6 batteries passes, cost (£)", noGas.passed ? noGas.cost : "fails", 420);

const timing = level("smart-timing");
check("Smart Timing: flexible jobs (MWh)", sum(timing.flex.map((j) => j.power * j.hours)), 32);
check("Smart Timing: whole town (MWh)", sum(timing.days[0].demand) + 32, 150);
const bus = timing.flex.find((j) => j.id === "buses");
check("Smart Timing: bus charging MW × hours", `${bus.power}×${bus.hours}`, "4×3");
const moved = Grid.evaluate(timing, { ...layout(timing, { solar: 4, wind: 1, battery: 4 }), flex: { pumps: 7, buses: 9, factory: 8 } });
check("Smart Timing 3 stars (jobs moved to the morning): passes, cost (£)", moved.passed ? moved.cost : "fails", 280);
const unshifted = Grid.evaluate(timing, layout(timing, { solar: 4, battery: 9 }));
check("Smart Timing, jobs not moved: 4 solar + 9 batteries passes, cost (£)", unshifted.passed ? unshifted.cost : "fails", 390);

const still = level("still-week");
check("Still Week: demand each day (MWh)", still.days.map((d) => sum(d.demand)).join(" "), "171 171 171");
const par8 = Grid.evaluate(still, layout(still, { wind: 5, battery: 1, hydro: 2, gas: 1 }));
const tueSum = (a) => sum(a.slice(24, 48));
check("Still Week 3 stars: passes, cost (£), CO2 (t)", `${par8.passed} £${par8.cost} ${par8.co2} t`, "true £366 3.3 t");
check("Still Week 3 stars: Tuesday wind (MWh)", round(tueSum(par8.sim.wind)), 34.7);
check("Still Week 3 stars: Tuesday from storage (MWh)", round(tueSum(par8.sim.batteryOut) + tueSum(par8.sim.hydroOut)), 128);
check("Still Week 3 stars: Tuesday gas (MWh)", round(tueSum(par8.sim.gas)), 8.4);
const noHydro = Grid.evaluate(still, layout(still, { wind: 5, battery: 16, gas: 1 }));
check("Still Week without pumped hydro: 5 wind + 16 batteries + 1 gas passes, cost (£)", noHydro.passed ? noHydro.cost : "fails", 696);

console.log(failures ? `\n${failures} number(s) differ from the pack: update pack.html, then run npm run packs -- grid-manager.` : "\nEvery number in the pack matches the game.");
process.exitCode = failures ? 1 : 0;
