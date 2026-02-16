import { state } from '../state.js';

export function nextPage() {
  if (state.settings.display === 'long') return;

  let increment = 1;
  if (state.settings.display === 'double' && state.currentPage > 0) {
    increment = 2;
  } else if (state.settings.display === 'double' && state.currentPage === 0) {
    increment = 1;
  }

  const newPage = state.currentPage + increment;
  if (newPage < state.totalPages) {
    return newPage;
  } else {
    return null;
  }
}

export function prevPage() {
  if (state.settings.display === 'long') return;

  let decrement = 1;
  if (state.settings.display === 'double' && state.currentPage > 1) {
    decrement = 2;
  } else if (state.settings.display === 'double' && state.currentPage === 1) {
    decrement = 1;
  }

  const newPage = Math.max(0, state.currentPage - decrement);
  return newPage !== state.currentPage ? newPage : null;
}

export function jumpToPage(pageNum) {
  return parseInt(pageNum);
}

export function handleSliderInput(value) {
  const tooltip = document.getElementById('reader-tooltip');
  const slider = document.getElementById('progress-slider');
  if (!tooltip || !slider) return;

  const pageNum = parseInt(value) + 1;
  tooltip.textContent = `Page ${pageNum}`;
  tooltip.classList.add('visible');

  const percent = (value / slider.max) * 100;
  tooltip.style.left = `${percent}%`;

  if (window.tooltipTimer) clearTimeout(window.tooltipTimer);
  window.tooltipTimer = setTimeout(() => {
    tooltip.classList.remove('visible');
  }, 1500);
}

export function navigateReaderComic(direction) {
  const targetComic = direction === 'prev' ? state.readerNavigation.prevComic : state.readerNavigation.nextComic;
  if (!targetComic) return null;
  return targetComic;
}
