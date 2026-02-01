import { state } from './state.js';
import { apiGet, apiPost, apiDelete } from './api.js';
import { showToast } from './utils.js';
import { setPreference } from './preferences.js';

let uiTimer = null;
let isUIVisible = true;
let lastMouseY = 0;
let lastShowX = 0;
let lastShowY = 0;

function showReaderUI() {
    const reader = document.getElementById('reader');
    if (!reader) return;
    reader.classList.remove('ui-hidden');
    isUIVisible = true;
    resetReaderUITimer();
}

function hideReaderUI() {
    const reader = document.getElementById('reader');
    if (!reader) return;
    
    // Don't hide if mouse is in the top/bottom 10%
    const threshold = window.innerHeight * 0.1;
    if (lastMouseY < threshold || lastMouseY > window.innerHeight - threshold) {
        return;
    }
    
    reader.classList.add('ui-hidden');
    isUIVisible = false;
    
    // Also close settings if UI hides
    const settings = document.getElementById('settings-panel');
    if (settings) settings.classList.remove('open');
}

function resetReaderUITimer() {
    if (uiTimer) clearTimeout(uiTimer);
    uiTimer = setTimeout(hideReaderUI, 2000);
}

function setupReaderInteraction() {
    const reader = document.getElementById('reader');
    if (!reader) return;

    // Use pointermove to handle mouse and touch
    reader.addEventListener('pointermove', (e) => {
        lastMouseY = e.clientY;
        const threshold = window.innerHeight * 0.1;
        const isControlZone = e.clientY < threshold || e.clientY > window.innerHeight - threshold;
        
        if (isControlZone) {
            // Hovering/moving in 10% zone - always show
            showReaderUI();
            if (uiTimer) clearTimeout(uiTimer);
        } else {
            // Middle zone logic
            // 1. Ignore if it's a touch move (touch shouldn't show UI in middle)
            if (e.pointerType === 'touch') return;
            
            // 2. Only show if movement is significant (threshold 10px)
            const dist = Math.sqrt(Math.pow(e.clientX - lastShowX, 2) + Math.pow(e.clientY - lastShowY, 2));
            if (dist > 10) {
                if (!isUIVisible) showReaderUI();
                else resetReaderUITimer();
                lastShowX = e.clientX;
                lastShowY = e.clientY;
            }
        }
    });

    // Pointerdown handles both click and tap
    reader.addEventListener('pointerdown', (e) => {
        const threshold = window.innerHeight * 0.1;
        if (e.clientY < threshold || e.clientY > window.innerHeight - threshold) {
            showReaderUI();
        }
        // Save position to prevent immediate pointermove trigger
        lastShowX = e.clientX;
        lastShowY = e.clientY;
    });
}

export async function startReading(comicId, page = 0) {
    // Fetch latest metadata from server to handle lazy-counted pages
    const comicData = await apiGet(`/api/read/${comicId}`);
    if (comicData.error) {
        showToast('Failed to load comic metadata', 'error');
        return;
    }
    
    const comic = comicData;
    state.currentComic = comic;
    state.totalPages = comic.pages || 0;
    
    // Update state.comics with latest pages count if it changed
    const localComic = state.comics.find(c => c.id === comicId);
    if (localComic && localComic.pages !== comic.pages) {
        localComic.pages = comic.pages;
    }
    
    // Find prev/next comics in the series
    const seriesComics = state.comics.filter(c => c.series === comic.series).sort((a, b) => {
        if (a.volume !== b.volume) return (a.volume || 0) - (b.volume || 0);
        return (a.chapter || 0) - (b.chapter || 0);
    });
    
    const currentIndex = seriesComics.findIndex(c => c.id === comicId);
    state.readerNavigation.prevComic = currentIndex > 0 ? seriesComics[currentIndex - 1] : null;
    state.readerNavigation.nextComic = currentIndex < seriesComics.length - 1 ? seriesComics[currentIndex + 1] : null;
    
    updateReaderToolbar();
    
    let startPage = page;
    if (state.isAuthenticated && page === 0) {
        const savedProgress = await loadProgressFromAPI(comicId);
        if (savedProgress) {
            startPage = savedProgress.page;
            state.readingProgress[comicId] = savedProgress;
        }
    }
    state.currentPage = startPage;

    document.getElementById('reader-title').textContent = `${comic.title} - ${comic.chapter ? `Ch. ${comic.chapter}` : (comic.volume ? `Vol. ${comic.volume}` : '')}`;
    document.getElementById('reader').classList.add('active');
    
    // Initialize interaction
    setupReaderInteraction();
    showReaderUI();
    
    await loadBookmarks(comicId);
    ensureBookmarkButton();
    await loadPage(startPage);
    updateReaderUI();
}

