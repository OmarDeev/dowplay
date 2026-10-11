"use strict";
// Grid Manager: the page. Draws the town map and the power chart, lets players build with
// mouse, touch or keyboard, re-runs the simulation after every change, and plays the day.

(() => {
  const T = 60; // SVG units per map square
  const SKY = 56; // height of the sky strip above the map
  const STORE_KEY = "gridManager.v1";
  const RUN_SECONDS = 8; // "Run the day" takes this long, however many days there are
  const REMOVE = "remove";
  const EPS = Grid.EPS;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Chart layout, in SVG units.
  const CW = 720; // chart width
  const CL = 46; // left margin, for the MW scale
  const CR = 12;
  const CTOP = 24; // room for day names
  const PH = 150; // height of the power plot
  const AXIS = 22; // hour labels
  const STRIP = 26; // storage strips
  const LANE = 32; // flexible-job lanes
  const PW = CW - CL - CR;
  const BADGE_MAX = 1.25; // how far map badges may grow on small screens
  const JOB_MAX = 1.3; // ...and the labels on flexible jobs

  const $ = (id) => document.getElementById(id);
  const ui = {
    play: document.querySelector(".play"),
    stage: $("stage"),
    board: $("board"),
    sky: $("sky"),
    terrain: $("terrain"),
    items: $("items"),
    shade: $("shade"),
    lights: $("lights"),
    overlay: $("overlay"),
    chart: $("chart"),
    chartBody: $("chartBody"),
    readout: $("readout"),
    status: $("status"),
    announcer: $("announcer"),
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
    goals: $("goals"),
    goalsCard: $("goalsCard"),
    stats: $("stats"),
    cost: $("cost"),
    meterFill: $("meterFill"),
    meterPar: $("meterPar"),
    budgetNote: $("budgetNote"),
    run: $("runButton"),
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

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const money = (n) => `£${n}`;
  const mw = (v) => (Math.abs(v) < 0.05 ? "0" : v.toFixed(1));
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const STAR_PATH = "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z";
  const starsHtml = (n) =>
    [0, 1, 2].map((i) => `<svg class="star${i < n ? "" : " empty"}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`).join("");

  // A steady pseudo-random number in [0, 1) for each square, so towns look the same every time.
  const hash = (r, c, k = 0) => {
    const x = Math.sin(r * 127.1 + c * 311.7 + k * 74.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const rgb = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const mix = (a, b, t) => {
    const [pa, pb] = [rgb(a), rgb(b)];
    return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * clamp(t, 0, 1)).toString(16).padStart(2, "0")).join("")}`;
  };

  // ---------- time ----------

  const pad = (n) => String(n).padStart(2, "0");
  const multiDay = () => state.level.days.length > 1;
  const dayOf = (h) => state.level.days[clamp(Math.floor(h / 24), 0, state.level.days.length - 1)];

  // "18:00", or "Tue 18:00" when the level has several days.
  function hourName(h) {
    if (h >= Grid.periodHours(state.level)) return "midnight";
    return multiDay() ? `${dayOf(h).day} ${pad(h % 24)}:00` : `${pad(h % 24)}:00`;
  }

  const slotName = (h) => `${hourName(h)}–${pad((h + 1) % 24)}:00`;

  // When a blackout happens: "at 18:00", "from 17:00 to 20:00" or "all day".
  function whenText({ from, to }) {
    if (from === 0 && to === Grid.periodHours(state.level)) return multiDay() ? "the whole time" : "all day";
    return to - from > 1 ? `from ${hourName(from)} to ${hourName(to)}` : `at ${hourName(from)}`;
  }

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
    tiles: new Map(), // "r,c" -> item
    flex: {}, // job id -> start hour
    tool: "solar",
    undo: [],
    hintsShown: 0,
    cursor: [0, 0],
    keyboardCursor: false,
    hover: null, // [r, c] under the mouse
    hour: 0, // the hour shown on the map and highlighted on the chart
    frac: 0.5, // how far through that hour (moves during a run)
    ymax: 10,
    ratio: 0, // width ÷ height of the map and chart together
    evaluation: null,
    run: null, // the day being played
    lastRun: null,
    dragJob: null,
    labelScale: 1,
    chartScale: 1,
    angles: new Map(), // turbine blade angles, so they keep turning smoothly
  };

  const tools = () => [...Grid.ITEM_ORDER.filter((item) => state.level.items.includes(item)), REMOVE];
  const design = () => ({ tiles: state.tiles, flex: state.flex });
  const cols = () => state.level.map[0].length;
  const rows = () => state.level.map.length;
  const who = () => state.level.who ?? "town";
  // "both days", "all 3 days"
  const allDays = () => (state.level.days.length === 2 ? "both days" : `all ${state.level.days.length} days`);
  const runLabel = () => (multiDay() ? `Run ${allDays()}` : "Run the day");

  function startLevel(index) {
    stopRun();
    const level = LEVELS[index];
    Object.assign(state, {
      index,
      level,
      tool: level.items[0],
      undo: [],
      hintsShown: 0,
      hover: null,
      lastRun: null,
      frac: 0.5,
    });
    restoreDesign(level);
    state.cursor = firstBuildable(level);
    const peak = Math.max(...level.days.flatMap((d) => d.demand)) + (level.flex ?? []).reduce((s, j) => s + j.power, 0);
    const top = peak * 1.35;
    const step = top <= 12 ? 2 : 5;
    state.ymax = Math.ceil(top / step) * step;
    state.evaluation = Grid.evaluate(level, design());
    state.hour = defaultHour();
    progress.last = index;
    renderTerrain();
    renderMission();
    renderTools();
    sizeStage();
    refresh();
    updateLabelScale();
  }

  function restoreDesign(level) {
    const saved = progress.designs[level.id];
    state.tiles = new Map();
    for (const [key, item] of Array.isArray(saved?.tiles) ? saved.tiles : []) {
      const [r, c] = Grid.parseKey(key);
      if (Grid.ITEMS[item] && !Grid.placeProblem(level, r, c, item)) state.tiles.set(key, item);
    }
    state.flex = Grid.flexStarts(level, { flex: saved?.flex });
  }

  function firstBuildable(level) {
    for (let r = 0; r < level.map.length; r++) {
      for (let c = 0; c < level.map[r].length; c++) if (!Grid.placeProblem(level, r, c, level.items[0])) return [r, c];
    }
    return [0, 0];
  }

  // Start by showing the first blackout, or else the busiest hour.
  function defaultHour() {
    const { sim, blackouts } = state.evaluation;
    if (blackouts.length) return blackouts[0].from;
    return sim.demand.indexOf(Math.max(...sim.demand));
  }

  function refresh() {
    state.evaluation = Grid.evaluate(state.level, design());
    renderHour();
    renderGoals();
    renderBudget();
    renderStatus();
    ui.undo.disabled = state.undo.length === 0 || !!state.run;
    ui.clear.disabled = state.tiles.size === 0 || !!state.run;
    progress.designs[state.level.id] = { tiles: [...state.tiles], flex: { ...state.flex } };
    saveProgress();
  }

  function renderHour() {
    renderSky();
    renderItems();
    renderOverlay();
    renderChart();
    renderReadout();
  }

  function setHour(h) {
    h = clamp(h, 0, Grid.periodHours(state.level) - 1);
    if (h === state.hour && state.frac === 0.5) return;
    state.hour = h;
    state.frac = 0.5;
    renderHour();
  }

  // ---------- editing ----------

  const snapshot = () => ({ tiles: [...state.tiles], flex: { ...state.flex } });

  function commit(before) {
    state.undo.push(before);
    if (state.undo.length > 200) state.undo.shift();
    state.lastRun = null;
    refresh();
  }

  function undo() {
    if (state.run) return;
    const snap = state.undo.pop();
    if (!snap) return;
    state.tiles = new Map(snap.tiles);
    state.flex = { ...snap.flex };
    state.lastRun = null;
    refresh();
    announce("Undone.");
  }

  function clearDesign() {
    if (!state.tiles.size || state.run) return;
    const before = snapshot();
    state.tiles.clear();
    commit(before);
    announce("Everything removed. Press Undo to bring it back.");
  }

  // Builds the chosen machine on a square ("place") or empties it ("remove").
  // Returns true if anything changed. `loud` explains why something can't be built.
  function applyTile([r, c], mode, loud) {
    const key = Grid.tileKey(r, c);
    const current = state.tiles.get(key);
    if (mode === "remove") {
      if (!current) return false;
      state.tiles.delete(key);
      return true;
    }
    const item = state.tool;
    if (current === item) return false;
    const problem = Grid.placeProblem(state.level, r, c, item);
    if (problem) {
      if (loud) say(Grid.placementText(problem, item), "bad");
      return false;
    }
    state.tiles.set(key, item);
    return true;
  }

  function selectTool(tool) {
    state.tool = tool;
    for (const button of ui.tools.querySelectorAll(".tool")) button.setAttribute("aria-pressed", String(button.dataset.tool === tool));
    renderOverlay();
  }

  // ---------- pointer input on the map (mouse, pen and touch) ----------

  function svgPoint(svg, event) {
    const ctm = svg.getScreenCTM();
    return ctm ? new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse()) : null;
  }

  function tileAt(event) {
    const p = svgPoint(ui.board, event);
    if (!p) return null;
    const c = Math.floor(p.x / T);
    const r = Math.floor((p.y - SKY) / T);
    return r >= 0 && r < rows() && c >= 0 && c < cols() ? [r, c] : null;
  }

  let gesture = null;

  ui.board.addEventListener("pointerdown", (event) => {
    if (state.run || (event.button !== 0 && event.button !== 2)) return;
    const tile = tileAt(event);
    if (!tile) return;
    event.preventDefault();
    ui.board.setPointerCapture(event.pointerId);
    const key = Grid.tileKey(...tile);
    // Tapping a square that already has the chosen machine takes it away again.
    const removing = event.button === 2 || state.tool === REMOVE || state.tiles.get(key) === state.tool;
    gesture = { id: event.pointerId, mode: removing ? "remove" : "place", snap: snapshot(), last: key, changed: false };
    state.hover = null;
    if (applyTile(tile, gesture.mode, true)) {
      gesture.changed = true;
      refresh();
    } else {
      renderOverlay();
    }
  });

  ui.board.addEventListener("pointermove", (event) => {
    const tile = tileAt(event);
    if (!gesture || gesture.id !== event.pointerId) {
      if (event.pointerType === "mouse" && !state.run) setHover(tile);
      return;
    }
    if (!tile) return;
    const key = Grid.tileKey(...tile);
    if (key === gesture.last) return;
    gesture.last = key;
    // Dragging paints (or clears) every square the pointer passes over.
    if (applyTile(tile, gesture.mode, false)) {
      gesture.changed = true;
      refresh();
    }
  });

  function endGesture(event) {
    if (!gesture || gesture.id !== event.pointerId) return;
    const g = gesture;
    gesture = null;
    if (g.changed) commit(g.snap);
  }

  ui.board.addEventListener("pointerup", endGesture);
  ui.board.addEventListener("pointercancel", endGesture);
  ui.board.addEventListener("contextmenu", (event) => event.preventDefault());
  ui.board.addEventListener("pointerleave", () => setHover(null));

  function setHover(tile) {
    if (String(tile) === String(state.hover)) return;
    state.hover = tile;
    renderOverlay();
  }

  // ---------- keyboard input on the map ----------

  const ARROWS = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };

  function describeTile([r, c]) {
    const terrain = Grid.terrainAt(state.level, r, c);
    const item = state.tiles.get(Grid.tileKey(r, c));
    let text = `Row ${r + 1}, column ${c + 1}: ${terrain.name}`;
    if (item) text += `, with a ${Grid.ITEMS[item].name.toLowerCase()}`;
    const tool = state.tool;
    if (tool !== REMOVE && tool !== item) {
      const problem = Grid.placeProblem(state.level, r, c, tool);
      if (problem) text += `. You can't build a ${Grid.ITEMS[tool].name.toLowerCase()} here`;
      else if (tool === "solar" || tool === "wind") text += `. ${tool === "solar" ? "Sun" : "Wind"} here: ${Math.round(Grid.rating(terrain, tool) * 100)}%`;
    }
    return `${text}.`;
  }

  ui.board.addEventListener("keydown", (event) => {
    if (state.run) return;
    const [r, c] = state.cursor;
    if (event.key in ARROWS) {
      event.preventDefault();
      const [dr, dc] = ARROWS[event.key];
      state.cursor = [clamp(r + dr, 0, rows() - 1), clamp(c + dc, 0, cols() - 1)];
      renderOverlay();
      announce(describeTile(state.cursor));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const current = state.tiles.get(Grid.tileKey(r, c));
      const mode = state.tool === REMOVE || current === state.tool ? "remove" : "place";
      const before = snapshot();
      if (applyTile(state.cursor, mode, true)) {
        commit(before);
        announce(mode === "remove" ? `${Grid.ITEMS[current].name} removed.` : `${Grid.ITEMS[state.tool].name} built.`);
      }
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      const current = state.tiles.get(Grid.tileKey(r, c));
      const before = snapshot();
      if (applyTile(state.cursor, "remove", false)) {
        commit(before);
        announce(`${Grid.ITEMS[current].name} removed.`);
      }
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
    else if (event.key.toLowerCase() === "r") selectTool(REMOVE);
  });

  // ---------- the chart: choosing an hour and moving flexible jobs ----------

  const chartHours = () => Grid.periodHours(state.level);
  const xOf = (h) => CL + (h * PW) / chartHours();
  const hourAt = (p) => ((p.x - CL) / PW) * chartHours();

  let chartGesture = null;

  ui.chart.addEventListener("pointerdown", (event) => {
    if (state.run || event.button !== 0) return;
    const p = svgPoint(ui.chart, event);
    if (!p) return;
    event.preventDefault();
    ui.chart.setPointerCapture(event.pointerId);
    const jobEl = event.target.closest?.(".job");
    if (jobEl) {
      const id = jobEl.dataset.job;
      chartGesture = { id: event.pointerId, job: id, offset: hourAt(p) - state.flex[id], snap: snapshot(), changed: false };
      state.dragJob = id;
      renderChart();
    } else {
      chartGesture = { id: event.pointerId };
      setHour(Math.floor(hourAt(p)));
    }
  });

  ui.chart.addEventListener("pointermove", (event) => {
    const p = svgPoint(ui.chart, event);
    if (!p) return;
    if (!chartGesture || chartGesture.id !== event.pointerId) {
      // A mouse just passing over the chart shows that hour too.
      if (event.pointerType === "mouse" && !state.run && !event.buttons && p.x >= CL && p.x <= CL + PW) setHour(Math.floor(hourAt(p)));
      return;
    }
    if (chartGesture.job) {
      const job = state.level.flex.find((j) => j.id === chartGesture.job);
      const start = clamp(Math.round(hourAt(p) - chartGesture.offset), job.earliest, job.latest - job.hours);
      if (start !== state.flex[job.id]) {
        state.flex[job.id] = start;
        chartGesture.changed = true;
        refresh();
      }
    } else {
      setHour(Math.floor(hourAt(p)));
    }
  });

  function endChartGesture(event) {
    if (!chartGesture || chartGesture.id !== event.pointerId) return;
    const g = chartGesture;
    chartGesture = null;
    if (!g.job) return;
    state.dragJob = null;
    if (g.changed) {
      commit(g.snap);
      announce(jobText(state.level.flex.find((j) => j.id === g.job)));
    } else {
      renderChart();
    }
  }

  ui.chart.addEventListener("pointerup", endChartGesture);
  ui.chart.addEventListener("pointercancel", endChartGesture);

  const jobText = (job) => `${job.name}: ${hourName(state.flex[job.id])} to ${hourName(state.flex[job.id] + job.hours)}.`;

  ui.chart.addEventListener("keydown", (event) => {
    if (state.run) return;
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    const jobEl = event.target.closest?.(".job");
    if (jobEl && step) {
      event.preventDefault();
      const job = state.level.flex.find((j) => j.id === jobEl.dataset.job);
      const start = clamp(state.flex[job.id] + step, job.earliest, job.latest - job.hours);
      if (start === state.flex[job.id]) return;
      const before = snapshot();
      state.flex[job.id] = start;
      commit(before);
      announce(jobText(job));
      return;
    }
    if (step || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const n = chartHours();
      setHour(event.key === "Home" ? 0 : event.key === "End" ? n - 1 : state.hour + step);
      announce(readoutText());
    }
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

  // ---------- drawing the map ----------

  // Shapes for every square that never change during a level: grass, hills, houses...
  function renderTerrain() {
    const { level } = state;
    const width = cols() * T;
    const height = SKY + rows() * T;
    ui.board.setAttribute("viewBox", `0 0 ${width} ${height}`);
    let html = "";
    level.map.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        html += terrainSvg(ch, r, c, c * T, SKY + r * T);
      });
    });
    const school = schoolBox();
    if (school) html += schoolSvg(school);
    let grid = "";
    for (let c = 1; c < cols(); c++) grid += `M${c * T} ${SKY}V${height}`;
    for (let r = 1; r < rows(); r++) grid += `M0 ${SKY + r * T}H${width}`;
    html += `<path class="grid-line" d="${grid}"/>`;
    ui.terrain.innerHTML = html;
    ui.shade.setAttribute("y", SKY);
    ui.shade.setAttribute("width", width);
    ui.shade.setAttribute("height", rows() * T);
  }

  const rect = (x, y, w, h, fill, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`;

  function terrainSvg(ch, r, c, x, y) {
    const v = hash(r, c);
    switch (ch) {
      case "f": {
        let s = rect(x, y, T, T, mix("#5c9a4c", "#66a554", v));
        for (let i = 0; i < 4; i++) s += `<path d="M${x + 7} ${y + 10 + i * 13}h${46 - (i % 2) * 8}" stroke="#74b462" stroke-width="3" stroke-linecap="round" opacity="0.6"/>`;
        return s;
      }
      case "h":
        return (
          rect(x, y, T, T, "#4b8541") +
          `<ellipse cx="${x + 30}" cy="${y + 32}" rx="27" ry="23" fill="#57934c"/><ellipse cx="${x + 30}" cy="${y + 30}" rx="18" ry="14" fill="#64a258"/><ellipse cx="${x + 30}" cy="${y + 28}" rx="9" ry="6" fill="#72b066"/>`
        );
      case "v": {
        let s = rect(x, y, T, T, "#3d6847");
        for (let i = 0; i < 4; i++) s += `<path d="M${x + i * 16 - 4} ${y + T}l18 -${T}" stroke="#355d3e" stroke-width="5"/>`;
        return s;
      }
      case "y": {
        let s = rect(x, y, T, T, "#6c737e");
        s += `<path d="M${x + 4} ${y + 20}h52M${x + 4} ${y + 40}h52M${x + 20} ${y + 4}v12M${x + 40} ${y + 4}v12M${x + 20} ${y + 44}v12M${x + 40} ${y + 44}v12" stroke="#858c97" stroke-width="2"/>`;
        return s;
      }
      case "o":
      case "w": {
        let s = rect(x, y, T, T, ch === "o" ? "#1b5781" : "#2a6d9e");
        for (let i = 0; i < 3; i++) {
          const wx = x + 6 + ((v * 30 + i * 19) % 30);
          s += `<path d="M${wx} ${y + 14 + i * 16}q5 -4 10 0t10 0" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="2" stroke-linecap="round"/>`;
        }
        return s;
      }
      case "r":
        return (
          rect(x, y, T, T, "#4b8541") +
          `<rect x="${x + 6}" y="${y + 6}" width="48" height="40" rx="14" fill="#2a6d9e"/><path d="M${x + 14} ${y + 22}q5 -4 10 0t10 0" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2" stroke-linecap="round"/><rect x="${x + 8}" y="${y + 44}" width="44" height="6" rx="2" fill="#c3c9d2"/>`
        );
      case "t":
        return rect(x, y, T, T, "#5a944b") + housesOf(r, c, x, y).map((h) => h.svg).join("");
      case "s":
        return rect(x, y, T, T, "#5a944b");
      case "F": {
        let s = rect(x, y, T, T, "#2c5532");
        for (let i = 0; i < 6; i++) {
          const tx = x + 9 + ((i % 3) * 20 + hash(r, c, i) * 8);
          const ty = y + 12 + Math.floor(i / 3) * 24 + hash(r, c, i + 9) * 8;
          s += `<circle cx="${tx}" cy="${ty}" r="${8 + hash(r, c, i + 3) * 3}" fill="${i % 2 ? "#3a7343" : "#336a3c"}"/>`;
        }
        return s;
      }
      case "P":
        return (
          rect(x, y, T, T, "#6c737e") +
          `<rect x="${x + 6}" y="${y + 26}" width="26" height="24" fill="#c9ced6"/><path d="M${x + 4} ${y + 26}l15 -9 15 9z" fill="#5d7f9e"/><ellipse cx="${x + 44}" cy="${y + 18}" rx="11" ry="4" fill="#74c0fc"/><rect x="${x + 33}" y="${y + 18}" width="22" height="30" fill="#4dabf7"/><ellipse cx="${x + 44}" cy="${y + 48}" rx="11" ry="4" fill="#339af0"/>`
        );
      case "B":
        return (
          rect(x, y, T, T, "#6c737e") +
          `<rect x="${x + 4}" y="${y + 10}" width="52" height="30" fill="#9aa3ae"/><path d="M${x + 2} ${y + 12}h56l-4 -6h-48z" fill="#5f6b7a"/><rect x="${x + 10}" y="${y + 40}" width="40" height="14" rx="4" fill="#40c057"/><rect x="${x + 13}" y="${y + 43}" width="26" height="5" fill="#d0ebff"/>`
        );
      case "K":
        return (
          rect(x, y, T, T, "#6c737e") +
          `<path d="M${x + 4} ${y + 52}V${y + 26}l12 -8v8l12 -8v8l12 -8v8l14 -8V${y + 52}z" fill="#b8bfc9"/><rect x="${x + 46}" y="${y + 4}" width="7" height="22" fill="#868e96"/>`
        );
      default:
        return rect(x, y, T, T, "#5a944b");
    }
  }

  // Two little houses per square. Each window is returned too, so it can light up.
  function housesOf(r, c, x, y) {
    const spots = [
      [x + 5, y + 10],
      [x + 32, y + 32],
    ];
    return spots.map(([hx, hy], i) => {
      const roof = ["#b5523b", "#8f4a34", "#a8643f", "#6f5a8a"][Math.floor(hash(r, c, i + 20) * 4)];
      const wall = ["#efe3cf", "#e3d2b8", "#f2ead8"][Math.floor(hash(r, c, i + 30) * 3)];
      const svg = `<rect x="${hx}" y="${hy + 6}" width="23" height="16" fill="${wall}"/><path d="M${hx - 2} ${hy + 7}l13.5 -9 13.5 9z" fill="${roof}"/>`;
      return { svg, windows: [[hx + 4, hy + 11], [hx + 14, hy + 11]] };
    });
  }

  function schoolBox() {
    let box = null;
    state.level.map.forEach((row, r) =>
      [...row].forEach((ch, c) => {
        if (ch !== "s") return;
        box = box ? { r0: Math.min(box.r0, r), c0: Math.min(box.c0, c), r1: Math.max(box.r1, r), c1: Math.max(box.c1, c) } : { r0: r, c0: c, r1: r, c1: c };
      })
    );
    if (!box) return null;
    const x = box.c0 * T + 8;
    const y = SKY + box.r0 * T + 16;
    const w = (box.c1 - box.c0 + 1) * T - 16;
    const h = (box.r1 - box.r0 + 1) * T - 26;
    const windows = [];
    for (let j = 0; j < 2; j++) for (let i = 0; i < 5; i++) windows.push([x + 8 + i * ((w - 22) / 4), y + 16 + j * 26]);
    return { x, y, w, h, windows };
  }

  function schoolSvg({ x, y, w, h }) {
    return (
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#e2d6c0"/><rect x="${x - 3}" y="${y - 6}" width="${w + 6}" height="8" fill="#8f4a34"/>` +
      `<rect x="${x + w / 2 - 7}" y="${y + h - 18}" width="14" height="18" fill="#6b4a33"/><path d="M${x + w - 10} ${y - 6}v-14" stroke="#ced4da" stroke-width="2"/><path d="M${x + w - 10} ${y - 20}h12l-3 4 3 4h-12z" fill="var(--accent)"/>`
    );
  }

  // Machines and lights for the hour being shown.
  function renderItems() {
    const { level, evaluation } = state;
    const sim = evaluation.sim;
    const h = state.hour;
    const day = dayOf(h);
    const hh = h % 24;
    const t = state.frac;
    const sun = Grid.sunAt(day, hh);
    const wind = Grid.perHour(day.wind, hh);
    const levelAt = (levels, cap) => (cap > 0 ? clamp((levels[h] + (levels[h + 1] - levels[h]) * t) / cap, 0, 1) : 0);
    const battery = levelAt(sim.batteryLevel, sim.battery.cap);
    const hydro = levelAt(sim.hydroLevel, sim.hydro.cap);
    const gasShare = sim.gasPower > 0 ? sim.gas[h] / sim.gasPower : 0;
    let base = "";
    let light = "";
    for (const [key, item] of state.tiles) {
      const [r, c] = Grid.parseKey(key);
      const terrain = Grid.terrainAt(level, r, c);
      const x = c * T;
      const y = SKY + r * T;
      if (item === "solar") base += solarSvg(x, y, sun * terrain.sun);
      else if (item === "wind") base += windSvg(key, x, y, Math.min(1, wind * terrain.wind));
      else if (item === "battery") {
        base += `<rect x="${x + 14}" y="${y + 15}" width="32" height="36" rx="5" fill="#2b2347" stroke="#b197fc" stroke-width="2.5"/><rect x="${x + 24}" y="${y + 10}" width="12" height="6" rx="2" fill="#b197fc"/>`;
        light += gauge(x + 18, y + 19, 24, 28, battery, "#b197fc");
      } else if (item === "hydro") {
        base += `<path d="M${x + 44} ${y + 46}l8 10" stroke="#adb5bd" stroke-width="5" stroke-linecap="round"/><rect x="${x + 2}" y="${y + 40}" width="16" height="16" fill="#dee2e6"/>`;
        light += gauge(x + 4, y + 10, 8, 26, hydro, "#4dabf7");
      } else if (item === "gas") {
        base += `<rect x="${x + 8}" y="${y + 28}" width="34" height="24" fill="#a3aab4"/><path d="M${x + 6} ${y + 28}h38l-5 -6h-28z" fill="#7b838e"/><rect x="${x + 40}" y="${y + 8}" width="9" height="44" fill="#868e96"/>`;
        if (gasShare > 0.01) {
          light += `<rect x="${x + 14}" y="${y + 36}" width="8" height="8" fill="#ff922b"/><rect x="${x + 28}" y="${y + 36}" width="8" height="8" fill="#ff922b"/>`;
          for (let i = 0; i < 3; i++) {
            light += `<circle cx="${x + 45 + i * 3}" cy="${y + 4 - i * 2}" r="${4 + i * 2}" fill="#ced4da" opacity="${(0.35 + 0.5 * gasShare) * (1 - i * 0.25)}"/>`;
          }
        }
      }
    }
    ui.items.innerHTML = base;

    // Houses light up at night if they have power, and go dark in a blackout.
    const darkness = 1 - clamp((Grid.clearSun(day, hh - 0.5 + t) / (day.peak ?? 1)) * 2.5, 0, 1);
    const powered = sim.unmet[h] <= EPS;
    const needs = sim.demand[h] > EPS;
    const windowColour = !needs ? "#2a3140" : !powered ? "#0b0e14" : darkness > 0.45 ? "#ffd84d" : "#b9d4ec";
    const blackout = needs && !powered;
    level.map.forEach((row, r) =>
      [...row].forEach((ch, c) => {
        const x = c * T;
        const y = SKY + r * T;
        if (ch === "t") {
          for (const house of housesOf(r, c, x, y)) for (const [wx, wy] of house.windows) light += rect(wx, wy, 5, 6, windowColour);
          if (blackout) light += `<rect class="blackout-ring" x="${x + 2}" y="${y + 2}" width="${T - 4}" height="${T - 4}" rx="8"/>`;
        }
        const job = (level.flex ?? []).find((j) => j.building === ch);
        if (job) {
          const on = h >= state.flex[job.id] && h < state.flex[job.id] + job.hours;
          if (on) light += `<rect x="${x + 2}" y="${y + 2}" width="${T - 4}" height="${T - 4}" rx="8" fill="none" stroke="var(--accent)" stroke-width="3"/><path d="M${x + 10} ${y + 4}l-6 9h5l-2 7 7 -10h-5z" fill="var(--accent)"/>`;
        }
      })
    );
    const school = schoolBox();
    if (school) {
      for (const [wx, wy] of school.windows) light += rect(wx.toFixed(1), wy, 8, 9, windowColour);
      if (blackout) light += `<rect class="blackout-ring" x="${school.x - 6}" y="${school.y - 12}" width="${school.w + 12}" height="${school.h + 18}" rx="8"/>`;
    }
    ui.lights.innerHTML = light;
    ui.shade.setAttribute("opacity", (0.55 * darkness).toFixed(2));
    spin();
  }

  function gauge(x, y, w, h, share, colour) {
    const fill = h * share;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#151225" opacity="0.8"/><rect x="${x}" y="${(y + h - fill).toFixed(1)}" width="${w}" height="${fill.toFixed(1)}" fill="${colour}"/>`;
  }

  function solarSvg(x, y, output) {
    const panel = mix("#1c3559", "#3f8cf0", output);
    let s = `<rect x="${x + 5}" y="${y + 9}" width="50" height="42" rx="3" fill="#202c40"/>`;
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < 3; i++) {
        const px = x + 8 + i * 15.5;
        const py = y + 12 + j * 19.5;
        s += `<rect x="${px}" y="${py}" width="13.5" height="17" fill="${panel}"/><path d="M${px} ${py + 8.5}h13.5M${px + 6.75} ${py}v17" stroke="#9cc3f5" stroke-width="0.8" opacity="0.5"/>`;
      }
    }
    if (output > 0.05) s += `<path d="M${x + 10} ${y + 46}l30 -34h8l-30 34z" fill="#fff" opacity="${(0.28 * output).toFixed(2)}"/>`;
    return s;
  }

  function windSvg(key, x, y, output) {
    const angle = state.angles.get(key) ?? hash(...Grid.parseKey(key)) * 120;
    const speed = output > 0.01 ? 0.2 + 1.1 * output : 0;
    let blades = "";
    for (const a of [0, 120, 240]) blades += `<path d="M0 0C2.5 -4 2.5 -13 0 -21C-1.2 -13 -1.8 -4 0 0z" fill="#f5f7fa" stroke="#9aa5b5" stroke-width="0.6" transform="rotate(${a})"/>`;
    return (
      `<ellipse cx="${x + 30}" cy="${y + 54}" rx="9" ry="3" fill="rgba(0,0,0,0.25)"/><path d="M${x + 28} ${y + 54}L${x + 29.2} ${y + 24}h1.6L${x + 32} ${y + 54}z" fill="#e9eef6"/>` +
      `<g transform="translate(${x + 30} ${y + 24})"><g class="blades" data-key="${key}" data-speed="${speed.toFixed(3)}" transform="rotate(${angle.toFixed(1)})">${blades}</g><circle r="3" fill="#fff"/></g>`
    );
  }

  // Turbine blades keep turning (faster in stronger wind) unless the reader prefers less motion.
  let spinning = false;
  let spinLast = null;

  function spin() {
    if (spinning || reducedMotion.matches || document.hidden || !ui.items.querySelector(".blades")) return;
    spinning = true;
    spinLast = null;
    requestAnimationFrame(spinFrame);
  }

  function spinFrame(time) {
    const blades = ui.items.querySelectorAll(".blades");
    if (!blades.length || document.hidden || reducedMotion.matches) {
      spinning = false;
      return;
    }
    const dt = spinLast === null ? 0 : Math.min(0.05, (time - spinLast) / 1000);
    spinLast = time;
    for (const b of blades) {
      const angle = ((state.angles.get(b.dataset.key) ?? 0) + Number(b.dataset.speed) * 360 * dt) % 360;
      state.angles.set(b.dataset.key, angle);
      b.setAttribute("transform", `rotate(${angle.toFixed(1)})`);
    }
    requestAnimationFrame(spinFrame);
  }

  document.addEventListener("visibilitychange", spin);

  // The sky: colour, sun or moon, clouds and wind for the moment being shown.
  function renderSky() {
    const width = cols() * T;
    const time = state.hour + state.frac;
    const day = dayOf(state.hour);
    const hh = time - Math.floor(state.hour / 24) * 24;
    const slot = state.hour % 24;
    const height = Grid.clearSun(day, hh - 0.5) / (day.peak ?? 1);
    const cloud = Grid.perHour(day.cloud, slot);
    const wind = Grid.perHour(day.wind, slot);
    const light = Math.sqrt(clamp(height, 0, 1));
    const top = mix("#0b1430", mix("#3a7fc4", "#6f7c8c", cloud), light);
    const bottom = mix("#1c2850", mix("#9ccaf0", "#a9b2bd", cloud), light);
    let html = `<defs><linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>`;
    html += `<rect width="${width}" height="${SKY}" fill="url(#skyGrad)"/>`;
    // The sun and moon travel between the day's name (left) and the clock (right).
    const minutes = state.run ? Math.floor(state.frac * 60) : 0;
    const clock = `${multiDay() ? `${day.day} ` : ""}${pad(slot)}:${pad(minutes)}`;
    const left = 40 + day.name.length * 7 * state.labelScale;
    const right = width - clock.length * 9 * state.labelScale - 36;
    const across = (hh - day.rise) / (day.set - day.rise);
    if (across > 0 && across < 1) {
      const sx = left + across * (right - left);
      const sy = SKY - 10 - Math.sin(Math.PI * across) * (SKY - 24);
      html += `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="17" fill="#ffe066" opacity="${(0.25 * (1 - cloud)).toFixed(2)}"/><circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="10" fill="#ffe066" opacity="${(1 - 0.55 * cloud).toFixed(2)}"/>`;
    } else {
      const nightLength = 24 - (day.set - day.rise);
      const m = (((hh - day.set) % 24) + 24) % 24 / nightLength;
      const mx = left + clamp(m, 0, 1) * (right - left);
      const my = SKY - 12 - Math.sin(Math.PI * clamp(m, 0, 1)) * (SKY - 28);
      html += `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="8" fill="#e9ecef"/><circle cx="${(mx + 4).toFixed(1)}" cy="${(my - 3).toFixed(1)}" r="7" fill="${top}"/>`;
    }
    const clouds = Math.round(cloud * 7);
    for (let i = 0; i < clouds; i++) {
      const cx = ((i * 0.37 + 0.11) % 1) * (width - 60) + 30;
      const cy = 14 + (i % 3) * 10;
      const tone = mix("#3b465c", "#e9edf2", light);
      html += `<g fill="${tone}" opacity="0.9"><ellipse cx="${cx}" cy="${cy + 6}" rx="22" ry="7"/><circle cx="${cx - 8}" cy="${cy + 2}" r="8"/><circle cx="${cx + 6}" cy="${cy}" r="10"/></g>`;
    }
    const streaks = Math.round(wind * 5);
    for (let i = 0; i < streaks; i++) {
      const wx = ((i * 0.29 + 0.6) % 1) * (width - 90) + 20;
      const wy = 12 + ((i * 7) % 30);
      html += `<path d="M${wx} ${wy}q12 -5 24 0t24 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.45"/>`;
    }
    html += `<text class="sky-text" x="${width - 12}" y="${SKY - 12}" text-anchor="end">${esc(clock)}</text>`;
    html += `<text class="sky-text small" x="12" y="${SKY - 13}">${esc(day.name)}</text>`;
    ui.sky.innerHTML = html;
  }

  // Hints drawn over the map: how good each square is, hover and keyboard highlights.
  function renderOverlay() {
    const { level } = state;
    let html = "";
    if (!state.run) {
      const tool = state.tool;
      const ls = Math.min(state.labelScale, BADGE_MAX); // badges must fit inside their square
      if (tool !== REMOVE) {
        let best = 0;
        level.map.forEach((row, r) =>
          [...row].forEach((ch, c) => {
            if (!Grid.placeProblem(level, r, c, tool)) best = Math.max(best, Grid.rating(Grid.TERRAIN[ch], tool));
          })
        );
        level.map.forEach((row, r) =>
          [...row].forEach((ch, c) => {
            if (state.tiles.has(Grid.tileKey(r, c)) || Grid.placeProblem(level, r, c, tool)) return;
            const x = c * T + T / 2;
            const y = SKY + r * T + T / 2;
            if (tool === "solar" || tool === "wind") {
              const rating = Grid.rating(Grid.TERRAIN[ch], tool);
              const w = 42 * ls;
              const h = 20 * ls;
              html += `<g class="badge${rating === best ? " best" : ""}"><rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${h / 2}"/><text x="${x}" y="${y + 1}">${Math.round(
                rating * 100
              )}%</text></g>`;
            } else {
              html += `<circle cx="${x}" cy="${y}" r="${7 * ls}" fill="rgba(10,16,28,0.7)" stroke="var(--accent)" stroke-width="2"/><path d="M${x - 3.5 * ls} ${y}h${7 * ls}M${x} ${y - 3.5 * ls}v${7 * ls}" stroke="var(--accent)" stroke-width="2"/>`;
            }
          })
        );
      }
      if (state.hover && !gesture) html += tileHighlight(state.hover, "hover-tile") + hoverLabel(state.hover);
      if (state.keyboardCursor) html += tileHighlight(state.cursor, "cursor-tile");
    }
    ui.overlay.innerHTML = html;
  }

  function tileHighlight([r, c], cls) {
    const key = Grid.tileKey(r, c);
    const has = state.tiles.get(key);
    const bad = cls === "hover-tile" && state.tool !== REMOVE && has !== state.tool && !!Grid.placeProblem(state.level, r, c, state.tool);
    return `<rect class="${cls}${bad ? " bad" : ""}" x="${c * T + 2}" y="${SKY + r * T + 2}" width="${T - 4}" height="${T - 4}" rx="6"/>`;
  }

  // A small label beside the square under the mouse: what it is and what's happening there.
  function hoverLabel([r, c]) {
    const { level, evaluation } = state;
    const terrain = Grid.terrainAt(level, r, c);
    const item = state.tiles.get(Grid.tileKey(r, c));
    const sim = evaluation.sim;
    const h = state.hour;
    const day = dayOf(h);
    let text = terrain.name;
    if (item === "solar") text = `Solar farm: ${mw(Grid.ITEMS.solar.power * Grid.sunAt(day, h % 24) * terrain.sun)} MW now`;
    else if (item === "wind") text = `Wind turbine: ${mw(Grid.ITEMS.wind.power * Math.min(1, Grid.perHour(day.wind, h % 24) * terrain.wind))} MW now`;
    else if (item === "battery") text = `Batteries: ${Math.round((sim.batteryLevel[h + 1] / sim.battery.cap) * 100)}% full`;
    else if (item === "hydro") text = `Pumped hydro: ${Math.round((sim.hydroLevel[h + 1] / sim.hydro.cap) * 100)}% full`;
    else if (item === "gas") text = `Gas plant: ${mw(sim.gas[h] / Math.max(1, evaluation.counts.gas))} MW now`;
    else if (state.tool === "solar" || state.tool === "wind") {
      if (!Grid.placeProblem(level, r, c, state.tool)) text += ` · ${state.tool === "solar" ? "sun" : "wind"} ${Math.round(Grid.rating(terrain, state.tool) * 100)}%`;
    }
    const ls = Math.min(state.labelScale, BADGE_MAX);
    const w = (text.length * 7.2 + 18) * ls;
    const h2 = 24 * ls;
    const width = cols() * T;
    const x = clamp(c * T + T / 2 - w / 2, 4, width - w - 4);
    const above = SKY + r * T - h2 - 4;
    const y = above >= SKY ? above : SKY + (r + 1) * T + 4;
    return `<g class="badge" pointer-events="none"><rect x="${x}" y="${y}" width="${w}" height="${h2}" rx="${h2 / 2}"/><text x="${x + w / 2}" y="${y + h2 / 2 + 1}">${esc(text)}</text></g>`;
  }

  // ---------- drawing the chart ----------

  function chartLayout(level) {
    const strips = ["battery", "hydro"].filter((item) => level.items.includes(item));
    const lanes = level.flex ?? [];
    const stripTop = CTOP + PH + AXIS;
    const laneTop = stripTop + strips.length * (STRIP + 4) + (strips.length ? 2 : 0);
    return { strips, lanes, stripTop, laneTop, height: laneTop + lanes.length * LANE + 6 };
  }

  // The map and chart share one width, so work out the shape that fits them both on screen.
  function sizeStage() {
    const { height } = chartLayout(state.level);
    ui.chart.setAttribute("viewBox", `0 0 ${CW} ${height}`);
    const mapRatio = (SKY + rows() * T) / (cols() * T);
    state.ratio = 1 / (mapRatio + height / CW);
    fitStage();
  }

  // On wide screens the map and chart get the height left under the toolbar (keeping
  // room for the hour readout and status line), and are as wide as that allows.
  function fitStage() {
    if (!state.ratio) return;
    const top = ui.stage.getBoundingClientRect().top + window.scrollY;
    const room = Math.max(280, window.innerHeight - top - 96);
    ui.play.style.setProperty("--fit", `${Math.floor(room * state.ratio)}px`);
  }

  window.addEventListener("resize", fitStage);

  function renderChart() {
    const { level, evaluation } = state;
    const sim = evaluation.sim;
    const n = sim.hours;
    const layout = chartLayout(level);
    const ymax = state.ymax;
    const y = (v) => CTOP + PH - (clamp(v, 0, ymax) / ymax) * PH;
    const X = (h) => xOf(h).toFixed(1);
    const focusedJob = document.activeElement?.closest?.(".job")?.dataset.job;
    let html = `<clipPath id="plotClip"><rect x="${CL}" y="${CTOP}" width="${PW}" height="${PH}"/></clipPath>`;
    html += `<rect class="plot-bg" x="${CL}" y="${CTOP}" width="${PW}" height="${PH}"/>`;

    // Night-time is shaded, so it's clear when solar can't help.
    let nightStart = null;
    for (let h = 0; h <= n; h++) {
      const dark = h < n && Grid.clearSun(dayOf(h), h % 24) < 0.03;
      if (dark && nightStart === null) nightStart = h;
      if (!dark && nightStart !== null) {
        html += `<rect class="night" x="${X(nightStart)}" y="${CTOP}" width="${(xOf(h) - xOf(nightStart)).toFixed(1)}" height="${PH}"/>`;
        nightStart = null;
      }
    }

    const step = ymax <= 12 ? 2 : 5;
    for (let v = 0; v <= ymax; v += step) {
      html += `<line class="gridline" x1="${CL}" x2="${CL + PW}" y1="${y(v)}" y2="${y(v)}"/><text class="axis-text" x="${CL - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    }
    html += `<text class="axis-text strong" x="${CL - 6}" y="${CTOP - 8}" text-anchor="end">MW</text>`;

    // Stacked areas: below the demand line is where the town's power came from; above it
    // is spare power charging storage or going to waste.
    const series = [
      ["solar", []],
      ["wind", []],
      ["store", []],
      ["gas", []],
      ["short", []],
      ["charge", []],
      ["waste", []],
    ];
    for (let h = 0; h < n; h++) {
      const renew = sim.solar[h] + sim.wind[h];
      const used = Math.min(renew, sim.demand[h]);
      const solarUsed = renew > 0 ? (used * sim.solar[h]) / renew : 0;
      const values = [solarUsed, used - solarUsed, sim.batteryOut[h] + sim.hydroOut[h], sim.gas[h], sim.unmet[h], sim.charge[h], sim.wasted[h]];
      values.forEach((v, i) => series[i][1].push(v));
    }
    const lower = new Array(n).fill(0);
    html += `<g clip-path="url(#plotClip)">`;
    for (const [name, values] of series) {
      if (values.every((v) => v < 0.005)) continue;
      const upper = values.map((v, h) => lower[h] + v);
      let d = "";
      for (let h = 0; h < n; h++) d += `${h ? "L" : "M"}${X(h)} ${y(upper[h]).toFixed(1)}L${X(h + 1)} ${y(upper[h]).toFixed(1)}`;
      for (let h = n - 1; h >= 0; h--) d += `L${X(h + 1)} ${y(lower[h]).toFixed(1)}L${X(h)} ${y(lower[h]).toFixed(1)}`;
      html += `<path class="series-${name}" d="${d}Z"/>`;
      upper.forEach((v, h) => (lower[h] = v));
    }
    const stepLine = (values) => values.map((v, h) => `${h ? "L" : "M"}${X(h)} ${y(v).toFixed(1)}L${X(h + 1)} ${y(v).toFixed(1)}`).join("");
    if (level.flex?.length) html += `<path class="base-line" d="${stepLine(sim.base)}"/>`;
    html += `<path class="demand-line" d="${stepLine(sim.demand)}"/>`;
    html += `</g>`;

    // Days and hours.
    for (let d = 0; d < level.days.length; d++) {
      if (d > 0) html += `<line class="day-line" x1="${X(d * 24)}" x2="${X(d * 24)}" y1="${CTOP - 18}" y2="${CTOP + PH}"/>`;
      if (multiDay()) html += `<text class="axis-text strong" x="${(xOf(d * 24) + xOf(d * 24 + 24)) / 2}" y="${CTOP - 8}" text-anchor="middle">${esc(level.days[d].name)}</text>`;
    }
    const every = n > 24 && state.chartScale > 1.25 ? 12 : 6;
    for (let h = 0; h <= n; h += every) {
      if (multiDay() && h % 24 === 0) continue; // the day names already mark midnight
      const anchor = h === 0 ? "start" : h === n ? "end" : "middle";
      html += `<text class="axis-text" x="${X(h)}" y="${CTOP + PH + 15}" text-anchor="${anchor}">${pad(h % 24 || (h === n ? 24 : 0))}:00</text>`;
    }

    // Storage strips: how full the batteries (and pumped hydro) are through the day.
    layout.strips.forEach((item, i) => {
      const top = layout.stripTop + i * (STRIP + 4);
      const levels = item === "battery" ? sim.batteryLevel : sim.hydroLevel;
      const cap = sim[item].cap;
      html += `<rect class="strip-bg" x="${CL}" y="${top}" width="${PW}" height="${STRIP}"/>`;
      if (cap > 0) {
        let d = `M${X(0)} ${top + STRIP}`;
        for (let h = 0; h <= n; h++) d += `L${X(h)} ${(top + STRIP - (levels[h] / cap) * STRIP).toFixed(1)}`;
        html += `<path class="strip-${item}" d="${d}L${X(n)} ${top + STRIP}Z"/>`;
      }
      const name = item === "battery" ? "Batteries" : "Pumped hydro";
      const now = cap > 0 ? `${Math.round((levels[state.hour + 1] / cap) * 100)}% full at ${pad((state.hour + 1) % 24)}:00` : "none built";
      html += `<text class="strip-label" x="${CL + 6}" y="${top + STRIP / 2 + 4}">${name}: ${now}</text>`;
    });

    // The hour being shown, and (while running) the part of the day still to come.
    const band = `<rect class="hour-band" x="${X(state.hour)}" y="${CTOP}" width="${(PW / n).toFixed(1)}" height="${layout.laneTop - CTOP - 2}"/>`;
    if (state.run) {
      const at = xOf(state.hour + state.frac);
      html += `<rect class="future" x="${at.toFixed(1)}" y="${CTOP}" width="${(CL + PW - at).toFixed(1)}" height="${layout.laneTop - CTOP - 2}"/>`;
      html += `<line x1="${at.toFixed(1)}" x2="${at.toFixed(1)}" y1="${CTOP}" y2="${layout.laneTop - 2}" stroke="#fff" stroke-width="2"/>`;
    } else {
      html += band;
    }

    // Flexible jobs: a lane each, with a block that can be dragged along its time window.
    layout.lanes.forEach((job, i) => {
      const top = layout.laneTop + i * LANE + 4;
      const h = LANE - 8;
      const start = state.flex[job.id];
      html += `<rect class="job-track" x="${X(job.earliest)}" y="${top}" width="${(xOf(job.latest) - xOf(job.earliest)).toFixed(1)}" height="${h}" rx="6"/>`;
      const x0 = xOf(start);
      const w = xOf(start + job.hours) - x0;
      const label = `${job.short ?? job.name} ${job.power} MW`;
      html += `<g class="job${state.dragJob === job.id ? " dragging" : ""}" data-job="${job.id}" tabindex="0" role="slider" aria-label="${esc(job.name)}, ${job.power} MW for ${
        job.hours
      } hours" aria-valuemin="${job.earliest}" aria-valuemax="${job.latest - job.hours}" aria-valuenow="${start}" aria-valuetext="${esc(
        `${hourName(start)} to ${hourName(start + job.hours)}`
      )}"><rect x="${x0.toFixed(1)}" y="${top}" width="${w.toFixed(1)}" height="${h}" rx="6"/><text x="${(x0 + w / 2).toFixed(1)}" y="${top + h / 2 + 1}">${esc(label)}</text></g>`;
    });

    ui.chartBody.innerHTML = html;
    if (focusedJob) ui.chartBody.querySelector(`[data-job="${focusedJob}"]`)?.focus({ preventScroll: true });
  }

  // ---------- the hour readout (also the chart's key) ----------

  function readoutParts() {
    const { level, evaluation } = state;
    const sim = evaluation.sim;
    const h = state.hour;
    const has = (item) => level.items.includes(item);
    const parts = [];
    if (has("solar")) parts.push(["solar", "Solar", sim.solar[h]]);
    if (has("wind")) parts.push(["wind", "Wind", sim.wind[h]]);
    if (has("battery") || has("hydro")) parts.push(["store", "From storage", sim.batteryOut[h] + sim.hydroOut[h]]);
    if (has("gas")) parts.push(["gas", "Gas", sim.gas[h]]);
    if (has("battery") || has("hydro")) parts.push(["charge", "Charging", sim.charge[h]]);
    parts.push(["waste", "Wasted", sim.wasted[h]]);
    parts.push(["short", "Blackout", sim.unmet[h]]);
    return parts;
  }

  function renderReadout() {
    const sim = state.evaluation.sim;
    const h = state.hour;
    let html = `<strong>${esc(slotName(h))}</strong><span class="chip"><i class="sw demand"></i>Needs <b>${mw(sim.demand[h])} MW</b></span>`;
    for (const [cls, name, value] of readoutParts()) {
      html += `<span class="chip${value < 0.05 ? " zero" : ""}"><i class="sw ${cls}"></i>${name} <b>${mw(value)}</b></span>`;
    }
    ui.readout.innerHTML = html;
  }

  function readoutText() {
    const sim = state.evaluation.sim;
    const h = state.hour;
    const parts = readoutParts()
      .filter(([, , v]) => v >= 0.05)
      .map(([, name, v]) => `${name} ${mw(v)}`);
    return `${slotName(h)}: needs ${mw(sim.demand[h])} megawatts. ${parts.join(", ")}.`;
  }

  // ---------- playing the day ----------

  function runDay() {
    if (state.run) {
      finishRun();
      return;
    }
    state.hover = null;
    if (reducedMotion.matches) {
      finishRun();
      return;
    }
    state.run = { t: 0, last: null, warned: false };
    ui.board.classList.add("locked");
    ui.chart.classList.add("locked");
    ui.run.textContent = "Skip to the end";
    ui.undo.disabled = ui.clear.disabled = true;
    renderOverlay();
    say(multiDay() ? "Here come the next few days…" : "Here comes the day…", "");
    requestAnimationFrame(runFrame);
  }

  function runFrame(time) {
    const run = state.run;
    if (!run) return;
    const dt = run.last === null ? 0 : Math.min(0.05, (time - run.last) / 1000);
    run.last = time;
    const sim = state.evaluation.sim;
    run.t += (dt * sim.hours) / RUN_SECONDS;
    if (run.t >= sim.hours) {
      finishRun();
      return;
    }
    const h = Math.floor(run.t);
    state.hour = h;
    state.frac = run.t - h;
    if (!run.warned && sim.unmet[h] > EPS) {
      run.warned = true;
      say(`Blackout at ${hourName(h)}!`, "bad");
    }
    renderSky();
    renderItems();
    renderChart();
    renderReadout();
    requestAnimationFrame(runFrame);
  }

  function stopRun() {
    state.run = null;
    ui.board.classList.remove("locked");
    ui.chart.classList.remove("locked");
    if (state.level) ui.run.textContent = runLabel();
  }

  function finishRun() {
    const { level, evaluation } = state;
    stopRun();
    state.lastRun = { passed: evaluation.passed };
    const first = evaluation.blackouts[0];
    state.hour = first ? first.from : evaluation.sim.hours - 1;
    state.frac = 0.5;
    refresh();
    ui.goalsCard.classList.remove("nudge");
    if (evaluation.passed) {
      say(`The lights stayed on ${multiDay() ? `for ${allDays()}` : "all day"}!`, "good");
      progress.stars[level.id] = Math.max(progress.stars[level.id] ?? 0, evaluation.stars);
      saveProgress();
      showWin(evaluation);
    } else {
      say(problemText(), "bad");
      void ui.goalsCard.offsetWidth; // restart the animation
      ui.goalsCard.classList.add("nudge");
    }
  }

  // ---------- explaining what's wrong ----------

  function blackoutText(run) {
    const { evaluation, level } = state;
    const sim = evaluation.sim;
    const n = evaluation.counts;
    let worst = run.from;
    for (let h = run.from; h < run.to; h++) if (sim.unmet[h] > sim.unmet[worst]) worst = h;
    const need = sim.demand[worst];
    let text = `Blackout ${whenText(run)}: the ${who()} needs ${mw(need)} MW but only gets ${mw(need - sim.unmet[worst])} MW.`;
    const canStore = level.items.includes("battery") || level.items.includes("hydro");
    if (canStore && !n.battery && !n.hydro) {
      text += " Batteries could save spare power from earlier for this.";
    } else if (run.empty) {
      text += n.hydro ? " Storage has run empty." : " The batteries have run empty.";
    } else if (run.power) {
      const out = n.battery * Grid.ITEMS.battery.power + n.hydro * Grid.ITEMS.hydro.power;
      text += ` Storage still has energy, but it can only give out ${out} MW at once (each battery gives at most ${Grid.ITEMS.battery.power} MW).`;
    } else if (!canStore && level.items.includes("solar")) {
      text += " Solar farms make much less when the sun is low.";
    }
    if (run.gasFull) text += " The gas plants are already flat out.";
    const more = evaluation.blackouts.length - 1;
    if (more > 0) text += ` (${plural(more, "more blackout", "more blackouts")} after that.)`;
    return text;
  }

  function problemText() {
    const { evaluation, level } = state;
    if (evaluation.blackouts.length) return blackoutText(evaluation.blackouts[0]);
    const co2 = evaluation.checks.find((c) => c.id === "co2");
    if (co2 && !co2.ok) return `Too much CO₂: ${co2.value} t, but the limit is ${level.co2Limit} t. Burn less gas: add storage or more renewables.`;
    return "";
  }

  // ---------- panel ----------

  function itemAbout(item) {
    const m = Grid.ITEMS[item];
    switch (item) {
      case "solar":
        return `Solar farm: up to ${m.power} MW in full sun, nothing at night. ${money(m.cost)} a day.`;
      case "wind":
        return `Wind turbine: up to ${m.power} MW when the wind blows, day or night. ${money(m.cost)} a day.`;
      case "battery":
        return `Battery: stores ${m.store} MWh, charges or gives out up to ${m.power} MW, keeps ${m.efficiency * 100}% of what goes in. ${money(m.cost)} a day.`;
      case "hydro":
        return `Pumped hydro: pumps water up to a hill lake to store ${m.store} MWh. Up to ${m.power} MW in or out, keeps ${m.efficiency * 100}%. ${money(m.cost)} a day.`;
      case "gas":
        return `Gas plant: up to ${m.power} MW whenever needed. ${money(m.cost)} a day, plus ${money(m.fuel)} of gas and ${m.co2} t of CO₂ per MWh.`;
      default:
        return "Remove: tap a machine to take it away (or right-click).";
    }
  }

  function toolIcon(tool) {
    const svg = (inner) => `<svg width="28" height="24" viewBox="0 0 28 24" aria-hidden="true">${inner}</svg>`;
    switch (tool) {
      case "solar":
        return svg(`<rect x="2" y="4" width="24" height="16" rx="2" fill="#202c40"/><path d="M4 6h20v12H4z" fill="#3f8cf0"/><path d="M4 12h20M10.7 6v12M17.3 6v12" stroke="#cfe3ff" stroke-width="1"/>`);
      case "wind":
        return svg(`<path d="M13 23l.6-12h.8l.6 12z" fill="#e9eef6"/><g transform="translate(14 11)"><path d="M0 0C2 -3 2 -7 0 -10C-1 -7 -1 -3 0 0z" fill="#f5f7fa"/><path d="M0 0C2 -3 2 -7 0 -10C-1 -7 -1 -3 0 0z" fill="#f5f7fa" transform="rotate(120)"/><path d="M0 0C2 -3 2 -7 0 -10C-1 -7 -1 -3 0 0z" fill="#f5f7fa" transform="rotate(240)"/></g>`);
      case "battery":
        return svg(`<rect x="7" y="4" width="14" height="18" rx="2.5" fill="#2b2347" stroke="#b197fc" stroke-width="2"/><rect x="11" y="1.5" width="6" height="3" rx="1" fill="#b197fc"/><rect x="10" y="12" width="8" height="7" fill="#b197fc"/>`);
      case "hydro":
        return svg(`<rect x="2" y="3" width="24" height="12" rx="5" fill="#2a6d9e"/><rect x="3" y="14" width="22" height="3" fill="#c3c9d2"/><path d="M20 17l4 6" stroke="#adb5bd" stroke-width="3" stroke-linecap="round"/>`);
      case "gas":
        return svg(`<rect x="3" y="12" width="17" height="10" fill="#a3aab4"/><rect x="19" y="3" width="5" height="19" fill="#868e96"/><circle cx="22" cy="2" r="2" fill="#ced4da"/><rect x="6" y="15" width="4" height="4" fill="#ff922b"/><rect x="12" y="15" width="4" height="4" fill="#ff922b"/>`);
      default:
        return svg(`<g transform="rotate(-25 14 12)"><rect x="4" y="6" width="20" height="11" rx="3" fill="#ff9aa2"/><rect x="4" y="6" width="8" height="11" rx="3" fill="#e9eef8"/></g>`);
    }
  }

  function renderTools() {
    // With lots of machines to choose from, short names keep the toolbar on one line.
    ui.tools.classList.toggle("crowded", state.level.items.length >= 4);
    ui.tools.innerHTML = tools()
      .map((tool, i) => {
        const long = tool === REMOVE ? "Remove" : Grid.ITEMS[tool].name;
        const short = tool === REMOVE ? "Remove" : Grid.ITEMS[tool].short;
        const cost = tool === REMOVE ? "" : `<span class="tool-cost">${money(Grid.ITEMS[tool].cost)}${tool === "gas" ? " + fuel" : ""}</span>`;
        const key = tool === REMOVE ? "R" : i + 1;
        return `<button type="button" class="tool" data-tool="${tool}" aria-pressed="${tool === state.tool}" title="${esc(itemAbout(tool))} (key ${key})" aria-label="${esc(long)}">${toolIcon(tool)}<span class="long">${esc(long)}</span><span class="short">${esc(
          short
        )}</span>${cost}</button>`;
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
    ui.run.textContent = runLabel();
    document.title = `${level.title} · Grid Manager`;
    renderHints();
  }

  function renderHints() {
    const { level, hintsShown } = state;
    ui.hints.innerHTML = level.hints.slice(0, hintsShown).map((hint) => `<li>${esc(hint)}</li>`).join("");
    ui.hintButton.hidden = hintsShown >= level.hints.length;
    ui.hintButton.textContent = hintsShown ? "Show another hint" : "Show a hint";
  }

  function spansText(blackouts) {
    const shown = blackouts.slice(0, 2).map(whenText);
    return shown.join(", ") + (blackouts.length > 2 ? ` and ${blackouts.length - 2} more` : "");
  }

  function renderGoals() {
    const { evaluation, level } = state;
    const t = evaluation.sim.totals;
    const items = evaluation.checks.map((check) => {
      let text;
      let detail;
      if (check.id === "lights") {
        text = multiDay() ? `Power every hour, ${allDays()}` : `Power every hour the ${who()} needs it`;
        detail = check.ok ? "No blackouts" : `Blackout ${spansText(evaluation.blackouts)} (${mw(t.unmet)} MWh short)`;
      } else {
        text = `CO₂ no more than ${level.co2Limit} t`;
        detail = `${check.value} t released (${mw(t.gas)} MWh from gas)`;
      }
      return `<li class="${check.ok ? "ok" : "bad"}"><span class="mark" aria-hidden="true">${check.ok ? "✓" : "✗"}</span><span>${esc(text)}<span class="sr-only">${
        check.ok ? ", done" : ", not yet"
      }</span><small>${esc(detail)}</small></span></li>`;
    });
    ui.goals.innerHTML = `<ul class="checks">${items.join("")}</ul>`;
    const parts = [`Used <b>${Math.round(t.demand)} MWh</b>`];
    if (level.items.includes("gas")) parts.push(`renewable <b>${Math.round(t.renewableShare * 100)}%</b>`);
    parts.push(`wasted <b>${Math.round(t.wasted)} MWh</b>`);
    ui.stats.innerHTML = parts.join(" · ");
    if (evaluation.passed) ui.goalsCard.classList.remove("nudge");
  }

  function renderBudget() {
    const { level, evaluation } = state;
    const { cost, build, fuel } = evaluation;
    ui.cost.textContent = money(cost);
    ui.meterFill.style.width = `${Math.min(100, (cost / level.budget) * 100)}%`;
    ui.meterFill.classList.toggle("over", cost > level.budget);
    ui.meterPar.style.left = `calc(${(level.par / level.budget) * 100}% - 1.5px)`;
    const split = fuel ? ` Machines ${money(build)} + gas ${money(fuel)}.` : "";
    ui.budgetNote.textContent =
      (cost > level.budget
        ? `Over the ${money(level.budget)} budget by ${money(cost - level.budget)}.`
        : `Budget ${money(level.budget)}. ${money(level.par)} or less for 3 stars.`) + split;
  }

  function renderStatus() {
    const { evaluation, level } = state;
    if (state.run) return;
    if (!state.tiles.size && !evaluation.passed) {
      say(`Choose a ${Grid.ITEMS[level.items[0]].name.toLowerCase()} above, then tap the map to build. The chart shows every hour of the ${multiDay() ? "forecast" : "day"}.`, "");
    } else if (!evaluation.passed) {
      say(problemText(), "bad");
    } else {
      say(`Every hour has enough power. Press "${runLabel()}" to see it happen.`, "good");
    }
  }

  function showWin({ stars, cost }) {
    const { level } = state;
    ui.winStars.innerHTML = starsHtml(stars);
    ui.winStars.setAttribute("aria-label", `${stars} out of 3 stars`);
    if (stars === 3 && cost < level.par) {
      ui.winCost.textContent = `It costs ${money(cost)} a day, even less than our best design (${money(level.par)}). Outstanding engineering!`;
    } else if (stars === 3) {
      ui.winCost.textContent = `It costs ${money(cost)} a day. That matches the best design we know. Brilliant engineering!`;
    } else if (stars === 2) {
      ui.winCost.textContent = `It costs ${money(cost)} a day, within the ${money(level.budget)} budget. Can you get it down to ${money(level.par)} for 3 stars?`;
    } else {
      ui.winCost.textContent = `It works, but it costs ${money(cost)} a day, over the ${money(level.budget)} budget. Find a cheaper mix for more stars.`;
    }
    ui.winLearn.textContent = level.learn;
    ui.winNext.textContent = state.index === LEVELS.length - 1 ? "All levels" : "Next level";
    ui.winDialog.showModal();
  }

  function openLevels() {
    if (state.run) return;
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

  // Small screens shrink the pictures; grow their text so it stays readable.
  function updateLabelScale() {
    const mapWidth = ui.board.viewBox.baseVal?.width;
    if (!mapWidth || !ui.board.clientWidth) return;
    const ls = clamp(1 / (ui.board.clientWidth / mapWidth), 1, 1.6);
    const cls = clamp(1 / (ui.chart.clientWidth / CW), 1, 1.7);
    const changed = Math.abs(ls - state.labelScale) > 0.02 || Math.abs(cls - state.chartScale) > 0.02;
    state.labelScale = ls;
    state.chartScale = cls;
    ui.board.style.setProperty("--ls", ls.toFixed(3));
    ui.board.style.setProperty("--bs", Math.min(ls, BADGE_MAX).toFixed(3));
    ui.chart.style.setProperty("--cls", cls.toFixed(3));
    ui.chart.style.setProperty("--js", Math.min(cls, JOB_MAX).toFixed(3));
    if (changed && state.evaluation) {
      renderOverlay();
      renderChart();
    }
  }

  new ResizeObserver(() => updateLabelScale()).observe(ui.stage);

  // ---------- wiring up the controls ----------

  ui.tools.addEventListener("click", (event) => {
    const button = event.target.closest(".tool");
    if (button) selectTool(button.dataset.tool);
  });
  ui.undo.addEventListener("click", undo);
  ui.clear.addEventListener("click", clearDesign);
  ui.hintButton.addEventListener("click", () => {
    state.hintsShown = Math.min(state.level.hints.length, state.hintsShown + 1);
    renderHints();
    ui.hints.lastElementChild?.setAttribute("tabindex", "-1");
    ui.hints.lastElementChild?.focus();
  });
  ui.run.addEventListener("click", runDay);
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
