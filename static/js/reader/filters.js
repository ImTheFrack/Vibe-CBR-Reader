import { state } from '../state.js';
import { setPreference } from '../preferences.js';

export function applyFilters() {
  const container = document.getElementById('reader-pages');
  if (!container) return;

  const s = state.settings;
  container.style.setProperty('--reader-brightness', s.brightness);
  container.style.setProperty('--reader-contrast', s.contrast);
  container.style.setProperty('--reader-saturate', s.saturation);
  container.style.setProperty('--reader-invert', s.invert);

  if (s.toneMode === 'grayscale') {
    container.style.setProperty('--reader-grayscale', s.toneValue);
    container.style.setProperty('--reader-sepia', 0);
  } else {
    container.style.setProperty('--reader-sepia', s.toneValue);
    container.style.setProperty('--reader-grayscale', 0);
  }
}

export function setSetting(type, value, syncPreference = true) {
  const numericTypes = ['brightness', 'contrast', 'saturation', 'invert', 'toneValue', 'autoAdvanceInterval', 'sepia'];
  if (numericTypes.includes(type)) {
    value = parseFloat(value);
  }

  state.settings[type] = value;

  if (syncPreference && state.isAuthenticated) {
    const prefMap = {
      'direction': 'reader_direction',
      'display': 'reader_display',
      'zoom': 'reader_zoom',
      'brightness': 'brightness',
      'contrast': 'contrast',
      'saturation': 'saturation',
      'invert': 'invert',
      'toneValue': 'tone_value',
      'toneMode': 'tone_mode',
      'autoAdvanceInterval': 'auto_advance_interval'
    };
    if (prefMap[type]) setPreference(prefMap[type], value, false);
  }
}

export function resetAllFilters() {
  state.settings.brightness = 1.0;
  state.settings.contrast = 1.0;
  state.settings.saturation = 1.0;
  state.settings.invert = 0.0;
  state.settings.toneValue = 0.0;
  state.settings.toneMode = 'sepia';

  applyFilters();
}

export function toggleSettings() {
  document.getElementById('settings-panel').classList.toggle('open');
}
