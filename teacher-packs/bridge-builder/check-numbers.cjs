#!/usr/bin/env node
"use strict";
// Re-checks every number the Bridge Builder teacher pack quotes against the game itself.
// Run it after changing the game's levels or materials:
//
//   node teacher-packs/bridge-builder/check-numbers.cjs
//
// designs.json holds the 3-star design for each level (the ones in the level guide and the
// worksheet figures).

const { loadGameScript } = require("../../games/load-game.cjs");
const Bridge = loadGameScript("bridge-builder", "bridge.js");
const LEVELS = loadGameScript("bridge-builder", "levels.js");
const DESIGNS = require("./designs.json");

const level = (id) => LEVELS.find((l) => l.id === id);
const round = (v, dp = 1) => Math.round(v * 10 ** dp) / 10 ** dp;
const pct = (usage) => Math.round(usage * 100);
const SQRT2 = Math.SQRT2;
let failures = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}: ${actual}${ok ? "" : `  (the pack says ${expected})`}`);
}

function run(id, design = new Map(DESIGNS[id])) {
  const lv = level(id);
  const ev = Bridge.evaluate(lv, design);
  const beams = ev.model.members.map((m) => ({ ...m, ...ev.worst[m.index], pulled: ev.worst[m.index].force >= 0 }));
  return { lv, design, ev, beams };
}
const counts = (design) => {
  const c = {};
  for (const material of design.values()) c[material] = (c[material] ?? 0) + 1;
  return ["road", "steel", "wood", "cable"].filter((m) => c[m]).map((m) => `${c[m]} ${m}`).join(", ");
};
const isDiagonal = (b) => b.ends[0][0] !== b.ends[1][0] && b.ends[0][1] !== b.ends[1][1];
const isUpright = (b) => b.ends[0][0] === b.ends[1][0];
const isAcross = (b) => b.ends[0][1] === b.ends[1][1];
const swap = (design, from, to) => new Map([...design].map(([k, m]) => [k, m === from ? to : m]));

console.log("Materials");
const M = Bridge.MATERIALS;
const squash = (m, len) => Bridge.compressionStrength(m, len);
check("metres per square", Bridge.CELL, 4);
check("road: pull, squash (kN), weight, cost", `${M.road.tension} ${squash("road", 1)} ${M.road.weight} ${M.road.cost}`, "200 200 4 15");
check("wood: pull, squash, squash diagonal, weight", `${M.wood.tension} ${squash("wood", 1)} ${round(squash("wood", SQRT2))} ${M.wood.weight}`, "70 60 30 1.5");
check("steel: pull, squash, squash diagonal, weight", `${M.steel.tension} ${squash("steel", 1)} ${round(squash("steel", SQRT2))} ${M.steel.weight}`, "200 180 90 3");
check("cable: pull, squash, weight, cost per square", `${M.cable.tension} ${M.cable.compression} ${M.cable.weight} ${M.cable.cost}`, "200 0 0.5 5");
check("wood buckles at 60 ÷ L², steel at 180 ÷ L²", `${M.wood.buckling} ${M.steel.buckling}`, "60 180");
check("wood beam 2 squares long buckles at (kN)", squash("wood", 2), 15);
const cost = (m, diagonal) => Bridge.memberCost(diagonal ? "0,0,1,1" : "0,0,1,0", m);
check("wood cost, straight and diagonal (£)", `${cost("wood")} ${cost("wood", true)}`, "8 11");
check("steel cost, straight and diagonal (£)", `${cost("steel")} ${cost("steel", true)}`, "16 23");

console.log("\nLevels");
check("vehicles (kN)", LEVELS.map((l) => `${l.truck.name} ${l.truck.weight}`).join(", "), "Car 20, Van 30, Truck 60, Truck 60, Lorry 80, Lorry 80, Lorry 80, Crane 100");
check("spans (m)", LEVELS.map((l) => (l.right - l.left) * Bridge.CELL).join(" "), "8 16 16 16 24 32 40 40");
check("pars (£)", LEVELS.map((l) => l.par).join(" "), "41 176 192 148 388 686 374 353");
check("budgets (£)", LEVELS.map((l) => l.budget).join(" "), "55 210 230 180 460 800 450 420");

console.log("\n3-star designs");
for (const lv of LEVELS) {
  const { ev } = run(lv.id);
  check(`${lv.title}: 3 stars at par £${lv.par}`, ev.passed && ev.cost === lv.par, true);
}
const expectCounts = {
  "mind-the-gap": "2 road, 1 wood",
  "triangle-power": "4 road, 13 wood",
  "push-and-pull": "4 road, 4 steel, 5 wood",
  "low-bridge": "4 road, 1 steel, 7 wood",
  "buckle-up": "6 road, 14 steel, 5 wood",
  "go-deeper": "8 road, 23 steel, 18 wood",
  "cable-stayed": "10 road, 9 cable",
  "heavy-haul": "10 road, 6 steel, 5 wood, 10 cable",
};
for (const lv of LEVELS) check(`${lv.title}: beams`, counts(run(lv.id).design), expectCounts[lv.id]);

console.log("\nLevel guide, lessons and worksheets");
let r = run("mind-the-gap");
check("Mind the Gap: road on its own wobbles", run("mind-the-gap", new Map(DESIGNS["mind-the-gap"].filter(([, m]) => m === "road"))).ev.failure?.kind, "wobbly");
const l1wood = r.beams.find((b) => b.material === "wood");
check("Mind the Gap: the wooden diagonal starts at a cliff anchor", isDiagonal(l1wood) && l1wood.ends.some(([, y]) => y > r.lv.deckY), true);

r = run("push-and-pull");
const pp = r;
check("Push and Pull: an all-wood truss breaks", !run("push-and-pull", swap(pp.design, "steel", "wood")).ev.passed, true);
const allSteel = run("push-and-pull", swap(pp.design, "wood", "steel")).ev;
check("Push and Pull: all steel is over the £230 budget", `${allSteel.cost > pp.lv.budget} £${allSteel.cost}`, "true £232");
check("Push and Pull: the steel beams are the 4 diagonals", pp.beams.filter((b) => b.material === "steel").every(isDiagonal) && pp.beams.filter(isDiagonal).length === 4, true);
const top = pp.beams.filter((b) => b.material === "wood" && isAcross(b));
check("Push and Pull: wooden top beams squashed (%)", top.map((b) => `${b.pulled ? "pulled" : "squashed"} ${pct(b.usage)}`).join(", "), "squashed 89, squashed 89");
const ends = pp.beams.filter((b) => b.material === "steel" && b.ends.some(([x]) => x === pp.lv.left || x === pp.lv.right));
check("Push and Pull: steel end diagonals squashed (kN, %)", ends.map((b) => `${b.pulled ? "pulled" : "squashed"} ${Math.round(-b.force)} ${pct(b.usage)}`).join(", "), "squashed 76 84, squashed 76 84");
check("Push and Pull: the uprights are pulled", pp.beams.filter(isUpright).every((b) => b.pulled), true);

r = run("low-bridge");
const hardest = r.beams.reduce((a, b) => (b.usage > a.usage ? b : a));
check("Low Bridge: hardest beam is steel, squashed (kN), from a cliff anchor", `${hardest.material} ${hardest.pulled ? "pulled" : "squashed"} ${Math.round(-hardest.force)} ${hardest.ends.some(([, y]) => y > r.lv.deckY && r.lv.anchors.some(([ax, ay]) => ay === y && ax === hardest.ends[0][0]))}`, "steel squashed 84 true");

r = run("buckle-up");
check("Buckle Up: every diagonal pulled, every upright squashed", r.beams.filter(isDiagonal).every((b) => b.pulled) && r.beams.filter(isUpright).every((b) => !b.pulled), true);
const topChord = r.beams.filter((b) => isAcross(b) && b.material !== "road");
check("Buckle Up: top beams are steel, hardest at (%)", `${topChord.every((b) => b.material === "steel")} ${Math.max(...topChord.map((b) => pct(b.usage)))}`, "true 85");
const flip = (key) => {
  const [[ax, ay], [bx, by]] = Bridge.memberEnds(key);
  return ax === bx || ay === by ? key : Bridge.memberKey([ax, by], [bx, ay]);
};
const howe = run("buckle-up", new Map(DESIGNS["buckle-up"].map(([k, m]) => [flip(k), m]))).ev;
const howeBeam = howe.failure?.members?.[0];
check("Buckle Up: flipping the diagonals makes a long beam buckle", !!(howeBeam && howeBeam.buckles && isDiagonal(howeBeam) && howe.failure.case.forces[howeBeam.index] < 0), true);

r = run("go-deeper");
const rows = [...r.design.keys()].flatMap((k) => Bridge.memberEnds(k).map(([, y]) => y));
check("Go Deeper: depth (m), hardest beam (%)", `${(r.lv.deckY - Math.min(...rows)) * Bridge.CELL} ${pct(r.ev.maxUsage)}`, "8 94");

r = run("cable-stayed");
const cables = r.beams.filter((b) => b.material === "cable");
check("Cable-Stayed: hardest cable (%)", Math.max(...cables.map((b) => pct(b.usage))), 36);
const towerTops = r.lv.towers.map((t) => `${t.x},${t.top + 1}`);
check("Cable-Stayed: cables start from bolts just below the tower tops", cables.every((b) => b.ends.some(([x, y]) => towerTops.includes(`${x},${y}`))), true);

r = run("heavy-haul");
const rock = r.lv.anchors.filter(([, y]) => y > r.lv.deckY).map(([x, y]) => `${x},${y}`);
check("Heavy Haul: rests on the rock, hardest beam (%)", `${r.beams.some((b) => b.ends.some(([x, y]) => rock.includes(`${x},${y}`)))} ${pct(r.ev.maxUsage)}`, "true 91");
check("Heavy Haul: the busy cables are pulled bottom beams", r.beams.filter((b) => b.material === "cable" && isAcross(b)).every((b) => b.pulled && b.ends.every(([, y]) => y === r.lv.deckY + 1)), true);
const uprights = r.beams.filter((b) => isUpright(b) && b.material !== "cable");
check("Heavy Haul: wood and steel uprights squashed", uprights.length > 0 && uprights.every((b) => !b.pulled), true);

console.log("\nWorksheet sums");
check("WS1 A4: 4 road + 6 wood + 4 wooden diagonals (£)", 4 * cost("road") + 6 * cost("wood") + 4 * cost("wood", true), 152);
const rafter = 30 / Math.sin(Math.PI / 4);
check("WS2 Q1: sloping beam, tie (kN)", `${round(rafter)} ${round(rafter * Math.cos(Math.PI / 4))}`, "42.4 30");
check("WS2 Q1c: wood diagonal too weak, steel strong enough", `${rafter > squash("wood", SQRT2)} ${rafter < squash("steel", SQRT2)} ${30 < M.wood.tension}`, "true true true");
const moment = (80 * 32) / 4;
check("WS2 Q3: moment (kN m), chord force at 4 m and 8 m (kN)", `${moment} ${moment / 4} ${moment / 8}`, "640 160 80");
check("WS2 Q3c: wood too weak at both depths, steel fine", `${moment / 8 > squash("wood", 1)} ${moment / 4 < squash("steel", 1)}`, "true true");
check("WS2 Q4: cable tension at 45°, 30°, 15° (kN)", [45, 30, 15].map((d) => round(20 / Math.sin((d * Math.PI) / 180))).join(" "), "28.3 40 77.3");
check("WS2 Q5: pull per £, wood and steel (kN)", `${M.wood.tension / M.wood.cost} ${M.steel.tension / M.steel.cost}`, "8.75 12.5");

console.log(failures ? `\n${failures} number(s) differ from the pack: update pack.html, then run npm run packs -- bridge-builder.` : "\nEvery number in the pack matches the game.");
process.exitCode = failures ? 1 : 0;
