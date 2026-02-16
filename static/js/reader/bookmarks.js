import { state } from '../state.js';
import { apiGet, apiPost, apiDelete } from '../api.js';
import { showToast } from '../utils.js';

export async function loadBookmarks(comicId) {
  if (!state.isAuthenticated) {
    state.currentBookmarks = [];
    return;
  }
  const result = await apiGet(`/api/bookmarks/${comicId}`);
  if (!result.error && Array.isArray(result)) {
    state.currentBookmarks = result;
  } else {
    state.currentBookmarks = [];
  }
}

export async function addBookmark() {
  if (!state.isAuthenticated) {
    showToast('Please log in to add bookmarks', 'error');
    return;
  }
  if (!state.currentComic) return;

  const result = await apiPost('/api/bookmarks', {
    comic_id: state.currentComic.id,
    page_number: state.currentPage,
    note: `Page ${state.currentPage + 1}`
  });

  if (result.error) {
    showToast('Failed to add bookmark', 'error');
  } else {
    showToast('Bookmark added!', 'success');
    await loadBookmarks(state.currentComic.id);
  }
}

export async function removeBookmark(pageNumber) {
  if (!state.isAuthenticated || !state.currentComic) return;
  const result = await apiDelete(`/api/bookmarks/${state.currentComic.id}/${pageNumber}`);
  if (result.error) {
    showToast('Failed to remove bookmark', 'error');
  } else {
    showToast('Bookmark removed', 'success');
    await loadBookmarks(state.currentComic.id);
  }
}

export function toggleBookmark() {
  if (!state.isAuthenticated) {
    showToast('Please log in to use bookmarks', 'error');
    return;
  }
  const existingBookmark = state.currentBookmarks.find(b => b.page_number === state.currentPage);
  if (existingBookmark) {
    removeBookmark(state.currentPage);
  } else {
    addBookmark();
  }
}

export function updateBookmarkUI() {
  const bookmarkBtn = document.getElementById('bookmark-btn');
  if (!bookmarkBtn) return;
  const hasBookmark = state.currentBookmarks.some(b => b.page_number === state.currentPage);
  bookmarkBtn.innerHTML = hasBookmark ? '🔖' : '🔖';
  bookmarkBtn.classList.toggle('active', hasBookmark);
  bookmarkBtn.title = hasBookmark ? 'Remove bookmark' : 'Add bookmark';
}

export function showBookmarksList() {
  if (!state.isAuthenticated || state.currentBookmarks.length === 0) {
    showToast('No bookmarks for this comic', 'info');
    return;
  }
}

export function closeBookmarksModal() {
  const overlay = document.getElementById('bookmarks-modal-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 300);
  }
}

export function ensureBookmarkButton() {
  let bookmarkBtn = document.getElementById('bookmark-btn');
  if (!bookmarkBtn) {
    const toolbar = document.querySelector('.reader-toolbar');
    if (toolbar) {
      bookmarkBtn = document.createElement('button');
      bookmarkBtn.id = 'bookmark-btn';
      bookmarkBtn.className = 'reader-btn';
      bookmarkBtn.onclick = () => toggleBookmark();
      const settingsBtn = toolbar.querySelector('[onclick="toggleSettings()"]');
      if (settingsBtn) toolbar.insertBefore(bookmarkBtn, settingsBtn);
      else toolbar.appendChild(bookmarkBtn);
    }
  }
}
