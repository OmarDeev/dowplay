"use strict";
// Light It Up level checker. For every level, the intended design passes (with the stars
// shown) and the typical mistakes fail for the intended reason. Run it after editing
// public/play/light-it-up/js/levels.js or circuit.js:
//
//   node games/light-it-up/check-levels.cjs
const { loadGameScript } = require("../load-game.cjs");
const Circuit = loadGameScript("light-it-up", "circuit.js");
const LEVELS = loadGameScript("light-it-up", "levels.js");

const W = { type: "wire" };
const T = { type: "thick" };
const R = (value) => ({ type: "resistor", value });

// Lays `piece` along a path of corner points, e.g. [[1,2],[5,2]].
function lay(board, corners, piece = W) {
  for (let i = 1; i < corners.length; i++) {
    let [x, y] = corners[i - 1];
    const [tx, ty] = corners[i];
    while (x !== tx || y !== ty) {
      const nx = x + Math.sign(tx - x);
      const ny = x === tx ? y + Math.sign(ty - y) : y;
      board.set(Circuit.edgeBetween([x, y], [nx, ny]), piece);
      [x, y] = [nx, ny];
    }
  }
  return board;
}
const put = (board, edge, piece) => (board.set(edge, piece), board);

const level = (id) => LEVELS.find((l) => l.id === id);
let failures = 0;

function report(id, name, board, expectPass, expectStars) {
  const lvl = level(id);
  for (const key of board.keys()) if (!Circuit.edgeInGrid(key, lvl)) throw new Error(`${id}: ${key} off grid`);
  for (const p of lvl.parts) if (board.has(p.edge)) throw new Error(`${id}: piece on fixed part ${p.edge}`);
  const ev = Circuit.evaluate(lvl, board);
  const loads = ev.results
    .map((r) => Object.entries(r.sim.loads).map(([lid, l]) => `${lid}=${l.V.toFixed(2)}V/${l.state}`).join(" "))
    .join(" | ");
  const fuses = ev.results.map((r) => Object.values(r.sim.batteries).map((b) => `${b.current.toFixed(3)}A${b.fuseBlown ? "!" : ""}`).join(",")).join(" | ");
  const ok = ev.passed === expectPass && (expectStars === undefined || ev.stars === expectStars);
  if (!ok) failures++;
  const firstProblem = ev.results.map((r) => Circuit.problems(lvl, r.sim, r.test.expect)[0]).find(Boolean) || "";
  console.log(`${ok ? "ok  " : "FAIL"} ${id.padEnd(14)} ${name.padEnd(28)} pass=${ev.passed} stars=${ev.stars} cost=£${ev.cost} (budget £${lvl.budget}, par £${lvl.par})`);
  console.log(`       ${loads}   supply: ${fuses}`);
  if (!expectPass) console.log(`       says: ${firstProblem}`);
}

// 1 Lights On
report("lights-on", "loop", lay(lay(new Map(), [[1, 2], [5, 2]]), [[1, 3], [5, 3]]), true, 3);
report("lights-on", "top wire only", lay(new Map(), [[1, 2], [5, 2]]), false);
report("lights-on", "short circuit", lay(lay(new Map(), [[1, 2], [2, 2], [2, 3], [1, 3]]), [[2, 2], [5, 2]]), false);

// 2 Two Rooms
report("two-rooms", "parallel rails", lay(lay(new Map(), [[1, 2], [7, 2]]), [[1, 3], [7, 3]]), true, 3);
{
  const b = lay(new Map(), [[1, 2], [4, 2]]);
  lay(b, [[4, 3], [5, 3], [5, 2], [7, 2]]);
  lay(b, [[7, 3], [7, 4], [1, 4], [1, 3]]);
  report("two-rooms", "series (dim)", b, false);
}

// 3 Hall Switch
{
  const b = lay(new Map(), [[1, 2], [7, 2]]);
  lay(b, [[4, 3], [1, 3]]);
  lay(b, [[7, 3], [5, 3], [5, 4], [3, 4]]);
  lay(b, [[2, 4], [1, 4], [1, 3]]);
  report("hall-switch", "hall return via switch", b, true, 3);
  report("hall-switch", "rails, switch unused", lay(lay(new Map(), [[1, 2], [7, 2]]), [[1, 3], [7, 3]]), false);
  const main = lay(new Map(), [[1, 2], [7, 2]]);
  lay(main, [[7, 3], [3, 3], [3, 4]]);
  lay(main, [[2, 4], [1, 4], [1, 3]]);
  put(main, "4,3,h", W);
  report("hall-switch", "switch on main line", main, false);
}

