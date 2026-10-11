"use strict";
// Grid Manager levels. Each level is plain data, so new ones can be added by copying one.
//
// map:     one letter per square (see TERRAIN in grid.js):
//            f field   h hilltop   v valley   y industrial yard   o sea   r hill lake
//            t houses  s school    F forest   w lake
//            P water pumps   B bus depot   K factory   (buildings for flexible jobs)
// items:   what the player can build.
// days:    one entry per day. name: shown in the sky; day: short name for multi-day levels.
//          rise/set: sunrise and sunset (hours). peak: midday sun on a
//          clear day (1 in summer, lower in winter). cloud: 0 = clear, 0.8 = very grey.
//          wind: 24 numbers, how hard the wind blows each hour (1 = a hilltop turbine at
//          full power). demand: 24 numbers, MW the town needs each hour.
// who:     who needs the power, for messages ("town" unless set).
// flex:    jobs the player can move: power (MW) for `hours` hours, starting no earlier than
//          `earliest` and finishing by `latest`. `start` is where they begin.
// co2Limit: most CO2 (tonnes) allowed, for levels with gas.
// par:     cheapest design `node check-levels.js` found (3 stars). budget: 2 stars.

const LEVELS = (() => {
  // Demand in MW for each hour from midnight.
  const SCHOOL = [0, 0, 0, 0, 0, 0, 0, 1, 5, 4, 4, 4, 5, 4, 4, 3, 2, 1, 0, 0, 0, 0, 0, 0];
  const TOWN = [3, 3, 3, 3, 3, 3, 4, 6, 6, 5, 5, 5, 5, 5, 5, 5, 6, 7, 8, 8, 7, 6, 5, 4];
  const RUSH = [3, 3, 3, 3, 3, 3, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 13, 14, 7, 6, 5, 4, 4];
  const SUMMER = [3, 3, 3, 3, 3, 3, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 7, 8, 8, 7, 6, 5, 4];
  const WINTER = [4, 4, 4, 4, 4, 5, 6, 8, 9, 8, 7, 7, 7, 7, 7, 8, 10, 12, 12, 11, 9, 7, 6, 5];

  // Wind for each hour from midnight (1 = full power on a hilltop).
  const CALM = new Array(24).fill(0);
  const NIGHT_BREEZE = [0.6, 0.6, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.2, 0.2, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.6, 0.6];
  const EVENING_LULL = [0.7, 0.7, 0.7, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, 0.4, 0.4, 0.35, 0.3, 0.25, 0.2, 0.1, 0.05, 0.05, 0.4, 0.6, 0.7, 0.7, 0.7];
  const LIGHT = [0.3, 0.3, 0.3, 0.3, 0.25, 0.25, 0.2, 0.2, 0.2, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.2, 0.2, 0.2, 0.25, 0.25, 0.3, 0.3, 0.3, 0.3];
  const STILL = [0.1, 0.1, 0.08, 0.06, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.06, 0.08, 0.1, 0.1, 0.12, 0.15];
  const GALE = [0.6, 0.7, 0.8, 0.9, 1, 1, 1, 1, 1, 0.9, 0.9, 0.8, 0.8, 0.8, 0.7, 0.7, 0.7, 0.6, 0.6, 0.6, 0.5, 0.5, 0.5, 0.5];

  return [
    {
      id: "sunny-school",
      title: "Sunny School",
      years: "Year 9",
      story: "Greenfield School wants to run on sunshine. Breakfast club starts at 7 am, lessons at 8, and the last club ends at 6 pm. The lights, computers and kitchen need power the whole time.",
      goal: "Build solar farms so the school has enough power every hour it's open.",
      hints: [
        "Watch the chart under the map: yellow is solar power, the white line is what the school needs. Red means a blackout.",
        "Solar farms make the most at midday. At 8 am the sun is low, so each farm makes much less, and that's when everyone arrives.",
        "Valley squares are shaded by the hills, so a farm there makes only 60% as much.",
      ],
      learn:
        "Supply has to match demand every hour, not just on average. Solar output follows the sun, so you need enough farms for the hardest hour (here 8 am), even though that leaves spare power at midday.",
      who: "school",
      items: ["solar"],
      map: ["FFfffvvF", "Fffssvvf", "fffssvvf", "FFfffvFF"],
      days: [{ name: "Sunny spring day", rise: 6, set: 20, cloud: 0, wind: CALM, demand: SCHOOL }],
      budget: 120,
      par: 90,
    },
    {
      id: "after-dark",
      title: "After Dark",
      years: "Year 9",
      story: "Now power the whole town of Brightwell. People need electricity at night too, when solar farms make nothing at all.",
      goal: "Keep the town powered for all 24 hours with solar farms and batteries.",
      hints: [
        "Batteries fill up with spare solar power in the day and give it back at night. Watch the purple battery strip under the chart.",
        "If the batteries run empty before sunrise, you need more of them, and enough solar to fill them.",
        "Batteries keep 90% of what goes in, so you need a little more spare solar than the town uses at night.",
      ],
      learn:
        "Storage moves energy from when it's made to when it's needed. Power (MW) is how fast energy flows; energy (MWh) is power × time. A town using 3 MW for 10 hours of darkness needs 30 MWh stored, plus a bit extra for losses.",
      items: ["solar", "battery"],
      map: ["FFffffffffFF", "Fffffttttyyf", "ffffftttttyy", "FFffffffFFFF"],
      days: [{ name: "Sunny summer day", rise: 5, set: 21, cloud: 0, wind: CALM, demand: TOWN }],
      budget: 400,
      par: 300,
    },
    {
      id: "windy-hill",
      title: "Windy Hill",
      years: "Years 9–10",
      story: "Brightwell has hills, and up there the wind blows day and night. Wind turbines cost more than solar farms, but they don't stop at sunset.",
      goal: "Keep the town powered all day, and spend as little as you can.",
      hints: [
        "Choose the wind turbine and look at the map: each square shows how much wind it gets. Hilltops get the most.",
        "The wind is strongest at night, just when solar stops. Every bit of night-time wind is energy you don't have to store.",
        "Try a mix: some wind, some solar and a few batteries.",
      ],
      learn:
        "Different sources work at different times, so a mix is cheaper than relying on one. Where you build matters too: a turbine on a hilltop makes twice what it would in a field. The average output divided by the maximum is called the capacity factor.",
      items: ["solar", "wind", "battery"],
      map: ["FhhhFFffffFF", "vvvFffttttyy", "vvvffffttFyy", "FFvvffffFFFF"],
      days: [{ name: "Breezy spring day", rise: 6, set: 20, cloud: 0.2, wind: NIGHT_BREEZE, demand: TOWN }],
      budget: 300,
      par: 230,
    },
    {
      id: "evening-rush",
      title: "Evening Rush",
      years: "Year 10",
      story: "It's autumn. The sun sets at 6 pm, just as everyone gets home, turns on the oven and plugs in the car. The wind drops in the evening too.",
      goal: "Get through the 6 pm rush, when the town needs 14 MW, without a blackout.",
      hints: [
        "Each battery can give out at most 2 MW, however full it is. How many do you need to give 14 MW at once?",
        "If there's a blackout while the battery strip still shows energy left, the problem is power (MW), not energy (MWh).",
        "Once you have enough batteries for the rush, their spare storage can cover the night as well.",
      ],
      learn:
        "Batteries have two limits: how much energy they store (MWh) and how fast they can deliver it (MW). Short, sharp peaks need power; long nights need energy. Grid batteries have to be sized for both.",
      items: ["solar", "wind", "battery"],
      map: ["hhhhFFffffFF", "hhvvffttttyy", "vvvffffttyyy", "FFvvffffFyyy"],
      days: [{ name: "Autumn day", rise: 7, set: 18, cloud: 0.1, wind: EVENING_LULL, demand: RUSH }],
      budget: 480,
      par: 370,
    },
    {
      id: "grey-skies",
      title: "Grey Skies",
      years: "Years 10–11",
      story: "The forecast: a sunny Monday, then a grey Tuesday with only a light breeze. The town needs power on both days, and the weather won't change to suit you.",
      goal: "Keep the town powered through Monday and Tuesday.",
      hints: [
        "Tap Tuesday on the chart: under thick cloud each solar farm makes about a quarter of what it did on Monday.",
        "Batteries can carry spare energy from Monday into Tuesday, but only as much as they hold.",
        "Design for the worst day, not the best one.",
      ],
      learn:
        "Renewable output depends on the weather, so a grid must be designed for bad days, not average ones. That means building more than a sunny day needs, and accepting some wasted energy when the weather is good.",
      items: ["solar", "wind", "battery"],
      map: ["FhhhFFffffFF", "vvvFffttttyy", "vvvffffttyyy", "FFvvffffFFyy"],
      days: [
        { name: "Sunny Monday", day: "Mon", rise: 6, set: 20, cloud: 0.05, wind: NIGHT_BREEZE, demand: TOWN },
        { name: "Grey Tuesday", day: "Tue", rise: 6, set: 20, cloud: 0.75, wind: LIGHT, demand: TOWN },
      ],
      budget: 500,
      par: 390,
    },
    {
      id: "backup-plan",
      title: "Backup Plan",
      years: "Years 11–12",
      story: "A cold winter day: short daylight, high demand, and the wind dies away in the evening. Now you can build gas plants. They run whenever you need them, but burning gas costs money and releases CO₂.",
      goal: "Keep the town powered and release no more than 4 tonnes of CO₂.",
      hints: [
        "Each MWh from gas releases 0.4 tonnes of CO₂, so 4 tonnes is 10 MWh: one plant at full power for two and a half hours.",
        "Gas plants are cheap to build. Keep them for the few hours that wind and batteries can't cover.",
        "Batteries are always used before gas, so more storage means less gas burnt.",
      ],
      learn:
        "Gas plants are 'dispatchable': they make power whenever asked, which makes them a handy backup. But every MWh releases CO₂. Cutting emissions means building more renewables and storage, which costs more: the trade-off every country faces on the way to net zero.",
      items: ["solar", "wind", "battery", "gas"],
      co2Limit: 4,
      map: ["hhhFFhhhFFff", "hvvffffttttF", "vvffffttttyy", "FFvvfffFFyyy"],
      days: [{ name: "Winter day", rise: 8, set: 16, peak: 0.55, cloud: 0.3, wind: EVENING_LULL, demand: WINTER }],
      budget: 520,
      par: 409,
    },
    {
      id: "smart-timing",
      title: "Smart Timing",
      years: "Year 12",
      story: "Some jobs in Brightwell don't have to happen at a fixed time. The water pumps, the electric buses and the factory oven can run whenever there's spare power, if someone schedules them.",
      goal: "Keep the town powered. Drag the three flexible jobs on the timeline to better hours.",
      hints: [
        "Right now all three jobs run in the evening, just as the sun goes down.",
        "Move them into the middle of the day, when solar power is going spare.",
        "Every MWh you move to midday is a MWh you don't have to store in a battery.",
      ],
      learn:
        "Changing when electricity is used is called demand-side response. Smart chargers, timers and cheaper midday prices move demand to when renewable power is plentiful. It's often the cheapest 'storage' there is.",
      items: ["solar", "wind", "battery"],
      map: ["FFhFffffffFF", "vvvFffttttPy", "vvvffBttKKyy", "FFvvffffFFyy"],
      days: [{ name: "Sunny summer day", rise: 5, set: 21, cloud: 0, wind: LIGHT, demand: SUMMER }],
      flex: [
        { id: "pumps", name: "Water pumps", short: "Pumps", building: "P", power: 2, hours: 4, earliest: 0, latest: 24, start: 18 },
        { id: "buses", name: "Bus charging", short: "Buses", building: "B", power: 4, hours: 3, earliest: 9, latest: 24, start: 19 },
        { id: "factory", name: "Factory oven", short: "Oven", building: "K", power: 3, hours: 4, earliest: 6, latest: 22, start: 16 },
      ],
      budget: 380,
      par: 280,
    },
    {
      id: "still-week",
      title: "Still Week",
      years: "Years 12–13",
      story: "Winter forecast: a gale on Monday, then a still, grey Tuesday with hardly any wind or sun, then a breeze on Wednesday. Batteries alone would cost a fortune, but the hill lakes could be used for pumped hydro.",
      goal: "Keep the town powered for all three days and release no more than 4 tonnes of CO₂.",
      hints: [
        "Pumped hydro stores 60 MWh for £60, far cheaper per MWh than batteries. But it gives out only 4 MW and gets back just 75%.",
        "Store Monday's gale for Tuesday. Look at the storage strip: does it last until Wednesday's breeze?",
        "Sea squares get 40% more wind than hilltops. A little gas can cover the very worst hours.",
      ],
      learn:
        "Long, still, grey spells (Germans call them Dunkelflaute, 'dark doldrums') are the hardest test for a renewable grid. Batteries are best for hours; pumped hydro and other long-duration storage cover days. Real grids combine wind, solar, storage, links to other countries and a little backup.",
      items: ["solar", "wind", "battery", "hydro", "gas"],
      co2Limit: 4,
      map: ["oooohhrrFFff", "ooohhvvFffff", "ooffvvttttyy", "offffvvttyyy", "offffFFFFyyy"],
      days: [
        { name: "Windy Monday", day: "Mon", rise: 7, set: 18, peak: 0.6, cloud: 0.3, wind: GALE, demand: WINTER },
        { name: "Still, grey Tuesday", day: "Tue", rise: 7, set: 18, peak: 0.6, cloud: 0.8, wind: STILL, demand: WINTER },
        { name: "Breezy Wednesday", day: "Wed", rise: 7, set: 18, peak: 0.6, cloud: 0.4, wind: NIGHT_BREEZE, demand: WINTER },
      ],
      budget: 480,
      par: 366,
    },
  ];
})();

if (typeof module !== "undefined") module.exports = LEVELS;
