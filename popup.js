// popup.js
// Functionality: Popup UI for status, game history cards, and controls.
//   - Reads storage for enabled state, stats, and game history
//   - Toggle enable/disable for auto-analysis
//   - Displays formatted clickable game history cards (date, result, players, time control)
//   - Clicking a card re-opens the game on Lichess with Theme Forever re-applied
//   - Clear History button with confirmation
//   - Dynamic updates via chrome.storage.onChanged listener
// Inputs: chrome.storage.local, DOM events
// Outputs: chrome.runtime.sendMessage, chrome.storage.local writes

const HISTORY_KEY = 'zenit_game_history';

document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  const countEl = document.getElementById('count');
  const countBadge = document.getElementById('countBadge');
  const toggleBtn = document.getElementById('toggleBtn');
  const clearBtn = document.getElementById('clearBtn');
  const historyList = document.getElementById('historyList');

  function render() {
    chrome.storage.local.get(['zenit_enabled', 'zenit_stats', HISTORY_KEY], (data) => {
      const enabled = data.zenit_enabled !== false;
      statusEl.textContent = enabled ? 'Watching' : 'Paused';
      statusEl.className = 'value ' + (enabled ? 'watching' : 'paused');
      toggleBtn.textContent = enabled ? 'Pause' : 'Resume';
      toggleBtn.className = 'btn-toggle' + (enabled ? '' : ' off');

      const games = data[HISTORY_KEY] || [];
      countEl.textContent = games.length;
      countBadge.textContent = games.length;

      if (games.length === 0) {
        historyList.innerHTML = '<div class="empty-state"><div class="icon">&#9822;</div><div class="text">No games analyzed yet</div></div>';
        return;
      }

      let html = '<h2>Recent Games</h2>';
      for (let i = games.length - 1; i >= 0; i--) {
        const g = games[i];
        const label = genericLabel(g);
        html += `
          <div class="game-card" data-id="${g.id || ''}">
            <div class="info">
              <div class="meta">${escapeHtml(label.date)}${label.tc ? ' &middot; ' + escapeHtml(label.tc) : ''}</div>
              <div class="players">
                <span class="result">${escapeHtml(label.result)}</span>
                ${escapeHtml(label.white)} vs ${escapeHtml(label.black)}
              </div>
            </div>
            <div class="right">
              <div class="time">${g.timestamp ? timeAgo(g.timestamp) : ''}</div>
            </div>
          </div>`;
      }
      historyList.innerHTML = html;

      // Attach click handlers to game cards
      historyList.querySelectorAll('.game-card').forEach((card) => {
        const id = card.dataset.id;
        card.addEventListener('click', () => loadGame(id));
        card.style.cursor = 'pointer';
      });
    });
  }

  function loadGame(gameId) {
    if (!gameId) return;
    chrome.storage.local.get(HISTORY_KEY, (data) => {
      const games = data[HISTORY_KEY] || [];
      const game = games.find(g => g.id === gameId);
      if (!game || !game.pgn) return;

      chrome.storage.local.get('zenit_theme_id', (data) => {
        const themeId = data.zenit_theme_id || null;
        chrome.runtime.sendMessage({
          action: 'open-history-game',
          pgn: game.pgn,
          themeId: themeId
        });
      });
    });
  }

  toggleBtn.addEventListener('click', () => {
    chrome.storage.local.get('zenit_enabled', (data) => {
      const current = data.zenit_enabled !== false;
      chrome.storage.local.set({ zenit_enabled: !current }, render);
    });
  });

  clearBtn.addEventListener('click', async () => {
    const ok = await showCustomConfirm('Clear History', 'Delete all analyzed games? This cannot be undone.');
    if (ok) {
      chrome.storage.local.set({ [HISTORY_KEY]: [] }, render);
    }
  });

  // Dynamic updates when background changes history
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[HISTORY_KEY] || changes.zenit_enabled || changes.zenit_stats) {
      render();
    }
  });

  render();
});

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const parts = dateStr.split('.');
  if (parts.length === 3) {
    return `${parts[1]}/${parts[2]}/${parts[0]}`;
  }
  return dateStr;
}

function formatResult(result) {
  const map = {
    '1-0': '1-0',
    '0-1': '0-1',
    '1/2-1/2': '\u00BD-\u00BD',
    '*': '*'
  };
  return map[result] || result;
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function genericLabel(g) {
  const hasMeta = g.white && g.white !== '?' && g.white !== '';
  const fallbackName = g.timestamp ? 'Match at ' + formatTime(g.timestamp) : 'Match';
  return {
    date: g.date ? formatDate(g.date) : '—',
    white: hasMeta ? g.white : fallbackName,
    black: hasMeta ? g.black : '',
    result: g.result && g.result !== '*' ? formatResult(g.result) : '',
    tc: g.timeControl || ''
  };
}

function formatTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return hh + ':' + mm;
}

function showCustomConfirm(title, message) {
  return new Promise((resolve) => {
    const container = document.getElementById('z-modal-container');
    if (!container) { resolve(false); return; }

    const overlay = document.createElement('div');
    overlay.className = 'z-modal-overlay';
    overlay.innerHTML = `
      <div class="z-modal">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        <div class="z-modal-btns">
          <button class="z-modal-cancel">Cancel</button>
          <button class="z-modal-delete">Delete</button>
        </div>
      </div>`;

    container.appendChild(overlay);

    const cancelBtn = overlay.querySelector('.z-modal-cancel');
    const deleteBtn = overlay.querySelector('.z-modal-delete');

    function close(result) {
      overlay.classList.add('closing');
      setTimeout(() => { overlay.remove(); resolve(result); }, 200);
    }

    cancelBtn.addEventListener('click', () => close(false));
    deleteBtn.addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
  });
}