// 4 Twelve Volts
{
  const series = lay(new Map(), [[1, 2], [4, 2]]);
  lay(series, [[4, 3], [5, 3], [5, 2], [7, 2]]);
  lay(series, [[7, 3], [7, 4], [1, 4], [1, 3]]);
  report("twelve-volts", "series", series, true, 3);
  report("twelve-volts", "parallel (blows)", lay(lay(new Map(), [[1, 2], [7, 2]]), [[1, 3], [7, 3]]), false);
  const res = lay(new Map(), [[1, 2], [7, 2]]);
  put(res, "4,3,v", R(12));
  put(res, "7,3,v", R(12));
  lay(res, [[7, 4], [1, 4], [1, 3]]);
  report("twelve-volts", "parallel + resistors", res, true, 1);
}

// 5 Pick the Resistor
{
  const good = lay(lay(new Map(), [[1, 2], [6, 2]]), [[1, 3], [6, 3]]);
  put(good, "2,2,h", R(2));
  put(good, "3,2,h", R(4));
  report("pick-resistor", "2 + 4 ohm", good, true, 3);
  const four = lay(lay(new Map(), [[1, 2], [6, 2]]), [[1, 3], [6, 3]]);
  put(four, "2,2,h", R(4));
  report("pick-resistor", "4 ohm only (too bright)", four, false);
  report("pick-resistor", "no resistor (blows)", lay(lay(new Map(), [[1, 2], [6, 2]]), [[1, 3], [6, 3]]), false);
}

// 6 Two Fuses
{
  const good = lay(lay(new Map(), [[1, 2], [3, 2]]), [[1, 3], [3, 3]]);
  lay(good, [[11, 2], [5, 2]]);
  lay(good, [[11, 3], [5, 3]]);
  report("two-fuses", "heater | fridge+tv+lamp", good, true, 3);
  const half = lay(lay(new Map(), [[1, 2], [5, 2]]), [[1, 3], [5, 3]]);
  lay(half, [[11, 2], [7, 2]]);
  lay(half, [[11, 3], [7, 3]]);
  report("two-fuses", "two and two (fuse A)", half, false);
  report("two-fuses", "joined circuits", lay(lay(new Map(), [[1, 2], [11, 2]]), [[1, 3], [11, 3]]), false);
}

// 7 Smart Doorbell
function divider(top, bottom) {
  const b = lay(new Map(), [[1, 1], [3, 1]]);
  if (top.length === 2) put(b, "3,1,h", R(top[1]));
  else put(b, "3,1,h", W);
  put(b, "4,1,v", R(top[0]));
  if (bottom.length === 2) {
    put(b, "4,2,v", R(bottom[0]));
    put(b, "4,3,v", R(bottom[1]));
    lay(b, [[4, 4], [1, 4], [1, 2]]);
    lay(b, [[7, 3], [7, 4], [4, 4]]);
  } else {
    put(b, "4,2,v", R(bottom[0]));
    lay(b, [[4, 3], [1, 3], [1, 2]]);
    lay(b, [[7, 3], [4, 3]]);
  }
  lay(b, [[4, 2], [7, 2]]);
  return b;
}
report("doorbell", "47+47 over 47", divider([47, 47], [47]), true, 3);
report("doorbell", "100+100 over 100", divider([100, 100], [100]), true, 3);
report("doorbell", "100 over 47 (loaded, low)", divider([100], [47]), false);
report("doorbell", "47 over 22 (fuse)", divider([47], [22]), false);
report("doorbell", "22 over 10 (fuse)", divider([22], [10]), false);
{
  const backwards = divider([47, 47], [47]);
  backwards.delete("4,2,h"); backwards.delete("5,2,h"); backwards.delete("6,2,h");
  for (const k of ["4,3,h", "5,3,h", "6,3,h"]) backwards.delete(k);
  lay(backwards, [[4, 2], [5, 2], [5, 3], [7, 3]]);
  lay(backwards, [[4, 3], [4, 4], [8, 4], [8, 2], [7, 2]]);
  report("doorbell", "doorbell backwards", backwards, false);
}

// 8 Power to the Shed
function shed(thinOnShed, lampPiece = W, shedPiece = T) {
  const b = lay(lay(new Map(), [[3, 2], [0, 2]], lampPiece), [[3, 3], [0, 3]], lampPiece);
  lay(lay(b, [[3, 2], [15, 2]], shedPiece), [[3, 3], [15, 3]], shedPiece);
  for (let i = 0; i < thinOnShed; i++) b.set(`${5 + i},2,h`, W);
  return b;
}
report("shed", "thin lamp, thick shed", shed(0), true, 2);
report("shed", "thin lamp, 1 thin on shed", shed(1), true, 3);
report("shed", "thin lamp, 2 thin on shed", shed(2), false);
report("shed", "all thin", shed(0, W, W), false);
report("shed", "all thick", shed(0, T, T), true, 1);

console.log(failures ? `\n${failures} check(s) failed` : "\nall level checks passed");
process.exitCode = failures ? 1 : 0;
