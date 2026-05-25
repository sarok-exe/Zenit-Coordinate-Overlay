// content.js
// Functionality: Multi-strategy DOM observer that detects finished Chess.com games.
//   Detection: MutationObserver + periodic sweeps + URL change monitor
//   PGN extraction (prioritized):
//     Primary:   Async wait for Share modal → PGN tab → textarea[name=pgn]
//     Secondary: Click arbitrary PGN button → read output panel
//     Tertiary:  data-pgn attribute, JSON script payload, board element attribute
//     Fallback:  DOM move-list reconstruction
//   Handles focus/theatre mode by exiting before Share interaction
//   Persists extraction failures to chrome.storage.local via zenitPersistError
// Inputs: DOM mutations, URL changes, periodic timer ticks on chess.com/*
// Outputs: chrome.runtime.sendMessage({ action: "open-lichess", url }) to background.js

const CONFIG = {
  debounceMs: 800,
  sweepIntervalMs: 3000,
  maxSweeps: 45,
  shareModalTimeoutMs: 5000
};

const SELECTORS = {
  gameOverModal: [
    'div[data-cy="game-over-modal-content"]',
    '.board-modal-component',
    '.game-over-modal-shell-container',
    '[class*="game-over-modal-shell"]',
    '[class*="game-over-modal"]',
    '[class*="gameOverModal"]',
    '[class*="game_result"]',
    '.board-modal',
    '[class*="board"] [class*="modal"]'
  ].join(', '),
  resultText: [
    'span.game-result',
    '[data-cy="header-title-component"]',
    '[data-cy="header-subtitle-first-line"]',
    '[class*="result"]',
    '[class*="game-over"]',
    '[class*="gameOver"]',
    '[class*="header"]'
  ].join(', '),
  shareBtn: '[aria-label=Share]',
  pgnTab: '#tab-pgn',
  pgnTextarea: 'textarea[name=pgn]',
  pgnButton: 'button[class*="pgn"], [data-export="pgn"], a[class*="pgn"], [class*="download"] a, [class*="pgn-download"]',
  pgnDataAttr: '[data-pgn]',
  moveList: 'wc-mode-swap-move-list, wc-simple-move-list, .timestamps-with-base-time, .move-list-component, .vertical-move-list, [class*="move-list"], [class*="move_list"], table[class*="move"]',
  closeModalBtn: '#share-modal button[aria-label="Close"], [data-cy="close-board-modal"], .modal-header [aria-label="Close"], [data-test-element="modal-close"]',
  focusBtn: '#board-controls-focus'
};

const RESULT_PATTERNS = [
  /\b(1-0|0-1|½-½|1\/2-1\/2)\b/,
  /\b(Game Over|game over)\b/i,
  /\b(Checkmate|Stalemate|Draw|Resign|Timeout|Abandoned)\b/i
];

let observer = null;
let debounceTimer = null;
let sweepTimer = null;
let sweepCount = 0;
let detected = false;
let currentState = 'idle';

function waitForElm(selector, timeout) {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);
    let timedOut = false;
    const timer = timeout ? setTimeout(() => { timedOut = true; resolve(null); }, timeout) : null;
    const obs = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found && !timedOut) {
        obs.disconnect();
        if (timer) clearTimeout(timer);
        resolve(found);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });
}

function setState(next, reason) {
  const prev = currentState;
  currentState = next;
  zenitState(prev, next, reason);
}

function matchesAnyPattern(text) {
  return RESULT_PATTERNS.some(rx => rx.test(text));
}

