// shared/theme-manager.js
// Dynamic Lichess theming + per-square coordinate overlay.
// Themes: monochrome, sunset, coffee-shop, dark-wood.
// Coordinates: press 'f' to toggle white/black perspective.

const THEMES = [
  { id: "monochrome", name: "Monochrome", pieceSet: "letter", boardSet: "brown", boardType: "png", colors: { backgroundColor: "#111111", surfaceColor: "#1a1a1a", primaryColor: "#aaaaaa", boardDark: "#666666", boardLight: "#aaaaaa" } },
  { id: "sunset", name: "Sunset", pieceSet: "riohacha", boardSet: "brown", boardType: "png", colors: { backgroundColor: "#1e1010", surfaceColor: "#2e1818", primaryColor: "#ff7f50", boardDark: "#b86040", boardLight: "#e8b898" } },
  { id: "coffee-shop", name: "Coffee Shop", pieceSet: "maestro", boardSet: "wood4", boardType: "jpg", colors: { backgroundColor: "#1a1410", surfaceColor: "#2a1e18", primaryColor: "#c4956a", boardDark: "#c4956a", boardLight: "#e8d8c8" } },
  { id: "dark-wood", name: "Dark Wood", pieceSet: "merida", boardSet: "wood2", boardType: "jpg", colors: { backgroundColor: "#1c1814", surfaceColor: "#2a2420", primaryColor: "#b58863", boardDark: "#b58863", boardLight: "#f0d9b5" } }
];

const STORAGE_KEY_THEME = 'zenit_theme_id';
const STORAGE_KEY_RANDOM = 'zenit_random_mode';
const STORAGE_KEY_COORDS = 'zenit_show_coords';
const STORAGE_KEY_FOREVER = 'zenit_forever';

const ZENIT_STYLE_ID = 'zenit-theme-style';
const PANEL_ID = 'zenit-theme-panel';
const COORD_OVERLAY_ID = 'zenit-coord-overlay';

const PIECE_NAMES = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];

function pickRandomTheme() {
  return THEMES[Math.floor(Math.random() * THEMES.length)];
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function darkenHex(hex, factor) {
  const h = hex.replace('#', '');
  const r = Math.round(parseInt(h.substring(0, 2), 16) * (1 - factor));
  const g = Math.round(parseInt(h.substring(2, 4), 16) * (1 - factor));
  const b = Math.round(parseInt(h.substring(4, 6), 16) * (1 - factor));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function assetUrl(filename) {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    return chrome.runtime.getURL('themes/assets/' + filename);
  }
  return 'https://raw.githubusercontent.com/lichess-org/lila/master/public/images/board/' + filename;
}

function generateColorBoardSVG(lightHex, darkHex) {
  const sq = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const color = (r + c) % 2 === 0 ? lightHex : darkHex;
      sq.push(`<rect x="${c * 12.5}%" y="${r * 12.5}%" width="12.5%" height="12.5%" fill="${color}"/>`);
    }
  }
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8">${sq.join('')}</svg>`)}`;
}

