import { state } from '../state.js';

let autoAdvanceTimer = null;
let autoAdvanceFrame = null;
let autoAdvanceStartTime = null;

export function toggleAutoAdvance() {
  state.settings.autoAdvanceActive = !state.settings.autoAdvanceActive;
  const btn = document.getElementById('auto-advance-toggle');
  if (btn) {
    btn.innerHTML = state.settings.autoAdvanceActive ? '⏹ Stop Auto-Advance' : '▶ Start Auto-Advance';
    btn.classList.toggle('active', state.settings.autoAdvanceActive);
  }

  if (state.settings.autoAdvanceActive) {
    startAutoAdvanceTimer();
  } else {
    stopAutoAdvance();
  }
}

export function startAutoAdvanceTimer() {
  if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
  if (autoAdvanceFrame) cancelAnimationFrame(autoAdvanceFrame);

  const autoAdvanceBar = document.getElementById('auto-advance-bar');
  if (!state.settings.autoAdvanceActive || !state.currentComic) {
    if (autoAdvanceBar) autoAdvanceBar.style.display = 'none';
    return;
  }

  autoAdvanceStartTime = Date.now();
  animateAutoAdvance();

  autoAdvanceTimer = setTimeout(() => {
    if (state.currentPage < state.totalPages - 1) {
    } else {
      toggleAutoAdvance();
    }
  }, state.settings.autoAdvanceInterval * 1000);
}

function animateAutoAdvance() {
  if (!state.settings.autoAdvanceActive || !state.currentComic) {
    const bar = document.getElementById('auto-advance-bar');
    if (bar) bar.style.display = 'none';
    return;
  }

  const container = document.getElementById('auto-advance-bar');
  const fill = document.getElementById('auto-advance-fill');
  if (!container || !fill) return;

  container.style.display = 'block';

  const now = Date.now();
  const elapsed = now - autoAdvanceStartTime;
  const duration = state.settings.autoAdvanceInterval * 1000;
  const remaining = Math.max(0, 100 - (elapsed / duration * 100));

  fill.style.width = `${remaining}%`;

  if (elapsed < duration) {
    autoAdvanceFrame = requestAnimationFrame(animateAutoAdvance);
  }
}

export function stopAutoAdvance() {
  if (autoAdvanceTimer) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
  if (autoAdvanceFrame) {
    cancelAnimationFrame(autoAdvanceFrame);
    autoAdvanceFrame = null;
  }
  const autoAdvanceBar = document.getElementById('auto-advance-bar');
  if (autoAdvanceBar) autoAdvanceBar.style.display = 'none';
}

export function getAutoAdvanceState() {
  return { autoAdvanceTimer, autoAdvanceFrame, autoAdvanceStartTime };
}
