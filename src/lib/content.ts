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
export const gameEmbedUrl = (game: Game) => game.data.embed ?? `/play/${game.id}/`;

export const absoluteUrl = (path: string) => new URL(path, SITE.url).href;

/** Public URL path for a page: Astro reports "/about.html" at build time, but Cloudflare serves "/about". */
export const cleanPath = (pathname: string) => pathname.replace(/(\/index)?\.html$/, '') || '/';
