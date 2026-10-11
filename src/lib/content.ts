import { getCollection, type CollectionEntry } from 'astro:content';
import { SITE } from '../config/site';

export type Game = CollectionEntry<'games'>;
export type App = CollectionEntry<'apps'>;

const isVisible = (entry: { data: { draft: boolean } }) => import.meta.env.DEV || !entry.data.draft;

/** Published games: featured first, then newest first. */
export async function getGames(): Promise<Game[]> {
  const games = await getCollection('games', isVisible);
  return games.sort(
    (a, b) =>
      Number(b.data.featured) - Number(a.data.featured) ||
      b.data.publishedAt.getTime() - a.data.publishedAt.getTime(),
  );
}

export async function getApps(): Promise<App[]> {
  const apps = await getCollection('apps', isVisible);
  return apps.sort((a, b) => a.data.order - b.data.order || a.data.name.localeCompare(b.data.name));
}

export const gameUrl = (game: Game) => `/games/${game.id}`;
export const categoryUrl = (category: string) => `/category/${category}`;
// Cloudflare serves public/play/<id>/index.html at /play/<id>/; the local dev server needs the file name.
export const gameEmbedUrl = (game: Game) =>
  game.data.embed ?? (import.meta.env.DEV ? `/play/${game.id}/index.html` : `/play/${game.id}/`);

export const absoluteUrl = (path: string) => new URL(path, SITE.url).href;

/**
 * Who a game is for, from the UK school years its levels cover. A UK Year N student is
 * in US Grade N−1 and is N+4 years old at the start of the school year.
 */
export function audienceOf(years: [number, number] | undefined) {
  if (!years) return null;
  const [from, to] = years;
  const range = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);
  return {
    years: `Year${from === to ? '' : 's'} ${range(from, to)}`,
    grades: `Grade${from === to ? '' : 's'} ${range(from - 1, to - 1)}`,
    ages: `Ages ${range(from + 4, to + 5)}`,
    // schema.org typicalAgeRange uses a plain hyphen
    ageRange: `${from + 4}-${to + 5}`,
  };
}

/** Public URL path for a page: Astro reports "/about.html" at build time, but Cloudflare serves "/about". */
export const cleanPath = (pathname: string) => pathname.replace(/(\/index)?\.html$/, '') || '/';
