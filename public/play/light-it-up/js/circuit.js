"use strict";
// Light It Up: circuit engine.
// The board is a grid of junctions. Every part (wire, lamp, battery...) sits on one
// edge between two neighbouring junctions, and a junction joins everything that
// touches it. The circuit is solved with nodal analysis, so the voltages and
// currents are the real ones. No page code here, so it can be tested on its own.

const Circuit = (() => {
  const WIRE_R = 0.01; // ohms per grid section of ordinary wire
  const BATTERY_R = 0.05; // internal resistance of a battery
  const GMIN = 1e-9; // tiny leak to 0 V so unconnected parts still give a solvable system
  const BLOW_RATIO = 1.35; // lamps and appliances burn out above 135% of their rated voltage
  const OFF_RATIO = 0.1; // under 10% of the rated voltage counts as off
  const DEFAULT_TOLERANCE = 0.2; // "working" means within 20% of the rated voltage

  // ---------- grid ----------

  const edgeKey = (x, y, dir) => `${x},${y},${dir}`;

  function parseEdge(key) {
    const [x, y, dir] = key.split(",");
    return { x: Number(x), y: Number(y), dir };
  }

  // The two junctions an edge joins: "h" edges go right, "v" edges go down.
  function edgeEnds(key) {
    const { x, y, dir } = parseEdge(key);
    return dir === "h" ? [[x, y], [x + 1, y]] : [[x, y], [x, y + 1]];
  }

  function edgeBetween([ax, ay], [bx, by]) {
    if (ay === by && Math.abs(ax - bx) === 1) return edgeKey(Math.min(ax, bx), ay, "h");
    if (ax === bx && Math.abs(ay - by) === 1) return edgeKey(ax, Math.min(ay, by), "v");
    return null;
  }

  function edgeInGrid(key, level) {
    const { x, y, dir } = parseEdge(key);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) return false;
    if (dir === "h") return x + 1 < level.cols && y < level.rows;
    if (dir === "v") return x < level.cols && y + 1 < level.rows;
    return false;
  }

  // ---------- parts and pieces ----------
  // "Parts" are fixed by the level (batteries, lamps, switches...).
  // "Pieces" are what the player places (wire, thick cable, resistors).

  const isLoad = (part) => part.type === "lamp" || part.type === "appliance" || part.type === "device";

  function loadResistance(part) {
    return part.type === "device" ? part.r : (part.vRated * part.vRated) / part.pRated;
  }

  function pieceResistance(level, piece) {
    if (piece.type === "resistor") return piece.value;
    if (piece.type === "thick") return level.thickR;
    return level.wireR ?? WIRE_R;
  }

  const samePiece = (p, q) => p.type === q.type && (p.type !== "resistor" || p.value === q.value);

  function toolFor(level, piece) {
    return level.tools.find((tool) => samePiece(tool, piece));
  }

  function boardCost(level, board) {
    let cost = 0;
    for (const piece of board.values()) cost += toolFor(level, piece)?.cost ?? 0;
    return cost;
  }

  function defaultSwitches(level) {
    const states = {};
    for (const part of level.parts) if (part.type === "switch") states[part.id] = !!part.on;
    return states;
  }

  // Everything on the board, with its two end junctions as node numbers.
  function collectItems(level, board, switchStates) {
    const node = ([x, y]) => y * level.cols + x;
    const items = [];
    for (const part of level.parts) {
      const [a, b] = edgeEnds(part.edge).map(node);
      const item = { key: part.edge, id: part.id, part, a, b };
      if (part.type === "battery") {
        Object.assign(item, { kind: "battery", r: part.r ?? BATTERY_R, plusAtA: part.plus === "a" });
      } else if (part.type === "switch") {
        Object.assign(item, { kind: "switch", r: level.wireR ?? WIRE_R, closed: switchStates[part.id] ?? !!part.on });
      } else {
        Object.assign(item, { kind: "load", r: loadResistance(part) });
      }
      items.push(item);
    }
    for (const [key, piece] of board) {
      const [a, b] = edgeEnds(key).map(node);
      items.push({ key, piece, a, b, kind: "piece", r: pieceResistance(level, piece) });
    }
    return items;
  }

  const conducts = (item, blown) => (item.kind === "switch" ? item.closed : !blown.has(item.key));

  // ---------- solver ----------

  // Gaussian elimination with partial pivoting. Modifies A and b.
  function solveLinear(A, b) {
    const n = b.length;
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row;
      }
      [A[col], A[pivot]] = [A[pivot], A[col]];
      [b[col], b[pivot]] = [b[pivot], b[col]];
      const p = A[col][col];
      for (let row = col + 1; row < n; row++) {
        const f = A[row][col] / p;
        if (f === 0) continue;
        for (let k = col; k < n; k++) A[row][k] -= f * A[col][k];
        b[row] -= f * b[col];
      }
    }
    const x = new Float64Array(n);
    for (let row = n - 1; row >= 0; row--) {
      let s = b[row];
      for (let k = row + 1; k < n; k++) s -= A[row][k] * x[k];
      x[row] = s / A[row][row];
    }
    return x;
  }

  // Nodal analysis. A battery is its EMF in series with its internal resistance,
  // stamped as the equivalent current source in parallel with that resistance.
  // Returns Map item -> { V: voltage from end a to end b, I: current flowing a -> b }.
  function solveCircuit(items, blown) {
    const index = new Map();
    const at = (node) => {
      if (!index.has(node)) index.set(node, index.size);
      return index.get(node);
    };
    const active = items.filter((item) => conducts(item, blown));
    const ends = active.map((item) => [at(item.a), at(item.b)]);

    const n = index.size;
    const G = Array.from({ length: n }, () => new Float64Array(n));
    const rhs = new Float64Array(n);
    for (let i = 0; i < n; i++) G[i][i] = GMIN;
    active.forEach((item, k) => {
      const [a, b] = ends[k];
      const g = 1 / item.r;
      G[a][a] += g;
      G[b][b] += g;
      G[a][b] -= g;
      G[b][a] -= g;
      if (item.kind === "battery") {
        const [plus, minus] = item.plusAtA ? [a, b] : [b, a];
        rhs[plus] += item.part.emf * g;
        rhs[minus] -= item.part.emf * g;
      }
    });
    const v = n ? solveLinear(G, rhs) : new Float64Array(0);
    const voltageAt = (node) => (index.has(node) ? v[index.get(node)] : null);

    const result = new Map();
    for (const item of items) {
      const va = voltageAt(item.a);
      const vb = voltageAt(item.b);
      const V = va !== null && vb !== null ? va - vb : 0;
      let I = 0;
      if (conducts(item, blown)) {
        if (item.kind === "battery") {
          const terminal = item.plusAtA ? V : -V; // voltage of + terminal above - terminal
          const out = (item.part.emf - terminal) / item.r; // current leaving the + terminal
          I = item.plusAtA ? -out : out; // inside a battery, current flows from - to +
        } else {
          I = V / item.r;
        }
      }
      result.set(item, { V, I });
    }
    return result;
  }

  // ---------- what happens to each part ----------

  function burnsOut(item, V) {
    const part = item.part;
    if (part.type === "device") {
      const v = part.plus === "a" ? V : -V;
      return v > (part.vBlow ?? part.vMax * 2);
    }
    return Math.abs(V) > part.vRated * BLOW_RATIO;
  }

  function loadReport(level, part, V, I, blown) {
    const current = Math.abs(I);
    if (part.type === "device") {
      const v = part.plus === "a" ? V : -V;
      let state = "good";
      if (blown) state = "blown";
      else if (Math.abs(v) < 0.1) state = "off";
      else if (v < 0) state = "reversed";
      else if (v < part.vMin) state = "low";
      else if (v > part.vMax) state = "over";
      return { part, V: v, I: current, P: Math.abs(v * I), state, brightness: 0 };
    }
    const tolerance = part.tol ?? level.tol ?? DEFAULT_TOLERANCE;
    const v = Math.abs(V);
    const ratio = v / part.vRated;
    let state = "good";
    if (blown) state = "blown";
    else if (ratio < OFF_RATIO) state = "off";
    else if (ratio < 1 - tolerance) state = "low";
    else if (ratio > 1 + tolerance) state = "over";
    const brightness = blown ? 0 : Math.min(1.6, ratio * ratio);
    return { part, V: v, I: current, P: v * current, state, ratio, brightness };
  }

  // Which batteries are wired into the same network (used for "keep circuits separate").
  function joinedSupplies(level, items) {
    if (!level.separate) return [];
    const parent = new Map();
    const find = (n) => {
      while (parent.has(n) && parent.get(n) !== n) n = parent.get(n);
      return n;
    };
    const union = (a, b) => parent.set(find(a), find(b));
    for (const item of items) {
      if (item.kind === "switch" && !item.closed) continue;
      union(item.a, item.b);
    }
    const nodeOf = (id) => items.find((item) => item.id === id).a;
    return level.separate.filter(([p, q]) => find(nodeOf(p)) === find(nodeOf(q)));
  }

  // Solves the board. Fuses that carry too much current blow, then parts that get
  // far too much voltage burn out, and the circuit is solved again each time.
  function simulate(level, board, switchStates = defaultSwitches(level)) {
    const items = collectItems(level, board, switchStates);
    const blown = new Set();
    const blowCurrent = new Map();
    let solution = solveCircuit(items, blown);
    for (let round = 0; round < items.length; round++) {
      const overloaded = items.filter(
        (item) => item.kind === "battery" && !blown.has(item.key) && Math.abs(solution.get(item).I) > item.part.fuse
      );
      if (overloaded.length) {
        for (const item of overloaded) {
          blown.add(item.key);
          blowCurrent.set(item.id, Math.abs(solution.get(item).I));
        }
      } else {
        const burnt = items.filter((item) => item.kind === "load" && !blown.has(item.key) && burnsOut(item, solution.get(item).V));
        if (!burnt.length) break;
        for (const item of burnt) blown.add(item.key);
      }
      solution = solveCircuit(items, blown);
    }

    const edges = new Map();
    const loads = {};
    const batteries = {};
    for (const item of items) {
      const { V, I } = solution.get(item);
      edges.set(item.key, { item, V, I, conducting: conducts(item, blown) });
      if (item.kind === "load") loads[item.id] = loadReport(level, item.part, V, I, blown.has(item.key));
      if (item.kind === "battery") {
        batteries[item.id] = {
          part: item.part,
          current: item.plusAtA ? -I : I,
          fuseBlown: blown.has(item.key),
          blowCurrent: blowCurrent.get(item.id) ?? 0,
        };
      }
    }
    return { edges, loads, batteries, switches: switchStates, joined: joinedSupplies(level, items) };
  }

  // ---------- goals ----------

  // Each test sets the switches and says which loads must be working ("on") or off.
  // Levels without tests just need every load working.
  function levelTests(level) {
    if (level.tests) return level.tests;
    const expect = {};
    for (const part of level.parts) if (isLoad(part)) expect[part.id] = "on";
    return [{ label: null, switches: {}, expect }];
  }

  function checkTest(level, board, test) {
    const switches = { ...defaultSwitches(level), ...test.switches };
    const sim = simulate(level, board, switches);
    const checks = Object.entries(test.expect).map(([id, want]) => {
      const got = sim.loads[id].state;
      return { id, part: sim.loads[id].part, want, got, ok: want === "on" ? got === "good" : got === "off" };
    });
    const fusesOk = Object.values(sim.batteries).every((b) => !b.fuseBlown);
    const ok = checks.every((c) => c.ok) && fusesOk && sim.joined.length === 0;
    return { test, sim, checks, fusesOk, ok };
  }

  function evaluate(level, board) {
    const results = levelTests(level).map((test) => checkTest(level, board, test));
    const passed = results.every((r) => r.ok);
    const cost = boardCost(level, board);
    let stars = 0;
    if (passed) stars = cost <= level.par ? 3 : cost <= level.budget ? 2 : 1;
    return { passed, results, cost, stars };
  }

  // ---------- words and numbers ----------

  function fmtNumber(x) {
    const a = Math.abs(x);
    if (a >= 100) return x.toFixed(0);
    if (a >= 10) return x.toFixed(1);
    return x.toFixed(2);
  }
  const fmtV = (v) => `${fmtNumber(v)} V`;
  const fmtA = (i) => (Math.abs(i) < 0.0005 ? "0 A" : Math.abs(i) < 0.1 ? `${fmtNumber(i * 1000)} mA` : `${fmtNumber(i)} A`);
  const fmtW = (p) => `${fmtNumber(p)} W`;
  const fmtRating = (amps) => (amps < 1 ? `${Math.round(amps * 1000)} mA` : `${amps} A`);

  // How a part is referred to in a sentence: "the kitchen lamp", "circuit A".
  const nameOf = (part) => part.ref ?? `the ${part.name.toLowerCase()}`;
  const capitalise = (text) => text[0].toUpperCase() + text.slice(1);

  // Explains what is wrong, most serious first. `expect` says which loads should be off.
  function problems(level, sim, expect = {}) {
    const list = [];
    const add = (severity, text) => list.push({ severity, text: capitalise(text) });
    for (const [a, b] of sim.joined) {
      const part = (id) => level.parts.find((p) => p.id === id);
      add(0, `${nameOf(part(a))} and ${nameOf(part(b))} are joined. Keep each circuit separate, like a real fuse box.`);
    }
    for (const battery of Object.values(sim.batteries)) {
      if (!battery.fuseBlown) continue;
      const name = nameOf(battery.part);
      if (battery.blowCurrent > 8 * battery.part.fuse) {
        add(0, `Short circuit! The current found a path from + to − with nothing to slow it down, so the fuse in ${name} blew.`);
      } else {
        // Use the same unit as the fuse rating, e.g. "131 mA" against a "100 mA" fuse.
        const drawn = battery.part.fuse < 1 ? fmtRating(battery.blowCurrent) : fmtA(battery.blowCurrent);
        add(0, `Overload! ${capitalise(name)} had to supply ${drawn}, but its fuse is ${fmtRating(battery.part.fuse)}, so the fuse blew.`);
      }
    }
    for (const [id, load] of Object.entries(sim.loads)) {
      const { part, state, V } = load;
      const name = nameOf(part);
      const wantOff = expect[id] === "off";
      if (part.type === "device") {
        const range = `${part.vMin}–${part.vMax} V`;
        if (state === "blown") add(1, `${name} was damaged by ${fmtV(V)}.`);
        else if (state === "reversed") add(2, `${name} is connected the wrong way round. Its + side must connect towards the battery's +.`);
        else if (state === "over") add(2, `${name} gets ${fmtV(V)}. That's more than its ${range}.`);
        else if (state === "low") add(3, `${name} only gets ${fmtV(V)}. It needs ${range}.`);
        else if (state === "off" && !wantOff) add(4, `${name} is off. Is it part of a complete loop?`);
        continue;
      }
      const rated = `${part.vRated} V`;
      if (state === "blown") add(1, `${name} blew! It got ${fmtV(V)}, but it's rated ${rated}.`);
      else if (wantOff && state !== "off") add(2, `${name} should be off right now, but it's on.`);
      else if (state === "over") add(2, `${name} gets ${fmtV(V)}. That's too much for a ${rated} ${part.type === "lamp" ? "lamp" : "appliance"}.`);
      else if (state === "low") add(3, `${name} ${part.type === "lamp" ? "is dim" : "isn't getting enough"}: it gets ${fmtV(V)} of its ${rated}.`);
      else if (state === "off" && !wantOff) add(4, `${name} is off. Is it part of a complete loop?`);
    }
    return list.sort((p, q) => p.severity - q.severity).map((p) => p.text);
  }

  return {
    edgeKey,
    parseEdge,
    edgeEnds,
    edgeBetween,
    edgeInGrid,
    isLoad,
    samePiece,
    toolFor,
    boardCost,
    defaultSwitches,
    simulate,
    levelTests,
    evaluate,
    problems,
    fmtV,
    fmtA,
    fmtW,
    fmtRating,
  };
})();

if (typeof module !== "undefined") module.exports = Circuit;