function buildThemeCSS(theme) {
  const base = 'https://raw.githubusercontent.com/lichess-org/lila/master/public/piece';
  const c = theme.colors || {};

  const primaryHex = c.arrowPrimary || c.primaryColor || '#15781B';
  const secondaryHex = c.arrowSecondary || darkenHex(primaryHex, 0.6);
  const lastMoveHex = c.lastMove || primaryHex;
  const moveDestHex = c.moveIndicator || primaryHex;

  let boardUrl;
  if (theme.boardType === 'color') {
    boardUrl = generateColorBoardSVG(c.boardLight || '#eeeed2', c.boardDark || '#769656');
  } else {
    const localFile = theme.boardSet + '.' + (theme.boardType === 'svg' ? 'png' : theme.boardType);
    boardUrl = assetUrl(localFile);
  }

  let css = '';

  // Piece set
  PIECE_NAMES.forEach(pn => {
    const short = pn.slice(0, 1).toLowerCase() + pn.slice(1);
    const url = `${base}/${theme.pieceSet}/${pn}.svg`;
    css += `.piece.${short} { background-image: url("${url}") !important; }\n`;
  });

  // Board image
  css += `.board, .cg-board, .is2d .cg-board { background-image: url("${boardUrl}") !important; }\n`;
  css += `.is2d .cg-board, .cg-board { background-size: cover !important; }\n`;

  // Color overrides
  if (c.backgroundColor) css += `body, .page, .analyse { background: ${c.backgroundColor} !important; }\n`;
  if (c.surfaceColor) css += `.analyse__side, .analyse__tools, .pv_box, .analyse__controls { background: ${c.surfaceColor} !important; }\n`;
  if (c.primaryColor) css += `.analyse__controls .fbt, .cmn-toggle input:checked + label, a { color: ${c.primaryColor} !important; }\n`;
  if (c.textColor) css += `body, .analyse, .pv_box, .tview2 { color: ${c.textColor} !important; }\n`;

  // Interactive element overrides (arrows + highlights)

  // SVG arrows — primary (user analysis)
  css += `g[cgKey="pg"] line, g[cgKey="pg"] path { stroke: ${primaryHex} !important; }\n`;
  css += `g[cgKey="pg"] marker path, g[cgKey="pg"] marker { fill: ${primaryHex} !important; }\n`;
  css += `#arrowhead-pg { fill: ${primaryHex} !important; }\n`;

  // SVG arrows — secondary (engine/variations)
  css += `g[cgKey="pb"] line, g[cgKey="pb"] path { stroke: ${secondaryHex} !important; }\n`;
  css += `g[cgKey="pb"] marker path, g[cgKey="pb"] marker { fill: ${secondaryHex} !important; }\n`;
  css += `#arrowhead-pb { fill: ${secondaryHex} !important; }\n`;

  // Last move square highlight
  css += `square.last-move { background-color: ${hexToRgba(lastMoveHex, 0.41)} !important; }\n`;
  css += `square.last-move:not(.move-dest) { background: ${hexToRgba(lastMoveHex, 0.41)} !important; }\n`;

  // Move destination dots
  css += `square.move-dest { background: radial-gradient(${hexToRgba(moveDestHex, 0.5)} 19%, rgba(0,0,0,0) calc(20% + 1px)) !important; }\n`;
  css += `square.oc.move-dest { background: radial-gradient(transparent 0%, transparent 79%, ${hexToRgba(moveDestHex, 0.3)} calc(80% + 1px)) !important; }\n`;

  // Premove destinations (blue-tinted secondary)
  css += `square.premove-dest { background: radial-gradient(${hexToRgba(secondaryHex, 0.5)} 19%, rgba(0,0,0,0) calc(20% + 1px)) !important; }\n`;
  css += `square.oc.premove-dest { background: radial-gradient(transparent 0%, transparent 79%, ${hexToRgba(secondaryHex, 0.2)} calc(80% + 1px)) !important; }\n`;

  // Selected square
  css += `square.selected { background-color: ${hexToRgba(moveDestHex, 0.5)} !important; }\n`;

  // Current premove
  css += `square.current-premove { background-color: ${hexToRgba(secondaryHex, 0.5)} !important; }\n`;

  return css;
}

