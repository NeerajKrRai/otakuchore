# ⚡ OtakuChore

An anime-themed **family chore tracker** — parents assign quests, kids earn stars & streaks,
snap selfie proof, and spend points on rewards. Runs entirely in the browser: **no account,
no backend, no ads, no tracking.** All data lives in `localStorage` on the device; photos/videos
live in `IndexedDB` (so they never blow the `localStorage` quota).

Part of **[Neeksha's Apps](https://apps.neeksha.com)** → live at **https://apps.neeksha.com/otakuchore/**

Merged from two originals: the **OtakuChore** single-file app (Neeksha's anime UI, avatar creator,
selfie booth, chat) and a React-Native/Expo **chore-tracker** (the parenting engine — approvals,
rewards economy, streaks, badges, categories/routines). This web app keeps the look of the first
and the functionality of the second, with zero backend.

## Features

- **Parent-approved chores** — kids tap "I did it", a parent approves/rejects (kids never self-award)
- **Rewards store** — point-costed rewards with affordability + over-spend protection
- **Streaks & badges** — consecutive-day streaks (with same-day grace) and lifetime badges (50/100/250/500)
- **Categories & routines** — Task/Manners/Healthy/Kindness/Learning × Morning/Anytime/Bedtime
- **Savings goals**, one-tap starter packs, points ledger + recent-activity feed
- **Selfie proof booth** (photo/short video, stored in IndexedDB), **per-quest chat**, **SVG avatar creator**
- PIN-gated kid mode, celebrations + haptics, self-hosted fonts (no external requests)

## Run locally

It's static — just serve the folder:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

(Camera and IndexedDB need a secure context, i.e. `https://` or `localhost`.)

## Structure

```
index.html         shell + script includes (relative paths for the /otakuchore/ subpath)
css/   theme.css (anime look) · avatar.css · fonts.css
js/    store.js (localStorage) · engine.js (parenting logic) · ui.js (screens)
       booth.js (camera + IndexedDB media) · chat.js · avatar.js (SVG creator) · app.js (boot + FX)
fonts/ self-hosted Bangers / Nunito / Send Flowers (woff2)
icons/ icon-192.png · icon-512.png
```

Built for **Neeksha** with **Claude**. Age-appropriate, make-believe, no ads, no tracking.
