#!/usr/bin/env node
"use strict";
// Re-checks every number the Gear Garage teacher pack quotes against the game itself.
// Run it after changing the game's levels or gears:
//
//   node teacher-packs/gear-garage/check-numbers.cjs
//
// designs.json holds the 3-star design for each level (the ones in the level guide and the
// worksheet figures).

const { loadGameScript } = require("../../games/load-game.cjs");
const Gears = loadGameScript("gear-garage", "gears.js");
const LEVELS = loadGameScript("gear-garage", "levels.js");
const DESIGNS = require("./designs.json");

const level = (id) => LEVELS.find((l) => l.id === id);
const round = (v, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;
let failures = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}: ${actual}${ok ? "" : `  (the pack says ${expected})`}`);
}

function run(id, board = new Map(DESIGNS[id])) {
  const lv = level(id);
  const ev = Gears.evaluate(lv, board);
  return { lv, board, ev, sim: ev.sim };
}
const teeth = (sim) => sim.gears.map((g) => g.teeth).join(" ");
const out = (sim) => Object.values(sim.outputs)[0];

console.log("Gears");
const prices = Object.fromEntries(level("efficiency").tools.map((t) => [t.teeth, t.cost]));
check("prices for 8/16/24/32/40 teeth (£)", [8, 16, 24, 32, 40].map((n) => prices[n]).join(" "), "2 3 4 5 6");
check("radius of 8/16/24/32/40 teeth (holes)", [8, 16, 24, 32, 40].map((n) => Gears.radius(n)).join(" "), "1 2 3 4 5");

console.log("\n3-star designs");
for (const lv of LEVELS) {
  const { ev } = run(lv.id);
  check(`${lv.title}: 3 stars at par £${lv.par}`, ev.passed && ev.cost === lv.par, true);
}
check("pars, levels 1–8", LEVELS.map((l) => l.par).join(" "), "6 8 6 7 15 12 8 10");

console.log("\nLevel guide and worksheets");
for (const [a, b] of [[16, 16], [8, 24]]) {
  const board = new Map([[Gears.gearKey(4, 4, 0), { teeth: a }], [Gears.gearKey(8, 4, 0), { teeth: b }]]);
  const { ev } = run("first-gear", board);
  check(`First Gear: ${a} + ${b} teeth gets 3 stars for £6`, ev.passed && ev.cost === 6, true);
}
let r = run("same-way");
check("Same Way Round: gears", teeth(r.sim), "8 24 8");
r = run("need-for-speed");
check("Need for Speed: motor rpm, gears", `${r.lv.motor.rpm} | ${teeth(r.sim)}`, "20 | 24 8");
check("Need for Speed: fan rpm, torque (N·m)", `${Math.abs(round(out(r.sim).rpm))} ${round(out(r.sim).torque)}`, "60 1.67");
r = run("heavy-lifting");
check("Heavy Lifting: motor torque, winch load (N·m)", `${r.lv.motor.torque} ${r.lv.outputs[0].load}`, "2 5");
check("Heavy Lifting: gears, winch rpm, torque", `${teeth(r.sim)} | ${Math.abs(round(out(r.sim).rpm))} ${round(out(r.sim).torque)}`, "8 32 | 7.5 8");
r = run("round-the-engine");
check("Round the Engine: crankshaft rpm, gears", `${r.lv.motor.rpm} | ${teeth(r.sim)}`, "40 | 8 24 16 16 16");
check("Round the Engine: 24-tooth gear rpm", Math.abs(round(r.sim.gears[1].rpm, 1)), 13.3);
check("Round the Engine: camshaft rpm, clockwise, torque", `${round(out(r.sim).rpm)} ${out(r.sim).rpm > 0} ${round(out(r.sim).torque)}`, "20 true 10");
r = run("compound");
check("Compound Gears: motor rpm and torque; 40-tooth gear available", `${r.lv.motor.rpm} ${r.lv.motor.torque} ${r.lv.tools.some((t) => t.teeth === 40)}`, "36 5 true");
check("Compound Gears: gears (bottom, middle, stacked, top)", teeth(r.sim), "8 24 8 24");
check("Compound Gears: middle axle rpm", Math.abs(round(r.sim.gears[1].rpm)), 12);
check("Compound Gears: turntable rpm, torque", `${round(out(r.sim).rpm)} ${round(out(r.sim).torque)}`, "4 45");
r = run("garage-door");
check("Garage Door: motor rpm, door range (cm/s)", `${r.lv.motor.rpm} ${r.lv.rack.want.minSpeed}–${r.lv.rack.want.maxSpeed}`, "30 9–10");
check("Garage Door: gears, door speed (cm/s)", `${teeth(r.sim)} | ${Math.abs(round(r.sim.rack.speed, 1))}`, "24 24 | 9.4");
r = run("efficiency");
check("Every Mesh Counts: motor rpm, torque; lift load; efficiency", `${r.lv.motor.rpm} ${r.lv.motor.torque} ${r.lv.outputs[0].load} ${r.lv.efficiency}`, "60 1 3.6 0.95");
check("Every Mesh Counts: gears, lift rpm, torque, meshes", `${teeth(r.sim)} | ${round(out(r.sim).rpm)} ${round(out(r.sim).torque)} ${out(r.sim).meshes}`, "8 16 8 16 | 15 3.61 2");
check("Every Mesh Counts: torque with a third mesh (N·m)", round(4 * r.lv.efficiency ** 3), 3.43);

console.log(failures ? `\n${failures} number(s) differ from the pack: update pack.html, then run npm run packs -- gear-garage.` : "\nEvery number in the pack matches the game.");
process.exitCode = failures ? 1 : 0;
