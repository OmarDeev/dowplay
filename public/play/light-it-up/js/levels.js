"use strict";
// Light It Up: the levels.
//
// Grid positions are junctions numbered from the top-left (0, 0). A part sits on
// an edge: "x,y,h" joins (x, y) to (x+1, y) and "x,y,v" joins (x, y) to (x, y+1).
// Rooms are drawn as bands of the house, in grid units, and light up when their
// lamps work. `par` is the cost of the cheapest known design (3 stars) and
// `budget` the cost for 2 stars.

const LEVELS = [
  {
    id: "lights-on",
    title: "Lights On",
    years: "Year 8",
    cols: 8,
    rows: 5,
    story: "It's getting dark and the bedroom lamp won't come on. It isn't connected to anything yet!",
    goal: "Connect the bedroom lamp to the battery so it lights up.",
    hints: [
      "Electricity needs a complete loop: out of the battery's + side, through the lamp, and back to the − side.",
      "Drag along the grid to lay wire. Run one wire along the top and one along the bottom.",
    ],
    learn:
      "A circuit only works when there is a complete loop. Current flows out of the + side of the battery, through the lamp and back to the − side. Break the loop anywhere and the lamp goes out.",
    budget: 12,
    par: 8,
    tools: [{ type: "wire", cost: 1 }],
    rooms: [
      { name: "Store room", x0: -0.5, x1: 2.5 },
      { name: "Bedroom", x0: 2.5, x1: 7.5, lights: ["lamp"] },
    ],
    parts: [
      { id: "battery", type: "battery", edge: "1,2,v", plus: "a", emf: 6, fuse: 5, name: "Battery" },
      { id: "lamp", type: "lamp", edge: "5,2,v", name: "Bedroom lamp", vRated: 6, pRated: 3 },
    ],
  },
  {
    id: "two-rooms",
    title: "Two Rooms",
    years: "Year 8",
    cols: 10,
    rows: 5,
    story: "The kitchen and the bedroom both need light, and there's only one 6 V battery.",
    goal: "Make both lamps shine at full brightness.",
    hints: [
      "Try wiring the lamps one after the other first. How bright are they?",
      "Lamps in a chain (series) share the battery's 6 V, so each only gets 3 V.",
      "Give each lamp its own path to both sides of the battery. That's called parallel.",
    ],
    learn:
      "In series, components share the battery's voltage, so two 6 V lamps on a 6 V battery are dim. In parallel, each lamp gets the full voltage. That's why the lights in a house are wired in parallel.",
    budget: 16,
    par: 12,
    tools: [{ type: "wire", cost: 1 }],
    rooms: [
      { name: "Store room", x0: -0.5, x1: 2.5 },
      { name: "Kitchen", x0: 2.5, x1: 5.5, lights: ["kitchen"] },
      { name: "Bedroom", x0: 5.5, x1: 9.5, lights: ["bedroom"] },
    ],
    parts: [
      { id: "battery", type: "battery", edge: "1,2,v", plus: "a", emf: 6, fuse: 5, name: "Battery" },
      { id: "kitchen", type: "lamp", edge: "4,2,v", name: "Kitchen lamp", vRated: 6, pRated: 3 },
      { id: "bedroom", type: "lamp", edge: "7,2,v", name: "Bedroom lamp", vRated: 6, pRated: 3 },
    ],
  },
  {
    id: "hall-switch",
    title: "The Hall Switch",
    years: "Years 8–9",
    cols: 10,
    rows: 6,
    story: "The switch by the front door is for the hall light. The kitchen lamp must stay on whatever the switch does.",
    goal: "Switch OFF: only the kitchen lamp is on. Switch ON: both lamps are on.",
    hints: [
      "Tap the switch to flip it and test your circuit both ways.",
      "A switch only controls the current that has to pass through it.",
      "Give the kitchen lamp its own loop back to the battery. Send only the hall lamp's return wire through the switch.",
    ],
    learn:
      "A switch breaks the loop it sits in. Put it in one branch and it controls only that branch, while the parallel branches keep working. That's how each room in a house gets its own light switch.",
    budget: 20,
    par: 16,
    tools: [{ type: "wire", cost: 1 }],
    rooms: [
      { name: "Entrance", x0: -0.5, x1: 3.5 },
      { name: "Kitchen", x0: 3.5, x1: 5.5, lights: ["kitchen"] },
      { name: "Hall", x0: 5.5, x1: 9.5, lights: ["hall"] },
    ],
    parts: [
      { id: "battery", type: "battery", edge: "1,2,v", plus: "a", emf: 6, fuse: 5, name: "Battery" },
      { id: "kitchen", type: "lamp", edge: "4,2,v", name: "Kitchen lamp", vRated: 6, pRated: 3 },
      { id: "hall", type: "lamp", edge: "7,2,v", name: "Hall lamp", vRated: 6, pRated: 3 },
      { id: "switch", type: "switch", edge: "2,4,h", name: "Hall switch", label: "below" },
    ],
    tests: [
      { label: "Switch OFF", switches: { switch: false }, expect: { kitchen: "on", hall: "off" } },
      { label: "Switch ON", switches: { switch: true }, expect: { kitchen: "on", hall: "on" } },
    ],
  },
  {
    id: "twelve-volts",
    title: "Twelve Volts",
    years: "Year 9",
    cols: 10,
    rows: 6,
    story: "The garden has a 12 V supply, but the porch and garden lamps are only rated 6 V.",
    goal: "Light both lamps without blowing them.",
    hints: [
      "What happens if each lamp gets the full 12 V?",
      "Remember Two Rooms: lamps in series share the voltage.",
      "Two identical lamps in series on 12 V get 6 V each.",
    ],
    learn:
      "Voltage is shared between components in series. Two identical lamps in series on 12 V get 6 V each, which is just right. A 6 V lamp connected straight across 12 V gets twice its rated voltage and blows.",
    budget: 16,
    par: 15,
    tools: [
      { type: "wire", cost: 1 },
      { type: "resistor", value: 12, cost: 3 },
    ],
    rooms: [
      { name: "Garage", x0: -0.5, x1: 2.5 },
      { name: "Porch", x0: 2.5, x1: 5.5, lights: ["porch"] },
      { name: "Garden", x0: 5.5, x1: 9.5, lights: ["garden"] },
    ],
    parts: [
      { id: "battery", type: "battery", edge: "1,2,v", plus: "a", emf: 12, fuse: 5, name: "Supply" },
      { id: "porch", type: "lamp", edge: "4,2,v", name: "Porch lamp", vRated: 6, pRated: 3 },
      { id: "garden", type: "lamp", edge: "7,2,v", name: "Garden lamp", vRated: 6, pRated: 3 },
    ],
  },
  {
    id: "pick-resistor",
    title: "Pick the Resistor",
    years: "Year 10",
    cols: 9,
    rows: 5,
    numbers: true,
    tol: 0.1,
    story: "The desk lamp is rated 6 V, 0.5 A, but the battery gives 9 V. A resistor in series can take the extra voltage.",
    goal: "Light the desk lamp at 6 V (within 10%).",
    hints: [
      "The resistor needs to take 9 V − 6 V = 3 V.",
      "In series the same 0.5 A flows through the lamp and the resistor, so R = V ÷ I = 3 V ÷ 0.5 A.",
      "There's no 6 Ω resistor in the box, but resistors in series add up: 2 Ω + 4 Ω = 6 Ω.",
    ],
    learn:
      "Ohm's law: V = I × R. To drop 3 V at 0.5 A you need R = 3 ÷ 0.5 = 6 Ω. Resistors in series add up: R = R₁ + R₂, so 2 Ω and 4 Ω make 6 Ω.",
    budget: 16,
    par: 14,
    tools: [
      { type: "wire", cost: 1 },
      { type: "resistor", value: 2, cost: 3 },
      { type: "resistor", value: 4, cost: 3 },
      { type: "resistor", value: 10, cost: 3 },
      { type: "resistor", value: 22, cost: 3 },
    ],
    rooms: [
      { name: "Cupboard", x0: -0.5, x1: 2.5 },
      { name: "Study", x0: 2.5, x1: 8.5, lights: ["lamp"] },
    ],
    parts: [
      { id: "battery", type: "battery", edge: "1,2,v", plus: "a", emf: 9, fuse: 2, name: "Battery" },
      { id: "lamp", type: "lamp", edge: "6,2,v", name: "Desk lamp", vRated: 6, pRated: 3 },
    ],
  },
  {
    id: "two-fuses",
    title: "Two Fuses",
    years: "Years 10–11",
    cols: 14,
    rows: 6,
    numbers: true,
    tol: 0.1,
    story: "The house has two 12 V circuits, each protected by a 3 A fuse. If a circuit draws more than 3 A, its fuse blows.",
    goal: "Run all four appliances without blowing a fuse. Keep circuit A and circuit B separate.",
    hints: [
      "Work out each appliance's current with I = P ÷ V.",
      "Heater 2 A, fridge 1.5 A, TV 1 A, lamp 0.25 A. Currents in parallel branches add up.",
      "Two appliances on each circuit puts 3.5 A on circuit A. Try a different split.",
    ],
    learn:
      "I = P ÷ V gives the current each appliance draws, and currents in parallel branches add up. Electricians share appliances between circuits so that no fuse carries more than its rating.",
    budget: 20,
    par: 16,
    tools: [{ type: "wire", cost: 1 }],
    separate: [["supplyA", "supplyB"]],
    rooms: [
      { name: "Fuse box A", x0: -0.5, x1: 2 },
      { name: "Lounge", x0: 2, x1: 4 },
      { name: "Kitchen", x0: 4, x1: 6 },
      { name: "Den", x0: 6, x1: 8 },
      { name: "Bedroom", x0: 8, x1: 10, lights: ["lamp"] },
      { name: "Fuse box B", x0: 10, x1: 13.5 },
    ],
    parts: [
      { id: "supplyA", type: "battery", edge: "1,2,v", plus: "a", emf: 12, fuse: 3, name: "Circuit A", ref: "circuit A", label: "below" },
      { id: "heater", type: "appliance", icon: "heater", edge: "3,2,v", name: "Heater", vRated: 12, pRated: 24, label: "below" },
      { id: "fridge", type: "appliance", icon: "fridge", edge: "5,2,v", name: "Fridge", vRated: 12, pRated: 18, label: "below" },
      { id: "tv", type: "appliance", icon: "tv", edge: "7,2,v", name: "TV", ref: "the TV", vRated: 12, pRated: 12, label: "below" },
      { id: "lamp", type: "lamp", edge: "9,2,v", name: "Lamp", vRated: 12, pRated: 3, label: "below" },
      { id: "supplyB", type: "battery", edge: "11,2,v", plus: "a", emf: 12, fuse: 3, name: "Circuit B", ref: "circuit B", label: "below" },
    ],
  },
  {
    id: "doorbell",
    title: "Smart Doorbell",
    years: "Years 11–13",
    cols: 10,
    rows: 6,
    numbers: true,
    story:
      "The smart doorbell needs between 2.8 V and 3.2 V, but the battery gives 9 V. The battery has a 100 mA fuse, so the circuit can't waste much current.",
    goal: "Give the doorbell 2.8–3.2 V without blowing the 100 mA fuse.",
    hints: [
      "Build a potential divider: two resistances in series across the battery. The doorbell takes its voltage from the junction between them.",
      "To get 3 V out of 9 V, the bottom resistance should be half the top one.",
      "The doorbell (1 kΩ) is in parallel with the bottom resistance and pulls the voltage down a little, so make the bottom slightly bigger. Small resistors draw too much current.",
    ],
    learn:
      "A potential divider shares voltage in proportion to resistance: V_out = V_in × R₂ ÷ (R₁ + R₂). Anything connected to the output is in parallel with R₂, which lowers the output (this is called loading). Larger resistors waste less current.",
    budget: 24,
    par: 21,
    tools: [
      { type: "wire", cost: 1 },
      { type: "resistor", value: 10, cost: 3 },
      { type: "resistor", value: 22, cost: 3 },
      { type: "resistor", value: 47, cost: 3 },
      { type: "resistor", value: 100, cost: 3 },
    ],
    rooms: [
      { name: "Cupboard", x0: -0.5, x1: 2.5 },
      { name: "Workshop", x0: 2.5, x1: 5.5 },
      { name: "Front door", x0: 5.5, x1: 9.5 },
    ],
    parts: [
      { id: "battery", type: "battery", edge: "1,1,v", plus: "a", emf: 9, fuse: 0.1, name: "Battery" },
      {
        id: "doorbell",
        type: "device",
        icon: "doorbell",
        edge: "7,2,v",
        plus: "a",
        name: "Doorbell",
        r: 1000,
        vMin: 2.8,
        vMax: 3.2,
      },
    ],
  },
  {
    id: "shed",
    title: "Power to the Shed",
    years: "Years 12–13",
    cols: 16,
    rows: 5,
    numbers: true,
    tol: 0.1,
    wireR: 0.1,
    thickR: 0.01,
    story:
      "The shed heater (12 V, 36 W) is a long way from the supply. Thin wire is cheap but has 0.1 Ω per section. Thick cable has only 0.01 Ω per section, but costs three times as much.",
    goal: "Give both the house lamp and the shed heater at least 10.8 V.",
    hints: [
      "The heater draws about 3 A, so every 0.1 Ω in its loop wastes about 0.3 V.",
      "The house lamp only draws 1 A, so thin wire is fine for its short loop.",
      "Work out how much resistance the shed loop can have and still leave 10.8 V for the heater. Can you afford any thin sections at all?",
    ],
    learn:
      "Cables have resistance, so they waste voltage (V = I × R) and power (P = I² × R). Circuits carrying a big current need thicker cables. That's why engineers size cables for the current they carry, and why the National Grid uses very high voltages to keep currents low.",
    budget: 80,
    par: 76,
    tools: [
      { type: "wire", cost: 1, label: "Thin wire" },
      { type: "thick", cost: 3, label: "Thick cable" },
    ],
    rooms: [
      { name: "House", x0: -0.5, x1: 4.5, lights: ["lamp"] },
      { name: "Garden", x0: 4.5, x1: 12.5 },
      { name: "Shed", x0: 12.5, x1: 15.5 },
    ],
    parts: [
      { id: "lamp", type: "lamp", edge: "0,2,v", name: "House lamp", vRated: 12, pRated: 12 },
      { id: "battery", type: "battery", edge: "3,2,v", plus: "a", emf: 12, fuse: 10, name: "Supply" },
      { id: "heater", type: "appliance", icon: "heater", edge: "15,2,v", name: "Shed heater", vRated: 12, pRated: 36, label: "left" },
    ],
  },
];

if (typeof module !== "undefined") module.exports = LEVELS;