async function extractPGNviaShareModal() {
  zenitDetect('extract', 'Attempting Share modal PGN extraction');

  const isFocusMode = document.body.classList.contains('theatre-mode');
  if (isFocusMode) {
    zenitDetect('extract', 'Focus mode detected, exiting for Share interaction');
    const focusBtn = document.querySelector(SELECTORS.focusBtn);
    if (focusBtn) focusBtn.click();
    await new Promise(r => setTimeout(r, 300));
  }

  const shareBtn = await waitForElm(SELECTORS.shareBtn, CONFIG.shareModalTimeoutMs);
  if (!shareBtn) {
    zenitExtraction('shareModal', 'SKIP', 'Share button not found within timeout');
    if (isFocusMode) {
      const fb = document.querySelector(SELECTORS.focusBtn);
      if (fb) fb.click();
    }
    return null;
  }

  shareBtn.click();
  zenitExtraction('shareModal', 'TRY', 'Share button clicked');

  const pgnTab = await waitForElm(SELECTORS.pgnTab, 3000);
  if (!pgnTab) {
    zenitExtraction('shareModal', 'SKIP', 'PGN tab not found in share modal');
    closeShareModal();
    if (isFocusMode) { const fb = document.querySelector(SELECTORS.focusBtn); if (fb) fb.click(); }
    return null;
  }
  pgnTab.click();
  zenitExtraction('shareModal', 'TRY', 'PGN tab clicked');

  const textarea = await waitForElm(SELECTORS.pgnTextarea, 3000);
  if (!textarea || !textarea.value) {
    zenitExtraction('shareModal', 'SKIP', 'PGN textarea not found or empty');
    closeShareModal();
    if (isFocusMode) { const fb = document.querySelector(SELECTORS.focusBtn); if (fb) fb.click(); }
    return null;
  }

  const pgn = textarea.value.trim();
  zenitExtraction('shareModal', 'OK', `Extracted ${pgn.length} chars from Share modal textarea`);

  closeShareModal();
  if (isFocusMode) {
    const fb = document.querySelector(SELECTORS.focusBtn);
    if (fb) fb.click();
  }
  return pgn;
}

function closeShareModal() {
  const closeBtn = document.querySelector(SELECTORS.closeModalBtn);
  if (closeBtn) {
    closeBtn.click();
    zenitDetect('extract', 'Share modal closed');
    return;
  }
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
  document.dispatchEvent(escape);
  zenitDetect('extract', 'Share modal closed via Escape');
}

function extractPGNsync() {
  // Strategy: Click PGN button and capture its output
  const pgnBtn = document.querySelector(SELECTORS.pgnButton);
  if (pgnBtn) {
    zenitExtraction('pgnButtonClick', 'TRY', 'PGN button found, clicking...');
    pgnBtn.click();
    const txt = document.querySelector(SELECTORS.pgnTextarea + ', textarea[class*="pgn"], textarea.pgn, [class*="pgn-text"]');
    if (txt && txt.value) {
      zenitExtraction('pgnButtonClick', 'OK', `Extracted ${txt.value.length} chars from textarea`);
      return txt.value.trim();
    }
    const block = document.querySelector('[class*="pgn"] pre, [class*="pgn"] div[class*="text"]');
    if (block && block.textContent) {
      zenitExtraction('pgnButtonClick', 'OK', `Extracted ${block.textContent.length} chars from block`);
      return block.textContent.trim();
    }
    zenitExtraction('pgnButtonClick', 'SKIP', 'Button clicked but no PGN element appeared');
  } else {
    zenitExtraction('pgnButtonClick', 'SKIP', 'No PGN button found');
  }

  // Strategy: Read data-pgn attribute
  const pgnEl = document.querySelector(SELECTORS.pgnDataAttr);
  if (pgnEl) {
    const pgn = pgnEl.getAttribute('data-pgn');
    if (pgn) {
      zenitExtraction('dataPgnAttr', 'OK', `Extracted ${pgn.length} chars`);
      return pgn.trim();
    }
    zenitExtraction('dataPgnAttr', 'SKIP', 'Attribute empty');
  } else {
    zenitExtraction('dataPgnAttr', 'SKIP', 'No element found');
  }

  // Strategy: JSON payload embedded in scripts or board element
  const scripts = document.querySelectorAll('script[type="application/json"], script:not([src])');
  let foundJson = false;
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      const pgn = data?.pgn || data?.game?.pgn || data?.data?.pgn;
      if (pgn && typeof pgn === 'string' && pgn.length > 20) {
        zenitExtraction('jsonPayload', 'OK', `Extracted ${pgn.length} chars`);
        return pgn.trim();
      }
      foundJson = true;
    } catch (_) { }
  }
  zenitExtraction('jsonPayload', 'SKIP', foundJson ? 'No PGN field in JSON' : 'No JSON scripts');

  const boardEl = document.querySelector('[class*="board"]');
  if (boardEl) {
    const attr = boardEl.getAttribute('data-pgn') || boardEl.getAttribute('data-game-pgn');
    if (attr) {
      zenitExtraction('boardAttr', 'OK', `Extracted ${attr.length} chars`);
      return attr.trim();
    }
    zenitExtraction('boardAttr', 'SKIP', 'No PGN attribute on board');
  } else {
    zenitExtraction('boardAttr', 'SKIP', 'No board element');
  }

  // Strategy: DOM move-list reconstruction (fallback)
  const moveList = document.querySelector(SELECTORS.moveList);
  if (moveList) {
    const pgn = reconstructPGNFromDOM(moveList);
    if (pgn) {
      zenitExtraction('domWalk', 'OK', `Reconstructed ${pgn.length} chars`);
      return pgn;
    }
    zenitExtraction('domWalk', 'SKIP', 'DOM walk produced no moves');
  } else {
    zenitExtraction('domWalk', 'SKIP', 'No move-list element');
  }

  return null;
}

