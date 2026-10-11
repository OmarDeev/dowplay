# DowPlay teacher packs

Printable teacher packs for the four DowPlay engineering games. Each pack is one HTML source that
builds two A4 PDFs: the full teacher pack and the student worksheets on their own. The PDFs are
written straight into the website (`public/teacher-packs/`), where anyone can download them free.

| Folder | Game | Years | Teacher pack | Worksheets |
|--------|------|-------|--------------|------------|
| `light-it-up/` | Light It Up (circuits) | 8–13 | 16 pages | 6 pages |
| `gear-garage/` | Gear Garage (gears and machines) | 8–13 | 16 pages | 6 pages |
| `bridge-builder/` | Bridge Builder (structures) | 8–13 | 16 pages | 6 pages |
| `grid-manager/` | Grid Manager (energy) | 9–13 | 17 pages | 6 pages |

Every pack has: an overview with curriculum links, teacher background on how the game works, a
level-by-level guide with the 3-star solutions, two 60-minute lesson plans, two worksheets, answers
and a mark scheme.

## What's in each folder

| File | What it is |
|------|------------|
| `pack.html` | The source for both PDFs. Edit the text here |
| `check-numbers.cjs` | Re-checks every number in the pack against the game |
| `designs.json` | The 3-star design for each level, used by `check-numbers.cjs` (Grid Manager's checker builds its designs itself) |
| `img/` | The cover image and the worksheet figures, captured from the game |

Shared by all packs: `build-pdf.mjs` (the PDF builder), `shared/pack.css` (the page styles) and
`shared/fonts/` (the DowPlay heading font).

## Editing a pack

1. Change the text in `pack.html`. Sections marked `class="teacher"` appear only in the teacher
   pack; everything else (the worksheets) appears in both PDFs.
2. Rebuild it (needs Node.js 22+ and Google Chrome). From the project folder:

   ```bash
   npm run packs -- bridge-builder
   ```

   Leave out the name to rebuild every pack. This writes, for `bridge-builder`:
   - `public/teacher-packs/bridge-builder-teacher-pack.pdf` and `…-student-worksheets.pdf`
   - `src/assets/packs/bridge-builder-cover.png` and `…-worksheet.png`, the pictures of the first
     pages shown on the website (made with macOS's `sips`; on other systems it tells you to make
     them yourself)
   - the page count in `src/content/games/bridge-builder.md`, if it changed

   The title comes from the `<meta name="pack-title">` tag in `pack.html`.

3. Open the PDFs and check that nothing new spills onto an extra page.

## If a game changes

Every figure in the worksheets and answers was taken from the game's own engine (the scripts in
`public/play/<game>/js/`). After changing a game's levels or parts, run its checker from the
project folder:

```bash
node teacher-packs/bridge-builder/check-numbers.cjs
```

or `npm run check:packs` for all four. It lists any number that no longer matches. If a level shown
in a worksheet figure changes, re-capture that image in `img/` too.

## Sharing

- The packs link to `dowplay.com/games/<game>`, so they only make sense once the games are live.
- Everything in the website's `public/` folder can be downloaded by anyone. That's intended for
  these free packs; keep any paid material elsewhere.
- Curriculum links are written in general terms (KS3, GCSE, A-level, NGSS). Before selling a pack,
  it's worth having a teacher check them against their own exam board's specification.
