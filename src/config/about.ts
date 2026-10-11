/**
 * All text and images for the /about page. Edit the copy here — the page layout
 * lives in src/pages/about.astro.
 */
import front from '../assets/about/front.jpg';
import serv1 from '../assets/about/serv1.jpg';
import serv2 from '../assets/about/serv2.jpg';
import serv3 from '../assets/about/serv3.jpg';
import pro2 from '../assets/about/pro2.jpg';
import pro3 from '../assets/about/pro3.jpg';
import pro4 from '../assets/about/pro4.jpg';
import pro5 from '../assets/about/pro5.jpg';
import pro6 from '../assets/about/pro6.jpg';

export const ABOUT = {
  hero: {
    eyebrow: 'About DowPlay · Game development studio',
    titleStart: 'We build mobile & web games people',
    titleHighlight: 'come back to',
    lead: 'DowPlay is an independent game studio. We make free engineering games that teach students how things really work, and we design, develop and publish games for iPhone, iPad and Android.',
    image: front,
    imageAlt: 'A colorful 3D handheld game console surrounded by game pieces',
  },

  intro: {
    eyebrow: 'Who we are',
    title: 'An independent studio that cares about the details',
    paragraphs: [
      'We started DowPlay with a simple idea: the best games are easy to pick up and hard to put down. Whether it is a one-minute puzzle or a game you play every day, it has to feel great from the very first tap.',
      'Every project begins as a small playable prototype. If it is not fun in the first minute, we keep iterating until it is. Only then do we move into full production, art and polish.',
      'Being independent means short feedback loops, fast decisions and the freedom to focus on what players actually notice: smooth controls, quick loading and a clean, readable design.',
    ],
  },

  values: [
    { title: 'Fun first', text: 'Every idea is prototyped and played before it is built.' },
    { title: 'Made for every screen', text: 'Touch-first design that scales from phones to desktops.' },
    { title: 'Fast & lightweight', text: 'Small downloads and quick load times — waiting is not playing.' },
    { title: 'Always improving', text: 'We read player feedback and keep updating after launch.' },
  ],

  services: [
    {
      title: 'Mobile game development',
      text: 'From first idea to App Store and Google Play launch. We build mobile games that feel native on every device, with controls designed for touch and performance tuned for long play sessions.',
      bullets: ['iOS & Android development', 'Touch-first controls and UX', 'Store listing & launch support', 'Ads and in-app purchase integration'],
      image: serv2,
      imageAlt: 'A player holding a smartphone sideways, playing a 3D mobile game',
    },
    {
      title: 'HTML5 & web games',
      text: 'Browser games that load in seconds and run anywhere — no install needed. Ideal for learning games like the engineering games on this site, game portals and brand campaigns.',
      bullets: ['Desktop & mobile browser support', 'Lightweight, fast-loading builds', 'Game portal & ad SDK integration', 'Embeddable on any website'],
      image: serv1,
      imageAlt: 'Illustration of hands playing an online platform game on a phone',
    },
    {
      title: 'Game design & live operations',
      text: 'Great games are designed, then kept alive. We shape the core loop, levels and art direction, and keep improving the game with updates and new content after release.',
      bullets: ['Game & level design', '2D / 3D art direction', 'Updates & seasonal content', 'Data-driven balancing'],
      image: serv3,
      imageAlt: 'A pastel retro game console showing a classic platformer',
    },
  ],

  genres: {
    eyebrow: 'Our games',
    title: 'Games we love to build',
    text: 'From quick casual sessions to deep strategy, these are the genres our games are made of.',
    items: [
      { title: 'Action & Shooter', text: 'Fast, punchy action with controls that feel right on a touchscreen.', image: pro6, imageAlt: 'Cartoon action heroes bursting out of a smartphone screen' },
      { title: 'Strategy & MOBA', text: 'Deep tactics, built for a small screen.', image: pro2, imageAlt: 'A strategy battle game running on a smartphone' },
      { title: 'Racing & Kart', text: 'Pick-up-and-play racing with arcade handling.', image: pro3, imageAlt: 'A colorful kart racing game on a phone' },
      { title: 'Adventure & RPG', text: 'Worlds to explore and heroes to level up.', image: pro4, imageAlt: 'Hands holding a phone with an open-world adventure game' },
      { title: 'Casual & Puzzle', text: 'Relaxing sessions — one minute or one hour.', image: pro5, imageAlt: 'A cheerful casual city game on a smartphone' },
    ],
  },

  process: [
    { title: 'Concept', text: 'We pitch, sketch and pick the ideas with the strongest hook.' },
    { title: 'Prototype', text: 'A playable version in days, tested until the core loop is fun.' },
    { title: 'Production', text: 'Art, levels, sound and polish — tested on real devices.' },
    { title: 'Launch & live', text: 'Release on the stores and the web, then keep improving.' },
  ],

  contact: {
    eyebrow: 'Contact us',
    title: "Let's make something fun together",
    text: 'Have a game idea, a publishing or partnership proposal, a press question, or feedback about one of our games? Send us a message and we will get back to you.',
    topics: [
      'General question',
      'Teachers & schools',
      'Game development project',
      'Publishing & partnerships',
      'Press & media',
      'Player support',
    ],
  },
};
