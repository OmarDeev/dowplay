"use strict";
// Gear Garage: the page. Draws the pegboard, lets players place, move and remove
// gears with mouse, touch or keyboard, and animates what the gears do.

(() => {
  const U = 40; // SVG units between neighbouring holes
  const M = 30; // margin around the holes
  const STORE_KEY = "gearGarage.v1";
  const ERASER = { type: "eraser" };
  const GEAR_COLOURS = { 8: "#4fd1c5", 16: "#f6ad55", 24: "#fc8181", 32: "#b794f4", 40: "#9ae6b4" };
  const HUB = 0.42 * U;
  const RACK_PITCH = ((2 * Math.PI) / 8) * U; // tooth spacing that matches every gear
  const CW = "↻";
  const ACW = "↺";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const $ = (id) => document.getElementById(id);
  const ui = {
    board: $("board"),
    pegboard: $("pegboard"),
    scenery: $("scenery"),
    objects: $("objects"),
    gears: [$("gears0"), $("gears1")],
    labels: $("labels"),
    overlay: $("overlay"),
    rackClipRect: $("rackClipRect"),
    levelName: $("levelName"),
    levelMeta: $("levelMeta"),
    levelTitle: $("levelTitle"),
    story: $("story"),
    goal: $("goal"),
    hints: $("hints"),
    hintButton: $("hintButton"),
    tools: $("tools"),
    undo: $("undoButton"),
    clear: $("clearButton"),
    numbers: $("numbersToggle"),
    status: $("status"),
    announcer: $("announcer"),
    goals: $("goals"),
    goalsCard: $("goalsCard"),
    cost: $("cost"),
    meterFill: $("meterFill"),
    meterPar: $("meterPar"),
    budgetNote: $("budgetNote"),
    check: $("checkButton"),
    levelsButton: $("levelsButton"),
    levelsDialog: $("levelsDialog"),
    levelList: $("levelList"),
    winDialog: $("winDialog"),
    winStars: $("winStars"),
    winCost: $("winCost"),
    winLearn: $("winLearn"),
    winStay: $("winStay"),
    winNext: $("winNext"),
  };

  const X = (gx) => M + gx * U;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const money = (n) => `£${n}`;
  const arrow = (rpm) => (rpm > 0 ? CW : ACW);
  const STAR_PATH = "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z";
  const starsHtml = (n) =>
    [0, 1, 2].map((i) => `<svg class="star${i < n ? "" : " empty"}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`).join("");

  // ---------- saved progress (stays in this browser only) ----------

  function loadProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved && typeof saved === "object") {
        return { stars: saved.stars ?? {}, boards: saved.boards ?? {}, last: Number(saved.last) || 0 };
      }
    } catch {
      // storage blocked or unreadable: start fresh
    }
    return { stars: {}, boards: {}, last: 0 };
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(progress));
    } catch {
      // storage blocked or full: the game still works, it just won't remember
    }
  }

  const progress = loadProgress();

  // ---------- game state ----------

  const state = {
    index: 0,
    level: null,
    board: new Map(), // "x,y,layer" -> { teeth }
    tool: null,
    undo: [],
    hintsShown: 0,
    numbers: false,
    cursor: [0, 0],
    keyboardCursor: false,
    labelScale: 1,
    hover: null, // { x, y } hole under the mouse
    drag: null, // gear being moved
    evaluation: null,
    clock: 0, // seconds of turning shown so far
    spinning: [], // { el, phase, rpm } for the animation
    rack: null,
  };

  const tools = () => [...state.level.tools, ERASER];

  function startLevel(index) {
    const level = LEVELS[index];
    Object.assign(state, {
      index,
      level,
      tool: level.tools[0],
      undo: [],
      hintsShown: 0,
      numbers: !!level.numbers,
      cursor: [level.motor.x, level.motor.y],
      hover: null,
      drag: null,
    });
    state.board = restoreBoard(level);
    progress.last = index;
    renderStatic();
    renderMission();
    renderTools();
    refresh();
  }

  // Keeps saved gears that still fit (in case a level was edited since).
  function restoreBoard(level) {
    const board = new Map();
    for (const [key, gear] of progress.boards[level.id] ?? []) {
      const { x, y, layer } = Gears.parseGearKey(key);
      if (!gear || !Gears.toolFor(level, gear) || (layer === 1 && !level.compound)) continue;
      if (!Gears.placementProblem(level, board, x, y, layer, gear.teeth)) board.set(key, { teeth: gear.teeth });
    }
    return board;
  }

  function refresh() {
    state.evaluation = Gears.evaluate(state.level, state.board);
    renderGears();
    renderLabels();
    renderOverlay();
    renderGoals();
    renderBudget();
    renderStatus();
    ui.undo.disabled = state.undo.length === 0;
    ui.clear.disabled = state.board.size === 0;
    progress.boards[state.level.id] = [...state.board];
    saveProgress();
  }

  // ---------- editing ----------

  const snapshot = () => [...state.board];

  function commit(before) {
    state.undo.push(before);
    if (state.undo.length > 200) state.undo.shift();
    refresh();
  }

  function undo() {
    const snap = state.undo.pop();
    if (!snap) return;
    state.board = new Map(snap);
    refresh();
    announce("Undone.");
  }

  function clearBoard() {
    if (!state.board.size) return;
    const before = snapshot();
    state.board.clear();
    commit(before);
    announce("All gears removed. Press Undo to bring them back.");
  }

  const gearsAt = (x, y) => Gears.gearList(state.board).filter((g) => g.x === x && g.y === y);

  // The topmost gear covering a point: upper layer first, then smaller gears.
  function gearAtPoint({ gx, gy }) {
    const hits = Gears.gearList(state.board).filter((g) => Math.hypot(g.x - gx, g.y - gy) <= g.r + Gears.TIP);
    hits.sort((a, b) => b.layer - a.layer || a.r - b.r);
    return hits[0] ?? null;
  }

  // What tapping a hole with the current gear would do.
  function planAt(x, y, board = state.board) {
    const teeth = state.tool.teeth;
    const same = Gears.gearList(board).find((g) => g.x === x && g.y === y && g.teeth === teeth);
    if (same) return { kind: "remove", gear: same };
    const layer = Gears.chooseLayer(state.level, board, x, y, teeth);
    if (layer !== null) return { kind: "place", ok: true, gear: { x, y, layer, teeth } };
    let problem = Gears.placementProblem(state.level, board, x, y, 0, teeth);
    if (problem?.reason === "taken" && state.level.compound) problem = Gears.placementProblem(state.level, board, x, y, 1, teeth);
    return { kind: "place", ok: false, gear: { x, y, layer: 0, teeth }, problem };
  }

  function removeGear(gear, spoken = true) {
    const before = snapshot();
    state.board.delete(gear.key);
    commit(before);
    if (spoken) announce(`Removed the ${gear.teeth}-tooth gear.`);
  }

  function tapHole(x, y) {
    if (state.tool.type === "eraser") {
      const top = gearsAt(x, y).sort((a, b) => b.layer - a.layer)[0];
      if (top) removeGear(top);
      return;
    }
    const plan = planAt(x, y);
    if (plan.kind === "remove") {
      removeGear(plan.gear);
    } else if (plan.ok) {
      const before = snapshot();
      state.board.set(Gears.gearKey(x, y, plan.gear.layer), { teeth: plan.gear.teeth });
      commit(before);
      const stacked = gearsAt(x, y).length > 1 ? " It's stacked on the same axle, so they turn together." : "";
      announce(`Placed a ${plan.gear.teeth}-tooth gear.${stacked}`);
    } else {
      say(Gears.placementText(plan.problem), "bad");
    }
  }

  function moveGear(gear, x, y) {
    const without = new Map(state.board);
    without.delete(gear.key);
    const layer = Gears.chooseLayer(state.level, without, x, y, gear.teeth);
    if (layer === null) {
      let problem = Gears.placementProblem(state.level, without, x, y, 0, gear.teeth);
      if (problem?.reason === "taken" && state.level.compound) problem = Gears.placementProblem(state.level, without, x, y, 1, gear.teeth);
      say(Gears.placementText(problem), "bad");
      return;
    }
    const before = snapshot();
    without.set(Gears.gearKey(x, y, layer), { teeth: gear.teeth });
    state.board = without;
    commit(before);
    announce(`Moved the ${gear.teeth}-tooth gear.`);
  }

  function selectTool(tool) {
    state.tool = tool;
    for (const button of ui.tools.querySelectorAll(".tool")) {
      button.setAttribute("aria-pressed", String(tools()[Number(button.dataset.index)] === tool));
    }
    renderOverlay();
  }

  // ---------- pointer input (mouse, pen and touch) ----------

  function gridPoint(event) {
    const ctm = ui.board.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return { gx: (p.x - M) / U, gy: (p.y - M) / U };
  }

  const holeAt = ({ gx, gy }) => [clamp(Math.round(gx), 0, state.level.cols - 1), clamp(Math.round(gy), 0, state.level.rows - 1)];

  let gesture = null;

  ui.board.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.button !== 2) return;
    const p = gridPoint(event);
    if (!p) return;
    event.preventDefault();
    ui.board.setPointerCapture(event.pointerId);
    gesture = { id: event.pointerId, start: p, gear: gearAtPoint(p), erase: event.button === 2, dragging: false };
  });

  ui.board.addEventListener("pointermove", (event) => {
    const p = gridPoint(event);
    if (!p) return;
    if (!gesture || gesture.id !== event.pointerId) {
      if (event.pointerType === "mouse") setHover(p);
      return;
    }
    if (!gesture.dragging) {
      if (!gesture.gear || gesture.erase || Math.hypot(p.gx - gesture.start.gx, p.gy - gesture.start.gy) < 0.35) return;
      gesture.dragging = true;
      state.drag = { gear: gesture.gear, to: null };
      ui.board.classList.add("dragging");
      renderGears();
    }
    const [x, y] = holeAt(p);
    if (!state.drag.to || state.drag.to[0] !== x || state.drag.to[1] !== y) {
      state.drag.to = [x, y];
      renderOverlay();
    }
  });

  function endGesture(event, cancelled) {
    if (!gesture || gesture.id !== event.pointerId) return;
    const g = gesture;
    gesture = null;
    if (g.dragging) {
      const { gear, to } = state.drag;
      state.drag = null;
      ui.board.classList.remove("dragging");
      if (!cancelled && to && (to[0] !== gear.x || to[1] !== gear.y)) moveGear(gear, to[0], to[1]);
      else renderGears();
      renderOverlay();
      return;
    }
    if (cancelled) return;
    const p = gridPoint(event);
    // A long swipe that didn't start on a gear isn't a tap.
    if (!p || Math.hypot(p.gx - g.start.gx, p.gy - g.start.gy) > 0.6) return;
    if (g.erase || state.tool.type === "eraser") {
      const gear = gearAtPoint(p);
      if (gear) removeGear(gear);
      return;
    }
    tapHole(...holeAt(p));
  }

  ui.board.addEventListener("pointerup", (event) => endGesture(event, false));
  ui.board.addEventListener("pointercancel", (event) => endGesture(event, true));
  ui.board.addEventListener("contextmenu", (event) => event.preventDefault());
  ui.board.addEventListener("pointerleave", () => {
    if (state.hover) {
      state.hover = null;
      renderOverlay();
    }
  });

  function setHover(p) {
    const hole = holeAt(p);
    const eraseTarget = state.tool.type === "eraser" ? gearAtPoint(p)?.key ?? null : null;
    const key = `${hole}|${eraseTarget}`;
    if (state.hover?.key === key) return;
    state.hover = { x: hole[0], y: hole[1], erase: eraseTarget, key };
    renderOverlay();
  }

  // ---------- keyboard input ----------

  const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

  ui.board.addEventListener("keydown", (event) => {
    const [x, y] = state.cursor;
    if (event.key in ARROWS) {
      event.preventDefault();
      const [dx, dy] = ARROWS[event.key];
      state.cursor = [clamp(x + dx, 0, state.level.cols - 1), clamp(y + dy, 0, state.level.rows - 1)];
      renderOverlay();
      announce(describeHole(...state.cursor));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      tapHole(x, y);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      const top = gearsAt(x, y).sort((a, b) => b.layer - a.layer)[0];
      if (top) removeGear(top);
    }
  });

  function describeHole(x, y) {
    const here = gearsAt(x, y).map((g) => `${g.teeth}-tooth gear`);
    const { motor, outputs } = state.level;
    if (motor.x === x && motor.y === y) here.unshift(`${motor.name ?? "Motor"} axle`);
    for (const o of outputs) if (o.x === x && o.y === y) here.unshift(`${o.name} axle`);
    return `Column ${x + 1}, row ${y + 1}${here.length ? `: ${here.join(", ")}` : ""}.`;
  }

  ui.board.addEventListener("focus", () => {
    state.keyboardCursor = ui.board.matches(":focus-visible");
    renderOverlay();
  });
  ui.board.addEventListener("blur", () => {
    state.keyboardCursor = false;
    renderOverlay();
  });

  document.addEventListener("keydown", (event) => {
    if (document.querySelector("dialog[open]") || event.target.closest("input, textarea, select")) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const list = tools();
    if (/^[1-9]$/.test(event.key) && Number(event.key) <= list.length) selectTool(list[Number(event.key) - 1]);
    else if (event.key.toLowerCase() === "e") selectTool(ERASER);
  });

  // Clearing first makes screen readers repeat a message even if it's the same as before.
  function announce(text) {
    ui.announcer.textContent = "";
    setTimeout(() => {
      ui.announcer.textContent = text;
    }, 50);
  }

  // The status line is a live region, so screen readers hear it without announce().
  function say(text, cls) {
    ui.status.textContent = text;
    ui.status.className = `status ${cls}`;
  }

  // ---------- drawing ----------

  const pathCache = new Map();

  // Gear outline with trapezoid teeth; tooth 0 points right (angle 0).
  function gearPath(teeth) {
    if (pathCache.has(teeth)) return pathCache.get(teeth);
    const r = Gears.radius(teeth) * U;
    const tip = r + Gears.TIP * U;
    const root = r - 0.3 * U;
    const p = (2 * Math.PI) / teeth;
    const pt = (radius, a) => `${(radius * Math.cos(a)).toFixed(2)} ${(radius * Math.sin(a)).toFixed(2)}`;
    let d = "";
    for (let k = 0; k < teeth; k++) {
      const c = k * p;
      d += `${k ? "L" : "M"}${pt(root, c - 0.3 * p)} L${pt(tip, c - 0.16 * p)} A${tip} ${tip} 0 0 1 ${pt(tip, c + 0.16 * p)} L${pt(root, c + 0.3 * p)} A${root} ${root} 0 0 1 ${pt(root, c + 0.7 * p)} `;
    }
    pathCache.set(teeth, `${d}Z`);
    return pathCache.get(teeth);
  }

  // Holes in the gear body so you can see it turn.
  function lighteningHoles(teeth) {
    const r = Gears.radius(teeth) * U;
    const count = teeth >= 24 ? teeth / 8 + 1 : teeth === 16 ? 3 : 1;
    const size = teeth >= 24 ? 0.17 * r : 0.13 * r;
    let html = "";
    for (let i = 0; i < count; i++) {
      const a = (i * 2 * Math.PI) / count + Math.PI / 4;
      html += `<circle class="lightening" cx="${(0.6 * r * Math.cos(a)).toFixed(1)}" cy="${(0.6 * r * Math.sin(a)).toFixed(1)}" r="${size.toFixed(1)}"/>`;
    }
    return html;
  }

  function gearSvg(gear, cls = "", rpmText = "") {
    const lift = gear.layer === 1 ? ' filter="url(#lift)"' : "";
    const label = rpmText ? `<text class="rpm" y="${HUB + 15}">${esc(rpmText)}</text>` : "";
    return `<g class="gear layer-${gear.layer} ${cls}" transform="translate(${X(gear.x)} ${X(gear.y)})"${lift}><g class="spin"><path class="body" d="${gearPath(
      gear.teeth
    )}" fill="${GEAR_COLOURS[gear.teeth] ?? "#cbd5e0"}"/>${lighteningHoles(gear.teeth)}</g><circle class="hub" r="${HUB}"/><text class="teeth">${gear.teeth}</text>${label}</g>`;
  }

  function renderStatic() {
    const { level } = state;
    const width = (level.cols - 1) * U + 2 * M;
    const height = (level.rows - 1) * U + 2 * M;
    ui.board.setAttribute("viewBox", `0 0 ${width} ${height}`);

    let pegs = `<rect width="${width}" height="${height}" fill="var(--board)"/>`;
    for (let y = 0; y < level.rows; y++) {
      for (let x = 0; x < level.cols; x++) pegs += `<circle class="peg" cx="${X(x)}" cy="${X(y)}" r="4.5"/>`;
    }
    ui.pegboard.innerHTML = pegs;

    let scenery = "";
    for (const ob of level.obstacles ?? []) {
      if (level.rack && ob.name === level.rack.name) continue; // drawn as the door below
      const x = X(ob.x0);
      const y = X(ob.y0);
      const w = (ob.x1 - ob.x0) * U;
      const h = (ob.y1 - ob.y0) * U;
      scenery += `<g class="obstacle"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/><text class="scenery-label" x="${x + w / 2}" y="${y + h / 2 + 5}">${esc(ob.name)}</text></g>`;
    }
    if (level.rack) scenery += rackSvg(level);
    const { motor } = level;
    scenery += `<g transform="translate(${X(motor.x)} ${X(motor.y)})"><rect class="motor-body" x="-26" y="-26" width="52" height="52" rx="10"/>${[
      [-17, -17],
      [17, -17],
      [-17, 17],
      [17, 17],
    ]
      .map(([bx, by]) => `<circle class="motor-bolt" cx="${bx}" cy="${by}" r="3"/>`)
      .join("")}<circle class="shaft motor-shaft" r="7"/></g>`;
    for (const output of level.outputs) scenery += `<circle class="shaft" cx="${X(output.x)}" cy="${X(output.y)}" r="7"/>`;
    ui.scenery.innerHTML = scenery;

    ui.objects.innerHTML = level.outputs.map(objectSvg).join("");
    state.objectEls = level.outputs.map((output) => ui.objects.querySelector(`[data-output="${output.id}"] .spin`));
    updateLabelScale(false);
  }

  // What each output drives, drawn underneath the gears and turning with them.
  function objectSvg(output) {
    const at = `translate(${X(output.x)} ${X(output.y)})`;
    let spin = "";
    let still = "";
    switch (output.kind) {
      case "wheel":
        spin = `<circle class="object-fill" r="${1.9 * U}" style="fill:#262d38;stroke-width:10"/>${[0, 72, 144, 216, 288]
          .map((a) => `<line class="object-line" x2="${1.6 * U}" transform="rotate(${a})"/>`)
          .join("")}`;
        break;
      case "fan":
        spin = [0, 120, 240]
          .map((a) => `<path class="object-fill" transform="rotate(${a})" d="M0 0 C ${0.8 * U} ${-0.9 * U}, ${2 * U} ${-0.5 * U}, ${2 * U} 0 C ${1.6 * U} ${0.4 * U}, ${0.6 * U} ${0.5 * U}, 0 0 Z"/>`)
          .join("");
        break;
      case "drum":
        spin = `<circle class="object-fill" r="${1.6 * U}"/>${[0, 45, 90, 135].map((a) => `<line class="object-line" x1="${-1.6 * U}" x2="${1.6 * U}" transform="rotate(${a})"/>`).join("")}`;
        still = `<line class="object-line" x1="0" y1="${-1.6 * U}" x2="${3 * U}" y2="${-1.6 * U}"/><line class="object-line" x1="0" y1="${1.6 * U}" x2="${3 * U}" y2="${1.6 * U}"/>`;
        break;
      case "cam":
        spin = `<path class="object-fill" d="M ${-1.1 * U} 0 A ${1.1 * U} ${1.1 * U} 0 0 1 ${1.1 * U} 0 L 0 ${2 * U} Z"/>`;
        break;
      case "turntable":
        spin = `<circle class="object-fill" r="${2.4 * U}"/>${[0, 60, 120, 180, 240, 300]
          .map((a) => `<circle cx="${1.9 * U}" r="5" fill="#8b98ad" transform="rotate(${a})"/>`)
          .join("")}`;
        break;
      case "winch":
        spin = `<circle class="object-fill" r="${1.2 * U}"/><line class="object-line" x1="${-1.2 * U}" x2="${1.2 * U}"/><line class="object-line" y1="${-1.2 * U}" y2="${1.2 * U}"/>`;
        still = `<line class="rope" x1="${1.2 * U}" y1="0" x2="${1.2 * U}" y2="${3.1 * U}"/><rect class="load-box" x="${0.5 * U}" y="${3.1 * U}" width="${1.4 * U}" height="${1.1 * U}" rx="4"/><text class="scenery-label" x="${1.2 * U}" y="${3.75 * U}" style="font-size:12px">${output.load} N·m</text>`;
        break;
      default:
        spin = `<circle class="object-fill" r="${1.5 * U}"/>`;
    }
    return `<g class="object" data-output="${output.id}" transform="${at}">${still}<g class="spin">${spin}</g></g>`;
  }

  function rackSvg(level) {
    const { rack, rows, cols } = level;
    const rx = X(rack.x);
    const top = X(rack.y0);
    const bottom = X(rack.y1);
    ui.rackClipRect.setAttribute("x", rx - 0.3 * U);
    ui.rackClipRect.setAttribute("y", top);
    ui.rackClipRect.setAttribute("width", 0.9 * U);
    ui.rackClipRect.setAttribute("height", bottom - top);
    // Teeth sit at whole multiples of the pitch; the animation slides them by less than one pitch.
    const p = RACK_PITCH;
    let teeth = "";
    for (let k = Math.floor(top / p) - 2; k * p <= bottom + 2 * p; k++) {
      const y = k * p;
      teeth += `M${rx + 0.3 * U} ${(y - 0.3 * p).toFixed(1)} L${rx - 0.25 * U} ${(y - 0.16 * p).toFixed(1)} L${rx - 0.25 * U} ${(y + 0.16 * p).toFixed(1)} L${rx + 0.3 * U} ${(y + 0.3 * p).toFixed(1)} Z `;
    }
    const doorX = rx + 0.6 * U;
    const doorW = X(cols - 0.5) - doorX + M;
    let slats = "";
    for (let y = -2 * U; y <= (rows + 2) * U; y += 0.8 * U) slats += `<line class="door-slat" x1="${doorX}" x2="${doorX + doorW}" y1="${y}" y2="${y}"/>`;
    return `<g class="rack"><rect class="door" x="${doorX}" y="0" width="${doorW}" height="${(rows - 1) * U + 2 * M}"/><g id="doorSlats">${slats}</g><rect class="rack-body" x="${rx + 0.3 * U}" y="${top}" width="${0.3 * U}" height="${bottom - top}"/><g clip-path="url(#rackClip)"><path id="rackTeeth" class="rack-teeth" d="${teeth}"/></g></g>`;
  }

  function renderGears() {
    const { sim } = state.evaluation;
    const html = ["", ""];
    state.spinning = [];
    sim.gears.forEach((gear) => {
      const cls = [
        sim.jammed && gear.driven ? "jam" : "",
        sim.stalled && gear.driven ? "stall" : "",
        state.drag?.gear.key === gear.key ? "lifted" : "",
      ].join(" ");
      const rpmText = state.numbers ? (gear.rpm ? `${Gears.fmtRpm(gear.rpm)} ${arrow(gear.rpm)}` : "stopped") : "";
      html[gear.layer] += gearSvg(gear, cls, rpmText);
    });
    ui.gears[0].innerHTML = html[0];
    ui.gears[1].innerHTML = html[1];
    const spins = [...ui.gears[0].querySelectorAll(".spin"), ...ui.gears[1].querySelectorAll(".spin")];
    const ordered = [...sim.gears.filter((g) => g.layer === 0), ...sim.gears.filter((g) => g.layer === 1)];
    state.spinning = ordered.map((gear, i) => ({ el: spins[i], phase: gear.phase, rpm: gear.rpm }));
    state.rack = sim.rack;
    drawFrame();
  }

  // ---------- animation ----------

  let lastTime = null;

  function drawFrame() {
    const t = state.clock;
    const toDeg = 180 / Math.PI;
    for (const { el, phase, rpm } of state.spinning) {
      el.setAttribute("transform", `rotate(${((phase + (rpm * Math.PI * t) / 30) * toDeg).toFixed(2)})`);
    }
    const { sim } = state.evaluation;
    state.level.outputs.forEach((output, i) => {
      const rpm = sim.outputs[output.id].rpm;
      state.objectEls[i]?.setAttribute("transform", `rotate(${((rpm * Math.PI * t) / 30) * toDeg})`);
    });
    if (state.level.rack) {
      // The rack moves by r × angle. When a tooth of the gear points straight at the
      // rack (angle 0), a gap in the rack must be opposite it.
      const pinion = state.rack?.pinion;
      let teethShift = 0;
      let travel = 0;
      if (pinion) {
        const gear = sim.gears[pinion.index];
        const angle = pinion.phase + (gear.rpm * Math.PI * t) / 30;
        travel = pinion.r * angle * U;
        teethShift = X(gear.y) + travel + RACK_PITCH / 2;
      }
      const wrap = (v, period) => ((v % period) + period) % period;
      document.getElementById("rackTeeth")?.setAttribute("transform", `translate(0 ${wrap(teethShift, RACK_PITCH).toFixed(2)})`);
      document.getElementById("doorSlats")?.setAttribute("transform", `translate(0 ${wrap(travel, 0.8 * U).toFixed(2)})`);
    }
  }

  function tick(time) {
    if (lastTime !== null && !reducedMotion.matches) {
      state.clock += Math.min(0.1, (time - lastTime) / 1000);
      drawFrame();
    }
    lastTime = time;
    requestAnimationFrame(tick);
  }

  // ---------- labels and overlay ----------

  // Wide boards get shrunk to fit; grow the text so it stays readable.
  function updateLabelScale(rerender = true) {
    const width = ui.board.viewBox.baseVal?.width;
    if (!width || !ui.board.clientWidth) return;
    const scale = clamp(1.05 / (ui.board.clientWidth / width), 1, 1.45);
    if (Math.abs(scale - state.labelScale) < 0.02) return;
    state.labelScale = scale;
    ui.board.style.setProperty("--ls", scale.toFixed(3));
    if (rerender && state.evaluation) renderLabels();
  }

  new ResizeObserver(() => updateLabelScale()).observe(ui.board);

  // `y` is the first line's baseline for "below" and the last line's for "above".
  function labelSvg(x, y, side, lines, anchor = "middle") {
    const lineHeight = 16 * state.labelScale;
    const block = (lines.length - 1) * lineHeight;
    const ty = side === "above" ? y - block : y;
    const spans = lines.map(([cls, text], i) => `<tspan class="${cls}" x="${x}"${i ? ` dy="${lineHeight}"` : ""}>${esc(text)}</tspan>`).join("");
    return `<text class="label" x="${x}" y="${ty}" text-anchor="${anchor}">${spans}</text>`;
  }

  // Puts a label below (or above) a motor or output, flipping it if it would run off the board.
  function placeLabel(thing, defaultGap, lineCount) {
    const gap = (thing.labelGap ?? defaultGap) * U;
    const block = (lineCount - 1) * 16 * state.labelScale;
    const height = ui.board.viewBox.baseVal.height;
    let side = thing.label ?? "below";
    if (side === "below" && X(thing.y) + gap + block + 6 > height) side = "above";
    else if (side === "above" && X(thing.y) - gap - block - 14 < 0) side = "below";
    return side === "above" ? [X(thing.x), X(thing.y) - gap + 12, side] : [X(thing.x), X(thing.y) + gap, side];
  }

  function needText(output) {
    const want = output.want ?? {};
    const parts = [];
    if (want.rpm) parts.push(`${want.rpm} rpm`);
    if (want.minRpm) parts.push(`${want.minRpm}+ rpm`);
    if (want.dir) parts.push(`${arrow(want.dir)} ${want.dir > 0 ? "clockwise" : "anticlockwise"}`);
    if (output.load) parts.push(`${output.load} N·m`);
    return parts.length ? `needs ${parts.join(", ")}` : "needs to turn";
  }

  function renderLabels() {
    const { level } = state;
    const { sim } = state.evaluation;
    let html = "";
    const motor = level.motor;
    const motorLines = [
      ["name", motor.name ?? "Motor"],
      ["need", `${motor.rpm} rpm ${arrow(motor.dir)}`],
    ];
    if (sim.stalled) motorLines.push(["warn", "stalled!"]);
    else if (state.numbers || level.outputs.some((o) => o.load)) motorLines.push(["need", `max ${motor.torque} N·m`]);
    html += labelSvg(...placeLabel(motor, 1.35, motorLines.length), motorLines);

    for (const output of level.outputs) {
      const result = sim.outputs[output.id];
      const lines = [
        ["name", output.name],
        ["need", needText(output)],
      ];
      if (result.rpm) lines.push(["reading", `now ${Gears.fmtRpm(result.rpm)} ${arrow(result.rpm)}`]);
      else lines.push(["warn", sim.stalled && result.connected ? "stalled" : sim.jammed && result.connected ? "jammed" : "not turning"]);
      if (state.numbers && result.rpm) lines.push(["reading", `torque ${Gears.fmt(result.torque)} N·m`]);
      html += labelSvg(...placeLabel(output, output.kind === "winch" ? 1.6 : 2.6, lines.length), lines);
    }

    if (level.rack) {
      const { rack } = level;
      const speed = sim.rack.speed;
      const reading = speed ? `now ${speed < 0 ? "↑" : "↓"} ${Gears.fmt(Math.abs(speed))} cm/s` : "not moving";
      // Left of the rack's top end, clear of the door.
      html += labelSvg(
        X(rack.x) - 0.6 * U,
        X(rack.y0) + 0.25 * U,
        "below",
        [
          ["name", rack.name],
          ["need", `needs ↑ ${rack.want.minSpeed}–${rack.want.maxSpeed} cm/s`],
          [speed ? "reading" : "warn", reading],
        ],
        "end"
      );
    }
    ui.labels.innerHTML = html;
  }

  function renderOverlay() {
    let html = "";
    if (state.drag?.to) {
      const [x, y] = state.drag.to;
      const without = new Map(state.board);
      without.delete(state.drag.gear.key);
      const layer = Gears.chooseLayer(state.level, without, x, y, state.drag.gear.teeth);
      html += gearSvg({ x, y, layer: layer ?? 0, teeth: state.drag.gear.teeth }, `ghost${layer === null ? " bad" : ""}`);
    } else if (state.hover && !gesture) {
      html += previewSvg(state.hover);
    }
    if (state.keyboardCursor) {
      const [x, y] = state.cursor;
      if (!state.hover) html += previewSvg({ x, y, erase: gearsAt(x, y).sort((a, b) => b.layer - a.layer)[0]?.key });
      html += `<circle class="cursor-ring" cx="${X(x)}" cy="${X(y)}" r="15"/>`;
    }
    ui.overlay.innerHTML = html;
  }

  function previewSvg({ x, y, erase }) {
    if (state.tool.type === "eraser") {
      const gear = erase && Gears.gearList(state.board).find((g) => g.key === erase);
      return gear ? crossSvg(gear) : "";
    }
    const plan = planAt(x, y);
    if (plan.kind === "remove") return crossSvg(plan.gear);
    return gearSvg(plan.gear, `ghost${plan.ok ? "" : " bad"}`);
  }

  const crossSvg = (gear) =>
    `<g transform="translate(${X(gear.x)} ${X(gear.y)})"><path class="remove-mark" d="M-12 -12 L12 12 M-12 12 L12 -12"/></g>`;

  // ---------- panel ----------

  function toolLabel(tool) {
    return tool.type === "eraser" ? "Eraser" : `${tool.teeth} teeth`;
  }

  function toolIcon(tool) {
    if (tool.type === "eraser") {
      return `<svg width="30" height="24" viewBox="0 0 34 22" aria-hidden="true"><g transform="rotate(-25 17 11)"><rect x="5" y="5" width="24" height="12" rx="3" fill="#ff9aa2"/><rect x="5" y="5" width="9" height="12" rx="3" fill="#e9eef8"/></g></svg>`;
    }
    const size = 12 + (tool.teeth / 40) * 12;
    const scale = size / (Gears.radius(tool.teeth) * U + Gears.TIP * U);
    return `<svg width="30" height="30" viewBox="-15 -15 30 30" aria-hidden="true"><g transform="scale(${scale.toFixed(3)})"><path d="${gearPath(tool.teeth)}" fill="${
      GEAR_COLOURS[tool.teeth]
    }" stroke="rgba(0,0,0,0.4)" stroke-width="${(1.5 / scale).toFixed(1)}"/></g><circle r="${(size * 0.3).toFixed(1)}" fill="#151b26"/></svg>`;
  }

  function renderTools() {
    ui.tools.innerHTML = tools()
      .map((tool, i) => {
        const cost = tool.cost !== undefined ? `<span class="tool-cost">${money(tool.cost)}</span>` : "";
        const spoken = tool.type === "eraser" ? "Eraser" : `${tool.teeth}-tooth gear, costs £${tool.cost}`;
        return `<button type="button" class="tool" data-index="${i}" aria-pressed="${tool === state.tool}" aria-label="${esc(spoken)}" title="${esc(
          toolLabel(tool)
        )} (key ${i + 1})">${toolIcon(tool)}<span>${esc(toolLabel(tool))}</span>${cost}</button>`;
      })
      .join("");
  }

  function renderMission() {
    const { level, index } = state;
    ui.levelName.textContent = `Level ${index + 1} of ${LEVELS.length}: ${level.title}`;
    ui.levelMeta.textContent = `Level ${index + 1} · ${level.years}`;
    ui.levelTitle.textContent = level.title;
    ui.story.textContent = level.story;
    ui.goal.textContent = level.goal;
    ui.numbers.checked = state.numbers;
    document.title = `${level.title} · Gear Garage`;
    renderHints();
  }

  function renderHints() {
    const { level, hintsShown } = state;
    ui.hints.innerHTML = level.hints.slice(0, hintsShown).map((hint) => `<li>${esc(hint)}</li>`).join("");
    ui.hintButton.hidden = hintsShown >= level.hints.length;
    ui.hintButton.textContent = hintsShown ? "Show another hint" : "Show a hint";
  }

  const checkItem = (ok, text) =>
    `<li class="${ok ? "ok" : "bad"}"><span class="mark" aria-hidden="true">${ok ? "✓" : "✗"}</span><span>${esc(text)}<span class="sr-only">${
      ok ? ", done" : ", not yet"
    }</span></span></li>`;

  function renderGoals() {
    const { checks, sim } = state.evaluation;
    let html = checks.map((c) => checkItem(c.ok, c.text)).join("");
    if (sim.jammed) html += checkItem(false, "No jammed gears");
    ui.goals.innerHTML = `<ul class="checks">${html}</ul>`;
  }

  function renderBudget() {
    const { level } = state;
    const cost = state.evaluation.cost;
    ui.cost.textContent = money(cost);
    ui.meterFill.style.width = `${Math.min(100, (cost / level.budget) * 100)}%`;
    ui.meterFill.classList.toggle("over", cost > level.budget);
    ui.meterPar.style.left = `calc(${(level.par / level.budget) * 100}% - 1.5px)`;
    ui.budgetNote.textContent =
      cost > level.budget
        ? `Over the ${money(level.budget)} budget by ${money(cost - level.budget)}.`
        : `Budget ${money(level.budget)}. Spend ${money(level.par)} or less for 3 stars.`;
  }

  function renderStatus() {
    const issues = Gears.problems(state.level, state.evaluation.sim);
    if (state.board.size === 0) {
      say("Pick a gear size, then tap the motor's axle to put a gear on it. Drag a gear to move it.", "");
    } else if (state.evaluation.passed) {
      say("It works! Press “Check my gears” to see your stars.", "good");
    } else if (issues.length) {
      say(issues[0], "bad");
    } else {
      say("", "");
    }
  }

  // ---------- checking and levels ----------

  function check() {
    const { evaluation, level } = state;
    if (!evaluation.passed) {
      const issue = Gears.problems(level, evaluation.sim)[0] ?? "Some goals aren't met yet.";
      say(`Not yet. ${issue}`, "bad");
      ui.goalsCard.classList.remove("nudge");
      void ui.goalsCard.offsetWidth; // restart the animation
      ui.goalsCard.classList.add("nudge");
      return;
    }
    progress.stars[level.id] = Math.max(progress.stars[level.id] ?? 0, evaluation.stars);
    saveProgress();
    showWin(evaluation);
  }

  function showWin({ stars, cost }) {
    const { level } = state;
    ui.winStars.innerHTML = starsHtml(stars);
    ui.winStars.setAttribute("aria-label", `${stars} out of 3 stars`);
    if (stars === 3 && cost < level.par) {
      ui.winCost.textContent = `You spent ${money(cost)}, even less than our best design (${money(level.par)}). Outstanding engineering!`;
    } else if (stars === 3) {
      ui.winCost.textContent = `You spent ${money(cost)}. That matches the best design we know. Brilliant engineering!`;
    } else if (stars === 2) {
      ui.winCost.textContent = `You spent ${money(cost)}, within the ${money(level.budget)} budget. Can you get it down to ${money(level.par)} for 3 stars?`;
    } else {
      ui.winCost.textContent = `It works, but it cost ${money(cost)}, over the ${money(level.budget)} budget. Find a cheaper design for more stars.`;
    }
    ui.winLearn.textContent = level.learn;
    ui.winNext.textContent = state.index === LEVELS.length - 1 ? "All levels" : "Next level";
    ui.winDialog.showModal();
  }

  function openLevels() {
    ui.levelList.innerHTML = LEVELS.map((level, i) => {
      const stars = progress.stars[level.id] ?? 0;
      return `<button type="button" class="level-item${i === state.index ? " current" : ""}" data-index="${i}"><span class="level-num">${
        i + 1
      }</span><span>${esc(level.title)}<small>${esc(level.years)}</small></span><span class="level-stars" aria-label="${stars} out of 3 stars">${starsHtml(
        stars
      )}</span></button>`;
    }).join("");
    ui.levelsDialog.showModal();
    ui.levelList.querySelector(".current")?.focus();
  }

  // ---------- wiring up the controls ----------

  ui.tools.addEventListener("click", (event) => {
    const button = event.target.closest(".tool");
    if (button) selectTool(tools()[Number(button.dataset.index)]);
  });
  ui.undo.addEventListener("click", undo);
  ui.clear.addEventListener("click", clearBoard);
  ui.numbers.addEventListener("change", () => {
    state.numbers = ui.numbers.checked;
    renderGears();
    renderLabels();
  });
  ui.hintButton.addEventListener("click", () => {
    state.hintsShown = Math.min(state.level.hints.length, state.hintsShown + 1);
    renderHints();
    ui.hints.lastElementChild?.setAttribute("tabindex", "-1");
    ui.hints.lastElementChild?.focus();
  });
  ui.check.addEventListener("click", check);
  ui.levelsButton.addEventListener("click", openLevels);
  ui.levelList.addEventListener("click", (event) => {
    const button = event.target.closest(".level-item");
    if (!button) return;
    ui.levelsDialog.close();
    startLevel(Number(button.dataset.index));
  });
  ui.winStay.addEventListener("click", () => ui.winDialog.close());
  ui.winNext.addEventListener("click", () => {
    ui.winDialog.close();
    if (state.index === LEVELS.length - 1) openLevels();
    else startLevel(state.index + 1);
  });

  startLevel(clamp(progress.last, 0, LEVELS.length - 1));
  requestAnimationFrame(tick);
})();
