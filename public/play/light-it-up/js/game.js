"use strict";
// Light It Up: the page. Draws the board, lets players build circuits with mouse,
// touch or keyboard, and shows what their circuit is doing as they build it.

(() => {
  const S = 64; // grid spacing in SVG units
  const M = 48; // margin around the grid
  const FLOW_PERIOD = 16; // must divide S so moving dots line up across wire sections
  const STORE_KEY = "lightItUp.v1";
  const ERASER = { type: "eraser" };
  const ICONS = { heater: "🔥", fridge: "🧊", tv: "📺", doorbell: "🔔" };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const $ = (id) => document.getElementById(id);
  const ui = {
    board: $("board"),
    rooms: $("rooms"),
    grid: $("grid"),
    wires: $("wires"),
    flow: $("flow"),
    parts: $("parts"),
    labels: $("labels"),
    overlay: $("overlay"),
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
    switchCard: $("switchCard"),
    switches: $("switches"),
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

  const px = (g) => M + g * S;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const money = (n) => `£${n}`;
  // Drawn stars: the ★ character shows as a colour emoji on some systems and ignores CSS colour.
  const STAR_PATH = "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z";
  const star = (filled) =>
    `<svg class="star${filled ? "" : " empty"}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
  const starsHtml = (n) => [0, 1, 2].map((i) => star(i < n)).join("");

  // ---------- saved progress (stars and boards stay in this browser only) ----------

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
    fixed: new Map(), // edge -> fixed part
    board: new Map(), // edge -> player piece
    switches: {},
    tool: null,
    undo: [],
    hintsShown: 0,
    numbers: false,
    cursor: [0, 0],
    keyboardCursor: false,
    labelScale: 1,
    hoverEdge: null,
    sim: null,
    evaluation: null,
    expect: {},
    flows: [],
  };

  const tools = () => [...state.level.tools, ERASER];

  function startLevel(index) {
    const level = LEVELS[index];
    Object.assign(state, {
      index,
      level,
      fixed: new Map(level.parts.map((part) => [part.edge, part])),
      switches: Circuit.defaultSwitches(level),
      tool: level.tools[0],
      undo: [],
      hintsShown: 0,
      numbers: !!level.numbers,
      cursor: Circuit.edgeEnds(level.parts[0].edge)[0],
      hoverEdge: null,
    });
    state.board = restoreBoard(level);
    progress.last = index;
    renderStatic();
    renderMission();
    renderTools();
    renderSwitches();
    refresh();
  }

  function restoreBoard(level) {
    const board = new Map();
    for (const [key, piece] of progress.boards[level.id] ?? []) {
      if (Circuit.edgeInGrid(key, level) && !state.fixed.has(key) && piece && Circuit.toolFor(level, piece)) {
        board.set(key, piece);
      }
    }
    return board;
  }

  // The test that matches the switches as they are now says which loads should be off.
  function currentExpectations() {
    const match = (state.level.tests ?? []).find((test) =>
      Object.entries(test.switches).every(([id, on]) => !!state.switches[id] === on)
    );
    return match ? match.expect : {};
  }

  function refresh() {
    const { level } = state;
    state.sim = Circuit.simulate(level, state.board, state.switches);
    state.evaluation = Circuit.evaluate(level, state.board);
    state.expect = currentExpectations();
    renderBoard();
    renderGoals();
    renderBudget();
    renderStatus();
    ui.undo.disabled = state.undo.length === 0;
    ui.clear.disabled = state.board.size === 0;
    progress.boards[level.id] = [...state.board];
    saveProgress();
  }

  // ---------- editing ----------

  const snapshot = () => [...state.board];

  function pushUndo(snap) {
    state.undo.push(snap);
    if (state.undo.length > 200) state.undo.shift();
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
    pushUndo(snapshot());
    state.board.clear();
    refresh();
    announce("Board cleared. Press Undo to bring it back.");
  }

  // Applies a tool to one edge. "tap" toggles a piece off again; "drag" only adds.
  function applyTool(key, mode, tool = state.tool) {
    if (!key || !Circuit.edgeInGrid(key, state.level) || state.fixed.has(key)) return false;
    const current = state.board.get(key);
    if (tool.type === "eraser") {
      if (!current) return false;
      state.board.delete(key);
      return true;
    }
    const piece = tool.type === "resistor" ? { type: "resistor", value: tool.value } : { type: tool.type };
    if (current && Circuit.samePiece(current, piece)) {
      if (mode !== "tap") return false;
      state.board.delete(key);
      return true;
    }
    if (current && mode === "drag" && current.type === "resistor") return false;
    state.board.set(key, piece);
    return true;
  }

  function toggleSwitch(id) {
    state.switches[id] = !state.switches[id];
    renderSwitches();
    refresh();
    const part = state.level.parts.find((p) => p.id === id);
    announce(`${part.name} ${state.switches[id] ? "on" : "off"}.`);
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
    return { gx: (p.x - M) / S, gy: (p.y - M) / S };
  }

  // Nearest junction, but only when the pointer is close to it (stops flicker between two).
  function nodeNear({ gx, gy }, reach = 0.42) {
    const x = Math.round(gx);
    const y = Math.round(gy);
    if (x < 0 || y < 0 || x >= state.level.cols || y >= state.level.rows) return null;
    return Math.hypot(gx - x, gy - y) <= reach ? [x, y] : null;
  }

  function edgeNear({ gx, gy }) {
    const candidates = [
      Circuit.edgeKey(Math.floor(gx), Math.round(gy), "h"),
      Circuit.edgeKey(Math.round(gx), Math.floor(gy), "v"),
    ];
    let best = null;
    let bestDistance = 0.36;
    for (const key of candidates) {
      if (!Circuit.edgeInGrid(key, state.level)) continue;
      const [[ax, ay], [bx, by]] = Circuit.edgeEnds(key);
      const d = Math.hypot(clamp(gx, ax, bx) - gx, clamp(gy, ay, by) - gy);
      if (d < bestDistance) {
        best = key;
        bestDistance = d;
      }
    }
    return best;
  }

  // Steps along the grid from one junction to another, one edge at a time.
  function walk(from, to, visit) {
    let [x, y] = from;
    const [tx, ty] = to;
    let changed = false;
    while (x !== tx || y !== ty) {
      const next = Math.abs(tx - x) >= Math.abs(ty - y) ? [x + Math.sign(tx - x), y] : [x, y + Math.sign(ty - y)];
      changed = visit(Circuit.edgeBetween([x, y], next)) || changed;
      [x, y] = next;
    }
    return changed;
  }

  let gesture = null;

  ui.board.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.button !== 2) return;
    const p = gridPoint(event);
    if (!p) return;
    event.preventDefault();
    ui.board.setPointerCapture(event.pointerId);
    gesture = {
      id: event.pointerId,
      start: p,
      lastNode: nodeNear(p, 0.75),
      dragging: false,
      changed: false,
      snap: snapshot(),
      tool: event.button === 2 ? ERASER : state.tool,
    };
    state.hoverEdge = null;
    renderOverlay();
  });

  ui.board.addEventListener("pointermove", (event) => {
    const p = gridPoint(event);
    if (!p) return;
    if (!gesture || gesture.id !== event.pointerId) {
      if (event.pointerType === "mouse") updateHover(p);
      return;
    }
    if (!gesture.dragging) {
      if (Math.hypot(p.gx - gesture.start.gx, p.gy - gesture.start.gy) < 0.25) return;
      if (gesture.tool.type === "resistor") return; // resistors are placed one at a time by tapping
      gesture.dragging = true;
    }
    const node = nodeNear(p);
    if (!node) return;
    if (!gesture.lastNode) {
      gesture.lastNode = node;
      return;
    }
    if (node[0] === gesture.lastNode[0] && node[1] === gesture.lastNode[1]) return;
    const changed = walk(gesture.lastNode, node, (key) => applyTool(key, "drag", gesture.tool));
    gesture.lastNode = node;
    if (changed) {
      gesture.changed = true;
      refresh();
    }
  });

  function endGesture(event, cancelled) {
    if (!gesture || gesture.id !== event.pointerId) return;
    if (!gesture.dragging && !cancelled) {
      const p = gridPoint(event);
      const key = p && edgeNear(p);
      const part = key && state.fixed.get(key);
      if (part?.type === "switch") toggleSwitch(part.id);
      else if (key && applyTool(key, "tap", gesture.tool)) {
        gesture.changed = true;
        refresh();
      }
    }
    if (gesture.changed) {
      pushUndo(gesture.snap);
      ui.undo.disabled = false;
    }
    gesture = null;
  }

  ui.board.addEventListener("pointerup", (event) => endGesture(event, false));
  ui.board.addEventListener("pointercancel", (event) => endGesture(event, true));
  ui.board.addEventListener("contextmenu", (event) => event.preventDefault());
  ui.board.addEventListener("pointerleave", () => {
    if (state.hoverEdge) {
      state.hoverEdge = null;
      renderOverlay();
    }
  });

  function updateHover(p) {
    const key = edgeNear(p);
    const part = key && state.fixed.get(key);
    const usable = key && (!part || part.type === "switch") ? key : null;
    ui.board.classList.toggle("over-switch", part?.type === "switch");
    if (usable !== state.hoverEdge) {
      state.hoverEdge = usable;
      renderOverlay();
    }
  }

  // ---------- keyboard input ----------

  const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const describeNode = ([x, y]) => `column ${x + 1}, row ${y + 1}`;

  ui.board.addEventListener("keydown", (event) => {
    if (!(event.key in ARROWS)) return;
    event.preventDefault();
    const [dx, dy] = ARROWS[event.key];
    const [x, y] = state.cursor;
    const next = [clamp(x + dx, 0, state.level.cols - 1), clamp(y + dy, 0, state.level.rows - 1)];
    if (next[0] === x && next[1] === y) return;
    if (event.shiftKey) {
      const key = Circuit.edgeBetween([x, y], next);
      const part = state.fixed.get(key);
      if (part?.type === "switch") {
        toggleSwitch(part.id);
      } else {
        const snap = snapshot();
        if (applyTool(key, "drag")) {
          pushUndo(snap);
          refresh();
          const what = state.tool.type === "eraser" ? "Removed" : `${toolLabel(state.tool)} laid`;
          announce(`${what} from ${describeNode([x, y])} to ${describeNode(next)}.`);
        } else if (part) {
          announce(`${part.name} is fixed here.`);
        }
      }
    } else {
      announce(describeNode(next));
    }
    state.cursor = next;
    renderOverlay();
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

  // ---------- drawing the board ----------

  function edgeLine(key) {
    const [[ax, ay], [bx, by]] = Circuit.edgeEnds(key);
    return [px(ax), px(ay), px(bx), px(by)];
  }

  function edgeCentre(key) {
    const [[ax, ay], [bx, by]] = Circuit.edgeEnds(key);
    return { cx: px((ax + bx) / 2), cy: px((ay + by) / 2), vertical: ax === bx };
  }

  const line = (cls, [x1, y1, x2, y2], extra = "") =>
    `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${extra}/>`;

  function renderStatic() {
    const { level } = state;
    const width = (level.cols - 1) * S + 2 * M;
    const height = (level.rows - 1) * S + 2 * M;
    ui.board.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const top = px(-0.5) + 4;
    const roomHeight = level.rows * S - 8;
    ui.rooms.innerHTML = level.rooms
      .map((room) => {
        const x = px(room.x0) + 4;
        const w = (room.x1 - room.x0) * S - 8;
        const rect = `x="${x}" y="${top}" width="${w}" height="${roomHeight}" rx="14"`;
        return `<rect class="room-bg" ${rect}/><rect class="room-light" ${rect} opacity="0"/><text class="room-name" x="${x + 14}" y="${top + 24}">${esc(room.name)}</text>`;
      })
      .join("");
    state.roomLights = [...ui.rooms.querySelectorAll(".room-light")];
    updateLabelScale(false);

    let dots = "";
    for (let y = 0; y < level.rows; y++) {
      for (let x = 0; x < level.cols; x++) dots += `<circle class="dot" cx="${px(x)}" cy="${px(y)}" r="2.6"/>`;
    }
    ui.grid.innerHTML = dots;
  }

  // Wide boards get shrunk to fit the screen; grow the text so it stays readable.
  function updateLabelScale(rerender = true) {
    const width = ui.board.viewBox.baseVal?.width;
    if (!width || !ui.board.clientWidth) return;
    // Aim for at least ~13px text on screen.
    const scale = clamp(1.05 / (ui.board.clientWidth / width), 1, 1.45);
    if (Math.abs(scale - state.labelScale) < 0.02) return;
    state.labelScale = scale;
    ui.board.style.setProperty("--ls", scale.toFixed(3));
    if (rerender && state.sim) renderParts();
  }

  new ResizeObserver(() => updateLabelScale()).observe(ui.board);

  function renderBoard() {
    renderWires();
    renderFlow();
    renderParts();
    renderRoomLights();
    renderOverlay();
  }

  function renderWires() {
    let html = "";
    for (const [key, piece] of state.board) {
      if (piece.type === "wire") html += line("wire", edgeLine(key));
      if (piece.type === "thick") html += line("thick-outer", edgeLine(key)) + line("thick-inner", edgeLine(key));
    }
    // Junction dots where three or more things meet.
    const count = new Map();
    for (const key of [...state.board.keys(), ...state.fixed.keys()]) {
      for (const [x, y] of Circuit.edgeEnds(key)) count.set(`${x},${y}`, (count.get(`${x},${y}`) ?? 0) + 1);
    }
    for (const [node, n] of count) {
      if (n < 3) continue;
      const [x, y] = node.split(",").map(Number);
      html += `<circle class="junction" cx="${px(x)}" cy="${px(y)}" r="6.5"/>`;
    }
    ui.wires.innerHTML = html;
  }

  // Moving dots show conventional current (+ to −); faster dots mean more current.
  function renderFlow() {
    let html = "";
    for (const [key, piece] of state.board) {
      if (piece.type === "resistor") continue;
      const { I } = state.sim.edges.get(key);
      if (Math.abs(I) < 0.001) continue;
      let coords = edgeLine(key);
      if (I < 0) coords = [coords[2], coords[3], coords[0], coords[1]];
      const speed = 14 + 60 * Math.min(1, Math.sqrt(Math.abs(I) / 3));
      html += line("flow", coords, ` data-speed="${speed.toFixed(1)}"`);
    }
    ui.flow.innerHTML = html;
    state.flows = [...ui.flow.children].map((el) => ({ el, speed: Number(el.dataset.speed) }));
  }

  function animateFlow(time) {
    if (!reducedMotion.matches) {
      for (const { el, speed } of state.flows) el.style.strokeDashoffset = String(-(((time / 1000) * speed) % FLOW_PERIOD));
    }
    requestAnimationFrame(animateFlow);
  }

  const lead = (x1, x2) => `<line class="lead" x1="${x1}" y1="0" x2="${x2}" y2="0"/>`;
  const plusSign = (x, y) => `<path class="plus-sign" d="M${x - 5} ${y} h10 M${x} ${y - 5} v10"/>`;

  function lampSymbol(load) {
    const lit = Math.min(1, load.brightness);
    const blown = load.state === "blown" ? " blown" : "";
    const glow =
      lit > 0.02 ? `<circle class="glow" r="${(18 + 26 * Math.min(1.3, load.brightness)).toFixed(1)}" opacity="${lit.toFixed(2)}"/>` : "";
    const fill = lit > 0.02 ? `rgba(255, 214, 102, ${(0.25 + 0.75 * lit).toFixed(2)})` : "var(--board)";
    return `${glow}${lead(-32, -13)}${lead(13, 32)}<circle class="lamp-body${blown}" r="13" style="fill: ${fill}"/><path class="lamp-x${blown}" d="M-9.2 -9.2 L9.2 9.2 M-9.2 9.2 L9.2 -9.2"/>`;
  }

  // Long plate is +. Drawn with + at end a, mirrored when + is at end b.
  // The + sign goes on the side away from the label so it doesn't read as part of the name.
  function batterySymbol(part) {
    const plusY = part.label === "left" || part.label === "below" ? -19 : 19;
    const cell = `${lead(-32, -6)}${lead(6, 32)}<line class="plate-long" x1="-6" y1="-17" x2="-6" y2="17"/><line class="plate-short" x1="6" y1="-9" x2="6" y2="9"/>${plusSign(-19, plusY)}`;
    return part.plus === "b" ? `<g transform="scale(-1 1)">${cell}</g>` : cell;
  }

  function switchSymbol(closed) {
    const blade = closed
      ? `<line class="blade" x1="-14" y1="0" x2="14" y2="0"/>`
      : `<line class="blade" x1="-14" y1="0" x2="10" y2="-17"/>`;
    return `${lead(-32, -14)}${lead(14, 32)}${blade}<circle class="terminal" cx="-14" cy="0" r="4"/><circle class="terminal" cx="14" cy="0" r="4"/>`;
  }

  function boxSymbol(part, load) {
    const cls = load.state === "good" ? " good" : load.state === "blown" ? " blown" : "";
    const plus = part.type === "device" ? plusSign(part.plus === "a" ? -25 : 25, 23) : "";
    return `${lead(-32, -18)}${lead(18, 32)}<rect class="box${cls}" x="-18" y="-15" width="36" height="30" rx="7"/>${plus}`;
  }

  const resistorSymbol = () =>
    `${lead(-32, -17)}${lead(17, 32)}<rect class="res-body" x="-17" y="-8" width="34" height="16" rx="2"/>`;

  function placed(key, inner, cls = "") {
    const { cx, cy, vertical } = edgeCentre(key);
    return `<g${cls ? ` class="${cls}"` : ""} transform="translate(${cx} ${cy}) rotate(${vertical ? 90 : 0})">${inner}</g>`;
  }

  function renderParts() {
    const { sim } = state;
    let parts = "";
    let labels = "";
    for (const [key, piece] of state.board) {
      if (piece.type !== "resistor") continue;
      parts += placed(key, resistorSymbol());
      labels += resistorLabel(key, piece);
    }
    for (const part of state.level.parts) {
      const load = sim.loads[part.id];
      if (part.type === "lamp") parts += placed(part.edge, lampSymbol(load));
      else if (part.type === "battery") parts += placed(part.edge, batterySymbol(part), sim.batteries[part.id].fuseBlown ? "dead" : "");
      else if (part.type === "switch") parts += placed(part.edge, switchSymbol(state.switches[part.id]));
      else {
        parts += placed(part.edge, boxSymbol(part, load));
        const { cx, cy } = edgeCentre(part.edge);
        labels += `<text class="part-icon${load.state === "good" ? "" : " off"}" x="${cx}" y="${cy}" aria-hidden="true">${ICONS[part.icon] ?? "⚙️"}</text>`;
      }
      labels += partLabel(part, partLines(part));
    }
    ui.parts.innerHTML = parts;
    ui.labels.innerHTML = labels;
  }

  const STATUS_WORDS = {
    lamp: { low: ["warn", "dim"], over: ["warn", "too bright!"], blown: ["bad", "blown!"] },
    appliance: { good: ["ok", "✓ working"], low: ["warn", "not enough power"], over: ["warn", "too much voltage!"], blown: ["bad", "burnt out!"] },
    device: { good: ["ok", "✓ working"], reversed: ["bad", "backwards!"], blown: ["bad", "damaged!"] },
  };

  function partLines(part) {
    const { sim } = state;
    if (part.type === "battery") {
      const battery = sim.batteries[part.id];
      const lines = [
        ["name", part.name],
        ["rating", `${part.emf} V · fuse ${Circuit.fmtRating(part.fuse)}`],
      ];
      if (battery.fuseBlown) lines.push(["bad", "fuse blown!"]);
      else if (state.numbers) lines.push(["reading", `giving ${Circuit.fmtA(battery.current)}`]);
      return lines;
    }
    if (part.type === "switch") {
      const on = state.switches[part.id];
      return [
        ["name", part.name],
        [on ? "ok" : "rating", `${on ? "ON" : "OFF"} · tap to flip`],
      ];
    }
    const load = sim.loads[part.id];
    const lines = [["name", part.name]];
    if (part.type === "device") {
      lines.push(["rating", `needs ${part.vMin}–${part.vMax} V`]);
      lines.push(["reading", `getting ${Circuit.fmtV(load.V)}`]);
      if (state.numbers) lines.push(["reading", `${Circuit.fmtA(load.I)}`]);
    } else {
      lines.push(["rating", `${part.vRated} V, ${part.pRated} W`]);
      if (state.numbers) lines.push(["reading", `${Circuit.fmtV(load.V)} · ${Circuit.fmtA(load.I)}`]);
    }
    const status = STATUS_WORDS[part.type][load.state];
    if (status) lines.push(status);
    return lines;
  }

  function partLabel(part, lines) {
    const { cx, cy, vertical } = edgeCentre(part.edge);
    const side = part.label ?? (vertical ? "right" : "above");
    const gap = part.type === "appliance" || part.type === "device" ? 28 : 24;
    const lineHeight = 15 * state.labelScale;
    const block = (lines.length - 1) * lineHeight;
    let x = cx;
    let y;
    let anchor = "middle";
    if (side === "right" || side === "left") {
      x = side === "right" ? cx + gap : cx - gap;
      anchor = side === "right" ? "start" : "end";
      y = cy - block / 2 + 4;
    } else if (side === "above") {
      // A vertical part's ends are on the grid rows above and below it, so clear those.
      y = vertical ? cy - S / 2 - 16 - block : cy - gap - block;
    } else {
      y = vertical ? cy + S / 2 + 24 : cy + gap + 10;
    }
    const spans = lines
      .map(([cls, text], i) => `<tspan class="${cls}" x="${x}"${i ? ` dy="${lineHeight}"` : ""}>${esc(text)}</tspan>`)
      .join("");
    return `<text class="label" x="${x}" y="${y}" text-anchor="${anchor}">${spans}</text>`;
  }

  function resistorLabel(key, piece) {
    const { cx, cy, vertical } = edgeCentre(key);
    const reading = state.numbers ? Circuit.fmtV(Math.abs(state.sim.edges.get(key).V)) : null;
    const x = vertical ? cx + 15 : cx;
    const y = vertical ? cy + (reading ? -3 : 4) : cy - (reading ? 28 : 14);
    const anchor = vertical ? "start" : "middle";
    const extra = reading ? `<tspan class="reading" x="${x}" dy="${14 * state.labelScale}">${reading}</tspan>` : "";
    return `<text class="res-label" x="${x}" y="${y}" text-anchor="${anchor}">${piece.value} Ω${extra}</text>`;
  }

  function renderRoomLights() {
    state.level.rooms.forEach((room, i) => {
      const glow = Math.max(0, ...(room.lights ?? []).map((id) => Math.min(1, state.sim.loads[id].brightness)));
      state.roomLights[i].setAttribute("opacity", glow.toFixed(2));
    });
  }

  function renderOverlay() {
    let html = "";
    if (state.hoverEdge && !gesture) {
      html += line(`hover-edge${state.tool.type === "eraser" ? " erase" : ""}`, edgeLine(state.hoverEdge));
    }
    if (state.keyboardCursor) {
      const [x, y] = state.cursor;
      html += `<circle class="cursor-ring" cx="${px(x)}" cy="${px(y)}" r="13"/>`;
    }
    ui.overlay.innerHTML = html;
  }

  // ---------- panel ----------

  function toolLabel(tool) {
    if (tool.type === "eraser") return "Eraser";
    if (tool.type === "resistor") return `${tool.value} Ω resistor`;
    return tool.label ?? (tool.type === "thick" ? "Thick cable" : "Wire");
  }

  function toolIcon(tool) {
    const svg = (inner) => `<svg width="34" height="22" viewBox="0 0 34 22" aria-hidden="true">${inner}</svg>`;
    const ink = 'stroke="var(--symbol)" stroke-width="2.5"';
    switch (tool.type) {
      case "wire":
        return svg(`<line x1="4" y1="11" x2="30" y2="11" stroke="var(--copper)" stroke-width="5" stroke-linecap="round"/>`);
      case "thick":
        return svg(
          `<line x1="5" y1="11" x2="29" y2="11" stroke="var(--copper-dark)" stroke-width="11" stroke-linecap="round"/><line x1="5" y1="11" x2="29" y2="11" stroke="var(--copper)" stroke-width="5" stroke-linecap="round"/>`
        );
      case "resistor":
        return svg(`<line x1="1" y1="11" x2="8" y2="11" ${ink}/><rect x="8" y="5" width="18" height="12" rx="2" fill="none" ${ink}/><line x1="26" y1="11" x2="33" y2="11" ${ink}/>`);
      default:
        return svg(
          `<g transform="rotate(-25 17 11)"><rect x="5" y="5" width="24" height="12" rx="3" fill="#ff9aa2"/><rect x="5" y="5" width="9" height="12" rx="3" fill="#e9eef8"/></g>`
        );
    }
  }

  function renderTools() {
    ui.tools.innerHTML = tools()
      .map((tool, i) => {
        const cost = tool.cost !== undefined ? `<span class="tool-cost">${money(tool.cost)}</span>` : "";
        // Resistor buttons show just the value next to the resistor icon to keep the toolbar short.
        const shown = tool.type === "resistor" ? `${tool.value} Ω` : toolLabel(tool);
        const spoken = tool.type === "resistor" ? `${tool.value} ohm resistor` : toolLabel(tool);
        const costSpoken = tool.cost !== undefined ? `, costs £${tool.cost}` : "";
        return `<button type="button" class="tool" data-index="${i}" aria-pressed="${tool === state.tool}" aria-label="${esc(spoken + costSpoken)}" title="${esc(toolLabel(tool))} (key ${i + 1})">${toolIcon(tool)}<span>${esc(shown)}</span>${cost}</button>`;
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
    document.title = `${level.title} · Light It Up`;
    renderHints();
  }

  function renderHints() {
    const { level, hintsShown } = state;
    ui.hints.innerHTML = level.hints.slice(0, hintsShown).map((hint) => `<li>${esc(hint)}</li>`).join("");
    ui.hintButton.hidden = hintsShown >= level.hints.length;
    ui.hintButton.textContent = hintsShown ? "Show another hint" : "Show a hint";
  }

  function renderSwitches() {
    const switches = state.level.parts.filter((part) => part.type === "switch");
    ui.switchCard.hidden = switches.length === 0;
    ui.switches.innerHTML = switches
      .map((part) => {
        const on = !!state.switches[part.id];
        return `<button type="button" class="switch-btn" data-id="${part.id}" aria-pressed="${on}"><span>${esc(part.name)}</span><span class="state">${on ? "ON" : "OFF"}</span></button>`;
      })
      .join("");
  }

  function expectationText(part, want) {
    if (want === "off") return `${part.name} off`;
    if (part.type === "lamp") return `${part.name} lit`;
    if (part.type === "device") return `${part.name} gets ${part.vMin}–${part.vMax} V`;
    return `${part.name} working`;
  }

  const SHORT_REASON = {
    off: "off",
    low: "not enough voltage",
    over: "too much voltage",
    blown: "blown",
    reversed: "backwards",
    good: "it's on",
  };

  const checkItem = (ok, text, why = "") =>
    `<li class="${ok ? "ok" : "bad"}"><span class="mark" aria-hidden="true">${ok ? "✓" : "✗"}</span><span>${esc(text)}${
      why ? ` <span class="why">(${esc(why)})</span>` : ""
    }<span class="sr-only">${ok ? ", done" : ", not yet"}</span></span></li>`;

  function renderGoals() {
    const { evaluation, level } = state;
    let html = '<ul class="checks">';
    for (const result of evaluation.results) {
      if (result.test.label) html += `<li class="test-label">${esc(result.test.label)}</li>`;
      for (const check of result.checks) {
        const why = check.ok ? "" : check.part.type === "lamp" && check.got === "low" ? "too dim" : SHORT_REASON[check.got];
        html += checkItem(check.ok, expectationText(check.part, check.want), why);
      }
    }
    const fusesOk = evaluation.results.every((r) => r.fusesOk);
    if (!fusesOk) html += checkItem(false, "No fuse blown");
    if (level.separate) html += checkItem(evaluation.results.every((r) => r.sim.joined.length === 0), "Circuits kept separate");
    ui.goals.innerHTML = `${html}</ul>`;
  }

  function renderBudget() {
    const { level, evaluation } = state;
    const cost = evaluation.cost;
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
    const issues = Circuit.problems(state.level, state.sim, state.expect);
    let text = "";
    let cls = "";
    if (state.board.size === 0) {
      text = "Drag along the grid to lay wire. Tap a piece to remove it, or use the eraser.";
    } else if (issues.length) {
      text = issues[0];
      cls = "bad";
    } else if (state.evaluation.passed) {
      text = "Everything works! Press “Check my circuit” to see your stars.";
      cls = "good";
    } else {
      text = "Working with the switches as they are now. Flip them to test the other way.";
      cls = "good";
    }
    ui.status.textContent = text;
    ui.status.className = `status ${cls}`;
  }

  // ---------- checking and levels ----------

  function check() {
    const { evaluation, level } = state;
    if (!evaluation.passed) {
      const failing = evaluation.results.find((r) => !r.ok);
      const issue = Circuit.problems(level, failing.sim, failing.test.expect)[0] ?? "Some goals aren't met yet.";
      ui.status.textContent = `Not yet. ${failing.test.label ? `${failing.test.label}: ` : ""}${issue}`;
      ui.status.className = "status bad";
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
  ui.switches.addEventListener("click", (event) => {
    const button = event.target.closest(".switch-btn");
    if (button) toggleSwitch(button.dataset.id);
  });
  ui.undo.addEventListener("click", undo);
  ui.clear.addEventListener("click", clearBoard);
  ui.numbers.addEventListener("change", () => {
    state.numbers = ui.numbers.checked;
    renderParts();
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
  requestAnimationFrame(animateFlow);
})();
