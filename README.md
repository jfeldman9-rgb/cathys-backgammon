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

- You are the **cheese checkers** 🧀 — the ones with your face on them. Tap **ROLL** (or the dice).
- Tap a **glowing** checker, then tap a glowing landing spot (👇).
- Land alone on a lone grape checker to **hit it to the bar** (the hound comes out 🐾).
- Checkers on the middle **BAR** must come back in first.
- Get all 15 home, then tap the **HOME TRAY** to bear them **OFF** 🏁. First one out wins!
- Rolling **doubles = 4 moves** 🎉.
- Stuck? **💡 Ask Cathy** — she'll tell you what she'd do. Mis-tap? **↩️ Undo**.

Modes: **Play Robo-Jason** (gentle AI that talks back) and
**Cathy vs Jason** pass-and-play hotseat.

## Publish with GitHub Pages

Static site, no build step. From the repo root:

1. Repo **Settings → Pages** → *Deploy from a branch*.
2. Branch: `main`, folder: `/ (root)`. Save.
3. The `.nojekyll` file is already committed, so `assets/` and `sw.js`
   are served as-is.

## The three photos (and where Cathy shows up DURING play)

- **HUD avatar** (left console, every turn): Cheese Cathy costume crop. Swaps to the
  **mom-dog** crop for 3.5 s whenever she hits Jason ("RELEASE THE HOUND!"), and to
  **Bama 2026 "I made it!"** when she bears off her first checker or gets all 15 home.
- **Checkers**: hi-res cheese discs with **her face** in the middle (hound face during a
  hit, Bama face while bearing off). Jason's are grape discs.
- **Home tray**: 15 cheese-disc slots fill as she bears off.
- **Title**: Cheese Cathy hero + two polaroids. **Win**: Bama photo (or the hound if Jason wins).

Files: `assets/photos/*.png` (originals, committed), `assets/photos/derived/*-face.jpg`
(face crops for checkers), `assets/chatgpt-art/*` (HUD avatars + checker discs).
Illustrated `.svg` fallbacks load only if a PNG is missing.

## For developers

```
node smoke.mjs            # rules tests + 5 seeded AI-vs-AI full games
python3 -m http.server    # serve locally, then open index.html
```

In-browser smoke (scripted taps, a live timed Robo-Jason turn, full game; fails loudly on JS errors):

```
http://localhost:8000/index.html?shot=smoke&seed=2026   # expect SMOKE-OK
```

Screenshot helpers (iPad-ish 1366×1024):

```
?shot=title   # title screen        ?shot=mid&seed=2026   # Cathy mid-move, banter
?shot=hit     # hound-swap moment    ?shot=win             # win screen
```

Files: `engine.js` (rules, no deps, browser+node), `ai.js` (soft 1-ply AI),
`app.js` (UI, voice lines, presence, flow), `styles.css` (console skin), `sw.js` (offline cache),
`manifest.webmanifest` (Add to Home Screen), `screenshots/`.