async function loadProgressFromAPI(comicId) {
    if (!state.isAuthenticated) return null;
    const result = await apiGet(`/api/progress/${comicId}`);
    if (!result.error) {
        return {
            page: result.current_page,
            completed: result.completed,
            lastRead: new Date(result.last_read).getTime()
        };
    }
    return null;
}

async function saveProgressToAPI() {
    if (!state.isAuthenticated || !state.currentComic) return;
    const progressData = {
        comic_id: state.currentComic.id,
        current_page: state.currentPage,
        total_pages: state.totalPages,
        completed: state.currentPage >= state.totalPages - 1
    };
    const result = await apiPost('/api/progress', progressData);
    if (result.error && result.status !== 401) {
        console.error('Failed to save progress:', result.error);
    }
}

async function loadBookmarks(comicId) {
    if (!state.isAuthenticated) {
        state.currentBookmarks = [];
        return;
    }
    const result = await apiGet(`/api/bookmarks/${comicId}`); // Optimized: used comic specific endpoint or filter? Original used /api/bookmarks then filter.
    // Actually, server has /api/bookmarks/{comic_id} endpoint!
    if (!result.error && Array.isArray(result)) {
        state.currentBookmarks = result;
    } else {
        state.currentBookmarks = [];
    }
    updateBookmarkUI();
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

function updateBookmarkUI() {
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
    const sorted = [...state.currentBookmarks].sort((a, b) => a.page_number - b.page_number);
    const list = sorted.map(b => `
        <div class="bookmark-item" onclick="jumpToPage(${b.page_number}); closeBookmarksModal();">
            <span>🔖 Page ${b.page_number + 1}</span>
            <button onclick="event.stopPropagation(); removeBookmark(${b.page_number});" class="bookmark-delete">&times;</button>
        </div>
    `).join('');
    
    const overlay = document.createElement('div');
    overlay.id = 'bookmarks-modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal" id="bookmarks-modal">
            <div class="modal-header">
                <h3 class="modal-title">Bookmarks</h3>
                <button class="modal-close" onclick="closeBookmarksModal()">&times;</button>
            </div>
            <div class="modal-body">
                ${list}
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('active'), 10);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeBookmarksModal();
    });
}

export function closeBookmarksModal() {
    const overlay = document.getElementById('bookmarks-modal-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 300);
    }
}

function updateReaderToolbar() {
    const toolbar = document.querySelector('.reader-toolbar');
    if (!toolbar) return;
    const existingNav = toolbar.querySelector('.reader-comic-nav');
    if (existingNav) existingNav.remove();
    
    const navContainer = document.createElement('div');
    navContainer.className = 'reader-comic-nav';
    
    if (state.readerNavigation.prevComic) {
        const prevBtn = document.createElement('button');
        prevBtn.className = 'reader-nav-btn prev-comic';
        prevBtn.innerHTML = '← Prev Ch';
        prevBtn.title = `Previous: ${state.readerNavigation.prevComic.title}`;
        prevBtn.onclick = () => navigateReaderComic('prev');
        navContainer.appendChild(prevBtn);
    }
    
    if (state.readerNavigation.nextComic) {
        const nextBtn = document.createElement('button');
        nextBtn.className = 'reader-nav-btn next-comic';
        nextBtn.innerHTML = 'Next Ch →';
        nextBtn.title = `Next: ${state.readerNavigation.nextComic.title}`;
        nextBtn.onclick = () => navigateReaderComic('next');
        navContainer.appendChild(nextBtn);
    }
    
    if (navContainer.children.length > 0) {
        toolbar.insertBefore(navContainer, toolbar.firstChild);
    }
}

export function navigateReaderComic(direction) {
    const targetComic = direction === 'prev' ? state.readerNavigation.prevComic : state.readerNavigation.nextComic;
    if (!targetComic) return;
    const progress = state.readingProgress[targetComic.id];
    const page = progress && !progress.completed ? progress.page : 0;
    startReading(targetComic.id, page);
    showToast(`${direction === 'prev' ? 'Previous' : 'Next'} chapter loaded`, 'success');
}

function ensureBookmarkButton() {
    let bookmarkBtn = document.getElementById('bookmark-btn');
    if (!bookmarkBtn) {
        const toolbar = document.querySelector('.reader-toolbar');
        if (toolbar) {
            bookmarkBtn = document.createElement('button');
            bookmarkBtn.id = 'bookmark-btn';
            bookmarkBtn.className = 'reader-btn';
            bookmarkBtn.onclick = toggleBookmark;
            const settingsBtn = toolbar.querySelector('[onclick="toggleSettings()"]');
            if (settingsBtn) toolbar.insertBefore(bookmarkBtn, settingsBtn);
            else toolbar.appendChild(bookmarkBtn);
        }
    }
    let bookmarksListBtn = document.getElementById('bookmarks-list-btn');
    if (!bookmarksListBtn) {
        const toolbar = document.querySelector('.reader-toolbar');
        if (toolbar) {
            bookmarksListBtn = document.createElement('button');
            bookmarksListBtn.id = 'bookmarks-list-btn';
            bookmarksListBtn.className = 'reader-btn';
            bookmarksListBtn.innerHTML = '📑';
            bookmarksListBtn.title = 'View bookmarks';
            bookmarksListBtn.onclick = showBookmarksList;
            const bookmarkBtn = document.getElementById('bookmark-btn');
            if (bookmarkBtn) toolbar.insertBefore(bookmarksListBtn, bookmarkBtn.nextSibling);
            else toolbar.appendChild(bookmarksListBtn);
        }
    }
}

