"use strict";
// Gear Garage: the levels.
//
// Holes are numbered from the top-left (0, 0). An N-tooth gear has radius N/8 holes,
// so gears mesh when their axles are (N1 + N2)/8 holes apart, e.g. two 16-tooth
// gears 4 holes apart. Motor speeds are in rpm; dir 1 = clockwise, -1 = anticlockwise.
// `par` is the cost of the cheapest design (3 stars) and `budget` the cost for 2 stars.
// Run `node check-levels.js` after editing to confirm every level can be solved.

const GEAR_PRICES = { 8: 2, 16: 3, 24: 4, 32: 5, 40: 6 };
const gearTools = (...sizes) => sizes.map((teeth) => ({ teeth, cost: GEAR_PRICES[teeth] }));

const LEVELS = [
  {
    id: "first-gear",
    title: "First Gear",
    years: "Year 8",
    cols: 13,
    rows: 9,
    story: "The go-kart's motor is running, but nothing connects it to the wheel.",
    goal: "Put a gear on the motor and a gear on the wheel so their teeth mesh.",
    hints: [
      "Pick a gear size, then tap the motor's axle to put a gear on it.",
      "The motor and the wheel are 4 holes apart. Two 16-tooth gears each reach 2 holes.",
    ],
    learn:
      "Gears pass turning motion from one axle to another when their teeth mesh. Look closely: the wheel turns the opposite way to the motor. Meshing gears always turn in opposite directions.",
    budget: 8,
    par: 6,
    tools: gearTools(8, 16, 24),
    motor: { x: 4, y: 4, rpm: 30, dir: 1, torque: 5 },
    outputs: [{ id: "wheel", name: "Wheel", kind: "wheel", x: 8, y: 4, want: {} }],
  },
  {
    id: "same-way",
    title: "Same Way Round",
    years: "Year 8",
    cols: 15,
    rows: 9,
    story: "The conveyor belt must carry boxes to the right, so its drum has to turn the same way as the motor: clockwise.",
    goal: "Make the conveyor drum turn clockwise.",
    hints: [
      "Two meshing gears turn in opposite directions.",
      "Add a third gear in the middle. It's called an idler.",
      "Count along the chain: clockwise, anticlockwise, clockwise...",
    ],
    learn:
      "Each mesh reverses the direction. An idler gear in the middle makes the last gear turn the same way as the first. Engineers use idlers to change direction or to bridge a gap.",
    budget: 10,
    par: 8,
    tools: gearTools(8, 16, 24, 32),
    motor: { x: 3, y: 4, rpm: 30, dir: 1, torque: 5 },
    outputs: [{ id: "drum", name: "Conveyor drum", kind: "drum", x: 11, y: 4, want: { dir: 1 } }],
  },
  {
    id: "need-for-speed",
    title: "Need for Speed",
    years: "Years 8–9",
    cols: 13,
    rows: 9,
    story: "The workshop fan needs to spin at 60 rpm, but the motor only turns at 20 rpm.",
    goal: "Make the fan spin at 60 rpm.",
    hints: [
      "Try different sizes on the motor and on the fan. What happens to the fan's speed?",
      "A big gear turning a small gear speeds it up.",
      "Speed goes up by driver teeth ÷ driven teeth. You need 3 times faster.",
    ],
    learn:
      "Gear ratio = driver teeth ÷ driven teeth. A 24-tooth gear turning an 8-tooth gear makes it turn 24 ÷ 8 = 3 times faster: 20 rpm becomes 60 rpm.",
    budget: 8,
    par: 6,
    tools: gearTools(8, 16, 24, 32),
    motor: { x: 4, y: 4, rpm: 20, dir: 1, torque: 5 },
    outputs: [{ id: "fan", name: "Fan", kind: "fan", x: 8, y: 4, want: { rpm: 60 } }],
  },
  {
    id: "heavy-lifting",
    title: "Heavy Lifting",
    years: "Year 9",
    cols: 15,
    rows: 10,
    story: "The winch has to lift an engine. The winch needs 5 N·m of torque, but the motor can only give 2 N·m.",
    goal: "Lift the engine with the winch.",
    hints: [
      "Torque is turning force. Slowing a turn down with gears increases its torque.",
      "A small gear turning a big gear: slower, but stronger.",
      "You need at least 5 ÷ 2 = 2.5 times more torque, so the winch must turn at least 2.5 times slower.",
    ],
    learn:
      "Gears trade speed for torque. A small gear driving a big one turns it slower but with more turning force: torque goes up by the same ratio as the speed goes down. That's why low gears help cars climb hills.",
    budget: 9,
    par: 7,
    tools: gearTools(8, 16, 24, 32),
    motor: { x: 4, y: 4, rpm: 30, dir: 1, torque: 2 },
    outputs: [{ id: "winch", name: "Winch", kind: "winch", x: 9, y: 4, load: 5, want: {} }],
  },
  {
    id: "round-the-engine",
    title: "Round the Engine",
    years: "Years 9–10",
    cols: 16,
    rows: 12,
    story: "In a car engine, the camshaft turns at exactly half the speed of the crankshaft. The engine block is in the way.",
    goal: "Turn the camshaft at 20 rpm, clockwise, by going around the engine block.",
    hints: [
      "Route a chain of gears over the top of the engine block.",
      "Idler gears don't change the speed. Only the first gear and the last gear decide the ratio.",
      "Half speed: the camshaft's gear needs twice as many teeth as the crankshaft's gear. Watch the direction too.",
    ],
    learn:
      "Idler gears pass motion along and can change direction, but they don't change the speed ratio. The overall ratio depends only on the first and last gears: 16 teeth ÷ 8 teeth = 2, so the camshaft turns at half speed.",
    budget: 18,
    par: 15,
    tools: gearTools(8, 16, 24, 32),
    motor: { x: 3, y: 8, rpm: 40, dir: 1, torque: 5, name: "Crankshaft" },
    outputs: [{ id: "cam", name: "Camshaft", kind: "cam", x: 12, y: 8, want: { rpm: 20, dir: 1 } }],
    obstacles: [{ name: "Engine block", x0: 5.5, y0: 6.5, x1: 9.5, y1: 10.5 }],
  },
  {
    id: "compound",
    title: "Compound Gears",
    years: "Years 10–11",
    cols: 16,
    rows: 11,
    compound: true,
    story: "The display turntable must turn very slowly: 4 rpm from a 36 rpm motor. That's 9 times slower, and one pair of gears can only manage 5 times.",
    goal: "Turn the turntable at 4 rpm.",
    hints: [
      "Tap a gear's axle again with a different size to stack a second gear on the same axle. Stacked gears turn together.",
      "Two stages multiply: if each stage is 3 times slower, together they are 3 × 3 = 9 times slower.",
      "8 teeth driving 24 teeth is 3 times slower. Do it twice.",
    ],
    learn:
      "A compound gear train puts two gears on one axle, so the ratios multiply: (24 ÷ 8) × (24 ÷ 8) = 9. Compound trains give big ratios in a small space, which is how clocks and gearboxes work.",
    budget: 15,
    par: 12,
    tools: gearTools(8, 16, 24, 32, 40),
    motor: { x: 3, y: 5, rpm: 36, dir: 1, torque: 5 },
    outputs: [{ id: "turntable", name: "Turntable", kind: "turntable", x: 11, y: 5, want: { rpm: 4 } }],
  },
  {
    id: "garage-door",
    title: "Garage Door",
    years: "Years 11–12",
    cols: 15,
    rows: 12,
    numbers: true,
    story: "The garage door is lifted by a rack: a straight bar of teeth. A gear turning against it pushes it up or down.",
    goal: "Raise the door at 9–10 cm/s. Each hole is 1 cm apart.",
    hints: [
      "The door moves at the speed of the gear's teeth: v = ω × r, where ω is in radians per second.",
      "In a simple chain, every gear's teeth move at the same speed. So the door's speed only depends on the gear on the motor.",
      "The motor turns at 30 rpm = π rad/s. Which radius r gives π × r between 9 and 10?",
    ],
    learn:
      "A rack and pinion turns rotation into straight-line motion: v = ω × r. In a simple gear train, the teeth of every gear move at the same speed, so v depends only on the motor's gear: π rad/s × 3 cm = 9.4 cm/s.",
    budget: 11,
    par: 8,
    tools: gearTools(8, 16, 24, 32),
    motor: { x: 3, y: 6, rpm: 30, dir: 1, torque: 5 },
    outputs: [],
    rack: { name: "Garage door", x: 12, y0: 1, y1: 10.5, want: { minSpeed: 9, maxSpeed: 10 } },
    obstacles: [{ name: "Garage door", x0: 12.6, y0: -1, x1: 15, y1: 13 }],
  },
  {
    id: "efficiency",
    title: "Every Mesh Counts",
    years: "Years 12–13",
    cols: 14,
    rows: 10,
    numbers: true,
    compound: true,
    efficiency: 0.95,
    story:
      "The lift needs 3.6 N·m at 15 rpm or faster. The motor gives 1 N·m at 60 rpm, and every mesh wastes 5% of the power as heat.",
    goal: "Run the lift at 15 rpm or faster without stalling the motor.",
    hints: [
      "15 rpm from 60 rpm means a ratio of at most 4.",
      "With a ratio of 4, the output torque is 1 × 4 × 0.95 per mesh. How many meshes can you afford?",
      "Two meshes leave 4 × 0.95² = 3.61 N·m. A compound train gives a ratio of 4 in just two meshes.",
    ],
    learn:
      "Power out = efficiency × power in, and efficiencies multiply: two meshes at 95% give 0.95² = 90%. Every extra idler wastes power, so good designs use as few meshes as possible.",
    budget: 13,
    par: 10,
    tools: gearTools(8, 16, 24, 32, 40),
    motor: { x: 3, y: 5, rpm: 60, dir: 1, torque: 1 },
    outputs: [{ id: "lift", name: "Lift", kind: "winch", x: 9, y: 5, load: 3.6, want: { minRpm: 15 } }],
  },
];

if (typeof module !== "undefined") module.exports = LEVELS;
