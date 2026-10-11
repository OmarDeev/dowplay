"use strict";
// Loads one of a game's browser scripts (public/play/<game>/js/<file>) in Node, for the level
// checkers and the teacher-pack number checks.
//
// The scripts end with `if (typeof module !== "undefined") module.exports = …`. A plain
// require() would treat them as ES modules (the website's package.json says "type": "module"),
// so they are run here as classic scripts instead.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const PLAY_DIR = path.join(__dirname, "..", "public", "play");

function loadGameScript(game, file) {
  const filename = path.join(PLAY_DIR, game, "js", file);
  const module = { exports: {} };
  const wrapper = vm.runInThisContext(`(function (module, exports) {\n${fs.readFileSync(filename, "utf8")}\n})`, { filename });
  wrapper(module, module.exports);
  return module.exports;
}

module.exports = { loadGameScript, PLAY_DIR };
