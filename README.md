# Cathy's Backgammon 🧀

The **Cheese Cathy Edition** — a big, friendly, iPad-first backgammon game.
Huge touch targets, big readable type, glowing legal moves, fat Swiss-hole
cheese checkers vs grape checkers. No tiny chrome, no squinting.

## Play on iPad (Safari)

1. Open the GitHub Pages link (below) in **Safari**, landscape orientation.
2. **Add to Home Screen** for the full console feel:
   - Tap **Share** → **Add to Home Screen** → **Add**.
   - Launch it from the home screen icon — it runs fullscreen and **offline**
     after the first visit.

## How to play (30 seconds)

- You are the **cheese checkers** 🧀. Tap **ROLL** (or the dice).
- Tap a **glowing** checker, then tap a glowing landing spot (👇).
- Land alone on a purple checker to **hit it to the bar** 🟣.
- Checkers on the middle **BAR** must come back in first.
- Get all 15 home, then tap them **OFF** 🏁. First one out wins!
- Rolling **doubles = 4 moves** 🎉.
- Stuck? **💡 Hint** suggests a move. Mis-tap? **↩️ Undo** takes it back.

Modes: **Play vs Computer** (gentle, Cathy-friendly AI) and
**Cathy vs Jason** pass-and-play hotseat.

## Publish with GitHub Pages

Static site, no build step. From the repo root:

1. Repo **Settings → Pages** → *Deploy from a branch*.
2. Branch: `main`, folder: `/ (root)`. Save.
3. The `.nojekyll` file is already committed, so `assets/` and `sw.js`
   are served as-is.

## The three photos

The game looks for these exact files in `assets/photos/`:

| File | Used on |
|---|---|
| `02-cheese-cathy.png` | Title screen (brand core) |
| `03-bama-2026.png` | Win screen, Cathy wins |
| `01-mom-dog-hybrid.png` | Win screen, rival wins (the underdog gag) |

Copy the originals in (they were chat attachments, so they live outside git):

```bash
cp 01-mom-dog-hybrid.png 02-cheese-cathy.png 03-bama-2026.png assets/photos/
```

Until then the game auto-falls-back to the bundled `.svg` illustrations of
the same scenes, so it always works — online or off. See
`assets/photos/README.md`.

## For developers

```
node smoke.mjs            # rules tests + 5 seeded AI-vs-AI full games
python3 -m http.server    # serve locally, then open index.html
```

In-browser smoke (full game + scripted taps, fails loudly on JS errors):

```
http://localhost:8000/index.html?shot=smoke&seed=2026   # expect SMOKE-OK
```

Screenshot helpers (iPad-ish 1366×1024):

```
?shot=title   # title screen      ?shot=mid&seed=2026   # mid-game board
?shot=win     # win screen        ?shot=smoke           # headless self-play
```

Files: `engine.js` (rules, no deps, browser+node), `ai.js` (soft 1-ply AI),
`app.js` (UI + flow), `styles.css`, `sw.js` (offline cache),
`manifest.webmanifest` (Add to Home Screen), `screenshots/`.
