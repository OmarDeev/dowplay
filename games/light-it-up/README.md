# Light It Up

An electrical engineering puzzle game for Years 8–13. Students wire up a house on a
grid to make lamps and appliances work, within a budget. The circuit is solved with
real physics (nodal analysis), so voltages and currents are correct.

## Playing

- The game itself is in `public/play/light-it-up/` (`index.html`, `style.css`, `js/`). Open that
  `index.html` directly, or run `npm run dev` and go to `/play/light-it-up/index.html`. On the
  website it plays inside `/games/light-it-up`. No installs or internet needed.
- Works with mouse, touch (iPad, Chromebook) and keyboard.
- Progress is saved in the browser only. No accounts, no data leaves the device.

## Levels

| # | Level | Years | Concept |
|---|-------|-------|---------|
| 1 | Lights On | 8 | A complete loop |
| 2 | Two Rooms | 8 | Series vs parallel brightness |
| 3 | The Hall Switch | 8–9 | Switches in branches |
| 4 | Twelve Volts | 9 | Voltage shared in series |
| 5 | Pick the Resistor | 10 | Ohm's law, resistors in series |
| 6 | Two Fuses | 10–11 | I = P ÷ V, currents add in parallel |
| 7 | Smart Doorbell | 11–13 | Potential dividers and loading |
| 8 | Power to the Shed | 12–13 | Cable resistance and losses |

Stars: 1 for a working circuit, 2 within budget, 3 at or below the cheapest known design.

## Adding a level

Levels live in `public/play/light-it-up/js/levels.js`. Each part sits on a grid edge: `"x,y,h"` joins
junction (x, y) to (x+1, y), and `"x,y,v"` joins (x, y) to (x, y+1). Copy an
existing level and change the parts, tools, budget and par.

Part types: `battery` (emf, fuse, plus end `"a"` or `"b"`), `lamp` and `appliance`
(vRated, pRated), `device` (fixed resistance r, needs vMin–vMax), `switch`.
Use `tests` to check behaviour with switches on and off (see The Hall Switch).

Then run the checker (needs Node.js), from the project folder:

```
node games/light-it-up/check-levels.cjs
```

It builds the intended design for every level and checks it passes with the expected stars,
and that typical mistakes (series instead of parallel, thin cable, missing switch) fail.
