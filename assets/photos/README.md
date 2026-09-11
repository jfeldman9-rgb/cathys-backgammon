# Cathy's photos

The three originals (committed, used in-game):

| File | Where it shows |
|---|---|
| `02-cheese-cathy.png` | Title screen hero; face medallion on every one of Cathy's checkers |
| `01-mom-dog-hybrid.png` | Title polaroid; "release the hound" checker faces after a hit; rival-wins screen |
| `03-bama-2026.png` | Title polaroid; Cathy's HUD avatar when she bears off / gets all home; win screen |

`derived/*-face.jpg` are 400×400 face crops cut from the PNGs above (used for the
checker medallions so they stay crisp at 40–60px). Regenerate with Pillow if the
originals change.

The `.svg` files are same-scene illustrated fallbacks used only if a PNG fails to load.
In-play HUD avatars live in `../chatgpt-art/`.
