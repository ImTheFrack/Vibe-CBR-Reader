import { state } from '../state.js';

export function renderScrubber() {
  const scrubber = document.getElementById('reader-scrubber');
  if (!scrubber || !state.currentComic) return;

  const comicId = state.currentComic.id;
  const total = state.totalPages;
  const current = state.currentPage;
  const windowSize = 50;

  let start = Math.max(0, current - Math.floor(windowSize / 2));
  let end = Math.min(total, start + windowSize);

  if (end === total) {
    start = Math.max(0, end - windowSize);
  }

  scrubber.innerHTML = '';

  for (let i = start; i < end; i++) {
    const thumb = document.createElement('img');
    thumb.src = `/api/read/${comicId}/page/${i}`;
    thumb.className = 'scrubber-thumb';
    thumb.loading = 'lazy';
    thumb.dataset.page = i;
    thumb.onclick = (e) => {
      e.stopPropagation();
    };
    scrubber.appendChild(thumb);
  }
  updateScrubberActive();
}

export function updateScrubberActive() {
  const scrubber = document.getElementById('reader-scrubber');
  if (!scrubber) return;

  const thumbs = scrubber.querySelectorAll('.scrubber-thumb');
  if (thumbs.length === 0) return;

  const firstPage = parseInt(thumbs[0].dataset.page);
  const lastPage = parseInt(thumbs[thumbs.length - 1].dataset.page);

  if (state.currentPage < firstPage || state.currentPage > lastPage) {
    renderScrubber();
    return;
  }

  thumbs.forEach(thumb => {
    const page = parseInt(thumb.dataset.page);
    const isActive = page === state.currentPage ||
      (state.settings.display === 'double' && page === state.currentPage + 1);
    thumb.classList.toggle('active', isActive);

    if (isActive) {
      thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  });
}
