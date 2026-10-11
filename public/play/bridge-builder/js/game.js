"use strict";
// Bridge Builder: the page. Draws the building site, lets players build with mouse,
// touch or keyboard, analyses the bridge as they build, and drives the truck across.

(() => {
  const C = 56; // SVG units per grid square
  const M = 28; // margin around the grid
  const STORE_KEY = "bridgeBuilder.v1";
  const EXAGGERATE = 40; // bending is drawn 40 times bigger so you can see it
  const SPEED = 2; // truck speed in squares per second
  const GRAVITY = 1400; // for the collapse animation, in SVG units per second²
  const ERASER = { type: "eraser" };
  const MATERIAL_ORDER = ["road", "wood", "steel", "cable"];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const $ = (id) => document.getElementById(id);
  const ui = {
    board: $("board"),
    scene: $("scene"),
    dots: $("dots"),
    members: $("members"),
    joints: $("joints"),
    truck: $("truck"),
    forceLabels: $("forceLabels"),
    overlay: $("overlay"),
    legend: $("legend"),
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
    forces: $("forcesToggle"),
    status: $("status"),
    announcer: $("announcer"),
    goals: $("goals"),
    goalsCard: $("goalsCard"),
    cost: $("cost"),
    meterFill: $("meterFill"),
    meterPar: $("meterPar"),
    budgetNote: $("budgetNote"),
    drive: $("driveButton"),
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

  const X = (g) => M + g * C;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const money = (n) => `£${n}`;
  const STAR_PATH = "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z";
  const starsHtml = (n) =>
    [0, 1, 2].map((i) => `<svg class="star${i < n ? "" : " empty"}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`).join("");
  const sameXY = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];

  // ---------- saved progress (stays in this browser only) ----------

  function loadProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved && typeof saved === "object") {
        return { stars: saved.stars ?? {}, designs: saved.designs ?? {}, last: Number(saved.last) || 0 };
      }
    } catch {
      // storage blocked or unreadable: start fresh
    }
    return { stars: {}, designs: {}, last: 0 };
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
    design: new Map(), // member key -> material
    tool: null,
    undo: [],
    hintsShown: 0,
    forces: false,
    cursor: [0, 0],
    start: null, // keyboard: first end of the next beam
    keyboardCursor: false,
    labelScale: 1,
    hover: null,
    preview: null, // cable being dragged
    evaluation: null,
    drive: null, // the truck run in progress
    lastRun: null, // what happened on the last drive: { ok, failure }
  };

  const tools = () => [
    ...MATERIAL_ORDER.filter((m) => m === "road" || state.level.materials.includes(m)).map((m) => ({ type: m })),
    ERASER,
  ];

  function startLevel(index) {
    const level = LEVELS[index];
    stopDrive();
    Object.assign(state, {
      index,
      level,
      tool: { type: "road" },
      undo: [],
      hintsShown: 0,
      forces: !!level.numbers,
      cursor: [level.left, level.deckY],
      start: null,
      hover: null,
      preview: null,
      lastRun: null,
    });
    state.design = restoreDesign(level);
    progress.last = index;
    renderScene();
    renderMission();
    renderTools();
    refresh();
  }

  function restoreDesign(level) {
    const design = new Map();
    for (const [key, material] of progress.designs[level.id] ?? []) {
      if (!Bridge.memberProblem(level, key, material)) design.set(key, material);
    }
    return design;
  }

  function refresh() {
    state.evaluation = Bridge.evaluate(state.level, state.design);
    renderBuild();
    renderGoals();
    renderBudget();
    renderStatus();
    ui.undo.disabled = state.undo.length === 0 || !!state.drive;
    ui.clear.disabled = state.design.size === 0 || !!state.drive;
    progress.designs[state.level.id] = [...state.design];
    saveProgress();
  }

  // ---------- editing ----------

  const snapshot = () => [...state.design];

  function commit(before) {
    state.undo.push(before);
    if (state.undo.length > 200) state.undo.shift();
    state.lastRun = null;
    refresh();
  }

  function undo() {
    if (state.drive) return;
    const snap = state.undo.pop();
    if (!snap) return;
    state.design = new Map(snap);
    state.lastRun = null;
    refresh();
    announce("Undone.");
  }

  function clearDesign() {
    if (!state.design.size || state.drive) return;
    const before = snapshot();
    state.design.clear();
    commit(before);
    announce("Bridge cleared. Press Undo to bring it back.");
  }

  // Builds (or removes) one beam between two points. "tap" toggles the same material off.
  function applyBeam(a, b, mode, tool = state.tool) {
    if (!a || !b || sameXY(a, b)) return false;
    const key = Bridge.memberKey(a, b);
    const current = state.design.get(key);
    if (tool.type === "eraser") {
      if (!current) return false;
      state.design.delete(key);
      return true;
    }
    if (current === tool.type) {
      if (mode !== "tap") return false;
      state.design.delete(key);
      return true;
    }
    const problem = Bridge.memberProblem(state.level, key, tool.type);
    if (problem) {
      if (mode !== "quiet") say(Bridge.placementText(problem), "bad");
      return false;
    }
    state.design.set(key, tool.type);
    return true;
  }

  function selectTool(tool) {
    state.tool = tool;
    for (const button of ui.tools.querySelectorAll(".tool")) {
      button.setAttribute("aria-pressed", String(tools()[Number(button.dataset.index)].type === tool.type));
    }
    renderOverlay();
  }

  // ---------- pointer input (mouse, pen and touch) ----------

  function gridPoint(event) {
    const ctm = ui.board.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return { gx: (p.x - M) / C, gy: (p.y - M) / C };
  }

  // The nearest buildable point, if the pointer is close enough to it.
  function pointNear({ gx, gy }, reach = 0.42) {
    const x = Math.round(gx);
    const y = Math.round(gy);
    if (Math.hypot(gx - x, gy - y) > reach || Bridge.pointProblem(state.level, x, y)) return null;
    return [x, y];
  }

  function memberNear({ gx, gy }, reach = 0.22) {
    let best = null;
    let bestDistance = reach;
    for (const key of state.design.keys()) {
      const [[ax, ay], [bx, by]] = Bridge.memberEnds(key);
      const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
      const t = clamp(((gx - ax) * (bx - ax) + (gy - ay) * (by - ay)) / len2, 0, 1);
      const d = Math.hypot(gx - (ax + t * (bx - ax)), gy - (ay + t * (by - ay)));
      if (d < bestDistance) {
        best = key;
        bestDistance = d;
      }
    }
    return best;
  }

  // Road follows the dashed line, so snap the pointer onto it.
  function roadPoint(p) {
    if (Math.abs(p.gy - state.level.deckY) > 0.6) return null;
    const x = clamp(Math.round(p.gx), state.level.left, state.level.right);
    return Math.abs(p.gx - x) <= 0.45 ? [x, state.level.deckY] : null;
  }

  // Steps from one point towards another (diagonally where possible), building beams.
  function walk(from, to, tool) {
    let [x, y] = from;
    let changed = false;
    while (x !== to[0] || y !== to[1]) {
      const next = [x + Math.sign(to[0] - x), y + Math.sign(to[1] - y)];
      if (Bridge.pointProblem(state.level, ...next)) break;
      changed = applyBeam([x, y], next, "quiet", tool) || changed;
      [x, y] = next;
    }
    return { changed, reached: [x, y] };
  }

  let gesture = null;

  ui.board.addEventListener("pointerdown", (event) => {
    if (state.drive || (event.button !== 0 && event.button !== 2)) return;
    const p = gridPoint(event);
    if (!p) return;
    event.preventDefault();
    ui.board.setPointerCapture(event.pointerId);
    const tool = event.button === 2 ? ERASER : state.tool;
    gesture = {
      id: event.pointerId,
      start: p,
      tool,
      point: tool.type === "road" ? roadPoint(p) : pointNear(p),
      moved: false,
      changed: false,
      snap: snapshot(),
    };
    gesture.last = gesture.point;
  });

  ui.board.addEventListener("pointermove", (event) => {
    const p = gridPoint(event);
    if (!p) return;
    if (!gesture || gesture.id !== event.pointerId) {
      if (event.pointerType === "mouse" && !state.drive) setHover(p);
      return;
    }
    if (!gesture.moved) {
      if (Math.hypot(p.gx - gesture.start.gx, p.gy - gesture.start.gy) < 0.3) return;
      gesture.moved = true;
      state.hover = null;
    }
    const { tool } = gesture;
    if (tool.type === "eraser") {
      const key = memberNear(p);
      if (key) {
        state.design.delete(key);
        gesture.changed = true;
        refresh();
      }
      return;
    }
    if (!gesture.point) return;
    if (tool.type === "cable") {
      const to = pointNear(p);
      state.preview = { from: gesture.point, to, ok: !!to && !sameXY(to, gesture.point) && !Bridge.memberProblem(state.level, Bridge.memberKey(gesture.point, to), "cable") };
      renderOverlay();
      return;
    }
    const target = tool.type === "road" ? roadPoint(p) : pointNear(p);
    if (!target || sameXY(target, gesture.last)) return;
    const { changed, reached } = walk(gesture.last, target, tool);
    gesture.last = reached;
    if (changed) {
      gesture.changed = true;
      refresh();
    }
  });

  function endGesture(event, cancelled) {
    if (!gesture || gesture.id !== event.pointerId) return;
    const g = gesture;
    gesture = null;
    const p = gridPoint(event);
    if (!cancelled && g.moved && g.tool.type === "cable" && state.preview) {
      const { from, to } = state.preview;
      state.preview = null;
      if (to && !sameXY(from, to)) g.changed = applyBeam(from, to, "place", g.tool) || g.changed;
      else renderOverlay();
    } else if (!cancelled && !g.moved && p) {
      // A tap: change or remove the beam under the pointer.
      const key = memberNear(p);
      if (key) {
        const [a, b] = Bridge.memberEnds(key);
        g.changed = applyBeam(a, b, "tap", g.tool) || g.changed;
      } else if (g.tool.type !== "eraser" && pointNear(p)) {
        say(g.tool.type === "cable" ? "Drag from one point to another to string a cable." : "Drag from this point to a neighbouring point to build a beam.", "");
      }
    }
    if (g.changed) commit(g.snap);
    else renderOverlay();
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
    const member = memberNear(p);
    const point = state.tool.type === "road" ? roadPoint(p) : pointNear(p);
    const key = `${member}|${point}`;
    if (state.hover?.key === key) return;
    state.hover = { member, point, key };
    renderOverlay();
  }

  // ---------- keyboard input ----------

  const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const describePoint = ([x, y]) => `column ${x + 1}, row ${y + 1}`;

  ui.board.addEventListener("keydown", (event) => {
    if (state.drive) return;
    const [x, y] = state.cursor;
    if (event.key in ARROWS) {
      event.preventDefault();
      const [dx, dy] = ARROWS[event.key];
      state.cursor = [clamp(x + dx, 0, state.level.cols - 1), clamp(y + dy, 0, state.level.rows - 1)];
      renderOverlay();
      const blocked = Bridge.pointProblem(state.level, ...state.cursor);
      announce(`${describePoint(state.cursor)}${blocked ? ", can't build here" : ""}.`);
    } else if (event.key === " ") {
      event.preventDefault();
      if (Bridge.pointProblem(state.level, x, y)) {
        announce("You can't build from here.");
        return;
      }
      state.start = [x, y];
      renderOverlay();
      announce(`Start point set at ${describePoint(state.start)}. Move to where the beam should end and press Enter.`);
    } else if (event.key === "Enter" && state.start) {
      event.preventDefault();
      const before = snapshot();
      if (applyBeam(state.start, state.cursor, "place")) {
        commit(before);
        announce(`${toolName(state.tool)} built from ${describePoint(state.start)} to ${describePoint(state.cursor)}.`);
        state.start = [...state.cursor];
        renderOverlay();
      }
    } else if ((event.key === "Delete" || event.key === "Backspace") && state.start) {
      event.preventDefault();
      const key = Bridge.memberKey(state.start, state.cursor);
      if (state.design.has(key)) {
        const before = snapshot();
        state.design.delete(key);
        commit(before);
        announce("Beam removed.");
      }
    } else if (event.key === "Escape") {
      state.start = null;
      renderOverlay();
    }
  });

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

  // ---------- drawing the scene ----------

  function renderScene() {
    const { level } = state;
    const width = (level.cols - 1) * C + 2 * M;
    const height = (level.rows - 1) * C + 2 * M;
    ui.board.setAttribute("viewBox", `0 0 ${width} ${height}`);
    ui.board.style.setProperty("--ratio", (width / height).toFixed(3));
    const deck = X(level.deckY);
    const waterTop = Math.min(height - 18, deck + C * 0.9 + Math.max(0, level.rows - level.deckY - 3) * C * 0.6);

    let html = `<rect width="${width}" height="${height}" fill="url(#sky)"/>`;
    html += `<path class="hill" d="M0 ${deck - 20} Q ${width * 0.25} ${deck - 110} ${width * 0.5} ${deck - 40} T ${width} ${deck - 70} V ${height} H 0 Z" opacity="0.6"/>`;
    html += `<rect class="water" x="${X(level.left)}" y="${waterTop}" width="${(level.right - level.left) * C}" height="${height - waterTop}"/>`;
    for (let i = 0; i < 3; i++) {
      const y = waterTop + 14 + i * 16;
      if (y > height - 4) break;
      html += `<path class="wave" d="M${X(level.left) + 20 + i * 30} ${y} q 12 -6 24 0 t 24 0 M${X(level.right) - 120 + i * 20} ${y + 6} q 12 -6 24 0 t 24 0"/>`;
    }
    for (const g of level.ground) {
      const x0 = Math.max(0, X(g.x0));
      const x1 = Math.min(width, X(g.x1));
      const y0 = X(g.y0);
      const rock = g !== level.ground[0] && g !== level.ground[1];
      html += `<rect class="${rock ? "rock" : "ground"}" x="${x0}" y="${y0}" width="${x1 - x0}" height="${height - y0}" rx="${rock ? 10 : 0}"/>`;
      if (!rock) html += `<rect class="ground-top" x="${x0}" y="${y0 - 4}" width="${x1 - x0}" height="10"/>`;
    }
    for (const tower of level.towers ?? []) {
      html += `<rect class="tower" x="${X(tower.x) - 12}" y="${X(tower.top) - 18}" width="24" height="${deck - X(tower.top) + 18}" rx="4"/>`;
    }
    for (const zone of level.noBuild ?? []) {
      const x0 = Math.max(0, X(zone.x0));
      const x1 = Math.min(width, X(zone.x1));
      const y0 = Math.max(0, X(zone.y0));
      const y1 = Math.min(height, X(zone.y1));
      const label = zone.name;
      // Above-road zones are labelled at the top; under-road zones near the water, beside the boat.
      const labelY = zone.y0 < level.deckY ? y0 + 22 : Math.min(y1 - 12, waterTop + 26);
      html += `<g class="zone"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/><text class="zone-label" x="${(x0 + x1) / 2}" y="${labelY}">${esc(
        label
      )}</text></g>`;
      if (/power/i.test(label)) {
        for (let i = 0; i < 3; i++) html += `<path class="power-line" d="M0 ${18 + i * 12} Q ${width / 2} ${40 + i * 12} ${width} ${18 + i * 12}"/>`;
      }
      if (/boat/i.test(label)) {
        // A small sailing boat near the left bank, clear of the label.
        const bx = x0 + 14;
        html += `<path class="boat" d="M${bx} ${waterTop - 2} h46 l-8 10 h-30 Z"/><path class="boat" d="M${bx + 20} ${waterTop - 2} v-24 l18 22 Z"/>`;
      }
    }
    html += `<line class="road-guide" x1="${X(level.left)}" y1="${deck}" x2="${X(level.right)}" y2="${deck}"/>`;
    ui.scene.innerHTML = html;

    let dots = "";
    for (let y = 0; y < level.rows; y++) {
      for (let x = 0; x < level.cols; x++) {
        if (!Bridge.pointProblem(level, x, y) && !level.anchors.some((a) => sameXY(a, [x, y]))) {
          dots += `<circle class="dot" cx="${X(x)}" cy="${X(y)}" r="3"/>`;
        }
      }
    }
    ui.dots.innerHTML = dots;
    updateLabelScale(false);
  }

  // ---------- drawing the bridge ----------

  // Where a point is drawn: its grid position plus (exaggerated) bending, or a collapse position.
  function placeOf(point, bend) {
    if (bend?.points) return bend.points.get(Bridge.pointKey(...point)) ?? [X(point[0]), X(point[1])];
    let [x, y] = [X(point[0]), X(point[1])];
    if (bend?.u) {
      const j = bend.model.joints.get(Bridge.pointKey(...point));
      if (j !== undefined) {
        const scale = (EXAGGERATE * C) / Bridge.CELL;
        // Never draw a joint more than half a square from where it was built.
        x += clamp(bend.u[2 * j] * scale, -C / 2, C / 2);
        y += clamp(bend.u[2 * j + 1] * scale, -C / 2, C / 2);
      }
    }
    return [x, y];
  }

  function beamSvg(material, [x1, y1], [x2, y2], slack = false) {
    const line = (cls) => `<line class="member ${cls}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    if (material === "road") return line("road-edge") + line("road-top") + line("road-line");
    if (material === "cable") return line(slack ? "cable-line slack" : "cable-line");
    return line(`${material}-edge`) + line(`${material}-top`);
  }

  // Draws every beam. `forceInfo(member)` gives { force, usage } for colouring, or null.
  function renderMembers(bend, forceInfo, broken = new Set()) {
    const { evaluation } = state;
    const model = evaluation.model;
    const loose = new Set(model.loose);
    let beams = "";
    let forces = "";
    const labelSpots = [];
    const jointPoints = new Map();
    for (const [key, material] of state.design) {
      if (broken.has(key)) continue;
      const [a, b] = Bridge.memberEnds(key);
      const pa = placeOf(a, bend);
      const pb = placeOf(b, bend);
      const member = model.members.find((m) => m.key === key);
      const slack = !!(bend?.slack && member && bend.slack.has(member.index));
      beams += `<g${loose.has(key) ? ' class="loose"' : ""}>${beamSvg(material, pa, pb, slack)}</g>`;
      for (const [p, xy] of [
        [a, pa],
        [b, pb],
      ]) {
        jointPoints.set(Bridge.pointKey(...p), xy);
      }
      const info = member && forceInfo ? forceInfo(member) : null;
      if (info && info.usage > 0.02) {
        const kind = info.usage > 1 ? "over" : info.force >= 0 ? "tension" : "compression";
        const width = 3 + 4 * Math.min(1.25, info.usage);
        const opacity = 0.35 + 0.65 * Math.min(1, info.usage);
        forces += `<line class="force ${kind}" x1="${pa[0].toFixed(1)}" y1="${pa[1].toFixed(1)}" x2="${pb[0].toFixed(1)}" y2="${pb[1].toFixed(1)}" stroke-width="${width.toFixed(1)}" opacity="${opacity.toFixed(2)}"/>`;
        if (info.usage >= 0.5 && info.showLabel) {
          labelSpots.push({ x: (pa[0] + pb[0]) / 2, y: (pa[1] + pb[1]) / 2, usage: info.usage, kind });
        }
      }
    }
    ui.members.innerHTML = beams + forces;
    // Percentages for the hardest-working beams first; a label is skipped if it would overlap one already shown.
    const w = 34 * state.labelScale;
    const h = 15 * state.labelScale;
    const shown = [];
    for (const spot of labelSpots.sort((p, q) => q.usage - p.usage)) {
      if (shown.some((s) => Math.abs(s.x - spot.x) < w && Math.abs(s.y - spot.y) < h)) continue;
      shown.push(spot);
    }
    ui.forceLabels.innerHTML = shown
      .map((s) => `<text class="force-label ${s.kind}" x="${s.x.toFixed(1)}" y="${s.y.toFixed(1)}">${Math.round(s.usage * 100)}%</text>`)
      .join("");

    let joints = "";
    for (const [key, [x, y]] of jointPoints) {
      const anchor = state.level.anchors.some((a) => Bridge.pointKey(...a) === key);
      if (!anchor) joints += `<circle class="joint" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5"/>`;
    }
    for (const [ax, ay] of state.level.anchors) joints += `<circle class="anchor" cx="${X(ax)}" cy="${X(ay)}" r="7"/>`;
    ui.joints.innerHTML = joints;
  }

  // While building: colour each beam by the worst it gets during the whole crossing.
  function renderBuild() {
    const { evaluation } = state;
    const showForces = state.forces && !evaluation.missing.length && !(evaluation.failure?.kind === "wobbly");
    renderMembers(null, showForces ? (m) => ({ ...evaluation.worst[m.index], showLabel: true }) : null);
    ui.legend.hidden = !state.forces;
    renderTruck(state.level.left - 1.3, null);
    renderOverlay();
  }

  // ---------- the vehicle ----------

  const VEHICLES = {
    car: { length: 1.35, height: 0.42, body: "#e5484d", cab: 0.55 },
    van: { length: 1.5, height: 0.6, body: "#e9edf3", cab: 0.4 },
    truck: { length: 1.6, height: 0.7, body: "#f5b83d", cab: 0.35 },
    lorry: { length: 1.75, height: 0.75, body: "#3fa34d", cab: 0.32 },
    crane: { length: 1.8, height: 0.62, body: "#f08c2e", cab: 0.3, boom: true },
  };

  // Draws the vehicle with its front axle at `front` (grid x), riding on the (bent) road.
  function renderTruck(front, bend, fall = null) {
    const { level } = state;
    const spec = VEHICLES[level.truck.kind] ?? VEHICLES.truck;
    const rear = front - level.truck.wheelbase;
    const roadY = (x) => {
      if (fall) return null;
      if (!bend?.u || x <= level.left || x >= level.right) return X(level.deckY);
      const x0 = Math.floor(x);
      const t = x - x0;
      const ya = placeOf([x0, level.deckY], bend)[1];
      const yb = placeOf([x0 + 1, level.deckY], bend)[1];
      return ya + (yb - ya) * t;
    };
    const wheelR = 0.17 * C;
    let fx = X(front);
    let rx = X(rear);
    let fy = roadY(front) - wheelR - 6;
    let ry = roadY(rear) - wheelR - 6;
    let angle = (Math.atan2(fy - ry, fx - rx) * 180) / Math.PI;
    if (fall) {
      fx = fall.x;
      rx = fall.x - level.truck.wheelbase * C;
      fy = ry = fall.y;
      angle = fall.angle;
    }
    const cx = (fx + rx) / 2;
    const cy = (fy + ry) / 2;
    const len = spec.length * C;
    const h = spec.height * C;
    const half = len / 2;
    const wb = (level.truck.wheelbase * C) / 2;
    const cabW = spec.cab * len;
    let body = `<rect x="${-half}" y="${-h - wheelR * 0.4}" width="${len - cabW}" height="${h}" rx="6" fill="${spec.body}" stroke="#1c2330" stroke-width="2"/>`;
    body += `<path d="M${half - cabW} ${-h * 0.85 - wheelR * 0.4} h${cabW * 0.6} l${cabW * 0.4} ${h * 0.4} v${h * 0.45} h${-cabW} Z" fill="${spec.body}" stroke="#1c2330" stroke-width="2"/>`;
    body += `<path class="vehicle-window" d="M${half - cabW + 6} ${-h * 0.75 - wheelR * 0.4} h${cabW * 0.5} l${cabW * 0.3} ${h * 0.3} h${-cabW * 0.8} Z"/>`;
    if (spec.boom) body += `<line x1="${-half + 10}" y1="${-h - wheelR * 0.4}" x2="${half - cabW - 6}" y2="${-h * 1.9}" stroke="#f5c542" stroke-width="7" stroke-linecap="round"/>`;
    body += `<circle class="wheel" cx="${-wb}" cy="0" r="${wheelR}"/><circle class="wheel" cx="${wb}" cy="0" r="${wheelR}"/>`;
    ui.truck.innerHTML = `<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${angle.toFixed(1)})">${body}</g>`;
  }

  // ---------- overlay ----------

  function renderOverlay() {
    let html = "";
    if (state.lastRun?.failure && !state.drive) html += failureMarks(state.lastRun.failure);
    if (state.hover && !gesture && !state.drive) {
      if (state.hover.member && (state.tool.type === "eraser" || !state.hover.point)) {
        const [a, b] = Bridge.memberEnds(state.hover.member);
        html += `<line class="hover-member${state.tool.type === "eraser" ? " erase" : ""}" x1="${X(a[0])}" y1="${X(a[1])}" x2="${X(b[0])}" y2="${X(b[1])}"/>`;
      } else if (state.hover.point && state.tool.type !== "eraser") {
        html += `<circle class="hover-point" cx="${X(state.hover.point[0])}" cy="${X(state.hover.point[1])}" r="11"/>`;
      }
    }
    if (state.preview) {
      const { from, to, ok } = state.preview;
      if (to) html += `<line class="preview${ok ? "" : " bad"}" x1="${X(from[0])}" y1="${X(from[1])}" x2="${X(to[0])}" y2="${X(to[1])}"/>`;
    }
    if (state.keyboardCursor) {
      if (state.start) {
        html += `<circle class="start-point" cx="${X(state.start[0])}" cy="${X(state.start[1])}" r="11"/>`;
        html += `<line class="preview" x1="${X(state.start[0])}" y1="${X(state.start[1])}" x2="${X(state.cursor[0])}" y2="${X(state.cursor[1])}" opacity="0.6"/>`;
      }
      html += `<circle class="cursor-ring" cx="${X(state.cursor[0])}" cy="${X(state.cursor[1])}" r="15"/>`;
    }
    ui.overlay.innerHTML = html;
  }

  // Red rings on the joints that wobbled, or the beams that broke, after a failed run.
  function failureMarks(failure) {
    if (failure.kind === "wobbly") return failure.joints.map(([x, y]) => `<circle class="wobble-ring" cx="${X(x)}" cy="${X(y)}" r="14"/>`).join("");
    if (failure.kind === "break") {
      return failure.members
        .map((m) => {
          const [a, b] = m.ends;
          return `<line class="hover-member erase" x1="${X(a[0])}" y1="${X(a[1])}" x2="${X(b[0])}" y2="${X(b[1])}"/>`;
        })
        .join("");
    }
    return "";
  }

  // ---------- driving the truck ----------

  // Front-axle position where the run goes wrong, or Infinity if it doesn't.
  function failurePoint(evaluation) {
    const { failure } = evaluation;
    if (!failure) return Infinity;
    if (failure.kind === "road") return failure.missing[0] + 0.25;
    return failure.case.front ?? -Infinity;
  }

  function drive() {
    if (state.drive) return;
    const { level, evaluation } = state;
    state.start = null;
    state.hover = null;
    state.lastRun = null;
    const failAt = failurePoint(evaluation);
    if (reducedMotion.matches) {
      finishRun(!evaluation.failure);
      return;
    }
    state.drive = { front: level.left - 1.3, failAt, phase: "drive", last: null, collapse: null };
    ui.board.classList.add("locked");
    ui.drive.disabled = true;
    ui.drive.textContent = "Driving…";
    ui.undo.disabled = ui.clear.disabled = true;
    say(`Here comes the ${level.truck.name.toLowerCase()}…`, "");
    // Falls down under its own weight before the truck even starts.
    if (failAt === -Infinity) startFailure(evaluation.failure);
    requestAnimationFrame(driveFrame);
  }

  function stopDrive() {
    state.drive = null;
    ui.board?.classList.remove("locked");
    if (ui.drive) {
      ui.drive.disabled = false;
      ui.drive.textContent = state.level ? `Drive the ${state.level.truck.name.toLowerCase()}` : "Drive";
    }
  }

  function driveFrame(time) {
    const run = state.drive;
    if (!run) return;
    const dt = run.last === null ? 0 : Math.min(0.05, (time - run.last) / 1000);
    run.last = time;
    const { level, evaluation } = state;
    if (run.phase === "drive") {
      run.front += SPEED * dt;
      if (run.front >= run.failAt) {
        startFailure(evaluation.failure);
      } else if (run.front > level.right + level.truck.wheelbase + 1.4) {
        finishRun(true);
        return;
      } else {
        const onBridge = run.front > level.left && run.front - level.truck.wheelbase < level.right;
        const result = onBridge ? Bridge.solveCase(level, evaluation.model, run.front) : evaluation.cases[0];
        const bend = { u: result.u, model: evaluation.model, slack: result.slack };
        renderMembers(bend, (m) => ({ force: result.forces[m.index], usage: result.usage[m.index], showLabel: state.forces }));
        renderTruck(run.front, bend);
      }
    }
    if (run.phase === "collapse") {
      stepCollapse(run.collapse, dt);
      drawCollapse(run.collapse);
      run.collapse.time += dt;
      if (run.collapse.time > 2.6) {
        finishRun(false);
        return;
      }
    }
    requestAnimationFrame(driveFrame);
  }

  // Overloaded beams snap where they were bent. A wobbly bridge has no real bent shape
  // (it would just fold), so it starts from how it was built and the beams at its
  // hinges snap.
  function startFailure(failure) {
    if (failure.kind === "road") {
      startCollapse(null, [], true);
    } else if (failure.kind === "wobbly") {
      const hinges = new Set(failure.joints.map((p) => Bridge.pointKey(...p)));
      const keys = state.evaluation.model.members.filter((m) => m.ends.some((p) => hinges.has(Bridge.pointKey(...p)))).map((m) => m.key);
      startCollapse(null, keys);
    } else {
      startCollapse(failure.case, failure.members.map((m) => m.key));
    }
  }

  // A simple physics model of the bridge falling apart (for show only): joints fall under
  // gravity while every unbroken beam keeps its length.
  function startCollapse(result, brokenKeys, roadGap = false) {
    const { level, evaluation } = state;
    const run = state.drive;
    const model = evaluation.model;
    const bend = result ? { u: result.u, model } : null;
    const points = new Map();
    const anchors = new Set(level.anchors.map((a) => Bridge.pointKey(...a)));
    for (const m of model.members) {
      for (const p of m.ends) {
        const key = Bridge.pointKey(...p);
        if (points.has(key)) continue;
        const [x, y] = placeOf(p, bend);
        points.set(key, { x, y, px: x, py: y, pinned: anchors.has(key) });
      }
    }
    const broken = new Set(brokenKeys);
    const links = model.members
      .filter((m) => !broken.has(m.key))
      .map((m) => {
        const a = points.get(Bridge.pointKey(...m.ends[0]));
        const b = points.get(Bridge.pointKey(...m.ends[1]));
        return { a, b, length: Math.hypot(b.x - a.x, b.y - a.y), cable: m.material === "cable", material: m.material, key: m.key };
      });
    const front = clamp(run.front, level.left - 1.3, level.right + 2);
    const overGap = roadGap || (front > level.left && front - level.truck.wheelbase < level.right);
    const startY = X(level.deckY) - 0.17 * C - 6;
    run.phase = "collapse";
    run.collapse = {
      points,
      links,
      broken: model.members.filter((m) => broken.has(m.key)),
      time: 0,
      truck: { x: X(front), y: startY, vy: 0, angle: 0, falling: overGap },
      front,
      floor: (level.rows - 1) * C + 2 * M - 10,
    };
  }

  function stepCollapse(collapse, dt) {
    if (!dt) return;
    for (const p of collapse.points.values()) {
      if (p.pinned) continue;
      const vx = (p.x - p.px) * 0.99;
      const vy = (p.y - p.py) * 0.99;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y = Math.min(collapse.floor, p.y + vy + GRAVITY * dt * dt);
    }
    for (let i = 0; i < 12; i++) {
      for (const link of collapse.links) {
        const { a, b } = link;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        if (link.cable && d < link.length) continue; // a rope can go slack
        const diff = (d - link.length) / d;
        const share = a.pinned || b.pinned ? 1 : 0.5;
        if (!a.pinned) {
          a.x += dx * diff * share;
          a.y += dy * diff * share;
        }
        if (!b.pinned) {
          b.x -= dx * diff * share;
          b.y -= dy * diff * share;
        }
      }
    }
    const t = collapse.truck;
    if (t.falling) {
      t.vy += GRAVITY * dt;
      t.y = Math.min(collapse.floor - 20, t.y + t.vy * dt);
      t.angle = Math.min(55, t.angle + 60 * dt);
    }
  }

  function drawCollapse(collapse) {
    let beams = "";
    for (const link of collapse.links) beams += beamSvg(link.material, [link.a.x, link.a.y], [link.b.x, link.b.y]);
    // Broken beams snap in half and swing down from their ends.
    const swing = Math.min(1, collapse.time * 1.6);
    for (const m of collapse.broken) {
      const [pa, pb] = m.ends.map((p) => collapse.points.get(Bridge.pointKey(...p)));
      const mx = (pa.x + pb.x) / 2;
      const my = (pa.y + pb.y) / 2;
      for (const end of [pa, pb]) {
        const half = Math.hypot(mx - end.x, my - end.y) * 0.9;
        const start = Math.atan2(my - end.y, mx - end.x);
        const angle = start + (Math.PI / 2 - start) * swing;
        beams += beamSvg(m.material, [end.x, end.y], [end.x + half * Math.cos(angle), end.y + half * Math.sin(angle)]);
      }
    }
    ui.members.innerHTML = beams;
    ui.forceLabels.innerHTML = "";
    let joints = "";
    for (const p of collapse.points.values()) if (!p.pinned) joints += `<circle class="joint" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5"/>`;
    for (const [ax, ay] of state.level.anchors) joints += `<circle class="anchor" cx="${X(ax)}" cy="${X(ay)}" r="7"/>`;
    ui.joints.innerHTML = joints;
    const t = collapse.truck;
    if (t.falling) renderTruck(collapse.front, null, { x: t.x, y: t.y, angle: t.angle });
    else renderTruck(Math.min(collapse.front, state.level.left - 0.2), null);
  }

  function finishRun(ok) {
    const { level, evaluation } = state;
    stopDrive();
    state.lastRun = { ok, failure: evaluation.failure };
    renderBuild();
    renderGoals();
    ui.goalsCard.classList.remove("nudge");
    if (ok) {
      say(`The ${level.truck.name.toLowerCase()} made it across!`, "good");
      progress.stars[level.id] = Math.max(progress.stars[level.id] ?? 0, evaluation.stars);
      saveProgress();
      showWin(evaluation);
    } else {
      say(Bridge.failureText(level, evaluation.failure), "bad");
      ui.goalsCard.classList.remove("nudge");
      void ui.goalsCard.offsetWidth; // restart the animation
      ui.goalsCard.classList.add("nudge");
    }
  }

  // ---------- panel ----------

  function toolName(tool) {
    return tool.type === "eraser" ? "Eraser" : Bridge.MATERIALS[tool.type].name;
  }

  function toolCost(tool) {
    if (tool.type === "eraser") return "";
    const m = Bridge.MATERIALS[tool.type];
    if (tool.type === "cable") return `£${m.cost} per square`;
    if (tool.type === "road") return `£${m.cost}`;
    return `£${m.cost} / £${Math.round(m.cost * Math.SQRT2)}`;
  }

  function toolIcon(tool) {
    const svg = (inner) => `<svg width="34" height="22" viewBox="0 0 34 22" aria-hidden="true">${inner}</svg>`;
    const line = (stroke, width, dash = "") => `<line x1="4" y1="11" x2="30" y2="11" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"${dash}/>`;
    switch (tool.type) {
      case "road":
        return svg(line("#2b3038", 12) + line("#4a515d", 8) + line("#ffd84d", 2, ' stroke-dasharray="4 4"'));
      case "wood":
        return svg(line("#6b4523", 10) + line("#c99559", 6));
      case "steel":
        return svg(line("#263243", 10) + line("#9db0c9", 5));
      case "cable":
        return svg(line("#d9e1ee", 3));
      default:
        return `<svg width="30" height="22" viewBox="0 0 34 22" aria-hidden="true"><g transform="rotate(-25 17 11)"><rect x="5" y="5" width="24" height="12" rx="3" fill="#ff9aa2"/><rect x="5" y="5" width="9" height="12" rx="3" fill="#e9eef8"/></g></svg>`;
    }
  }

  function renderTools() {
    ui.tools.innerHTML = tools()
      .map((tool, i) => {
        const m = Bridge.MATERIALS[tool.type];
        const cost = tool.type === "eraser" ? "" : `<span class="tool-cost">${toolCost(tool)}</span>`;
        const strength =
          tool.type === "eraser"
            ? "Eraser"
            : tool.type === "cable"
            ? `Cable: only pulls, up to ${m.tension} kN. ${toolCost(tool)}`
            : `${m.name}: pull up to ${m.tension} kN, squash up to ${Bridge.compressionStrength(tool.type, 1)} kN. Costs ${toolCost(tool)} (straight / diagonal)`;
        return `<button type="button" class="tool" data-index="${i}" aria-pressed="${tool.type === state.tool.type}" title="${esc(strength)} (key ${i + 1})">${toolIcon(
          tool
        )}<span>${esc(toolName(tool))}</span>${cost}</button>`;
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
    ui.forces.checked = state.forces;
    ui.drive.textContent = `Drive the ${level.truck.name.toLowerCase()}`;
    document.title = `${level.title} · Bridge Builder`;
    renderHints();
  }

  function renderHints() {
    const { level, hintsShown } = state;
    ui.hints.innerHTML = level.hints.slice(0, hintsShown).map((hint) => `<li>${esc(hint)}</li>`).join("");
    ui.hintButton.hidden = hintsShown >= level.hints.length;
    ui.hintButton.textContent = hintsShown ? "Show another hint" : "Show a hint";
  }

  // The last goal is only known once the truck has driven (or with forces showing).
  function renderGoals() {
    const { checks } = state.evaluation;
    const known = state.forces || state.lastRun;
    ui.goals.innerHTML = `<ul class="checks">${checks
      .map((c, i) => {
        const unknown = i === checks.length - 1 && !known && checks[0].ok && checks[1].ok;
        const cls = unknown ? "unknown" : c.ok ? "ok" : "bad";
        const mark = unknown ? "?" : c.ok ? "✓" : "✗";
        const extra = unknown ? " (press Drive to test)" : "";
        return `<li class="${cls}"><span class="mark" aria-hidden="true">${mark}</span><span>${esc(c.text + extra)}<span class="sr-only">${
          unknown ? ", not tested yet" : c.ok ? ", done" : ", not yet"
        }</span></span></li>`;
      })
      .join("")}</ul>`;
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
    const { evaluation, level } = state;
    const loose = evaluation.model.loose.length ? " Some beams are only fixed at one end, so they don't help." : "";
    if (!state.design.size) {
      say("Choose Road and drag along the dashed line, from one bank to the other.", "");
    } else if (evaluation.missing.length) {
      say(`The road doesn't reach the other side yet. Fill the gaps in the dashed line with road.${loose}`, "bad");
    } else if (evaluation.failure?.kind === "wobbly") {
      say(Bridge.failureText(level, evaluation.failure) + loose, "bad");
    } else if (state.forces && evaluation.failure) {
      say(`Careful: ${Bridge.failureText(level, evaluation.failure)}${loose}`, "bad");
    } else if (state.forces) {
      say(`Looks strong enough: the hardest-working beam reaches ${Math.round(evaluation.maxUsage * 100)}% of its strength. Press Drive to test it.${loose}`, "good");
    } else {
      say(`Ready to test. Press Drive to send the ${level.truck.name.toLowerCase()} across.${loose}`, "");
    }
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
    if (state.drive) return;
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

  // Wide boards get shrunk to fit; grow the text so it stays readable.
  function updateLabelScale(rerender = true) {
    const width = ui.board.viewBox.baseVal?.width;
    if (!width || !ui.board.clientWidth) return;
    const scale = clamp(1.05 / (ui.board.clientWidth / width), 1, 1.45);
    if (Math.abs(scale - state.labelScale) < 0.02) return;
    state.labelScale = scale;
    ui.board.style.setProperty("--ls", scale.toFixed(3));
    if (rerender && state.evaluation && !state.drive) renderBuild();
  }

  new ResizeObserver(() => updateLabelScale()).observe(ui.board);

  // ---------- wiring up the controls ----------

  ui.tools.addEventListener("click", (event) => {
    const button = event.target.closest(".tool");
    if (button) selectTool(tools()[Number(button.dataset.index)]);
  });
  ui.undo.addEventListener("click", undo);
  ui.clear.addEventListener("click", clearDesign);
  ui.forces.addEventListener("change", () => {
    state.forces = ui.forces.checked;
    if (!state.drive) renderBuild();
    renderGoals();
    renderStatus();
  });
  ui.hintButton.addEventListener("click", () => {
    state.hintsShown = Math.min(state.level.hints.length, state.hintsShown + 1);
    renderHints();
    ui.hints.lastElementChild?.setAttribute("tabindex", "-1");
    ui.hints.lastElementChild?.focus();
  });
  ui.drive.addEventListener("click", drive);
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
})();
