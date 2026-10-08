---
# Copy this file to <game-slug>.md (no leading underscore) to publish a new game.
# The file name becomes the URL: my-game.md -> /games/my-game
# Put the game's HTML build in public/play/<game-slug>/index.html
title: My Game
description: One or two sentences for Google results (max ~160 characters). Mention what the game is and that it's free to play online.
cover: ../../assets/games/my-game.png   # 16:10, e.g. 1280x800
coverAlt: Short description of the cover image
category: puzzle                        # one of the keys in src/config/categories.ts
tags: [tag-one, tag-two]
publishedAt: 2026-01-01
# updatedAt: 2026-02-01
orientation: landscape                  # or portrait
featured: false
draft: true                             # remove (or set false) to publish
# embed: https://example.com/hosted-game/   # only if the game is hosted elsewhere
# appStoreUrl: https://apps.apple.com/app/id000000000
# googlePlayUrl: https://play.google.com/store/apps/details?id=com.example.game
controls:
  - input: Mouse / Tap
    action: Play
---

## How to play

Write 150–300 words about the game: goal, how to play, tips. Unique text on each game page
is what lets Google rank it — don't leave this empty.
