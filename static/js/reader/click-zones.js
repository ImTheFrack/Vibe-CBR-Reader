import { state } from '../state.js';

export function setupClickZones() {
  const reader = document.getElementById('reader');
  if (!reader) return;

  reader.addEventListener('click', (e) => {
    if (e.target.closest('.reader-toolbar') || e.target.closest('.reader-footer')) {
      return;
    }

    const rect = reader.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    const leftZone = width * 0.25;
    const rightZone = width * 0.75;

    if (state.settings.direction === 'rtl') {
      if (x < leftZone) {
      } else if (x > rightZone) {
      }
    } else {
      if (x < leftZone) {
      } else if (x > rightZone) {
      }
    }
  });
}
