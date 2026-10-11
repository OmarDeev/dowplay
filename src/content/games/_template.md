---
# Copy this file to <game-slug>.md (no leading underscore) to publish a new game.
# The file name becomes the URL: my-game.md -> /games/my-game
# Put the game's HTML build in public/play/<game-slug>/index.html
title: My Game
# seoTitle: "My Game: Free Circuit Game for Students"   # optional <title> for Google (max 70 characters)
description: One or two sentences for Google results (max ~160 characters). Say what students build and learn, and that it's free.
tagline: One short line for game cards (max 90 characters).
cover: ../../assets/games/my-game.png   # 16:10, e.g. 1280x800
coverAlt: Short description of the cover image
category: electricity                   # topic: electricity, mechanics, structures or energy (see src/config/categories.ts)
tags: [tag-one, tag-two]                # extra search words, e.g. [series circuits, ohms law]
years: [8, 13]                          # UK school years the levels cover (US grades and ages are worked out from this)
levels: 8
# saveKey: myGame.v1                    # localStorage key the game saves { stars, last } under (shows progress)
learn:                                  # what students learn, short phrases (shown on the page and to Google)
  - First key idea
  - Second key idea
curriculum:                             # optional curriculum links
  - "KS3 Science: ..."
  - "GCSE Physics: ..."
# teacherPack:                          # optional free teacher pack (put the PDFs in public/teacher-packs/)
#   pack: /teacher-packs/my-game-teacher-pack.pdf
#   pages: 12
#   worksheets: /teacher-packs/my-game-student-worksheets.pdf
#   preview: ../../assets/packs/my-game-cover.png         # picture of the pack's first page
#   worksheetPreview: ../../assets/packs/my-game-worksheet.png
#   includes:
#     - A 60-minute lesson plan
#     - A worksheet with answers
publishedAt: 2026-01-01
# updatedAt: 2026-02-01
orientation: landscape                  # or portrait
featured: false
draft: true                             # remove (or set false) to publish
# embed: https://example.com/hosted-game/   # only if the game is hosted elsewhere
controls:
  - input: Mouse / Tap
    action: Play
---

## How to play

Write 300–500 words about the game: what students build, how to play, how the levels get
harder from Year 8 to Year 13, and tips. Unique text on each game page is what lets Google
rank it, so don't leave this empty.

## Tips for teachers

A few lines on how to use it in a lesson: which levels suit which year group, and what to
ask students before and after they test their designs.
