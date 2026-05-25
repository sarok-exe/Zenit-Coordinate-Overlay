# Zenit — Chess.com to Lichess Analyzer

A Chrome extension that detects finished Chess.com games, extracts PGNs, and opens them on a Lichess analysis board with dynamic theming and a per-square coordinate overlay.

## Features

- **Auto-detect** finished Chess.com games (Share modal, PGN button, data-pgn attribute, DOM reconstruction)
- **One-click replay** from popup history cards
- **4 themes** — monochrome, sunset, coffee-shop, dark-wood
- **Random mode** — random theme per session
- **Theme Forever** — persists theme across all Lichess pages via `chrome.storage.sync`
- **Coordinate overlay** — per-square labels; press `f` to toggle between White/Black perspective
- **Custom confirmation modal** for destructive actions

## Load as Unpacked Extension

1. Open Chrome/Brave/Edge and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the project root (the folder containing `manifest.json`)
5. The Zenit icon appears in the toolbar

## Usage

| Action | How |
|---|---|
| Auto-analyze Chess.com game | After a game ends, Zenit opens PGN in Lichess automatically |
| Toggle coordinates | Press **`f`** on any Lichess analysis page |
| Switch themes | Open floating panel (bottom-right on Lichess analysis) |
| Replay past game | Click a game card in the popup |
| Pause/resume watching | Popup toggle button |

## Files

| File | Role |
|---|---|
| `manifest.json` | Extension manifest (Manifest V3) |
| `content.js` | Chess.com game detection + PGN extraction |
| `background.js` | Service worker — tab creation, message routing |
| `popup.html` / `popup.js` | Popup UI — game history, controls |
| `lichess.js` | Post-nav automation on Lichess analysis |
| `shared/theme-manager.js` | Theming engine + coordinate overlay |
| `shared/pgn-parser.js` | PGN validation, normalization, header parsing |
| `shared/utils.js` | Shared logging and error persistence |
| `themes/assets/` | Local board texture images |

## Debug

Open DevTools (`F12`) on any Lichess analysis page and filter by `[Zenit]` to see logs.
