# ChatGPT art (Other AIs)

Art in this folder is preferred over the procedural / SVG skins. The game loads by
**exact filename**; drop a file in and it is used with no code change.

| File | Size | Status | Used for |
|---|---|---|---|
| `avatar-cathy-cheese.png` | 1024×1024, circular, transparent | in | Cathy's HUD avatar (default, every turn) |
| `avatar-cathy-momdog.png` | 1024×1024, circular, transparent | in | HUD avatar for 3.5 s when Cathy hits Jason; lose screen HUD |
| `checker-cheese.png` | 512×512 disc, transparent | in | Cathy's checkers + home-tray slots (her face medallion is overlaid from `../photos/derived/`) |
| `checker-grape.png` | 512×512 disc, transparent | in | Jason's checkers + home-tray slots |
| `avatar-jason.png` | 1024×1024, circular, transparent | optional | Replaces `../jason.svg` monogram if present |
| `board-table.png` | 2048×1536+, landscape | optional | Painted over the playing surface behind the points (CSS console board stays as the default) |

Notes
- Cathy's checker face comes from the real photo crop, so a new `checker-cheese.png`
  only needs to be a disc with an open centre (the medallion covers the inner ~62%).
- `avatar-cathy-cheese-v2.png` is a duplicate of the canonical file, kept for reference.
- The service worker (`sw.js`) pre-caches the "in" files; add new optional files there
  if they should work offline on first launch.