async function extractPGN() {
  zenitDetect('extract', 'Beginning PGN extraction pipeline');

  const fromShare = await extractPGNviaShareModal();
  if (fromShare) return fromShare;

  zenitDetect('extract', 'Share modal failed, trying sync strategies');
  const fromSync = extractPGNsync();
  if (fromSync) return fromSync;

  zenitDetect('extract', 'All extraction strategies exhausted');
  return null;
}

function reconstructPGNFromDOM(moveList) {
  const moves = [];
  const rows = moveList.querySelectorAll('.main-line-row.move-list-row, [class*="move-list-row"], tr, [class*="move-row"], [class*="move_line"]');
  if (rows.length === 0) return null;
  rows.forEach(row => {
    if (row.classList.contains('result-row')) return;
    const white = row.querySelector('.node.white-move, [class*="white-move"], [class*="white"], td:first-child');
    const black = row.querySelector('.node.black-move, [class*="black-move"], [class*="black"], td:last-child');
    if (white) {
      const text = (white.querySelector('.node-highlight-content') || white).textContent.trim();
      if (text && !/^\d+\./.test(text)) {
        moves.push(`${Math.floor(moves.length / 2) + 1}. ${text}`);
      } else if (text) {
        moves.push(text);
      }
    }
    if (black) {
      const text = (black.querySelector('.node-highlight-content') || black).textContent.trim();
      if (text) moves.push(text);
    }
  });
  if (moves.length === 0) return null;
  return moves.join(' ');
}

function openInLichess(pgn) {
  const encoded = encodeURIComponent(pgn);
  const url = `https://lichess.org/analysis/pgn/${encoded}`;
  zenitLog(`Opening Lichess: ${url.substring(0, 100)}...`);
  chrome.runtime.sendMessage({ action: "open-lichess", url });
  setState('redirected', 'Lichess URL dispatched');
}

function handleGameOver() {
  if (detected) { zenitDetect('handle', 'Already detected, ignoring'); return; }
  if (debounceTimer) clearTimeout(debounceTimer);

  setState('detected', 'Game over signal received');
  zenitDetect('handle', 'Debouncing extraction...');

  debounceTimer = setTimeout(async () => {
    if (detected) return;
    detected = true;
    setState('extracting', 'Debounce elapsed');

    let pgn;
    try {
      pgn = await extractPGN();
    } catch (e) {
      zenitError('PGN extraction threw:', e);
      zenitPersistError('extraction_crash', { reason: e.message, url: location.href });
      return;
    }

    if (pgn && validatePGN(pgn)) {
      // Validate moves structurally before accepting
      const moveCheck = validateMoves(pgn);
      if (!moveCheck.valid) {
        zenitDetect('handle', `Move validation failed: ${moveCheck.reason} at token '${moveCheck.token}'`);
        zenitPersistError('move_validation_failed', { reason: moveCheck.reason, token: moveCheck.token, url: location.href });
        detected = false;
        setState('idle', 'Move validation failed, resetting');
        return;
      }

      // Parse headers from raw PGN BEFORE normalization (normalize flattens newlines)
      const gameData = extractGameData(pgn);
      const gameId = generateGameId(pgn) || 'g_' + Date.now().toString(36);
      const normalized = normalizePGN(pgn);
      const link = `https://lichess.org/analysis/pgn/${encodeURIComponent(normalized)}`;

      zenitDetect('handle', `PGN valid (${normalized.length} chars), redirecting`);
      try {
        openInLichess(normalized);
      } catch (e) {
        zenitError('Lichess open failed:', e);
        zenitPersistError('lichess_open_failed', { reason: e.message, pgn: normalized.substring(0, 200) });
      }

      chrome.storage.local.get(['zenit_stats', 'zenit_game_history'], (data) => {
        const stats = data.zenit_stats || { detected: 0 };
        stats.detected += 1;
        const history = data.zenit_game_history || [];
        history.push({
          id: gameId,
          date: gameData.date || '',
          white: gameData.white || '',
          black: gameData.black || '',
          result: gameData.result || '*',
          timeControl: gameData.timeControl || '',
          link: link,
          pgn: normalized,
          timestamp: Date.now()
        });
        // Keep last 50 games
        if (history.length > 50) history.splice(0, history.length - 50);
        chrome.storage.local.set({
          zenit_stats: stats,
          zenit_game_history: history,
          lastGameUrl: link
        });
      });
    } else {
      zenitDetect('handle', `Extraction result: ${pgn ? 'invalid PGN' : 'null'}`);
      zenitPersistError('extraction_failed', {
        reason: pgn ? 'validation_failed' : 'no_pgn_found',
        url: location.href,
        bodyClasses: document.body ? document.body.className : null
      });
      detected = false;
      setState('idle', 'Extraction failed, resetting');
    }
    cleanup();
  }, CONFIG.debounceMs);
}

