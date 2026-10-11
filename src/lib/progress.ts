/**
 * Reads a game's saved progress from the visitor's browser (games save
 * `{ stars: { [levelId]: 0–3 }, last: levelIndex }` under their own key), so the site can show
 * a returning player where they got to. Runs in the browser only.
 */
export interface Progress {
  /** The level they were last on, counting from 1 */
  level: number;
  /** Levels with at least one star */
  done: number;
  stars: number;
}

export function readProgress(key: string | undefined, levels: number): Progress | null {
  if (!key || !levels) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!saved || typeof saved !== 'object') return null;
    const stars = Object.values(saved.stars ?? {})
      .map(Number)
      .filter((n) => n > 0);
    const last = Number(saved.last) || 0;
    if (!stars.length && !last) return null;
    return {
      level: Math.min(last, levels - 1) + 1,
      done: stars.length,
      stars: stars.reduce((sum, n) => sum + Math.min(n, 3), 0),
    };
  } catch {
    return null; // storage blocked or unreadable
  }
}
