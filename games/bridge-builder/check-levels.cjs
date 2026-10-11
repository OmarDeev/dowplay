// Checks every Bridge Builder level by designing a cheap bridge for it.
//
// It starts from classic bridge shapes (Pratt, Howe, Warren and cross-braced trusses
// of different depths, above or below the road, arched or flat, and fans of cables),
// built in the strongest material. Each shape that lets the truck across is then
// slimmed down: beams are removed or swapped for cheaper materials while the truck
// can still cross. The cheapest result should match the level's par.
//
// Usage: node check-levels.js              (all levels)
//        node check-levels.js go-deeper    (one level)
//        node check-levels.js --draw       (also print the designs)

const { loadGameScript } = require("../load-game.cjs");
const Bridge = loadGameScript("bridge-builder", "bridge.js");
const LEVELS = loadGameScript("bridge-builder", "levels.js");

const RESTARTS = 3;

const passes = (level, design) => !Bridge.analyse(level, design, { quick: true }).failure;

function roadOnly(level) {
  const design = new Map();
  for (let x = level.left; x < level.right; x++) design.set(Bridge.memberKey([x, level.deckY], [x + 1, level.deckY]), "road");
  return design;
}

// ---------- starting shapes ----------

// Truss over (side = -1) or under (side = +1) the road. `depthAt(x)` is the number of
// squares from the road to the chord at column x; `pattern` picks the diagonals.
function trussShape(level, side, depthAt, pattern, beam) {
  const design = roadOnly(level);
  const mid = (level.left + level.right) / 2;
  const add = (a, b) => {
    const key = Bridge.memberKey(a, b);
    if (!design.has(key) && !Bridge.memberProblem(level, key, beam)) design.set(key, beam);
  };
  const y = (j) => level.deckY + side * j;
  for (let x = level.left; x <= level.right; x++) {
    for (let j = 0; j < depthAt(x); j++) add([x, y(j)], [x, y(j + 1)]); // verticals
  }
  for (let x = level.left; x < level.right; x++) {
    const d = Math.min(depthAt(x), depthAt(x + 1));
    for (let j = 1; j <= d; j++) add([x, y(j)], [x + 1, y(j)]); // chords
    if (depthAt(x + 1) > d) add([x, y(d)], [x + 1, y(d + 1)]); // stepping up the profile
    if (depthAt(x) > d) add([x, y(d + 1)], [x + 1, y(d)]);
    for (let j = 0; j < Math.max(d, 1); j++) {
      const towardMiddle = x + 0.5 < mid ? 1 : -1;
      const pratt = towardMiddle > 0 ? [[x, y(j + 1)], [x + 1, y(j)]] : [[x, y(j)], [x + 1, y(j + 1)]];
      const howe = towardMiddle > 0 ? [[x, y(j)], [x + 1, y(j + 1)]] : [[x, y(j + 1)], [x + 1, y(j)]];
      const warren = (x - level.left + j) % 2 === 0 ? pratt : howe;
      if (pattern === "pratt" || pattern === "cross") add(...pratt);
      if (pattern === "howe" || pattern === "cross") add(...howe);
      if (pattern === "warren") add(...warren);
    }
  }
  // Tie the underside to any anchor bolts on the cliff faces.
  for (const [ax, ay] of level.anchors) {
    if (Math.sign(ay - level.deckY) !== side) continue;
    for (const [nx, ny] of [
      [ax + 1, ay],
      [ax - 1, ay],
      [ax + 1, ay - side],
      [ax - 1, ay - side],
    ]) {
      const key = Bridge.memberKey([ax, ay], [nx, ny]);
      if (design.has(key) || Bridge.memberProblem(level, key, beam)) continue;
      const [[x1], [x2]] = Bridge.memberEnds(key);
      if (x1 >= level.left && x2 <= level.right) design.set(key, beam);
    }
  }
  return design;
}

// How many squares of building room there are above (side -1) or below (+1) the road.
function room(level, side) {
  let depth = 0;
  for (let j = 1; j < level.rows; j++) {
    const y = level.deckY + side * j;
    if (y < 0 || y >= level.rows) break;
    let ok = true;
    for (let x = level.left + 1; x < level.right; x++) if (Bridge.pointProblem(level, x, y)) ok = false;
    if (!ok) break;
    depth = j;
  }
  return depth;
}

function startingShapes(level) {
  const beams = level.materials.filter((m) => m !== "cable");
  const beam = beams.includes("steel") ? "steel" : beams[0];
  const shapes = [];
  const half = (level.right - level.left) / 2;
  const mid = (level.left + level.right) / 2;
  if (beam) {
    for (const side of [-1, 1]) {
      const max = Math.min(room(level, side), 3);
      for (let d = 1; d <= max; d++) {
        const flat = () => d;
        const arched = (x) => Math.max(1, Math.round(d * (1 - ((x - mid) / (half + 0.5)) ** 2)));
        for (const depthAt of d > 1 ? [flat, arched] : [flat]) {
          for (const pattern of ["pratt", "howe", "warren", "cross"]) shapes.push(trussShape(level, side, depthAt, pattern, beam));
        }
      }
    }
  }
  if (level.materials.includes("cable")) {
    const fan = roadOnly(level);
    for (const [ax, ay] of level.anchors) {
      if (ay >= level.deckY) continue;
      for (let x = level.left + 1; x < level.right; x++) {
        const key = Bridge.memberKey([ax, ay], [x, level.deckY]);
        if (!Bridge.memberProblem(level, key, "cable")) fan.set(key, "cable");
      }
    }
    shapes.push(fan);
  }
  return shapes;
}