async function loadPage(pageNum) {
    if (state.settings.display === 'long') {
        await loadLongStrip();
        return;
    }

    const comicId = state.currentComic.id;
    const container = document.getElementById('reader-pages');
    if (!container) return;
    
    container.innerHTML = ''; // Clear existing images
    
    pageNum = parseInt(pageNum);
    state.currentPage = pageNum;

    if (state.settings.display === 'double') {
        // Double page logic: page 0 is usually single, then pairs
        if (pageNum === 0) {
            const img = createReaderImage(`/api/read/${comicId}/page/0`);
            container.appendChild(img);
        } else {
            // Ensure we are on an odd page for double (1, 3, 5...)
            const firstPage = pageNum % 2 === 0 ? pageNum - 1 : pageNum;
            state.currentPage = firstPage;
            
            const img1 = createReaderImage(`/api/read/${comicId}/page/${firstPage}`);
            container.appendChild(img1);
            
            if (firstPage + 1 < state.totalPages) {
                const img2 = createReaderImage(`/api/read/${comicId}/page/${firstPage + 1}`);
                container.appendChild(img2);
            }
        }
    } else {
        // Single page
        const img = createReaderImage(`/api/read/${comicId}/page/${pageNum}`);
        container.appendChild(img);
        
        // Preload next
        if (pageNum < state.totalPages - 1) {
            const nextImg = new Image();
            nextImg.src = `/api/read/${comicId}/page/${pageNum + 1}`;
        }
    }
    
    updateReaderUI();
}

function createReaderImage(src) {
    const img = document.createElement('img');
    img.src = src;
    img.className = 'reader-image';
    img.alt = 'Comic page';
    
    // Apply current zoom settings
    applyImageZoom(img, state.settings.zoom);
    
    return img;
}

function applyImageZoom(img, zoom) {
    if (zoom === 'width') {
        img.style.width = '100%';
        img.style.height = 'auto';
        img.style.maxWidth = '100%';
        img.style.maxHeight = 'none';
        img.style.objectFit = 'contain';
    } else if (zoom === 'height') {
        img.style.width = 'auto';
        img.style.height = '100%';
        img.style.maxWidth = 'none';
        img.style.maxHeight = '100%';
        img.style.objectFit = 'contain';
    } else {
        // 'fit' - Fit to Screen
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';
        img.style.objectFit = 'contain';
    }
}

async function loadLongStrip() {
    const comicId = state.currentComic.id;
    const container = document.getElementById('reader-pages');
    if (!container) return;
    
    container.innerHTML = '';
    
    for (let i = 0; i < state.totalPages; i++) {
        const img = createReaderImage(`/api/read/${comicId}/page/${i}`);
        img.loading = 'lazy';
        container.appendChild(img);
    }
    
    // Reset scroll position
    document.getElementById('reader-viewport').scrollTop = 0;
    updateReaderUI();
}

function updateReaderUI() {
    let indicatorText = `${state.currentPage + 1} / ${state.totalPages}`;
    
    if (state.settings.display === 'double' && state.currentPage > 0 && state.currentPage + 1 < state.totalPages) {
        indicatorText = `${state.currentPage + 1}-${state.currentPage + 2} / ${state.totalPages}`;
    } else if (state.settings.display === 'long') {
        indicatorText = `Long Strip / ${state.totalPages} Pages`;
    }
    
    document.getElementById('page-indicator').textContent = indicatorText;
    const slider = document.getElementById('progress-slider');
    slider.max = state.totalPages - 1;
    slider.value = state.currentPage;
    updateBookmarkUI();
    saveProgress();
}

