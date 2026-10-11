# Grid Manager

An energy engineering game for Years 9–13. Students keep a town powered every hour of the
day with solar farms, wind turbines, batteries, pumped hydro and (later) gas, for as little
money and CO₂ as they can. A chart under the map shows, hour by hour, where the town's
power comes from, what's going into storage, what's wasted, and where the blackouts are.

## Playing

- The game itself is in `public/play/grid-manager/` (`index.html`, `style.css`, `js/`). Open that
  `index.html` directly, or run `npm run dev` and go to `/play/grid-manager/index.html`. On the
  website it plays inside `/games/grid-manager`. No installs or internet needed.
- Choose a machine, then tap squares on the map to build (drag to build on several).
  Tap it again, or use Remove (or right-click), to take it away. While a solar farm or wind
  turbine is chosen, each free square shows how much sun or wind it gets.
- Move along the chart to see any hour: the map shows the sky, the turbines, the battery
  levels and the houses' lights at that time. In Smart Timing, drag the flexible jobs along
  the timeline under the chart.
- **Run the day** plays it through. The lights stay on, or the houses go dark and the game
  explains why: not enough energy stored, or batteries that can't deliver it fast enough.
- Works with mouse, touch (iPad, Chromebook) and keyboard: arrow keys move around the map,
  Enter builds, Delete removes, number keys choose a machine, R chooses Remove. On the chart,
  left and right arrows pick an hour; Tab to a flexible job and use the arrows to move it.
- Progress is saved in the browser only. No accounts, no data leaves the device.

## Levels

| # | Level | Years | Concept |
|---|-------|-------|---------|
| 1 | Sunny School | 9 | Supply must meet demand every hour; solar follows the sun |
| 2 | After Dark | 9 | Storage moves energy from day to night; MW vs MWh |
| 3 | Windy Hill | 9–10 | Mixing sources; siting; capacity factor |
| 4 | Evening Rush | 10 | Battery power limit (MW) vs energy (MWh); peak demand |
| 5 | Grey Skies | 10–11 | Weather; designing for the worst day (2 days) |
| 6 | Backup Plan | 11–12 | Gas backup, CO₂ limits, cost vs emissions |
| 7 | Smart Timing | 12 | Demand-side response: moving flexible demand |
| 8 | Still Week | 12–13 | Long-duration storage (pumped hydro) for a still, grey spell (3 days) |

Stars: 1 for keeping the lights on (and under the CO₂ limit), 2 within budget, 3 at or below
the cheapest design found.

## The numbers

Costs are per day: each machine's share of paying for it and running it, plus gas fuel.

| Machine | Power | Storage | Cost per day | Notes |
|---------|-------|---------|--------------|-------|
| Solar farm | up to 4 MW | – | £30 | Follows the sun; clouds cut it |
| Wind turbine | up to 3 MW | – | £40 | Day or night, when the wind blows |
| Battery | 2 MW in or out | 8 MWh | £30 | Keeps 90% of what goes in |
| Pumped hydro | 4 MW in or out | 60 MWh | £60 | Keeps 75%; only on hill lakes |
| Gas plant | up to 4 MW | – | £10 + £2 per MWh | 0.4 t of CO₂ per MWh |

| Square | Sun | Wind | Can build |
|--------|-----|------|-----------|
| Field | 100% | 50% | solar, wind, battery, gas |
| Hilltop | 100% | 100% | solar, wind, battery, gas |
| Valley | 60% | 30% | solar, wind, battery, gas |
| Sea | – | 140% (up to full power) | wind |
| Industrial yard | – | – | battery, gas |
| Hill lake | – | – | pumped hydro |

Each hour: solar and wind make what the weather allows. Spare power charges the batteries,
then pumped hydro, and anything left is wasted. If there isn't enough, the batteries help
first, then pumped hydro, then gas, and anything still missing is a blackout. The level's
days repeat, so storage starts with whatever it has left at the end, and a design can't
borrow energy it never made.

All of this lives in `public/play/grid-manager/js/grid.js` (`ITEMS`, `TERRAIN`).

## Adding a level

Levels live in `public/play/grid-manager/js/levels.js`: the map (one letter per square), what can be built, each
day's sunrise, sunset, cloud, hourly wind and hourly demand, any flexible jobs, the CO₂
limit, and the budget and par. Then run (needs Node.js), from the project folder:

```
node games/grid-manager/check-levels.cjs
```

It tries every mix of machines that fits on the map, puts each one on its best square,
finds the fewest batteries that keep the lights on, and moves flexible jobs to their best
hours. It tells you whether the cheapest design matches the level's `par`. Checking all
eight levels takes about 20 seconds.

`node games/grid-manager/check-levels.cjs still-week --draw` checks one level and prints its best design hour by
hour; `--top` lists the next-best mixes, which is handy for checking that a level teaches
what you want it to.
