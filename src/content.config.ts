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
      // Optional <title> for Google, e.g. "Bridge Builder: Free Bridge Building Game for Students".
      // Defaults to "<title> — Free <topic> Game".
      seoTitle: z.string().max(70).optional(),
      // Meta description — shown in Google results. Keep it under ~160 characters.
      description: z.string().max(200),
      // One short line for game cards, e.g. "Build a bridge and drive a truck across it."
      tagline: z.string().max(90).optional(),
      // Cover image, 16:10 recommended (e.g. 1280×800). Path relative to the .md file.
      cover: image(),
      coverAlt: z.string().optional(),
      // The engineering topic: one of the keys in src/config/categories.ts
      category: z.enum(CATEGORY_KEYS),
      tags: z.array(z.string()).default([]),
      // UK school years the levels cover, e.g. [8, 13]. US grades and ages are worked out
      // from this (Year 8 = Grade 7 = age 12).
      years: z.tuple([z.number().int().min(1).max(13), z.number().int().min(1).max(13)]).optional(),
      // How many levels the game has
      levels: z.number().int().positive().optional(),
      // The localStorage key the game saves progress under ({ stars, last }), so the site can
      // show returning players their progress, e.g. "bridgeBuilder.v1"
      saveKey: z.string().optional(),
      // What students learn: short phrases, shown on the game page and in structured data
      learn: z.array(z.string()).default([]),
      // Curriculum links, e.g. "GCSE Physics: series and parallel circuits"
      curriculum: z.array(z.string()).default([]),
      // A free teacher pack (PDFs in public/teacher-packs/), offered on the game page and the teachers page
      teacherPack: z
        .object({
          pack: z.string(), // e.g. /teacher-packs/grid-manager-teacher-pack.pdf
          pages: z.number().int().positive(),
          worksheets: z.string().optional(), // the student worksheets on their own
          includes: z.array(z.string()).default([]),
          // Pictures of the first pages, shown next to the download buttons
          // (e.g. ../../assets/packs/grid-manager-cover.png)
          preview: image().optional(),
          worksheetPreview: image().optional(),
        })
        .optional(),
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