export function nextPage() {
    if (state.settings.display === 'long') return;
    
    let increment = 1;
    if (state.settings.display === 'double' && state.currentPage > 0) {
        increment = 2;
    } else if (state.settings.display === 'double' && state.currentPage === 0) {
        increment = 1;
    }
    
    // Note: state.settings.direction only affects layout, not logical page order
    const newPage = state.currentPage + increment;
    if (newPage < state.totalPages) {
        loadPage(newPage);
    } else {
        completeReading();
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
    if (newPage !== state.currentPage) {
        loadPage(newPage);
    }
}

export function jumpToPage(pageNum) {
    state.currentPage = parseInt(pageNum);
    loadPage(state.currentPage);
    updateReaderUI();
}

async function completeReading() {
    state.readingProgress[state.currentComic.id] = {
        ...state.readingProgress[state.currentComic.id],
        completed: true,
        page: state.totalPages - 1,
        lastRead: Date.now()
    };
    await saveProgressToAPI();
    if (state.readerNavigation.nextComic) showComicEndModal();
    else showToast('You\'ve reached the end of the series!', 'success');
}

function showComicEndModal() {
    const existingModal = document.getElementById('comic-end-overlay');
    if (existingModal) existingModal.remove();
    
    const overlay = document.createElement('div');
    overlay.id = 'comic-end-overlay';
    overlay.className = 'comic-end-overlay';
    
    const prevComic = state.readerNavigation.prevComic;
    const nextComic = state.readerNavigation.nextComic;
    
    const prevBtn = prevComic ? `<button class="btn-secondary" onclick="closeComicEndModal(); navigateReaderComic('prev')">← Previous: ${prevComic.chapter ? `Ch. ${prevComic.chapter}` : (prevComic.volume ? `Vol. ${prevComic.volume}` : 'Previous')}</button>` : '';
    const nextBtn = nextComic ? `<button class="btn-primary" onclick="closeComicEndModal(); navigateReaderComic('next')">Next: ${nextComic.chapter ? `Ch. ${nextComic.chapter}` : (nextComic.volume ? `Vol. ${nextComic.volume}` : 'Next')} →</button>` : '';
    
    overlay.innerHTML = `
        <div class="comic-end-modal">
            <h3>Chapter Complete! 🎉</h3>
            <p>You've finished reading this chapter.</p>
            <div class="comic-end-actions">${nextBtn}${prevBtn}<button class="btn-secondary" onclick="closeComicEndModal()" style="margin-top: 8px;">Stay Here</button></div>
        </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('active'), 10);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeComicEndModal(); });
}

export function closeComicEndModal() {
    const overlay = document.getElementById('comic-end-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 300);
    }
}

function saveProgress() {
    if (!state.currentComic) return;
    state.readingProgress[state.currentComic.id] = {
        page: state.currentPage,
        lastRead: Date.now(),
        completed: state.currentPage >= state.totalPages - 1
    };
    saveProgressToAPI();
}

export function closeReader() {
    document.getElementById('reader').classList.remove('active');
    document.getElementById('reader').classList.remove('ui-hidden');
    if (uiTimer) clearTimeout(uiTimer);
    state.currentComic = null;
    state.currentBookmarks = [];
    saveProgress();
}

export function toggleSettings() {
    document.getElementById('settings-panel').classList.toggle('open');
}

export function setSetting(type, value) {
    state.settings[type] = value;
    document.querySelectorAll(`[data-setting="${type}"]`).forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === value);
    });
    
    const reader = document.getElementById('reader');
    if (type === 'display') {
        reader.setAttribute('data-display', value);
        if (value === 'long') {
            loadLongStrip();
        } else {
            loadPage(state.currentPage);
        }
    }
    if (type === 'direction') {
        reader.setAttribute('data-direction', value);
        if (state.settings.display === 'double') {
            loadPage(state.currentPage);
        }
    }
    
    if (type === 'zoom') {
        // Refresh images to apply zoom
        if (state.settings.display === 'long') {
            const images = document.querySelectorAll('.reader-image');
            images.forEach(img => applyImageZoom(img, value));
        } else {
            loadPage(state.currentPage);
        }
    }
    if (state.isAuthenticated) {
        const prefMap = { 'direction': 'reader_direction', 'display': 'reader_display', 'zoom': 'reader_zoom' };
        if (prefMap[type]) setPreference(prefMap[type], value);
    }
}

export function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (!state.currentComic) return;
        switch(e.key) {
            case 'ArrowLeft': case 'a': case 'A': e.preventDefault(); prevPage(); break;
            case 'ArrowRight': case 'd': case 'D': case ' ': e.preventDefault(); nextPage(); break;
            case 'Escape': closeReader(); break;
            case 'f': case 'F': e.preventDefault(); toggleFullscreen(); break;
            case 'b': case 'B': e.preventDefault(); toggleBookmark(); break;
        }
        if (e.shiftKey) {
            switch(e.key) {
                case 'ArrowLeft': e.preventDefault(); if (state.readerNavigation.prevComic) navigateReaderComic('prev'); break;
                case 'ArrowRight': e.preventDefault(); if (state.readerNavigation.nextComic) navigateReaderComic('next'); break;
            }
        }
    });
}

function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
}
