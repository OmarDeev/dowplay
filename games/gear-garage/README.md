# Gear Garage

A mechanical engineering puzzle game for Years 8–13. Students place gears on a
pegboard to connect a motor to a machine, making it turn at the right speed, in the
right direction and with enough torque, within a budget. Gears mesh, jam, stall and
turn exactly as real gears would.

## Playing

- The game itself is in `public/play/gear-garage/` (`index.html`, `style.css`, `js/`). Open that
  `index.html` directly, or run `npm run dev` and go to `/play/gear-garage/index.html`. On the
  website it plays inside `/games/gear-garage`. No installs or internet needed.
- Pick a gear size, then tap a hole to place it. Tap a gear's axle again with the same
  size to remove it, or with a different size to stack a second gear (compound levels).
  Drag a gear to move it.
- Works with mouse, touch (iPad, Chromebook) and keyboard: arrow keys move, Enter places,
  Delete removes, number keys pick a gear size.
- Progress is saved in the browser only. No accounts, no data leaves the device.

## Levels

| # | Level | Years | Concept |
|---|-------|-------|---------|
| 1 | First Gear | 8 | Meshing gears turn each other, in opposite directions |
| 2 | Same Way Round | 8 | Idler gears change direction |
| 3 | Need for Speed | 8–9 | Gear ratio = driver teeth ÷ driven teeth |
| 4 | Heavy Lifting | 9 | Trading speed for torque |
| 5 | Round the Engine | 9–10 | Idlers don't change the overall ratio |
| 6 | Compound Gears | 10–11 | Ratios multiply in a compound train |
| 7 | Garage Door | 11–12 | Rack and pinion, v = ωr |
| 8 | Every Mesh Counts | 12–13 | Efficiency multiplies, P = Tω |

Stars: 1 for a working machine, 2 within budget, 3 at or below the cheapest design.

## Adding a level

Levels live in `public/play/gear-garage/js/levels.js`. Holes are numbered from the top-left (0, 0). An N-tooth
gear has radius N/8 holes, so two gears mesh when their axles are (N1 + N2)/8 holes
apart. Copy an existing level and change the motor, outputs, obstacles, tools, budget
and par.

Then run the checker (needs Node.js), from the project folder:

```
node games/gear-garage/check-levels.cjs
```

It searches for the cheapest working design on every level and tells you whether it
matches the level's `par`, so you know each level can be solved and what 3 stars should
cost. `node games/gear-garage/check-levels.cjs garage-door` checks one level.
