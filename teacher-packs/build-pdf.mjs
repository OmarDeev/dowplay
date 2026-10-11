#!/usr/bin/env node
// Builds the teacher pack PDFs with Google Chrome (no other installs needed), straight into
// the website. From the project folder:
//
//   npm run packs                      every pack
//   npm run packs -- light-it-up       one pack
//
// Each pack folder has a pack.html. For a folder like light-it-up this writes:
//   public/teacher-packs/light-it-up-teacher-pack.pdf        everything (teacher pages, worksheets, answers)
//   public/teacher-packs/light-it-up-student-worksheets.pdf  the worksheets only (pack.html?student)
//   src/assets/packs/light-it-up-cover.png / -worksheet.png  pictures of the first pages (macOS only)
// and updates `pages:` in the game's teacherPack block (src/content/games/light-it-up.md).
//
// Needs Node.js 22+ and Google Chrome. Set CHROME=/path/to/chrome if it isn't in the usual place.

import { execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile, readdir, rm, access } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const PDF_DIR = join(SITE, "public", "teacher-packs");
const PREVIEW_DIR = join(SITE, "src", "assets", "packs");
const GAMES_DIR = join(SITE, "src", "content", "games");
const CHROME =
  process.env.CHROME ??
  {
    darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    win32: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  }[process.platform] ??
  "google-chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A picture of a PDF's first page, for the website. Uses macOS's built-in sips; elsewhere it
// says what to do instead.
async function makePreview(pdf, png) {
  if (process.platform !== "darwin") {
    console.log(`  (skipped the preview picture: make ${png} from the PDF's first page, 900 px wide)`);
    return;
  }
  await new Promise((resolve, reject) =>
    execFile("sips", ["-s", "format", "png", "--resampleWidth", "900", pdf, "--out", png], (err) => (err ? reject(err) : resolve())),
  );
}

// Keeps the page count shown on the website in step with the PDF.
async function updatePageCount(slug, pages) {
  const file = join(GAMES_DIR, `${slug}.md`);
  if (!(await exists(file))) return;
  const text = await readFile(file, "utf8");
  const updated = text.replace(/(teacherPack:\n(?:  .*\n)*?  pages: )(\d+)/, (_, head, old) => {
    if (Number(old) !== pages) console.log(`  updated pages: ${old} → ${pages} in src/content/games/${slug}.md`);
    return head + pages;
  });
  if (updated !== text) await writeFile(file, updated);
}

// Which packs to build: the folders named on the command line, or every folder with a pack.html.
const exists = (path) => access(path).then(() => true, () => false);
const wanted = process.argv.slice(2);
const packs = [];
for (const entry of await readdir(HERE, { withFileTypes: true })) {
  if (entry.isDirectory() && (await exists(join(HERE, entry.name, "pack.html"))) && (!wanted.length || wanted.includes(entry.name))) packs.push(entry.name);
}
for (const name of wanted) if (!packs.includes(name)) throw new Error(`No pack folder called "${name}" with a pack.html in it.`);

// Serve this folder over http, so Chrome loads the shared styles, font and images without file:// limits.
const TYPES = { ".html": "text/html", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".css": "text/css" };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const body = await readFile(join(HERE, path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const profile = join(tmpdir(), `pack-chrome-${process.pid}`);
const port = 9300 + (process.pid % 500);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], {
  stdio: "ignore",
});

try {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page");
    } catch {}
    if (!target) await sleep(200);
  }
  if (!target) throw new Error(`Couldn't start Chrome at ${CHROME}`);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const waiting = new Map();
  const events = [];
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && waiting.has(msg.id)) {
      const { resolve, reject } = waiting.get(msg.id);
      waiting.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) events.push(msg.method);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      waiting.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  await send("Page.enable");

  for (const slug of packs) {
    const html = await readFile(join(HERE, slug, "pack.html"), "utf8");
    const title = html.match(/<meta name="pack-title" content="([^"]+)">/)?.[1] ?? slug;
    const footer = `<div style="width:100%; padding:0 15mm; display:flex; justify-content:space-between; font:7.5pt Helvetica, Arial, sans-serif; color:#6b7280;">
      <span>${title} · dowplay.com/games/${slug}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
    for (const [query, suffix, label, preview] of [
      ["", "teacher-pack", "teacher pack", "cover"],
      ["?student", "student-worksheets", "student worksheets", "worksheet"],
    ]) {
      events.length = 0;
      await send("Page.navigate", { url: `${base}/${slug}/pack.html${query}` });
      for (let i = 0; i < 100 && !events.includes("Page.loadEventFired"); i++) await sleep(100);
      await send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true });
      await sleep(300);
      const pdf = await send("Page.printToPDF", {
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: "<div></div>",
        footerTemplate: footer,
      });
      const bytes = Buffer.from(pdf.data, "base64");
      const pages = (bytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
      const out = join(PDF_DIR, `${slug}-${suffix}.pdf`);
      await writeFile(out, bytes);
      console.log(`${title} ${label}: public/teacher-packs/${slug}-${suffix}.pdf (${pages} pages)`);
      await makePreview(out, join(PREVIEW_DIR, `${slug}-${preview}.png`));
      if (!query) await updatePageCount(slug, pages);
    }
  }
  ws.close();
} finally {
  chrome.kill();
  server.close();
  await sleep(300);
  await rm(profile, { recursive: true, force: true });
}
