/**
 * Game categories. Each category that has at least one published game
 * gets its own landing page at /category/<key> (good for long-tail SEO).
 */
export const CATEGORIES = {
  action: { label: 'Action', intro: 'Fast-paced action games that test your reflexes.' },
  arcade: { label: 'Arcade', intro: 'Classic arcade games reimagined for the browser — quick to learn, hard to master.' },
  puzzle: { label: 'Puzzle', intro: 'Brain-teasing puzzle games to sharpen your logic.' },
  casual: { label: 'Casual', intro: 'Relaxing casual games you can pick up for a minute or an hour.' },
  racing: { label: 'Racing', intro: 'Racing and driving games straight in your browser.' },
  sports: { label: 'Sports', intro: 'Sports games for quick competitive sessions.' },
  strategy: { label: 'Strategy', intro: 'Strategy games where planning beats button-mashing.' },
  adventure: { label: 'Adventure', intro: 'Adventure games full of worlds to explore.' },
  idle: { label: 'Idle', intro: 'Idle and clicker games that keep progressing.' },
  word: { label: 'Word', intro: 'Word games for vocabulary lovers.' },
} as const;

export type CategoryKey = keyof typeof CATEGORIES;
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as [CategoryKey, ...CategoryKey[]];
