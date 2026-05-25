# Zenit — Knowledge Archive

## Critical Lessons Learned

### 1. DOM Stability: Never Trust the DOM After Game End

**Problem:** Chess.com's DOM changes rapidly and non-deterministically after a game ends. Elements appear/disappear in multiple waves. Listeners fire repeatedly on the same state.

**Fixes that barely held:**
- Debounced extraction (2s after game-over detected)
- Session Lock (`hasExtracted` flag that only resets on a clean game-over→active-game transition)
- Observing *transitions* instead of *state* (detect movement between game phases, not the phase itself)

**Lesson:** DOM observation for dynamic SPAs requires both a `hasExtracted`-style debounce AND transition detection. Without both, extraction loops or double-fires are inevitable. But even these are fragile against Chess.com site updates.

### 2. PGN Extraction: The Chess.com Tab-Textarea-Share API

**Problem:** There is no stable DOM hook for PGN text. The "Share" button is a tab group; the PGN tab must be clicked before the textarea is rendered.

**Discovery:**
- `button[aria-label="Share"]` is stable (survives their redesigns)
- PGN tab selector: `button[role="tab"]` + text content match on `"PGN"`
- Textarea selector: `textarea[name="pgn"]` (only available *after* the PGN tab is clicked)
- The tab-click→render→extract sequence requires a small delay (50ms) between switching tabs and reading the textarea

**Lesson:** Chess.com game extraction requires a fragile 3-step flow (find share → click PGN tab → wait for textarea → read text). Any site redesign can break it. A more robust approach would use the Chess.com API directly (fetch PGN from `/game/live/...` endpoint) rather than DOM scraping.

### 3. Architecture: Minimal Is Stable

**The arc of this project:**
1. **Initial:** Clean overlay + PGN extraction → **stable**
2. **Additions:** Auto-analysis, "Go More Deeper", Chess.com overlay, font scaling → **bloated, fragile**
3. **Addiction:** Anti-looping session locks, # headers everywhere → **complex, unmaintainable**
4. **Final:** Reset to initial + new logo → **stable again**

**Lesson:** Every feature added interacts with every other. A PGN extraction bug may be caused by the auto-analysis toggle, not the extraction code. The only way to guarantee stability is to not add features.

**Rule of thumb for the next project:** If a feature can live as a separate extension, make it one. Do not build an all-in-one. Each feature should be independently testable and independently deployable.

### 4. Logo & Branding: Keep It Simple

- SVG is king for extension icons (scales to all sizes, small file size when not base64-embedded)
- The `logo2.svg` with embedded base64 PNG data was 644KB vs a clean SVG that would be <1KB
- Always generate PNGs at exact sizes (128, 48, 16) from the SVG at build time
- `manifest.json` `icons` field needs exact-size PNGs, not SVGs (Chrome does not reliably scale SVG)
- `default_icon` in `action` similarly needs a PNG for the toolbar

### 5. Git Hygiene for Experimental Projects

- The 7-commit spiral (feature → revert → hotfix → anti-looping → reset) is a sign: *commit early, but branch early too*
- All experimental features should go on branches, not `main`
- `main` should only receive tested, minimal changes
- When reverting, prefer `git revert` (preserves history) over `git reset --hard` + force push (destroys history for collaborators)
