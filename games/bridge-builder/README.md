# Bridge Builder

A structural engineering game for Years 8–13. Students build a truss bridge from road,
wood, steel and cables, then drive a vehicle across it. Every beam's force is worked out
with the direct stiffness method (the way engineers analyse real trusses), so beams snap
when pulled too hard, crush or buckle when squashed, and bridges without triangles fold up.

## Playing

- The game itself is in `public/play/bridge-builder/` (`index.html`, `style.css`, `js/`). Open that
  `index.html` directly, or run `npm run dev` and go to `/play/bridge-builder/index.html`. On the
  website it plays inside `/games/bridge-builder`. No installs or internet needed.
- Drag from point to point to build beams (road goes along the dashed line). Drag from one
  point to any other to string a cable. Tap a beam to remove it, or tap with a different
  material to swap it.
- **Show forces** colours each beam: blue = pulled (tension), orange = squashed
  (compression), red = over 100% and would break. Percentages show how hard each beam works.
- Works with mouse, touch (iPad, Chromebook) and keyboard: arrow keys move, Space picks a
  start point, Enter builds to the cursor, Delete removes, number keys pick a material.
- Progress is saved in the browser only. No accounts, no data leaves the device.

## Levels

| # | Level | Years | Concept |
|---|-------|-------|---------|
| 1 | Mind the Gap | 8 | Triangles make structures rigid |
| 2 | Triangle Power | 8 | Trusses |
| 3 | Push and Pull | 9 | Tension and compression; strong material where forces are big |
| 4 | Low Bridge | 9–10 | Building under the road, arches |
| 5 | Buckle Up | 10–11 | Buckling ∝ 1/length²; Pratt trusses |
| 6 | Go Deeper | 11–12 | Chord force = bending moment ÷ depth |
| 7 | Cable-Stayed | 11–13 | Tension-only cables, cable-stayed bridges |
| 8 | Heavy Haul | 12–13 | Intermediate supports; everything combined |

Stars: 1 for getting across, 2 within budget, 3 at or below the cheapest design found.

## The numbers

One grid square is 4 m. Strengths are in kN (10 kN ≈ 1 tonne). Diagonal beams are √2
times longer, so they cost more and buckle at half the force of a straight beam.

| Material | Pull (kN) | Squash (kN) | Weight (kN per square) | Cost |
|----------|-----------|-------------|------------------------|------|
| Road     | 200 | 200 | 4 | £15 |
| Wood     | 70  | 60 (30 diagonal) | 1.5 | £8 / £11 |
| Steel    | 200 | 180 (90 diagonal) | 3 | £16 / £23 |
| Cable    | 200 | 0 (goes slack) | 0.5 | £5 per square |

These live in `public/play/bridge-builder/js/bridge.js` (`MATERIALS`).

## Adding a level

Levels live in `public/play/bridge-builder/js/levels.js`: the gap (`left`, `right`, `deckY`), the anchor bolts, any
no-build zones, the materials, the vehicle's weight, and the budget and par. Then run
(needs Node.js), from the project folder:

```
node games/bridge-builder/check-levels.cjs
```

It designs a cheap bridge for every level, starting from classic truss shapes and
removing or downgrading beams while the vehicle still gets across, and tells you whether
the cheapest design matches the level's `par`. `node games/bridge-builder/check-levels.cjs go-deeper --draw`
checks one level and prints the design it found.
