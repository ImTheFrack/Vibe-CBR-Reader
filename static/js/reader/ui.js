import { state } from '../state.js';

let uiTimer = null;
let isUIVisible = true;
let lastMouseY = 0;
let lastShowX = 0;
let lastShowY = 0;

export function showReaderUI() {
  const reader = document.getElementById('reader');
  if (!reader) return;
  reader.classList.remove('ui-hidden');
  isUIVisible = true;
  resetReaderUITimer();
}

export function hideReaderUI(force = false) {
  const reader = document.getElementById('reader');
  if (!reader) return;

  if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
    resetReaderUITimer();
    return;
  }

  if (!force) {
    const threshold = window.innerHeight * 0.1;
    if (lastMouseY < threshold || lastMouseY > window.innerHeight - threshold) {
      return;
    }
  }

  if (uiTimer) { clearTimeout(uiTimer); uiTimer = null; }

  reader.classList.add('ui-hidden');
  isUIVisible = false;

  const settings = document.getElementById('settings-panel');
  if (settings) settings.classList.remove('open');
}

export function resetReaderUITimer() {
  if (uiTimer) clearTimeout(uiTimer);
  uiTimer = setTimeout(hideReaderUI, 2000);
}

export function toggleReaderUI() {
  if (isUIVisible) hideReaderUI(true); else showReaderUI();
}

export function getUIState() {
  return { isUIVisible, lastMouseY, lastShowX, lastShowY };
}

export function setLastMousePosition(x, y) {
  lastShowX = x;
  lastShowY = y;
}

export function setLastMouseY(y) {
  lastMouseY = y;
}
