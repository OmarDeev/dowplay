import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { CATEGORY_KEYS } from './config/categories';

// Files starting with "_" (e.g. _template.md) are ignored.
const games = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/games' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      // Meta description — shown in Google results. Keep it under ~160 characters.
      description: z.string().max(200),
      // Cover image, 16:10 recommended (e.g. 1280×800). Path relative to the .md file.
      cover: image(),
      coverAlt: z.string().optional(),
      category: z.enum(CATEGORY_KEYS),
      tags: z.array(z.string()).default([]),
      publishedAt: z.coerce.date(),
      updatedAt: z.coerce.date().optional(),
      // Where the playable game lives. Defaults to /play/<file-name>/ (i.e. public/play/<file-name>/index.html).
      // Can also be an absolute URL if the game is hosted elsewhere.
      embed: z.string().optional(),
      orientation: z.enum(['landscape', 'portrait']).default('landscape'),
      controls: z.array(z.object({ input: z.string(), action: z.string() })).default([]),
      featured: z.boolean().default(false),
      // Drafts are visible in `npm run dev` but excluded from the production build.
      draft: z.boolean().default(false),
      // Optional: if the game is also on the stores
      appStoreUrl: z.url().optional(),
      googlePlayUrl: z.url().optional(),
    }),
});

const apps = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/apps' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      // One or two sentences shown on the portfolio card
      summary: z.string(),
      // Square app icon, 512×512 or larger
      icon: image(),
      genre: z.string(),
      releasedAt: z.coerce.date().optional(),
      appStoreUrl: z.url().optional(),
      googlePlayUrl: z.url().optional(),
      // Link to the web version on this site, if any (e.g. "/games/neon-snake")
      webUrl: z.string().optional(),
      // Lower numbers appear first
      order: z.number().default(100),
      draft: z.boolean().default(false),
    }),
});

export const collections = { games, apps };
