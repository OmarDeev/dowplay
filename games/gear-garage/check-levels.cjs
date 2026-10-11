// Checks every Gear Garage level by searching for its cheapest working design.
// It tries chains of gears from the motor (with stacked gears where a level allows
// them) and reports the cheapest cost it finds, which should match the level's par.
//
// Usage: node check-levels.js            (all levels)
//        node check-levels.js garage-door (one level)

const { loadGameScript } = require("../load-game.cjs");
const Gears = loadGameScript("gear-garage", "gears.js");
const LEVELS = loadGameScript("gear-garage", "levels.js");

// Whole-number offsets (dx, dy) exactly R holes away.
function circlePoints(R) {
  const points = [];
  for (let dx = -R; dx <= R; dx++) {
    const dy2 = R * R - dx * dx;
    const dy = Math.round(Math.sqrt(dy2));
    if (dy * dy !== dy2) continue;
    points.push([dx, dy]);
    if (dy) points.push([dx, -dy]);
  }
  return points;
}

function cheapest(level, maxGears = 7) {
  const sizes = level.tools.map((t) => t.teeth);
  const price = Object.fromEntries(level.tools.map((t) => [t.teeth, t.cost]));
  const lowest = Math.min(...Object.values(price));
  let found = null;
  let tried = 0;

  function search(board, last, spent, cap) {
    tried++;
    if (Gears.evaluate(level, board).passed) {
      found = { board: new Map(board), cost: spent };
      return true;
    }
    if (board.size >= maxGears || spent + lowest > cap) return false;
    for (const teeth of sizes) {
      if (spent + price[teeth] > cap) continue;
      const options = circlePoints(Gears.radius(last.teeth) + Gears.radius(teeth)).map(([dx, dy]) => ({
        x: last.x + dx,
        y: last.y + dy,
        layer: last.layer,
        stacked: false,
      }));
      if (level.compound && !last.stacked) options.push({ x: last.x, y: last.y, layer: 1 - last.layer, stacked: true });
      for (const option of options) {
        const key = Gears.gearKey(option.x, option.y, option.layer);
        if (board.has(key) || Gears.placementProblem(level, board, option.x, option.y, option.layer, teeth)) continue;
        board.set(key, { teeth });
        if (search(board, { ...option, teeth }, spent + price[teeth], cap)) return true;
        board.delete(key);
      }
    }
    return false;
  }

  for (let cap = lowest; cap <= level.budget * 2 && !found; cap++) {
    for (const teeth of sizes) {
      const { x, y } = level.motor;
      if (price[teeth] > cap || Gears.placementProblem(level, new Map(), x, y, 0, teeth)) continue;
      const board = new Map([[Gears.gearKey(x, y, 0), { teeth }]]);
      if (search(board, { x, y, layer: 0, teeth, stacked: false }, price[teeth], cap)) break;
    }
  }
  return { found, tried };
}

function describe(board) {
  return [...board]
    .map(([key, { teeth }]) => {
      const { x, y, layer } = Gears.parseGearKey(key);
      return `${teeth}T@(${x},${y})${layer ? " upper" : ""}`;
    })
    .join("  ");
}

const only = process.argv[2];
let problems = 0;
for (const level of LEVELS.filter((l) => !only || l.id === only)) {
  const started = Date.now();
  const { found, tried } = cheapest(level);
  const time = `${((Date.now() - started) / 1000).toFixed(1)}s, ${tried} designs tried`;
  if (!found) {
    problems++;
    console.log(`✗ ${level.id}: no working design found within £${level.budget * 2} (${time})`);
    continue;
  }
  const ok = found.cost === level.par && level.par <= level.budget;
  if (!ok) problems++;
  console.log(`${ok ? "✓" : "✗"} ${level.id}: cheapest £${found.cost}, par £${level.par}, budget £${level.budget} (${time})`);
  console.log(`    ${describe(found.board)}`);
}
console.log(problems ? `\n${problems} level(s) need attention.` : "\nAll levels check out.");
process.exitCode = problems ? 1 : 0;