function injectStyle(css) {
  let style = document.getElementById(ZENIT_STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = ZENIT_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = css;
}

function removeStyle() {
  const style = document.getElementById(ZENIT_STYLE_ID);
  if (style) style.remove();
}

function applyTheme(themeId) {
  const theme = THEMES.find(t => t.id === themeId);
  if (!theme) {
    console.warn('[Zenit] Theme not found:', themeId);
    return;
  }
  const css = buildThemeCSS(theme);
  injectStyle(css);
  console.log(`[Zenit] Theme applied: ${theme.name} (${theme.id})`);
}

async function loadAndApplyTheme() {
  // Check sync storage for Theme Forever preference
  const syncData = await new Promise(resolve => chrome.storage.sync.get([STORAGE_KEY_FOREVER, STORAGE_KEY_THEME], resolve));
  const forever = syncData[STORAGE_KEY_FOREVER] || false;

  // Priority: sync theme (if forever) → local theme → default
  let themeId;
  if (forever && syncData[STORAGE_KEY_THEME]) {
    themeId = syncData[STORAGE_KEY_THEME];
  } else {
    const localData = await new Promise(resolve => chrome.storage.local.get([STORAGE_KEY_THEME, STORAGE_KEY_RANDOM], resolve));
    const randomMode = localData[STORAGE_KEY_RANDOM] || false;
    themeId = localData[STORAGE_KEY_THEME] || THEMES[0].id;

    if (randomMode) {
      const random = pickRandomTheme();
      themeId = random.id;
      chrome.storage.local.set({ [STORAGE_KEY_THEME]: themeId });
    }
  }

  applyTheme(themeId);
}

async function setTheme(themeId) {
  await new Promise(resolve => chrome.storage.local.set({ [STORAGE_KEY_THEME]: themeId }, resolve));
  // Also sync to sync storage if Theme Forever is active
  const forever = await getThemeForever();
  if (forever) {
    await new Promise(resolve => chrome.storage.sync.set({ [STORAGE_KEY_THEME]: themeId }, resolve));
  }
  applyTheme(themeId);
}

async function setRandomMode(enabled) {
  await new Promise(resolve => chrome.storage.local.set({ [STORAGE_KEY_RANDOM]: enabled }, resolve));
}

async function getRandomMode() {
  const data = await new Promise(resolve => chrome.storage.local.get(STORAGE_KEY_RANDOM, resolve));
  return data[STORAGE_KEY_RANDOM] || false;
}

async function setThemeForever(enabled) {
  await new Promise(resolve => chrome.storage.sync.set({ [STORAGE_KEY_FOREVER]: enabled }, resolve));
  if (enabled) {
    const data = await new Promise(resolve => chrome.storage.local.get(STORAGE_KEY_THEME, resolve));
    const themeId = data[STORAGE_KEY_THEME] || THEMES[0].id;
    await new Promise(resolve => chrome.storage.sync.set({ [STORAGE_KEY_THEME]: themeId }, resolve));
  }
}

async function getThemeForever() {
  const data = await new Promise(resolve => chrome.storage.sync.get(STORAGE_KEY_FOREVER, resolve));
  return data[STORAGE_KEY_FOREVER] || false;
}

async function applyForever() {
  const forever = await getThemeForever();
  if (forever) {
    await loadAndApplyTheme();
  } else {
    removeStyle();
  }
}

function getSquareColor(row, col) {
  return (col + row + 1) % 2 === 0 ? 'dark' : 'light';
}

function getBoardContainer() {
  return document.querySelector('.cg-wrap');
}

var coordPerspective = 'white';

function getPerspective() {
  return coordPerspective;
}

function getCoordinateForSquare(row, col, perspective) {
  if (perspective === 'white') {
    const files = ['a','b','c','d','e','f','g','h'];
    const ranks = ['8','7','6','5','4','3','2','1'];
    return files[col] + ranks[row];
  }
  const files = ['h','g','f','e','d','c','b','a'];
  const ranks = ['8','7','6','5','4','3','2','1'];
  return files[col] + ranks[row];
}

function rebuildCoordinates() {
  const old = document.getElementById(COORD_OVERLAY_ID);
  if (old) old.remove();

  const wrap = getBoardContainer();
  if (!wrap) return;

  const container = document.createElement('div');
  container.id = COORD_OVERLAY_ID;
  container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;';
  wrap.appendChild(container);

  const perspective = getPerspective();
  const rect = wrap.getBoundingClientRect();
  const sqSize = rect.width / 8;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const label = getCoordinateForSquare(row, col, perspective);
      const isDark = getSquareColor(row, col) === 'dark';
      const textColor = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)';

      const span = document.createElement('span');
      span.textContent = label;
      span.style.cssText = `
        position:absolute;pointer-events:none;font-size:${sqSize * 0.35}px;font-weight:bold;
        font-family:'Courier New','Roboto Mono',Consolas,monospace;user-select:none;
        text-shadow:none;filter:none;backdrop-filter:none;-webkit-text-stroke:0;
        left:${col * sqSize}px;top:${row * sqSize}px;
        width:${sqSize}px;height:${sqSize}px;
        display:flex;align-items:center;justify-content:center;
        color:${textColor};
      `;
      container.appendChild(span);
    }
  }

}

function addCoordinateOverlay() {
  const old = document.getElementById(COORD_OVERLAY_ID);
  if (old) old.remove();

  const board = getBoardContainer();
  if (!board) return;

  const container = document.createElement('div');
  container.id = COORD_OVERLAY_ID;
  container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;';
  board.appendChild(container);

  requestAnimationFrame(rebuildCoordinates);
}

function removeCoordinateOverlay() {
  const el = document.getElementById(COORD_OVERLAY_ID);
  if (el) el.remove();
}

var coordKeyListener = null;

function handleKeyDown(e) {
  if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    var container = document.getElementById(COORD_OVERLAY_ID);
    if (!container) return;
    coordPerspective = coordPerspective === 'white' ? 'black' : 'white';
    console.log('[Zenit] Coord perspective toggled to ' + coordPerspective);
    requestAnimationFrame(rebuildCoordinates);
  }
}

function startCoordKeyListener() {
  stopCoordKeyListener();
  document.addEventListener('keydown', handleKeyDown);
  coordKeyListener = true;
}

function stopCoordKeyListener() {
  document.removeEventListener('keydown', handleKeyDown);
  coordKeyListener = false;
}

async function loadAndSetCoordToggle(checkbox) {
  const data = await new Promise(resolve => chrome.storage.local.get(STORAGE_KEY_COORDS, resolve));
  const show = data[STORAGE_KEY_COORDS] || false;
  checkbox.checked = show;
  if (show) { addCoordinateOverlay(); startCoordKeyListener(); }
}

