// lichess.js
// Functionality: Post-navigation automation on Lichess analysis pages.
//   - Waits for the analysis board and controls to render
//   - Clicks "First move" button (data-act="first") to jump to the game start
//   - Ensures local engine evaluation (ceval) is enabled for instant analysis
// Inputs: lichess.org/analysis/* page load
// Outputs: DOM interactions (clicks on buttons/toggles)

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

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function setupLichessAnalysis() {
  console.log('[Zenit] Setting up Lichess analysis board...');

  // Wait for the analysis controls to appear (board + jumps)
  const controls = await waitForElm('.analyse__controls', 10000);
  if (!controls) {
    console.warn('[Zenit] Analysis controls not found');
    return;
  }
  console.log('[Zenit] Analysis controls loaded');

  await delay(500);

  // Jump to first move to show the starting position
  const firstBtn = controls.querySelector('button[data-act="first"]');
  if (firstBtn) {
    firstBtn.click();
    console.log('[Zenit] Jumped to first move');
  } else {
    console.warn('[Zenit] First move button not found');
  }

  await delay(300);

  // Ensure local evaluation (ceval) is enabled
  const cevalInput = document.querySelector('#cmn-tg-analyse-toggle-ceval');
  if (cevalInput) {
    if (!cevalInput.checked) {
      // Click the label associated with the checkbox to toggle it on
      const label = document.querySelector('label[for="cmn-tg-analyse-toggle-ceval"]');
      if (label) {
        label.click();
        console.log('[Zenit] Local engine evaluation enabled');
      } else {
        cevalInput.click();
        console.log('[Zenit] Local engine evaluation enabled (via input click)');
      }
    } else {
      console.log('[Zenit] Local engine evaluation already active');
    }
  } else {
    console.warn('[Zenit] Ceval toggle not found');
  }

  console.log('[Zenit] Lichess setup complete');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupLichessAnalysis);
} else {
  setupLichessAnalysis();
}
