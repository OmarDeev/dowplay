/**
 * Engineering topics. Every game belongs to one topic, and each topic that has at
 * least one published game gets its own landing page at /category/<key> (good for
 * long-tail SEO, e.g. "circuit games for students").
 *
 * label:       short name for filters and tags
 * heading:     page heading and <title> ("Free <heading> for students")
 * description: meta description for Google (keep under ~155 characters)
 * intro:       paragraph at the top of the topic page
 * blurb:       a few words for menus and topic cards
 */
export const CATEGORIES = {
  electricity: {
    blurb: 'Circuits, Ohm’s law and fuses',
    label: 'Electricity',
    heading: 'Electricity and circuit games',
    description:
      'Free circuit games for ages 12–18: wire up lamps and appliances, compare series and parallel, and use Ohm’s law. No sign-up.',
    intro:
      'Wire up houses, lamps and appliances, and see why some bulbs glow brighter than others. These games cover complete circuits, series and parallel, voltage, current and resistance, Ohm’s law, fuses and potential dividers, from Year 8 up to A-level.',
  },
  mechanics: {
    blurb: 'Gear ratios, torque and machines',
    label: 'Mechanics',
    heading: 'Gears and machines games',
    description:
      'Free gear and machine games for ages 12–18: gear ratios, idlers, torque, rack and pinion and efficiency. Play in any browser, no sign-up.',
    intro:
      'Link gears to make machines turn faster, slower, the other way or with more force. These games cover gear ratios, idler and compound gears, speed and torque, rack and pinion, power and efficiency.',
  },
  structures: {
    blurb: 'Bridges, trusses and forces',
    label: 'Structures',
    heading: 'Bridge and structures games',
    description:
      'Free bridge building games for ages 12–18: trusses, tension and compression, buckling and loads. Play in any browser, no sign-up.',
    intro:
      'Design bridges that carry real loads, then watch where they bend, buckle or snap. These games cover forces, triangles and trusses, tension and compression, buckling, bending and choosing materials.',
  },
  energy: {
    blurb: 'Renewables, storage and the grid',
    label: 'Energy',
    heading: 'Energy and power grid games',
    description:
      'Free energy games for ages 12–18: keep a town powered with solar, wind and batteries. Supply and demand, storage and CO₂. No sign-up.',
    intro:
      'Keep a town powered every hour of the day with solar, wind, batteries and backup. These games cover supply and demand, power and energy, renewables, energy storage, emissions and sustainability.',
  },
} as const;

export type CategoryKey = keyof typeof CATEGORIES;
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as [CategoryKey, ...CategoryKey[]];
