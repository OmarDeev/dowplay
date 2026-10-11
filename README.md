# DowPlay

Website for DowPlay: free engineering games for students aged 12–18 (UK Years 8–13, US grades 7–12) on the home page, a page for teachers and parents, and the studio portfolio (App Store / Google Play games) on `/about`.

Built with [Astro](https://astro.build) as a fully static site: every page is plain, pre-rendered HTML, which is the best setup for SEO and speed. It's hosted on Cloudflare and deployed automatically from GitHub.

## Pages

| URL | What it is | Source |
| --- | --- | --- |
| `/` | All games (search + topic filter) | `src/pages/index.astro` |
| `/games/<slug>` | One game: SEO page + player, what students learn, curriculum links | `src/pages/games/[slug].astro` |
| `/category/<key>` | Games in one topic, e.g. `/category/energy` (only created when it has games) | `src/pages/category/[category].astro` (topics in `src/config/categories.ts`) |
| `/teachers` | For teachers & parents: why and how to use the games, games by topic and year, FAQ | `src/pages/teachers.astro` |
| `/about` | Studio intro, services, games, contact form | `src/pages/about.astro` (text in `src/config/about.ts`) |
| `/privacypolicy` | Privacy policy (needed for store listings) | `src/pages/privacypolicy.md` (plain Markdown, edit the text directly) |
| `/play/<slug>/` | The raw game files, loaded inside the game page | `public/play/<slug>/` |

`sitemap-index.xml`, `robots.txt`, canonical URLs, Open Graph images and schema.org data (Organization, VideoGame + LearningResource, BreadcrumbList, FAQPage, MobileApplication) are all generated automatically.

## Project layout

Everything for the site, the games and the teacher packs is in this one repository:

| Folder | What's in it |
| --- | --- |
| `src/` | The website (pages, components, styles, game and app pages in `src/content/`) |
| `public/play/<game>/` | The games themselves: plain HTML, CSS and JavaScript, served as they are |
| `games/<game>/` | Each game's notes and level checker (see `games/README.md`) |
| `teacher-packs/<game>/` | The teacher pack sources, which build the PDFs in `public/teacher-packs/` (see `teacher-packs/README.md`) |
| `public/teacher-packs/` | The teacher pack PDFs that visitors download |

## First-time setup

1. Edit **`src/config/site.ts`**: domain, email, store developer pages and social links.
2. **Contact form:** create a free form at [formspree.io](https://formspree.io) and paste its endpoint into `contactFormEndpoint` in `src/config/site.ts`. Until you do, the form opens the visitor's email app with the message pre-filled.
3. Edit the About page text (intro, services, genres, process, contact) in **`src/config/about.ts`**. Its images are in `src/assets/about/`.
4. Add your App Store / Google Play games to `src/content/apps/` when you're ready (see below). Until then the store section on `/about` stays hidden.
5. Review `src/pages/privacypolicy.md` — the company name, address and contact details must be yours.

## Add a web game

1. Put the game build (its `index.html` plus assets) in `public/play/my-game/`.
2. Add a cover image (16:10, e.g. 1280×800) at `src/assets/games/my-game.png`.
3. Copy `src/content/games/_template.md` to `src/content/games/my-game.md` and fill it in. The file name becomes the URL: `/games/my-game`.
   - `category` is the engineering topic (`electricity`, `mechanics`, `structures`, `energy`; add more in `src/config/categories.ts`).
   - `years: [8, 13]` is the UK school years the levels cover. The site shows US grades and ages from it.
   - `learn` lists what students learn, and `curriculum` the curriculum links (KS3, GCSE, A-level…). Both appear on the game page and the teachers page.
4. Write 300–500 words of unique text in the markdown body (how to play, how the levels progress, tips for teachers). That text is what Google ranks.
5. Commit and push. Cloudflare rebuilds and deploys the site.

Games marked `draft: true` show up in `npm run dev` but are left out of the live site.

> Cloudflare limits: max **25 MiB per file**, 20,000 files per deployment. If a game has bigger files, host it elsewhere (for example on Cloudflare R2) and set `embed:` to its URL.

## Teacher packs

Free teacher packs (lesson plans, worksheets, answers) are PDFs in `public/teacher-packs/`. To offer
one, add a `teacherPack` block to the game's markdown file (see `_template.md`): it then appears as a
"Free teacher pack" box on the game page and in the list and table on `/teachers`.

Every game has a pack, built from `teacher-packs/<game>/pack.html` (see `teacher-packs/README.md`):

```bash
npm run packs -- bridge-builder   # rebuild one pack (or leave out the name for all)
npm run check:packs               # check every number in the packs against the games
```

Rebuilding writes the two PDFs into `public/teacher-packs/`, the pictures of their first pages
(shown next to the download buttons) into `src/assets/packs/`, and the page count into the game's
`teacherPack` block.

## Design

Colours, buttons, cards and the topic colours (`data-topic="electricity"` and so on) are defined at
the top of `src/styles/global.css`. Each game also has a short `tagline` in its markdown file, shown on
the game cards.

## Update a game

The four engineering games (Light It Up, Gear Garage, Bridge Builder, Grid Manager) are edited
in place in `public/play/<game>/`. Their notes and level checkers are in `games/<game>/`:

```bash
node games/grid-manager/check-levels.cjs   # check one game's levels can all be solved
npm run check:levels                       # all four
```

Players keep their progress: each game saves it in the browser under its own key, and the game
page shows a returning player where they got to.

## Add a mobile app to the portfolio

Copy `src/content/apps/_template.md` to `src/content/apps/my-app.md` and add a square icon (512×512) to `src/assets/apps/`.

## Commands

```bash
npm install        # once
npm run dev        # local dev server at http://localhost:4321
npm run build      # build to ./dist
npm run preview    # build + serve with Cloudflare's runtime at http://localhost:8787
npm run check      # type-check
npm run packs      # rebuild the teacher pack PDFs
npm run check:packs   # check the numbers in the teacher packs
npm run check:levels  # check every game level can be solved
```

Requires Node 22.12+.

## Deploy: GitHub → Cloudflare

The site deploys as a **Cloudflare Worker with static assets** (Cloudflare's recommended setup for new sites). The config is in `wrangler.jsonc`.

1. Push this folder to a GitHub repository.
2. In the Cloudflare dashboard, go to **Workers & Pages → Create → Import a repository** and pick the repo.
3. Settings:
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
4. Deploy. After that, every push to `main` deploys automatically, and other branches get preview URLs.
5. Add your domain: open the Worker, then **Settings → Domains & Routes → Add → Custom domain**.

### After the first deploy

- **Google Search Console:** add the domain (DNS verification through Cloudflare is the simplest), then submit `https://<your-domain>/sitemap-index.xml`.
- **Bing Webmaster Tools:** import the site from Search Console.
- **Google Analytics:** paste your Measurement ID (`G-…`) into `googleAnalyticsId` in `src/config/site.ts`. A cookie banner asks visitors for consent first (Google Consent Mode v2), and a "Cookie settings" link in the footer lets them change their mind. Besides page views, the site sends `game_start`, `game_fullscreen` and `generate_lead` (contact form) events. Find them in GA4 under **Reports → Engagement → Events**.
- **Cloudflare Web Analytics** (optional): switch it on in the dashboard. It's free, cookie-less and needs no code. It counts every visitor, including those who decline cookies.
- **app-ads.txt:** if your apps show ads (AdMob, etc.), put your `app-ads.txt` file in `public/`. It's served at `/app-ads.txt`.
