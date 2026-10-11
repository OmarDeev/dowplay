#!/usr/bin/env node
"use strict";
// Re-checks every number the Light It Up teacher pack quotes against the game itself.
// Run it after changing the game's levels or parts:
//
//   node teacher-packs/light-it-up/check-numbers.cjs
//
// designs.json holds the 3-star design for each level (the ones in the level guide and the
// worksheet figures).

const { loadGameScript } = require("../../games/load-game.cjs");
const Circuit = loadGameScript("light-it-up", "circuit.js");
const LEVELS = loadGameScript("light-it-up", "levels.js");
const DESIGNS = require("./designs.json");

const level = (id) => LEVELS.find((l) => l.id === id);
const part = (lv, id) => lv.parts.find((p) => p.id === id);
const round = (v, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;
let failures = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}: ${actual}${ok ? "" : `  (the pack says ${expected})`}`);
}

// Runs a level's 3-star design: the first test's simulation and the overall evaluation.
function run(id) {
  const lv = level(id);
  const board = new Map(DESIGNS[id]);
  const ev = Circuit.evaluate(lv, board);
  return { lv, board, ev, sim: ev.results[ev.results.length - 1].sim };
}
const pieces = (board, type, value) => [...board.values()].filter((p) => p.type === type && (value === undefined || p.value === value)).length;

console.log("3-star designs");
for (const lv of LEVELS) {
  const { ev } = run(lv.id);
  check(`${lv.title}: 3 stars at par £${lv.par}`, ev.passed && ev.cost === lv.par, true);
}
check("pars, levels 1–8", LEVELS.map((l) => l.par).join(" "), "8 12 16 15 14 16 21 76");

console.log("\nLevel guide");
let r = run("lights-on");
check("Lights On: wire sections", pieces(r.board, "wire"), 8);
r = run("two-rooms");
check("Two Rooms: battery current (A)", round(r.sim.batteries.battery.current), 0.98);
check("Two Rooms: kitchen lamp V / A", `${round(r.sim.loads.kitchen.V)}/${round(r.sim.loads.kitchen.I)}`, "5.89/0.49");
check("Two Rooms: bedroom lamp V / A", `${round(r.sim.loads.bedroom.V)}/${round(r.sim.loads.bedroom.I)}`, "5.86/0.49");
r = run("twelve-volts");
check("Twelve Volts: supply (V) and lamps in series, about 6 V each", `${part(r.lv, "battery").emf} ${round(r.sim.loads.porch.V, 1)} ${round(r.sim.loads.garden.V, 1)}`, "12 6 6");
r = run("pick-resistor");
check("Pick the Resistor: battery V, lamp rating", `${part(r.lv, "battery").emf} V, ${part(r.lv, "lamp").vRated} V ${part(r.lv, "lamp").pRated} W`, "9 V, 6 V 3 W");
check("Pick the Resistor: resistors in the box (Ω)", r.lv.tools.filter((t) => t.type === "resistor").map((t) => t.value).join(" "), "2 4 10 22");
check("Pick the Resistor: 3-star design uses a 2 Ω and a 4 Ω", `${pieces(r.board, "resistor", 2)} ${pieces(r.board, "resistor", 4)}`, "1 1");
check("Pick the Resistor: lamp V / A", `${round(r.sim.loads.lamp.V)}/${round(r.sim.loads.lamp.I)}`, "5.96/0.5");
const resistorVolts = [...r.sim.edges.values()].filter((e) => e.item.kind === "piece" && e.item.piece?.type === "resistor").map((e) => round(Math.abs(e.V))).sort().join(" ");
check("Pick the Resistor: resistor voltages (V)", resistorVolts, "0.99 1.99");
r = run("two-fuses");
check("Two Fuses: appliance powers (W) at 12 V", ["heater", "fridge", "tv", "lamp"].map((id) => part(r.lv, id).pRated).join(" "), "24 18 12 3");
check("Two Fuses: fuses (A)", `${part(r.lv, "supplyA").fuse} ${part(r.lv, "supplyB").fuse}`, "3 3");
check("Two Fuses: circuit A / B currents (A)", `${round(r.sim.batteries.supplyA.current, 1)} ${round(r.sim.batteries.supplyB.current, 1)}`, "2 2.7");
r = run("doorbell");
check("Smart Doorbell: battery V, fuse (A), doorbell Ω, range (V)", `${part(r.lv, "battery").emf} ${part(r.lv, "battery").fuse} ${part(r.lv, "doorbell").r} ${part(r.lv, "doorbell").vMin}–${part(r.lv, "doorbell").vMax}`, "9 0.1 1000 2.8–3.2");
check("Smart Doorbell: three 47 Ω resistors", pieces(r.board, "resistor", 47), 3);
check("Smart Doorbell: doorbell voltage (V)", round(r.sim.loads.doorbell.V), 2.91);
check("Smart Doorbell: battery current (mA)", Math.round(r.sim.batteries.battery.current * 1000), 65);
r = run("shed");
check("Power to the Shed: heater rating, thin and thick Ω per section", `${part(r.lv, "heater").vRated} V ${part(r.lv, "heater").pRated} W, ${r.lv.wireR}, ${r.lv.thickR}`, "12 V 36 W, 0.1, 0.01");
check("Power to the Shed: thick and thin sections", `${pieces(r.board, "thick")} ${pieces(r.board, "wire")}`, "23 7");
check("Power to the Shed: heater / lamp voltage (V)", `${round(r.sim.loads.heater.V, 1)} ${round(r.sim.loads.lamp.V, 1)}`, "10.9 11.3");

console.log("\nWorksheet sums (independent of the game, checked anyway)");
const parallel = (a, b) => 1 / (1 / a + 1 / b);
check("Doorbell: 47 Ω ∥ 1 kΩ (Ω)", round(parallel(47, 1000), 1), 44.9);
check("Doorbell: loaded output (V)", round((9 * parallel(47, 1000)) / (94 + parallel(47, 1000))), 2.91);
check("Doorbell: 22 Ω over 10 Ω, loaded output (V)", round((9 * parallel(10, 1000)) / (22 + parallel(10, 1000))), 2.79);

console.log(failures ? `\n${failures} number(s) differ from the pack: update pack.html, then run npm run packs -- light-it-up.` : "\nEvery number in the pack matches the game.");
process.exitCode = failures ? 1 : 0;