// ---------- slimming down ----------

function shuffle(list, random) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function seeded(seed) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

function slimDown(level, start, random, expensiveFirst) {
  const byCost = [...level.materials].sort((a, b) => Bridge.MATERIALS[a].cost - Bridge.MATERIALS[b].cost);
  const design = new Map(start);
  let improved = true;
  while (improved) {
    improved = false;
    const keys = shuffle([...design.keys()].filter((k) => design.get(k) !== "road"), random);
    if (expensiveFirst) keys.sort((a, b) => Bridge.memberCost(b, design.get(b)) - Bridge.memberCost(a, design.get(a)));
    for (const key of keys) {
      const material = design.get(key);
      design.delete(key);
      if (passes(level, design)) {
        improved = true;
        continue;
      }
      let swapped = false;
      for (const cheaper of byCost) {
        if (Bridge.MATERIALS[cheaper].cost >= Bridge.MATERIALS[material].cost || Bridge.memberProblem(level, key, cheaper)) continue;
        design.set(key, cheaper);
        if (passes(level, design)) {
          swapped = improved = true;
          break;
        }
      }
      if (!swapped) design.set(key, material);
    }
  }
  return design;
}

function optimise(level) {
  let best = null;
  let workable = 0;
  for (const shape of startingShapes(level)) {
    if (!passes(level, shape)) continue;
    workable++;
    for (let r = 0; r < RESTARTS; r++) {
      const design = slimDown(level, shape, seeded(r + 1), r === 0);
      const cost = Bridge.designCost(design);
      if (!best || cost < best.cost) best = { design, cost };
    }
  }
  return best && { ...best, workable };
}

// Text picture of a design: R road, W wood, S steel, C cable (long cables listed below).
function draw(level, design) {
  const W = level.cols * 4 - 3;
  const H = level.rows * 2 - 1;
  const grid = Array.from({ length: H }, () => Array(W).fill(" "));
  for (let y = 0; y < level.rows; y++) {
    for (let x = 0; x < level.cols; x++) {
      const anchor = level.anchors.some(([ax, ay]) => ax === x && ay === y);
      grid[y * 2][x * 4] = anchor ? "A" : Bridge.pointProblem(level, x, y)?.reason === "ground" ? "#" : ".";
    }
  }
  const letter = { road: "R", wood: "W", steel: "S", cable: "C" };
  const long = [];
  for (const [key, material] of design) {
    const [[ax, ay], [bx, by]] = Bridge.memberEnds(key);
    if (Bridge.memberLength(key) > 1.5) {
      long.push(`(${ax},${ay})-(${bx},${by})`);
      continue;
    }
    const ch = letter[material];
    if (ay === by) for (let i = 1; i < 4; i++) grid[ay * 2][ax * 4 + i] = ch;
    else if (ax === bx) grid[Math.min(ay, by) * 2 + 1][ax * 4] = ch;
    else grid[Math.min(ay, by) * 2 + 1][Math.min(ax, bx) * 4 + 2] = (bx - ax) * (by - ay) > 0 ? "\\" : "/";
  }
  const picture = grid.map((row) => "    " + row.join("")).join("\n");
  return long.length ? `${picture}\n    long cables: ${long.join(" ")}` : picture;
}

const args = process.argv.slice(2);
const showDrawings = args.includes("--draw");
const only = args.find((a) => !a.startsWith("--"));
let problems = 0;
for (const level of LEVELS.filter((l) => !only || l.id === only)) {
  const started = Date.now();
  const best = optimise(level);
  const time = `${((Date.now() - started) / 1000).toFixed(1)}s`;
  if (!best) {
    problems++;
    console.log(`✗ ${level.id}: none of the starting shapes can carry the ${level.truck.name.toLowerCase()} (${time})`);
    continue;
  }
  // Par must be reachable (3 stars possible) and the budget must leave room above it.
  const ok = best.cost === level.par && level.par <= level.budget;
  if (!ok) problems++;
  console.log(`${ok ? "✓" : "✗"} ${level.id}: cheapest found £${best.cost}, par £${level.par}, budget £${level.budget} (${best.workable} shapes worked, ${time})`);
  if (best.cost > level.par) console.log(`    nothing found at par: 3 stars may be impossible. Set par to £${best.cost}.`);
  if (best.cost < level.par) console.log(`    found a design under par: set par to £${best.cost}.`);
  if (showDrawings) console.log(draw(level, best.design));
}
console.log(problems ? `\n${problems} level(s) need attention.` : "\nAll levels check out.");
process.exitCode = problems ? 1 : 0;