function checkForGameOver() {
  if (detected) return false;
  const modal = document.querySelector(SELECTORS.gameOverModal);
  if (modal && modal.offsetParent !== null) {
    if (matchesAnyPattern(modal.textContent)) {
      zenitDetect('sweep', 'Game over via modal');
      handleGameOver();
      return true;
    }
  }
  const els = document.querySelectorAll(SELECTORS.resultText);
  for (const el of els) {
    if (matchesAnyPattern(el.textContent) && (el.offsetParent !== null || document.contains(el))) {
      zenitDetect('sweep', 'Game over via result element');
      handleGameOver();
      return true;
    }
  }
  return false;
}

function onMutation(mutations) {
  if (detected) return;
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const el = node;
      if (el.matches && el.matches(SELECTORS.gameOverModal)) { handleGameOver(); return; }
      if (el.querySelector && el.querySelector(SELECTORS.gameOverModal)) { handleGameOver(); return; }
      if (el.matches && el.matches(SELECTORS.resultText) && matchesAnyPattern(el.textContent)) { handleGameOver(); return; }
    }
    if (mutation.type === 'attributes') {
      const el = mutation.target;
      if (mutation.attributeName === 'class' || mutation.attributeName === 'data-cy') {
        if (el.matches && (el.matches(SELECTORS.gameOverModal) || el.matches(SELECTORS.resultText))) {
          if (el.offsetParent !== null && matchesAnyPattern(el.textContent)) { handleGameOver(); return; }
        }
      }
    }
  }
}

function monitorUrlChanges() {
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      zenitDetect('urlChange', `${lastUrl} → ${location.href}`);
      lastUrl = location.href;
      detected = false;
      sweepCount = 0;
      setState('idle', 'URL changed');
      startSweeper();
    }
  }, 500);
}

function startSweeper() {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepCount = 0;
  sweepTimer = setInterval(() => {
    sweepCount++;
    if (sweepCount > CONFIG.maxSweeps || detected) {
      clearInterval(sweepTimer);
      sweepTimer = null;
      return;
    }
    checkForGameOver();
  }, CONFIG.sweepIntervalMs);
  zenitDetect('sweep', `Started (every ${CONFIG.sweepIntervalMs}ms, max ${CONFIG.maxSweeps})`);
}

function cleanup() {
  if (observer) { observer.disconnect(); observer = null; }
  if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null; }
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
}

function startObserver() {
  if (document.body) {
    zenitLog(`Zenit v${ZENIT.VERSION} on ${location.hostname}`);
    observer = new MutationObserver(onMutation);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'data-cy'] });
    setState('watching', 'Active');
    checkForGameOver();
    startSweeper();
    monitorUrlChanges();
  }
}

// Interactive forced-trigger for console debugging
// Usage: run `zenitForceTrigger()` in DevTools console to simulate game-over
window.zenitForceTrigger = async function () {
  zenitLog('Forced trigger activated — simulating game over');
  zenitDetect('forced', 'User manually triggered detection');
  detected = false;
  currentState = 'idle';
  setState('watching', 'Forced trigger reset');
  const pgn = await extractPGN();
  zenitDetect('forced', `Extraction result: ${pgn ? pgn.substring(0, 50) + '...' : 'null'}`);
  if (pgn && validatePGN(pgn)) {
    zenitLog('✓ PGN valid, opening Lichess');
    openInLichess(normalizePGN(pgn));
  } else {
    zenitError('✗ PGN extraction failed or invalid');
    zenitPersistError('forced_trigger_failed', {
      reason: pgn ? 'validation_failed' : 'no_pgn_found',
      url: location.href,
      bodyClasses: document.body ? document.body.className : null,
      docTitle: document.title
    });
  }
  return pgn;
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startObserver);
} else {
  startObserver();
}
