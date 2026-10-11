"use strict";
// Bridge Builder: structural engine.
// A bridge is a pin-jointed truss on a grid: beams join neighbouring grid points
// (across, up or diagonally), so every beam is either pulled (tension) or squashed
// (compression). The truss is solved with the direct stiffness method for each position
// of the truck as it crosses, and every beam's force is compared with its strength.
// Squashed beams also buckle, and longer beams buckle sooner (strength ∝ 1/length²).
// No page code here, so it can be tested on its own.

const Bridge = (() => {
  const CELL = 4; // metres per grid square
  const SOFT = 1; // kN/m spring from every joint to the ground, so a floppy structure still gives an answer
  const WOBBLE = 0.25; // metres: moving more than this means part of the structure can fold up
  const STEP = 0.25; // the truck's position is checked every quarter of a square
  const EPS = 1e-9;

  // Strength in kN, stiffness (EA) in kN, weight in kN per square of length, cost per square.
  const MATERIALS = {
    road: { name: "Road", tension: 200, compression: 200, buckling: 200, stiffness: 200000, weight: 4, cost: 15 },
    wood: { name: "Wood", tension: 70, compression: 60, buckling: 60, stiffness: 50000, weight: 1.5, cost: 8 },
    steel: { name: "Steel", tension: 200, compression: 200, buckling: 180, stiffness: 200000, weight: 3, cost: 16 },
    cable: { name: "Cable", tension: 200, compression: 0, buckling: 0, stiffness: 150000, weight: 0.5, cost: 5, tensionOnly: true },
  };

  // ---------- geometry ----------

  const pointKey = (x, y) => `${x},${y}`;

  function memberKey([ax, ay], [bx, by]) {
    if (ax > bx || (ax === bx && ay > by)) [ax, ay, bx, by] = [bx, by, ax, ay];
    return `${ax},${ay},${bx},${by}`;
  }

  function memberEnds(key) {
    const [ax, ay, bx, by] = key.split(",").map(Number);
    return [
      [ax, ay],
      [bx, by],
    ];
  }

  const memberLength = (key) => {
    const [[ax, ay], [bx, by]] = memberEnds(key);
    return Math.hypot(bx - ax, by - ay);
  };

  const memberCost = (key, material) => Math.round(MATERIALS[material].cost * memberLength(key));

  function designCost(design) {
    let cost = 0;
    for (const [key, material] of design) cost += memberCost(key, material);
    return cost;
  }

  // Strength when squashed: the smaller of crushing and buckling (buckling ∝ 1/length²).
  function compressionStrength(material, length) {
    const m = MATERIALS[material];
    return Math.min(m.compression, m.buckling / (length * length));
  }

  const strictlyInside = (x, y, r) => x > r.x0 + EPS && x < r.x1 - EPS && y > r.y0 + EPS && y < r.y1 - EPS;
  const touching = (x, y, r) => x >= r.x0 - EPS && x <= r.x1 + EPS && y >= r.y0 - EPS && y <= r.y1 + EPS;

  const anchorSet = (level) => new Set(level.anchors.map(([x, y]) => pointKey(x, y)));
  const isAnchor = (level, x, y) => level.anchors.some(([ax, ay]) => ax === x && ay === y);

  // Why a grid point can't hold a joint, or null. The ground can only be built on at its anchor bolts.
  function pointProblem(level, x, y) {
    if (x < 0 || y < 0 || x >= level.cols || y >= level.rows) return { reason: "edge" };
    if (isAnchor(level, x, y)) return null;
    for (const g of level.ground) if (touching(x, y, g)) return { reason: "ground" };
    for (const zone of level.noBuild ?? []) if (strictlyInside(x, y, zone)) return { reason: "zone", what: zone.name };
    return null;
  }

  // Why a beam can't go between two points, or null. Beams join neighbouring points;
  // cables can stretch between any two points within the level's cable reach.
  function memberProblem(level, key, material) {
    const [[ax, ay], [bx, by]] = memberEnds(key);
    if (ax === bx && ay === by) return { reason: "far" };
    const neighbours = Math.abs(ax - bx) <= 1 && Math.abs(ay - by) <= 1;
    if (!neighbours && material !== "cable") return { reason: "far" };
    if (material === "cable" && Math.hypot(bx - ax, by - ay) > (level.cableReach ?? 8) + EPS) return { reason: "reach" };
    if (material !== "road" && !level.materials.includes(material)) return { reason: "material" };
    for (const [x, y] of [
      [ax, ay],
      [bx, by],
    ]) {
      const problem = pointProblem(level, x, y);
      if (problem) return problem;
    }
    // Nothing may pass through the ground or a no-build zone along the way.
    for (let t = 0.1; t < 0.95; t += 0.1) {
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      for (const g of level.ground) if (strictlyInside(x, y, g)) return { reason: "ground" };
      for (const zone of level.noBuild ?? []) if (strictlyInside(x, y, zone)) return { reason: "zone", what: zone.name };
    }
    if (material === "road" && (ay !== by || ay !== level.deckY || ax < level.left || bx > level.right)) return { reason: "road" };
    return null;
  }

  // Which road sections are missing between the two banks.
  function missingRoad(level, design) {
    const missing = [];
    for (let x = level.left; x < level.right; x++) {
      if (design.get(memberKey([x, level.deckY], [x + 1, level.deckY])) !== "road") missing.push(x);
    }
    return missing;
  }

  // ---------- building the structural model ----------

  // Beams whose far end isn't held by anything can't carry load. They are left out of
  // the analysis and reported as loose (repeatedly, so dangling chains go too).
  function buildModel(level, design) {
    const anchors = anchorSet(level);
    let members = [...design]
      .filter(([key, material]) => !memberProblem(level, key, material))
      .map(([key, material]) => ({ key, material, ends: memberEnds(key) }));
    const loose = [];
    for (;;) {
      const degree = new Map();
      for (const m of members) for (const [x, y] of m.ends) degree.set(pointKey(x, y), (degree.get(pointKey(x, y)) ?? 0) + 1);
      const dangling = members.filter((m) => m.ends.some(([x, y]) => !anchors.has(pointKey(x, y)) && degree.get(pointKey(x, y)) === 1));
      if (!dangling.length) break;
      for (const m of dangling) loose.push(m.key);
      members = members.filter((m) => !dangling.includes(m));
    }

    const joints = new Map(); // point key -> index of a free joint
    const jointList = [];
    for (const m of members) {
      for (const [x, y] of m.ends) {
        const k = pointKey(x, y);
        if (!anchors.has(k) && !joints.has(k)) {
          joints.set(k, jointList.length);
          jointList.push([x, y]);
        }
      }
    }
    members.forEach((m, index) => {
      const [[ax, ay], [bx, by]] = m.ends;
      const length = Math.hypot(bx - ax, by - ay);
      const props = MATERIALS[m.material];
      Object.assign(m, {
        index,
        a: joints.get(pointKey(ax, ay)) ?? -1,
        b: joints.get(pointKey(bx, by)) ?? -1,
        c: (bx - ax) / length,
        s: (by - ay) / length,
        length,
        k: props.stiffness / (length * CELL),
        tensionOnly: !!props.tensionOnly,
        tensionStrength: props.tension,
        compressionStrength: compressionStrength(m.material, length),
        buckles: props.buckling / (length * length) < props.compression,
      });
    });
    return { members, joints, jointList, loose, dofs: 2 * jointList.length, factors: new Map() };
  }

  // Stiffness matrix with the slack cables left out, LU-factorised (cached per slack set).
  function factorise(model, slack) {
    const id = [...slack].sort((a, b) => a - b).join(",");
    if (model.factors.has(id)) return model.factors.get(id);
    const n = model.dofs;
    const K = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) K[i][i] = SOFT;
    for (const m of model.members) {
      if (slack.has(m.index)) continue;
      const dof = [m.a >= 0 ? 2 * m.a : -1, m.a >= 0 ? 2 * m.a + 1 : -1, m.b >= 0 ? 2 * m.b : -1, m.b >= 0 ? 2 * m.b + 1 : -1];
      const d = [-m.c, -m.s, m.c, m.s];
      for (let i = 0; i < 4; i++) {
        if (dof[i] < 0) continue;
        for (let j = 0; j < 4; j++) if (dof[j] >= 0) K[dof[i]][dof[j]] += m.k * d[i] * d[j];
      }
    }
    const perm = Array.from({ length: n }, (_, i) => i);
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let row = col + 1; row < n; row++) if (Math.abs(K[row][col]) > Math.abs(K[pivot][col])) pivot = row;
      [K[col], K[pivot]] = [K[pivot], K[col]];
      [perm[col], perm[pivot]] = [perm[pivot], perm[col]];
      for (let row = col + 1; row < n; row++) {
        const f = (K[row][col] /= K[col][col]);
        if (f === 0) continue;
        for (let k = col + 1; k < n; k++) K[row][k] -= f * K[col][k];
      }
    }
    const result = { LU: K, perm };
    model.factors.set(id, result);
    return result;
  }

  function luSolve({ LU, perm }, b) {
    const n = b.length;
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = b[perm[i]];
      for (let k = 0; k < i; k++) s -= LU[i][k] * x[k];
      x[i] = s;
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = x[i];
      for (let k = i + 1; k < n; k++) s -= LU[i][k] * x[k];
      x[i] = s / LU[i][i];
    }
    return x;
  }

  // ---------- loads ----------

  const truckAxles = (level, front) => [front, front - level.truck.wheelbase];

  // Gravity loads (kN, +y is down): beam weights plus the truck's axles on the road.
  function loadVector(level, model, front) {
    const F = new Float64Array(model.dofs);
    const add = (x, y, kN) => {
      const j = model.joints.get(pointKey(x, y));
      if (j !== undefined) F[2 * j + 1] += kN;
    };
    for (const m of model.members) {
      const w = MATERIALS[m.material].weight * m.length;
      add(...m.ends[0], w / 2);
      add(...m.ends[1], w / 2);
    }
    if (front !== null) {
      const axle = level.truck.weight / 2;
      for (const x of truckAxles(level, front)) {
        if (x <= level.left || x >= level.right) continue; // on solid ground
        const x0 = Math.floor(x);
        const t = x - x0;
        add(x0, level.deckY, axle * (1 - t));
        if (t > EPS) add(x0 + 1, level.deckY, axle * t);
      }
    }
    return F;
  }

  // Solves one load case. Cables that would be squashed go slack and the truss is solved again.
  function solveCase(level, model, front) {
    const F = loadVector(level, model, front);
    let slack = new Set();
    let u;
    let forces;
    for (let round = 0; round < 12; round++) {
      u = luSolve(factorise(model, slack), F);
      forces = new Float64Array(model.members.length);
      const nextSlack = new Set();
      for (const m of model.members) {
        const ua = m.a >= 0 ? [u[2 * m.a], u[2 * m.a + 1]] : [0, 0];
        const ub = m.b >= 0 ? [u[2 * m.b], u[2 * m.b + 1]] : [0, 0];
        const stretch = (ub[0] - ua[0]) * m.c + (ub[1] - ua[1]) * m.s;
        if (m.tensionOnly && stretch < 0) nextSlack.add(m.index);
        else forces[m.index] = m.k * stretch;
      }
      const same = nextSlack.size === slack.size && [...nextSlack].every((i) => slack.has(i));
      slack = nextSlack;
      if (same) break;
    }
    let maxMove = 0;
    const wobblyJoints = [];
    model.jointList.forEach((point, j) => {
      const move = Math.hypot(u[2 * j], u[2 * j + 1]);
      maxMove = Math.max(maxMove, move);
      if (move > WOBBLE) wobblyJoints.push(point);
    });
    const usage = model.members.map((m) => {
      const N = forces[m.index];
      if (N >= 0) return N / m.tensionStrength;
      return m.compressionStrength > 0 ? -N / m.compressionStrength : Infinity;
    });
    return { front, u, forces, slack, usage, maxMove, wobbly: wobblyJoints.length > 0, wobblyJoints };
  }

  // Positions of the front axle from the moment it reaches the bridge until the
  // back axle has left it.
  function truckFronts(level) {
    const fronts = [];
    for (let x = level.left; x <= level.right + level.truck.wheelbase + EPS; x += STEP) fronts.push(Math.round(x / STEP) * STEP);
    return fronts;
  }

  // ---------- the whole crossing ----------

  // `quick` stops at the first failure (used by the level checker).
  function analyse(level, design, { quick = false } = {}) {
    const model = buildModel(level, design);
    const missing = missingRoad(level, design);
    const deadLoad = solveCase(level, model, null);
    const cases = [deadLoad];
    if (!missing.length && !deadLoad.wobbly) {
      for (const front of truckFronts(level)) {
        const c = solveCase(level, model, front);
        cases.push(c);
        if (quick && (c.wobbly || c.usage.some((u) => u > 1 + EPS))) break;
      }
    }

    // Worst use of each beam over the whole crossing (1 = at its limit).
    const worst = model.members.map((m) => {
      let best = { usage: 0, force: 0, front: null };
      for (const c of cases) if (c.usage[m.index] > best.usage) best = { usage: c.usage[m.index], force: c.forces[m.index], front: c.front };
      return best;
    });

    let failure = null;
    if (deadLoad.wobbly) failure = { kind: "wobbly", case: deadLoad, joints: deadLoad.wobblyJoints };
    else if (missing.length) failure = { kind: "road", missing };
    else {
      for (const c of cases) {
        if (c.wobbly) {
          failure = { kind: "wobbly", case: c, joints: c.wobblyJoints };
          break;
        }
        const broken = model.members.filter((m) => c.usage[m.index] > 1 + EPS);
        if (broken.length) {
          broken.sort((p, q) => c.usage[q.index] - c.usage[p.index]);
          failure = { kind: "break", case: c, members: broken };
          break;
        }
      }
    }
    const maxUsage = Math.max(0, ...worst.map((w) => w.usage));
    return { model, missing, cases, worst, failure, maxUsage };
  }

  function evaluate(level, design) {
    const result = analyse(level, design);
    const cost = designCost(design);
    const { failure } = result;
    const checks = [
      { text: "Road reaches the other side", ok: result.missing.length === 0 },
      { text: "Bridge stands up without wobbling", ok: !(failure && failure.kind === "wobbly") },
      { text: `${level.truck.name} crosses safely`, ok: !failure },
    ];
    const passed = !failure;
    let stars = 0;
    if (passed) stars = cost <= level.par ? 3 : cost <= level.budget ? 2 : 1;
    return { ...result, checks, passed, cost, stars };
  }

  // ---------- words ----------

  const fmtKN = (kN) => `${Math.round(Math.abs(kN))} kN`;

  function failureText(level, failure) {
    if (!failure) return "";
    if (failure.kind === "road") return "The road isn't finished yet. The truck needs road all the way across the gap.";
    if (failure.kind === "wobbly") {
      return failure.case.front === null
        ? "Wobbly! Part of the bridge can fold up like a hinge, so it falls under its own weight. Add diagonal beams to make triangles."
        : `Wobbly! When the ${level.truck.name.toLowerCase()} drives on, part of the bridge folds up like a hinge. Add diagonal beams to make triangles.`;
    }
    const m = failure.members[0];
    const N = failure.case.forces[m.index];
    const material = MATERIALS[m.material].name.toLowerCase();
    if (N > 0) {
      return `Snap! A ${material} beam was pulled apart: ${fmtKN(N)} of tension, but it can only take ${fmtKN(m.tensionStrength)}.`;
    }
    if (m.buckles) {
      return `Buckled! A ${m.length > 1.01 ? "long " : ""}${material} beam was squashed with ${fmtKN(N)} and bent sideways. It buckles at ${fmtKN(
        m.compressionStrength
      )}. Longer beams buckle at lower forces.`;
    }
    return `Crunch! A ${material} beam was crushed: ${fmtKN(N)} of compression, but it can only take ${fmtKN(m.compressionStrength)}.`;
  }

  function placementText(problem) {
    switch (problem?.reason) {
      case "far":
        return "Beams join neighbouring points: across, up or diagonally.";
      case "reach":
        return "That cable is too long.";
      case "ground":
        return "You can only fix beams to the ground at the anchor bolts.";
      case "zone":
        return `You can't build there: ${problem.what.toLowerCase()}.`;
      case "road":
        return "Road only goes along the dashed road line, between the two banks.";
      case "edge":
        return "That's off the edge of the building area.";
      default:
        return "You can't build there.";
    }
  }

  return {
    CELL,
    MATERIALS,
    pointKey,
    memberKey,
    memberEnds,
    memberLength,
    memberCost,
    designCost,
    compressionStrength,
    pointProblem,
    memberProblem,
    missingRoad,
    buildModel,
    solveCase,
    truckFronts,
    analyse,
    evaluate,
    failureText,
    placementText,
    fmtKN,
  };
})();

if (typeof module !== "undefined") module.exports = Bridge;
