"use strict";
// Bridge Builder: the levels.
//
// Grid points are numbered from the top-left (0, 0); one square is 4 m. The road runs
// along row `deckY` from the left bank edge (`left`) to the right bank edge (`right`).
// Beams can only be fixed to the ground at `anchors`. `noBuild` zones block building.
// Truck weight is in kN (10 kN ≈ 1 tonne), shared equally between its two axles.
// `par` is the cost of the cheapest known design (3 stars), `budget` the cost for 2 stars.
// Run `node check-levels.js` after editing to confirm every level can be solved.

// Two banks of ground either side of the gap, at road level.
function banks(cols, rows, deckY, left, right) {
  return [
    { x0: -1, y0: deckY, x1: left, y1: rows + 1 },
    { x0: right, y0: deckY, x1: cols + 1, y1: rows + 1 },
  ];
}

// Boats sail under the road, so nothing can be built below it in the gap.
const boatZone = (level) => ({ name: "Boats need to pass underneath", x0: level.left, y0: level.deckY, x1: level.right, y1: level.rows + 1 });

const LEVELS = [
  {
    id: "mind-the-gap",
    title: "Mind the Gap",
    years: "Year 8",
    cols: 9,
    rows: 6,
    deckY: 3,
    left: 3,
    right: 5,
    story: "A small stream cuts the village road in two. Build a bridge so the car can get across.",
    goal: "Build a road across the gap that doesn't wobble, and drive the car over it.",
    hints: [
      "Drag along the dashed line with the road tool to lay the road.",
      "A flat road with a joint in the middle folds like a hinge. Press 'Drive' and watch.",
      "Add wooden beams from the anchor bolts on the cliff to the middle of the road to make triangles.",
    ],
    learn:
      "Triangles are the strongest shape for a structure: a triangle can't change shape without a side changing length. A square or a straight line of beams can fold at its joints, but a triangle can't.",
    materials: ["wood"],
    truck: { name: "Car", kind: "car", weight: 20, wheelbase: 1 },
    anchors: [
      [3, 3],
      [5, 3],
      [3, 4],
      [5, 4],
    ],
    budget: 55,
    par: 41,
  },
  {
    id: "triangle-power",
    title: "Triangle Power",
    years: "Year 8",
    cols: 11,
    rows: 7,
    deckY: 4,
    left: 3,
    right: 7,
    story: "The river is wider here and there's nowhere to bolt onto the cliffs below the road.",
    goal: "Build a bridge above the road using triangles, and drive the van across.",
    hints: [
      "The only anchors are at the ends of the road, so build a frame above the road.",
      "Make a row of triangles over the road: up, across, down, like a zig-zag.",
      "Every joint in the road needs a beam going up from it.",
    ],
    learn:
      "A truss is a frame made of triangles. It lets a bridge span a wide gap with only a few light beams, because the triangles pass the weight along to the banks.",
    boats: true,
    materials: ["wood"],
    truck: { name: "Van", kind: "van", weight: 30, wheelbase: 1 },
    anchors: [
      [3, 4],
      [7, 4],
    ],
    budget: 210,
    par: 176,
  },
  {
    id: "push-and-pull",
    title: "Push and Pull",
    years: "Year 9",
    cols: 11,
    rows: 7,
    deckY: 4,
    left: 3,
    right: 7,
    numbers: true,
    story: "A delivery truck needs to cross, and it's much heavier than the van. Wood alone won't do everywhere, but steel costs twice as much.",
    goal: "Get the truck across. Use steel only where the forces are biggest.",
    hints: [
      "Turn on 'Show forces'. Blue beams are being pulled (tension). Orange beams are being squashed (compression).",
      "The beams near the middle of the top carry the most squash. The percentage shows how close each beam is to its limit.",
      "Use steel only for the beams over 100%, and wood everywhere else.",
    ],
    learn:
      "In a bridge, some beams are pulled (tension) and some are squashed (compression). The top of a truss is squashed and the bottom is stretched, like a bending ruler. Engineers put strong material only where forces are biggest.",
    boats: true,
    materials: ["wood", "steel"],
    truck: { name: "Truck", kind: "truck", weight: 60, wheelbase: 1 },
    anchors: [
      [3, 4],
      [7, 4],
    ],
    budget: 230,
    par: 192,
  },
  {
    id: "low-bridge",
    title: "Low Bridge",
    years: "Years 9–10",
    cols: 11,
    rows: 8,
    deckY: 2,
    left: 3,
    right: 7,
    numbers: true,
    story: "Power lines run just above the road, so nothing can go above it. But there are anchor bolts on the cliff faces below.",
    goal: "Build the bridge underneath the road and drive the truck across.",
    hints: [
      "Nothing can be built above the road, so put the triangles underneath it.",
      "Beams from the anchor bolts on the cliffs can push up on the road, like an arch.",
      "An arch is squashed all the way round, so it pushes outwards on the cliffs.",
    ],
    learn:
      "Bridges can carry their load from below, like an arch. An arch is squashed (compression) along its whole curve and pushes outwards on the banks, which is why arches need strong ground at each end.",
    materials: ["wood", "steel"],
    truck: { name: "Truck", kind: "truck", weight: 60, wheelbase: 1 },
    anchors: [
      [3, 2],
      [7, 2],
      [3, 3],
      [7, 3],
      [3, 4],
      [7, 4],
      [3, 5],
      [7, 5],
    ],
    noBuild: [{ name: "Power lines overhead", x0: -1, y0: -1, x1: 12, y1: 2 }],
    budget: 180,
    par: 148,
  },
  {
    id: "buckle-up",
    title: "Buckle Up",
    years: "Years 10–11",
    cols: 12,
    rows: 7,
    deckY: 4,
    left: 3,
    right: 9,
    numbers: true,
    story: "A lorry needs to cross a wider gap. Watch out: squashed beams can buckle, and long beams buckle much more easily than short ones.",
    goal: "Get the lorry across without any beam buckling.",
    hints: [
      "A diagonal beam is about 1.4 times as long as a straight one, so it buckles at half the force (strength ∝ 1 ÷ length²).",
      "Pulling a beam doesn't make it buckle. Try to arrange the diagonals so they are pulled, not squashed.",
      "Diagonals that slope down towards the middle are pulled. That's a Pratt truss.",
    ],
    learn:
      "Long, thin beams buckle when squashed: buckling force ∝ 1 ÷ length², so doubling the length quarters the strength. Good designs keep long beams in tension and short beams in compression, like the Pratt truss used on many railway bridges.",
    boats: true,
    materials: ["wood", "steel"],
    truck: { name: "Lorry", kind: "lorry", weight: 80, wheelbase: 1 },
    anchors: [
      [3, 4],
      [9, 4],
    ],
    budget: 460,
    par: 388,
  },
  {
    id: "go-deeper",
    title: "Go Deeper",
    years: "Years 11–12",
    cols: 14,
    rows: 8,
    deckY: 5,
    left: 3,
    right: 11,
    numbers: true,
    story: "This gap is twice as wide. The longer the bridge, the bigger the bending effect in the middle.",
    goal: "Get the lorry across this long span within budget.",
    hints: [
      "The squash in the top beams and the pull in the bottom beams are biggest in the middle of the span.",
      "Making the truss taller (deeper) reduces those forces: force = bending moment ÷ depth.",
      "Try a truss two or three squares deep in the middle and shallower near the ends.",
    ],
    learn:
      "A bridge resists bending with a pair of forces: squash in the top and pull in the bottom. Force = bending moment ÷ depth, so a deeper truss needs smaller forces and lighter beams. That's why long-span bridges are tall in the middle.",
    boats: true,
    materials: ["wood", "steel"],
    truck: { name: "Lorry", kind: "lorry", weight: 80, wheelbase: 1 },
    anchors: [
      [3, 5],
      [11, 5],
    ],
    budget: 800,
    par: 686,
  },
  {
    id: "cable-stayed",
    title: "Cable-Stayed",
    years: "Years 11–13",
    cols: 16,
    rows: 9,
    deckY: 6,
    left: 3,
    right: 13,
    numbers: true,
    story:
      "A 40 m gorge. Two tall towers stand on the banks, with anchor bolts at the top. Steel cables are cheap and very strong, but they can only pull.",
    goal: "Hold the road up with cables from the towers and drive the lorry across.",
    hints: [
      "Drag from a bolt on a tower to a joint on the road to string a cable.",
      "Each joint in the road needs a cable holding it up from above.",
      "Cables can't push. They pull the road up and in, and the road itself is squashed between them.",
    ],
    learn:
      "In a cable-stayed bridge, straight cables run from tall towers to the road. The cables are in tension and the road is squashed between them. Cables are light and strong in tension, so these bridges can cross very long gaps.",
    boats: true,
    materials: ["cable", "steel"],
    cableReach: 11,
    truck: { name: "Lorry", kind: "lorry", weight: 80, wheelbase: 1 },
    anchors: [
      [3, 6],
      [13, 6],
      [3, 1],
      [3, 2],
      [13, 1],
      [13, 2],
    ],
    towers: [
      { x: 3, top: 1 },
      { x: 13, top: 1 },
    ],
    budget: 450,
    par: 374,
  },
  {
    id: "heavy-haul",
    title: "Heavy Haul",
    years: "Years 12–13",
    cols: 16,
    rows: 9,
    deckY: 5,
    left: 3,
    right: 13,
    numbers: true,
    story: "A mobile crane weighing 10 tonnes must cross a 40 m river. You can use everything you've learned, and there's a rock in the middle of the river.",
    goal: "Get the crane across for as little money as possible.",
    hints: [
      "The rock in the river has anchor bolts. Using it splits one long span into two shorter ones.",
      "Shorter spans have much smaller bending moments: moment grows with span².",
      "Use deep triangles, keep long beams in tension, and only use steel where you need it.",
    ],
    learn:
      "Bending moment grows with the square of the span, so a support in the middle reduces the forces enormously. Real engineers balance span, depth, materials and cost, and check every member for tension, compression and buckling, just as you did.",
    materials: ["wood", "steel", "cable"],
    cableReach: 6,
    truck: { name: "Crane", kind: "crane", weight: 100, wheelbase: 1 },
    anchors: [
      [3, 5],
      [13, 5],
      [7, 6],
      [8, 6],
      [9, 6],
    ],
    extraGround: [{ x0: 7, y0: 6, x1: 9, y1: 10 }],
    budget: 420,
    par: 353,
  },
];

for (const level of LEVELS) {
  level.ground = [...banks(level.cols, level.rows, level.deckY, level.left, level.right), ...(level.extraGround ?? [])];
  if (level.boats) level.noBuild = [...(level.noBuild ?? []), boatZone(level)];
}

if (typeof module !== "undefined") module.exports = LEVELS;