function buildPanel() {
  if (document.getElementById(PANEL_ID)) return;

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <style>
      #zenit-theme-panel {
        position: fixed; bottom: 20px; right: 20px; z-index: 9999;
        background: #1a1a2e; border: 1px solid #333; border-radius: 8px;
        padding: 12px; font-family: sans-serif; font-size: 13px; color: #e0e0e0;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4); min-width: 200px;
      }
      #zenit-theme-panel .z-header {
        display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;
      }
      #zenit-theme-panel .z-header { gap: 6px; }
      #zenit-theme-panel .z-header img { width: 18px; height: 18px; }
      #zenit-theme-panel .z-header span { font-weight: bold; color: #bb86fc; }
      #zenit-theme-panel .z-close { cursor: pointer; color: #888; font-size: 16px; }
      #zenit-theme-panel select {
        width: 100%; padding: 4px; margin-bottom: 6px; border-radius: 4px; border: 1px solid #444;
        background: #16213e; color: #e0e0e0; font-size: 12px;
      }
      #zenit-theme-panel label { display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; }
      #zenit-theme-panel input[type="checkbox"] { cursor: pointer; }
    </style>
    <div class="z-header"><img src="${chrome.runtime.getURL('assets/icon.svg')}" alt="Z"><span>Zenit Theme</span><span class="z-close" id="z-panel-close">&times;</span></div>
    <select id="z-theme-select"></select>
    <label><input type="checkbox" id="z-random-toggle"> Random mode</label>
    <label><input type="checkbox" id="z-forever-toggle"> Theme Forever</label>
    <label><input type="checkbox" id="z-coord-toggle"> Show coordinates on squares</label>
  `;
  document.body.appendChild(panel);

  const select = panel.querySelector('#z-theme-select');
  THEMES.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    select.appendChild(opt);
  });

  // Load current state
  chrome.storage.local.get([STORAGE_KEY_THEME, STORAGE_KEY_RANDOM], (localData) => {
    chrome.storage.sync.get([STORAGE_KEY_FOREVER, STORAGE_KEY_THEME], (syncData) => {
      const foreverThemeId = syncData[STORAGE_KEY_THEME];
      select.value = foreverThemeId || localData[STORAGE_KEY_THEME] || THEMES[0].id;
      const cb = panel.querySelector('#z-random-toggle');
      cb.checked = localData[STORAGE_KEY_RANDOM] || false;
      const fb = panel.querySelector('#z-forever-toggle');
      fb.checked = syncData[STORAGE_KEY_FOREVER] || false;
    });
  });

  // Events
  select.addEventListener('change', () => setTheme(select.value));
  panel.querySelector('#z-random-toggle').addEventListener('change', (e) => setRandomMode(e.target.checked));
  panel.querySelector('#z-forever-toggle').addEventListener('change', (e) => {
    setThemeForever(e.target.checked);
    if (e.target.checked) {
      loadAndApplyTheme();
    } else {
      removeStyle();
    }
  });
  const coordCb = panel.querySelector('#z-coord-toggle');
  coordCb.addEventListener('change', (e) => {
    const on = e.target.checked;
    chrome.storage.local.set({ [STORAGE_KEY_COORDS]: on });
    if (on) { coordPerspective = 'white'; addCoordinateOverlay(); startCoordKeyListener(); }
    else { removeCoordinateOverlay(); stopCoordKeyListener(); }
  });
  loadAndSetCoordToggle(coordCb);
  panel.querySelector('#z-panel-close').addEventListener('click', () => panel.remove());
}

// Auto-apply on load — runs on all Lichess pages
// Theme Forever mode applies globally; otherwise inject only on /analysis/
function shouldAutoApply() {
  const isAnalysis = window.location.href.includes('lichess.org/analysis');
  return isAnalysis;
}

async function init() {
  const data = await new Promise(resolve => chrome.storage.sync.get(STORAGE_KEY_FOREVER, resolve));
  const forever = data[STORAGE_KEY_FOREVER] || false;

  if (forever || shouldAutoApply()) {
    loadAndApplyTheme();
  }

  if (shouldAutoApply()) {
    buildPanel();
  }
}

// Listen for theme-apply commands from background (e.g., history game re-open)
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'zenit-apply-theme') {
      if (msg.themeId) {
        setTheme(msg.themeId);
      } else {
        loadAndApplyTheme();
      }
      sendResponse({ success: true });
    }
  });
}

if (typeof window !== 'undefined' && window.location && window.location.href.includes('lichess.org')) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
