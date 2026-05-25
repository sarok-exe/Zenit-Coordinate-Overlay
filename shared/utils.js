// shared/utils.js
// Functionality: Shared constants, structured logging, debug helpers, and persistent error storage for Zenit.
//   - zenitLog: general debug logging (tagged with [Zenit])
//   - zenitError: error logging
//   - zenitDetect: step-by-step detection pipeline tracing (observer, sweep, checks)
//   - zenitExtraction: PGN extraction method tracing
//   - zenitState: state machine transition logging
//   - zenitPersistError: writes structured error records to chrome.storage.local for offline debugging
// Inputs: log messages, step names, detection state, error objects
// Outputs: formatted console output + persisted records in zenit_error_logs storage key

const ZENIT = {
  DEBUG: true,
  VERSION: '1.0.0',
  STORAGE_KEYS: {
    enabled: 'zenit_enabled',
    lastGame: 'zenit_last_game',
    stats: 'zenit_stats',
    errorLogs: 'zenit_error_logs'
  }
};

function zenitLog(...args) {
  if (ZENIT.DEBUG) {
    console.log('[Zenit]', ...args);
  }
}

function zenitError(...args) {
  console.error('[Zenit]', ...args);
}

function zenitDetect(step, detail) {
  if (ZENIT.DEBUG) {
    console.log(`[Zenit:Detect] Step ${step} —`, detail);
  }
}

function zenitExtraction(method, status, detail) {
  if (ZENIT.DEBUG) {
    const icon = status === 'OK' ? '✓' : status === 'SKIP' ? '–' : '✗';
    console.log(`[Zenit:Extract] ${icon} ${method} — ${detail}`);
  }
}

function zenitState(prev, next, reason) {
  if (ZENIT.DEBUG) {
    console.log(`[Zenit:State] ${prev} → ${next} (${reason})`);
  }
}

function zenitPersistError(context, detail) {
  zenitError(context, detail);
  const record = {
    ts: Date.now(),
    url: location.href,
    context,
    detail,
    domSnapshot: {
      bodyClasses: document.body ? document.body.className : null,
      selectors: {
        shareBtn: document.querySelector('[aria-label=Share]') ? 'found' : 'missing',
        gameOverModal: document.querySelector('.game-over-modal, .modal-game-over, [class*="game-over-modal"]') ? 'found' : 'missing',
        pgnTextarea: document.querySelector('textarea[name=pgn]') ? 'found' : 'missing',
        pgnDataAttr: document.querySelector('[data-pgn]') ? 'found' : 'missing'
      }
    }
  };
  try {
    chrome.storage.local.get([ZENIT.STORAGE_KEYS.errorLogs], (data) => {
      const logs = data[ZENIT.STORAGE_KEYS.errorLogs] || [];
      logs.push(record);
      if (logs.length > 50) logs.shift();
      chrome.storage.local.set({ [ZENIT.STORAGE_KEYS.errorLogs]: logs });
    });
  } catch (e) {
    console.error('[Zenit] Failed to persist error log:', e);
  }
}
