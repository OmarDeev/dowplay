"use strict";
// Gear Garage: gear engine.
// Gears sit on the holes of a pegboard (whole-number grid points). An N-tooth gear
// has a pitch radius of N/8 grid units, so two gears mesh exactly when their axles
// are (N1 + N2)/8 units apart. Gears on the same axle turn together (compound gears),
// and gears only mesh with gears on the same layer. No page code here, so it can be
// tested on its own.

const Gears = (() => {
  const TEETH_PER_UNIT = 8; // an N-tooth gear has pitch radius N/8
  const TIP = 0.25; // tooth tips reach this far past the pitch circle
  const CLEAR = 0.5; // gears that don't mesh need this gap between their pitch circles
  const SHAFT = 0.2; // radius of an axle
  const SPEED_TOLERANCE = 0.01; // "60 rpm" accepts 1% either way
  const EPS = 1e-9;

  const radius = (teeth) => teeth / TEETH_PER_UNIT;
  const gearKey = (x, y, layer) => `${x},${y},${layer}`;

  function parseGearKey(key) {
    const [x, y, layer] = key.split(",").map(Number);
    return { x, y, layer };
  }

  // Board: Map "x,y,layer" -> { teeth }. Layer 0 is the lower layer, 1 the upper.
  function gearList(board) {
    return [...board].map(([key, gear]) => ({ key, ...parseGearKey(key), teeth: gear.teeth, r: radius(gear.teeth) }));
  }

  const toolFor = (level, gear) => level.tools.find((tool) => tool.teeth === gear.teeth);

  function boardCost(level, board) {
    let cost = 0;
    for (const gear of board.values()) cost += toolFor(level, gear)?.cost ?? 0;
    return cost;
  }

  // Every axle on the board: the motor, the outputs and each hole holding a gear.
  function shafts(level, gears) {
    const list = [{ x: level.motor.x, y: level.motor.y, what: "motor" }];
    for (const output of level.outputs ?? []) list.push({ x: output.x, y: output.y, what: output.name });
    for (const g of gears) {
      if (!list.some((s) => s.x === g.x && s.y === g.y)) list.push({ x: g.x, y: g.y, what: `${g.teeth}-tooth gear` });
    }
    return list;
  }

  function circleHitsRect(cx, cy, r, rect) {
    const nx = Math.max(rect.x0, Math.min(cx, rect.x1));
    const ny = Math.max(rect.y0, Math.min(cy, rect.y1));
    return Math.hypot(cx - nx, cy - ny) < r;
  }

  // A rack's teeth face left; gears mesh with it when their pitch circle touches its pitch line.
  const rackBody = (rack) => ({ x0: rack.x - TIP, y0: rack.y0, x1: rack.x + 0.6, y1: rack.y1 });
  const meshesRack = (rack, g) => rack && Math.abs(g.x + g.r - rack.x) < EPS && g.y >= rack.y0 && g.y <= rack.y1;

  // Why a gear can't go at (x, y) on `layer`, or null if it fits.
  // `ignore` leaves one gear out of the checks (used when moving a gear).
  function placementProblem(level, board, x, y, layer, teeth, ignore = null) {
    const r = radius(teeth);
    const reach = r + TIP;
    if (x - reach < -0.5 || y - reach < -0.5 || x + reach > level.cols - 0.5 || y + reach > level.rows - 0.5) {
      return { reason: "edge" };
    }
    for (const obstacle of level.obstacles ?? []) {
      if (circleHitsRect(x, y, reach, obstacle)) return { reason: "obstacle", what: obstacle.name };
    }
    const gears = gearList(board).filter((g) => g.key !== ignore);
    if (gears.some((g) => g.x === x && g.y === y && g.layer === layer)) return { reason: "taken" };
    if (level.rack && !meshesRack(level.rack, { x, y, r }) && circleHitsRect(x, y, reach, rackBody(level.rack))) {
      return { reason: "obstacle", what: level.rack.name };
    }
    for (const g of gears) {
      if (g.layer !== layer || (g.x === x && g.y === y)) continue;
      const d2 = (g.x - x) ** 2 + (g.y - y) ** 2;
      const sum = r + g.r;
      if (Math.abs(d2 - sum * sum) < EPS) continue; // teeth mesh
      if (Math.sqrt(d2) < sum + CLEAR) return { reason: "gear", teeth: g.teeth };
    }
    // A gear can't sit over another axle, whichever layer it's on.
    for (const shaft of shafts(level, gears)) {
      if (shaft.x === x && shaft.y === y) continue;
      if (Math.hypot(shaft.x - x, shaft.y - y) < reach + SHAFT) return { reason: "shaft", what: shaft.what };
    }
    return null;
  }

  // Which layer a new gear goes on: the free layer where it fits, preferring one where it meshes.
  function chooseLayer(level, board, x, y, teeth) {
    const layers = level.compound ? [0, 1] : [0];
    const options = layers
      .filter((layer) => !placementProblem(level, board, x, y, layer, teeth))
      .map((layer) => ({ layer, meshes: meshCount(board, x, y, layer, teeth) }));
    if (!options.length) return null;
    options.sort((a, b) => b.meshes - a.meshes || a.layer - b.layer);
    return options[0].layer;
  }

  function meshCount(board, x, y, layer, teeth) {
    const r = radius(teeth);
    return gearList(board).filter((g) => {
      if (g.layer !== layer || (g.x === x && g.y === y)) return false;
      return Math.abs((g.x - x) ** 2 + (g.y - y) ** 2 - (r + g.r) ** 2) < EPS;
    }).length;
  }

  // ---------- turning ----------

  // Works out how every gear turns. Speeds are in rpm, positive = clockwise on screen.
  // `phase` is each gear's angle (radians, clockwise) at time 0, chosen so meshing teeth
  // interlock; a gear's angle at time t is phase + speed * t.
  function simulate(level, board) {
    const gears = gearList(board);
    const n = gears.length;
    const links = gears.map(() => []);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = gears[i];
        const b = gears[j];
        if (a.x === b.x && a.y === b.y) {
          links[i].push({ to: j, kind: "axle" });
          links[j].push({ to: i, kind: "axle" });
        } else if (a.layer === b.layer && Math.abs((a.x - b.x) ** 2 + (a.y - b.y) ** 2 - (a.r + b.r) ** 2) < EPS) {
          const alpha = Math.atan2(b.y - a.y, b.x - a.x);
          links[i].push({ to: j, kind: "mesh", alpha });
          links[j].push({ to: i, kind: "mesh", alpha: alpha + Math.PI });
        }
      }
    }

    const motorRpm = level.motor.rpm * level.motor.dir;
    const rpm = new Array(n).fill(null);
    const phase = new Array(n).fill(0);
    const meshes = new Array(n).fill(0);
    const driven = new Array(n).fill(false);
    let jammed = false;

    // Spreads a speed out from the starting gears along meshes and shared axles.
    function spread(starts, speed, isDriven) {
      const queue = [];
      for (const s of starts) {
        if (rpm[s] !== null) continue;
        rpm[s] = speed;
        driven[s] = isDriven;
        queue.push(s);
      }
      while (queue.length) {
        const i = queue.shift();
        for (const link of links[i]) {
          const j = link.to;
          const want = link.kind === "axle" ? rpm[i] : (-rpm[i] * gears[i].teeth) / gears[j].teeth;
          if (rpm[j] === null) {
            rpm[j] = want;
            driven[j] = isDriven;
            meshes[j] = meshes[i] + (link.kind === "mesh" ? 1 : 0);
            phase[j] =
              link.kind === "axle"
                ? phase[i]
                : link.alpha + Math.PI + ((link.alpha - phase[i]) * gears[i].teeth) / gears[j].teeth - Math.PI / gears[j].teeth;
            queue.push(j);
          } else if (Math.abs(rpm[j] - want) > 1e-9 * Math.max(1, Math.abs(want))) {
            jammed = jammed || isDriven; // a locked loop, e.g. three gears in a triangle
          }
        }
      }
    }

    const onMotor = gears.map((_, i) => i).filter((i) => gears[i].x === level.motor.x && gears[i].y === level.motor.y);
    spread(onMotor, motorRpm, true);
    for (let i = 0; i < n; i++) if (rpm[i] === null) spread([i], 0, false);

    // Speed each output would have if nothing stopped the motor.
    const outputs = {};
    for (const output of level.outputs ?? []) {
      const i = gears.findIndex((g, k) => driven[k] && g.x === output.x && g.y === output.y);
      outputs[output.id] = { output, connected: i >= 0, freeRpm: i >= 0 ? rpm[i] : 0, meshes: i >= 0 ? meshes[i] : 0 };
    }

    // The rack moves at the pitch-line speed of the gear that drives it (down is +).
    let rack = null;
    if (level.rack) {
      const pinions = gears.map((g, i) => i).filter((i) => meshesRack(level.rack, gears[i]));
      const drivers = pinions.filter((i) => driven[i]);
      const speeds = drivers.map((i) => (gears[i].r * rpm[i] * 2 * Math.PI) / 60);
      if (speeds.some((v) => Math.abs(v - speeds[0]) > 1e-9)) jammed = true;
      const p = drivers[0] ?? pinions[0];
      rack = {
        connected: drivers.length > 0,
        freeSpeed: speeds[0] ?? 0,
        pinion: p === undefined ? null : { r: gears[p].r, phase: phase[p], index: p },
      };
    }

    // The motor stalls if the loads need more torque than it can give.
    // Each mesh passes on only `efficiency` of the power.
    const efficiency = level.efficiency ?? 1;
    let needTorque = 0;
    for (const { output, freeRpm, meshes: k } of Object.values(outputs)) {
      if (output.load && freeRpm) needTorque += (output.load * Math.abs(freeRpm / motorRpm)) / efficiency ** k;
    }
    const stalled = !jammed && needTorque > level.motor.torque + 1e-9;
    const running = !jammed && !stalled;

    for (const result of Object.values(outputs)) {
      result.rpm = running ? result.freeRpm : 0;
      result.torque = result.freeRpm ? (level.motor.torque * Math.abs(motorRpm / result.freeRpm) * efficiency ** result.meshes) : 0;
    }
    if (rack) rack.speed = running ? rack.freeSpeed : 0;

    return {
      gears: gears.map((g, i) => ({ ...g, rpm: running && driven[i] ? rpm[i] : 0, phase: phase[i], driven: driven[i], meshes: meshes[i] })),
      outputs,
      rack,
      jammed,
      stalled,
      needTorque,
      motorRpm,
    };
  }

  // ---------- goals ----------

  const DIRECTION = { 1: "clockwise", "-1": "anticlockwise" };

  function goalChecks(level, sim) {
    const checks = [];
    for (const output of level.outputs ?? []) {
      const { rpm } = sim.outputs[output.id];
      const want = output.want ?? {};
      checks.push({ text: `${output.name} turns`, ok: rpm !== 0 });
      if (want.dir) checks.push({ text: `${output.name} turns ${DIRECTION[want.dir]}`, ok: Math.sign(rpm) === want.dir });
      if (want.rpm) checks.push({ text: `${output.name} at ${want.rpm} rpm`, ok: Math.abs(Math.abs(rpm) - want.rpm) <= want.rpm * SPEED_TOLERANCE });
      if (want.minRpm) checks.push({ text: `${output.name} at ${want.minRpm} rpm or faster`, ok: Math.abs(rpm) >= want.minRpm - 1e-9 });
      if (output.load) checks.push({ text: `Motor strong enough for the ${output.name.toLowerCase()} (${output.load} N·m)`, ok: rpm !== 0 && !sim.stalled });
    }
    if (level.rack) {
      const { want, name } = level.rack;
      const speed = sim.rack.speed; // cm/s, positive = down
      checks.push({ text: `${name} goes up`, ok: speed < 0 });
      checks.push({ text: `${name} at ${want.minSpeed}–${want.maxSpeed} cm/s`, ok: -speed >= want.minSpeed && -speed <= want.maxSpeed });
    }
    return checks;
  }

  function evaluate(level, board) {
    const sim = simulate(level, board);
    const checks = goalChecks(level, sim);
    const passed = checks.every((c) => c.ok) && !sim.jammed && !sim.stalled;
    const cost = boardCost(level, board);
    let stars = 0;
    if (passed) stars = cost <= level.par ? 3 : cost <= level.budget ? 2 : 1;
    return { sim, checks, passed, cost, stars };
  }

  // ---------- words ----------

  const fmt = (x) => (Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2));
  const fmtRpm = (rpm) => `${Number.isInteger(Math.round(Math.abs(rpm) * 100) / 100) ? Math.abs(rpm).toFixed(0) : fmt(Math.abs(rpm))} rpm`;
  const directionWord = (rpm) => (rpm > 0 ? "clockwise" : "anticlockwise");

  function placementText(problem) {
    switch (problem.reason) {
      case "edge":
        return "That gear won't fit there: it would hang off the board.";
      case "obstacle":
        return `That gear won't fit there: it would hit the ${problem.what.toLowerCase()}.`;
      case "taken":
        return "There's already a gear on that axle.";
      case "gear":
        return `That gear won't fit there: it would crash into the ${problem.teeth}-tooth gear. Gears must either mesh exactly or have a gap.`;
      case "shaft":
        return `That gear won't fit there: it would hit the ${problem.what.toLowerCase()}'s axle.`;
      default:
        return "That gear won't fit there.";
    }
  }

  // Explains what's wrong, most important first.
  function problems(level, sim) {
    const list = [];
    if (sim.jammed) {
      list.push("Jammed! Some gears are locked against each other and can't turn. Three gears meshing in a triangle always jam.");
    }
    for (const { output, connected, freeRpm } of Object.values(sim.outputs)) {
      const want = output.want ?? {};
      const name = output.name.toLowerCase();
      if (!connected) {
        list.push(`The ${name} isn't connected to the motor yet. Gears only turn each other when their teeth mesh.`);
        continue;
      }
      if (sim.stalled && output.load) {
        list.push(
          `Too heavy! The ${name} needs the motor to give ${fmt(sim.needTorque)} N·m, but it only gives ${level.motor.torque} N·m. Turn the ${name} more slowly to get more torque.`
        );
        continue;
      }
      if (want.dir && Math.sign(freeRpm) !== want.dir) {
        list.push(`The ${name} turns ${directionWord(freeRpm)}. It needs to turn ${DIRECTION[want.dir]}.`);
      }
      if (want.rpm && Math.abs(Math.abs(freeRpm) - want.rpm) > want.rpm * SPEED_TOLERANCE) {
        list.push(`The ${name} turns at ${fmtRpm(freeRpm)}. It needs ${want.rpm} rpm.`);
      }
      if (want.minRpm && Math.abs(freeRpm) < want.minRpm - 1e-9) {
        list.push(`The ${name} only turns at ${fmtRpm(freeRpm)}. It needs at least ${want.minRpm} rpm.`);
      }
    }
    if (level.rack) {
      const { name, want } = level.rack;
      const lower = name.toLowerCase();
      const speed = sim.rack.freeSpeed;
      if (!sim.rack.connected) list.push(`The ${lower} isn't connected yet. A gear has to mesh with the rack's teeth.`);
      else if (speed > 0) list.push(`The ${lower} goes down. Make it go up.`);
      else if (-speed < want.minSpeed || -speed > want.maxSpeed) {
        list.push(`The ${lower} rises at ${fmt(-speed)} cm/s. It needs ${want.minSpeed}–${want.maxSpeed} cm/s.`);
      }
    }
    return list;
  }

  return {
    TIP,
    radius,
    gearKey,
    parseGearKey,
    gearList,
    toolFor,
    boardCost,
    placementProblem,
    chooseLayer,
    meshesRack,
    simulate,
    goalChecks,
    evaluate,
    placementText,
    problems,
    fmt,
    fmtRpm,
    directionWord,
  };
})();

if (typeof module !== "undefined") module.exports = Gears;
