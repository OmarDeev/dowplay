# The games

Each engineering game is a small, self-contained HTML5 game (plain HTML, CSS and JavaScript,
no build step). Its playable files live in **`public/play/<game>/`**: the website serves them
as they are, and the game page at `/games/<game>` plays them in a frame.

This folder holds what each game needs for development but players don't:

| Folder | What's in it |
|--------|--------------|
| `light-it-up/` | Notes on the game and its levels (`README.md`) and the level checker |
| `gear-garage/` | Same |
| `bridge-builder/` | Same |
| `grid-manager/` | Same |
| `load-game.cjs` | Lets the checkers (and the teacher-pack number checks) load a game's scripts in Node |

## Changing a game

1. Edit the files in `public/play/<game>/`, for example the levels in `js/levels.js`.
2. Try it: `npm run dev`, then open `/games/<game>` (or `/play/<game>/index.html` on its own).
3. Check every level can still be solved, with the stars you expect (needs Node.js):

   ```bash
   node games/bridge-builder/check-levels.cjs
   ```

   `npm run check:levels` runs all four (Grid Manager takes about 20 seconds).
4. If the level or the numbers in it appear in a teacher pack, run `npm run check:packs` too
   (see `teacher-packs/README.md`).

Progress is saved in the visitor's browser under one key per game (`lightItUp.v1`,
`gearGarage.v1`, `bridgeBuilder.v1`, `gridManager.v1`). If you change what's saved, change the
key's version so old saves don't break the game. The game pages read these keys to show a
returning player their progress.

## Adding a game

Put its files in `public/play/<new-game>/` (with an `index.html`), add a cover image in
`src/assets/games/` and a page in `src/content/games/` (copy `_template.md`). The game page,
game cards, topic page, sitemap and structured data are all made from that file.
