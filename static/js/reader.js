import { state } from './state.js';
import { apiGet, apiPost, apiDelete } from './api.js';
import { showToast } from './utils.js';
import { setPreference } from './preferences.js';
import * as router from './router.js';

let uiTimer = null;
let isUIVisible = true;
let lastMouseY = 0;
let lastShowX = 0;
let lastShowY = 0;
let sessionStartTime = null;
let autoAdvanceTimer = null;
let autoAdvanceFrame = null;
let autoAdvanceStartTime = null;
let gestureController = null;
let pointerMoveHandler = null;
let pointerDownHandler = null;

function showReaderUI() {
    const reader = document.getElementById('reader');
    if (!reader) return;
    reader.classList.remove('ui-hidden');
    isUIVisible = true;
    resetReaderUITimer();
}

function hideReaderUI(force = false) {
    const reader = document.getElementById('reader');
    if (!reader) return;
    
    if (!force) {
        const threshold = window.innerHeight * 0.1;
        if (lastMouseY < threshold || lastMouseY > window.innerHeight - threshold) {
            return;
        }
    }
    
    // Clear any pending auto-hide timer to prevent it from re-hiding or interfering
    if (uiTimer) { clearTimeout(uiTimer); uiTimer = null; }
    
    reader.classList.add('ui-hidden');
    isUIVisible = false;
    
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

    // Named pointer move handler for proper cleanup
    pointerMoveHandler = (e) => {
        lastMouseY = e.clientY;
        
        // Touch is handled by GestureController and click zones, not pointer events
        // This prevents touch near edges from re-showing UI after it's been hidden
        if (e.pointerType === 'touch') {
            return;
        }
        
        const threshold = window.innerHeight * 0.1;
        const isControlZone = e.clientY < threshold || e.clientY > window.innerHeight - threshold;
        
        if (isControlZone) {
            // Hovering/moving in 10% zone - always show for mouse
            showReaderUI();
            if (uiTimer) clearTimeout(uiTimer);
        } else {
            // Middle zone logic - only for mouse
            // Only show if movement is significant (threshold 10px)
            const dist = Math.sqrt(Math.pow(e.clientX - lastShowX, 2) + Math.pow(e.clientY - lastShowY, 2));
            if (dist > 10) {
                if (!isUIVisible) showReaderUI();
                else resetReaderUITimer();
                lastShowX = e.clientX;
                lastShowY = e.clientY;
            }
        }
    };

    // Named pointer down handler for proper cleanup
    pointerDownHandler = (e) => {
        // Save position first for all pointer types
        lastShowX = e.clientX;
        lastShowY = e.clientY;
        
        // Only show UI on pointerdown for mouse (not touch)
        // Touch UI control is handled by GestureController and click zones
        if (e.pointerType === 'touch') {
            return;
        }
        
        const threshold = window.innerHeight * 0.1;
        if (e.clientY < threshold || e.clientY > window.innerHeight - threshold) {
            showReaderUI();
        }
    };

    // Use pointermove to handle mouse and touch
    reader.addEventListener('pointermove', pointerMoveHandler);

    // Pointerdown handles both click and tap
    reader.addEventListener('pointerdown', pointerDownHandler);

    // Initialize Swipes and store instance for cleanup
    gestureController = new GestureController(reader, 
        () => { // Swipe Left
            if (state.settings.direction === 'rtl') prevPage(); else nextPage();
            hideReaderUI(true);
        },
        () => { // Swipe Right
            if (state.settings.direction === 'rtl') nextPage(); else prevPage();
            hideReaderUI(true);
        }
    );
}

function cleanupReaderInteraction() {
    const reader = document.getElementById('reader');
    if (!reader) return;
    
    if (pointerMoveHandler) {
        reader.removeEventListener('pointermove', pointerMoveHandler);
        pointerMoveHandler = null;
    }
    
    if (pointerDownHandler) {
        reader.removeEventListener('pointerdown', pointerDownHandler);
        pointerDownHandler = null;
    }
    
    if (gestureController) {
        gestureController.destroy();
        gestureController = null;
    }
    
    if (autoAdvanceTimer) {
        clearTimeout(autoAdvanceTimer);
        autoAdvanceTimer = null;
    }
    
    if (autoAdvanceFrame) {
        cancelAnimationFrame(autoAdvanceFrame);
        autoAdvanceFrame = null;
    }
    
    prefetchManager.clear();
}

class PrefetchManager {
    constructor() {
        this.cache = new Map();
        this.maxCacheSize = 8; // Reduced from 15
        this.loadingUrls = new Set();
    }

    async prefetch(url) {
        if (this.cache.has(url) || this.loadingUrls.has(url)) return;
        if (this.cache.size >= this.maxCacheSize) this.enforceCacheLimit();

        this.loadingUrls.add(url);
        try {
            const img = new Image();
            img.src = url;
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                // Timeout prefetch after 5s to not block forever
                setTimeout(resolve, 5000);
            });
            this.cache.set(url, img);
        } catch (e) {
            console.warn(`Failed to prefetch: ${url}`, e);
        } finally {
            this.loadingUrls.delete(url);
        }
    }

    enforceCacheLimit() {
        while (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
    }

    getCachedImage(url) {
        return this.cache.get(url);
    }

    clear() {
        this.cache.clear();
        this.loadingUrls.clear();
    }
}

const prefetchManager = new PrefetchManager();

class GestureController {
    constructor(element, onSwipeLeft, onSwipeRight) {
        this.element = element;
        this.onSwipeLeft = onSwipeLeft;
        this.onSwipeRight = onSwipeRight;
        this.startX = 0;
        this.startY = 0;
        this.threshold = 50; // min distance for swipe
        
        this.touchStartHandler = (e) => {
            this.startX = e.touches[0].clientX;
            this.startY = e.touches[0].clientY;
        };
        
        this.touchEndHandler = (e) => {
            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;
            
            const diffX = endX - this.startX;
            const diffY = endY - this.startY;
            
            // horizontal swipe
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > this.threshold) {
                if (diffX > 0) {
                    this.onSwipeRight();
                } else {
                    this.onSwipeLeft();
                }
            }
        };
        
        this.init();
    }

    init() {
        this.element.addEventListener('touchstart', this.touchStartHandler, { passive: true });
        this.element.addEventListener('touchend', this.touchEndHandler, { passive: true });
    }
    
    destroy() {
        this.element.removeEventListener('touchstart', this.touchStartHandler);
        this.element.removeEventListener('touchend', this.touchEndHandler);
    }
}

export async function startReading(comicId, page = 0) {
    // Navigate to read route
    router.navigate('read', { comicId });
    
    router.registerCleanup('reader', cleanupReaderInteraction);
    
    // Fetch latest metadata from server to handle lazy-counted pages
    const comicData = await apiGet(`/api/read/${comicId}`);
    if (comicData.error) {
        showToast('Failed to load comic metadata', 'error');
        return;
    }
    
    const comic = comicData;
    state.currentComic = comic;
    state.totalPages = comic.pages || 0;
    sessionStartTime = Date.now();
    
    prefetchManager.clear();
    
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
    
    // Apply global defaults for visual filters first
    if (state.userPreferences) {
        if (state.userPreferences.brightness !== undefined) state.settings.brightness = state.userPreferences.brightness;
        if (state.userPreferences.contrast !== undefined) state.settings.contrast = state.userPreferences.contrast;
        if (state.userPreferences.saturation !== undefined) state.settings.saturation = state.userPreferences.saturation;
        if (state.userPreferences.invert !== undefined) state.settings.invert = state.userPreferences.invert;
        if (state.userPreferences.tone_value !== undefined) state.settings.toneValue = state.userPreferences.tone_value;
        if (state.userPreferences.tone_mode !== undefined) state.settings.toneMode = state.userPreferences.tone_mode;
        if (state.userPreferences.auto_advance_interval !== undefined) state.settings.autoAdvanceInterval = state.userPreferences.auto_advance_interval;
    }

    let startPage = page;
    if (state.isAuthenticated && page === 0) {
        const savedProgress = await loadProgressFromAPI(comicId);
        if (savedProgress) {
            startPage = savedProgress.page;
            state.readingProgress[comicId] = savedProgress;
            
            // Apply per-comic settings if they exist
            if (savedProgress.reader_display) setSetting('display', savedProgress.reader_display, false);
            if (savedProgress.reader_direction) setSetting('direction', savedProgress.reader_direction, false);
            if (savedProgress.reader_zoom) setSetting('zoom', savedProgress.reader_zoom, false);
        } else {
            // Apply global defaults from preferences for new comics
            if (state.userPreferences) {
                if (state.userPreferences.reader_display) setSetting('display', state.userPreferences.reader_display, false);
                if (state.userPreferences.reader_direction) setSetting('direction', state.userPreferences.reader_direction, false);
                if (state.userPreferences.reader_zoom) setSetting('zoom', state.userPreferences.reader_zoom, false);
            }
        }
    }
    state.currentPage = startPage;

    document.getElementById('reader-title').textContent = `${comic.title} - ${comic.chapter ? `Ch. ${comic.chapter}` : (comic.volume ? `Vol. ${comic.volume}` : '')}`;
    document.getElementById('reader').classList.add('active');
    
    // Initialize interaction
    setupReaderInteraction();
    setupClickZones();
    showReaderUI();
    
    await loadBookmarks(comicId);
    ensureBookmarkButton();
    await loadPage(startPage);
    applyFilters();
    renderScrubber();
    updateReaderUI();
    
    // Sync slider UI
    const sliders = ['brightness', 'contrast', 'saturation', 'invert', 'toneValue'];
    sliders.forEach(type => {
        const slider = document.getElementById(`${type}-slider`);
        if (slider) slider.value = state.settings[type];
    });
    
    const aSlider = document.getElementById('autoAdvanceInterval-slider');
    if (aSlider) aSlider.value = state.settings.autoAdvanceInterval;
    const aVal = document.getElementById('autoAdvanceInterval-value');
    if (aVal) aVal.textContent = `${state.settings.autoAdvanceInterval}s`;
}

async function loadProgressFromAPI(comicId) {
    if (!state.isAuthenticated) return null;
    const result = await apiGet(`/api/progress/${comicId}`);
    if (!result.error) {
        return {
            page: result.current_page,
            completed: result.completed,
            lastRead: new Date(result.last_read).getTime(),
            reader_display: result.reader_display,
            reader_direction: result.reader_direction,
            reader_zoom: result.reader_zoom,
            seconds_read: result.seconds_read
        };
    }
    return null;
}

async function saveProgressToAPI(additionalSeconds = 0) {
    if (!state.isAuthenticated || !state.currentComic) return;
    const progressData = {
        comic_id: state.currentComic.id,
        current_page: state.currentPage,
        total_pages: state.totalPages,
        completed: state.currentPage >= state.totalPages - 1,
        reader_display: state.settings.display,
        reader_direction: state.settings.direction,
        reader_zoom: state.settings.zoom,
        additional_seconds: additionalSeconds
    };
    
    // Update local state immediately for responsiveness
    state.readingProgress[state.currentComic.id] = {
        ...state.readingProgress[state.currentComic.id],
        page: state.currentPage,
        lastRead: Date.now(),
        completed: progressData.completed,
        reader_display: progressData.reader_display,
        reader_direction: progressData.reader_direction,
        reader_zoom: progressData.reader_zoom
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
    router.navigate('read', { comicId: targetComic.id });
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
    }
    
    updateReaderUI();

    // Prefetching logic - reduced count and prioritized
    setTimeout(() => {
        if (!state.currentComic) return;
        const nextOffset = state.settings.display === 'double' ? 2 : 1;
        // Just prefetch next 2 pages and prev 1 page
        const prefetchIndices = [
            state.currentPage + nextOffset,
            state.currentPage + (nextOffset * 2),
            state.currentPage - nextOffset
        ];

        prefetchIndices.forEach(idx => {
            if (idx >= 0 && idx < state.totalPages) {
                prefetchManager.prefetch(`/api/read/${state.currentComic.id}/page/${idx}`);
            }
        });
    }, 500); // Small delay to let current page load first
}

function createReaderImage(src) {
    const loading = document.getElementById('reader-loading');
    
    // Check cache
    const cachedImg = prefetchManager.getCachedImage(src);
    let img;
    
    if (cachedImg) {
        img = cachedImg.cloneNode();
        if (loading) loading.classList.remove('active');
    } else {
        if (loading) loading.classList.add('active');
        img = document.createElement('img');
        img.src = src;
        
        img.onload = () => {
            if (loading) loading.classList.remove('active');
        };
        
        img.onerror = () => {
            if (loading) loading.classList.remove('active');
            showToast('Failed to load page', 'error');
        };
    }

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

export function applyFilters() {
    const container = document.getElementById('reader-pages');
    if (!container) return;
    
    const s = state.settings;
    container.style.setProperty('--reader-brightness', s.brightness);
    container.style.setProperty('--reader-contrast', s.contrast);
    container.style.setProperty('--reader-saturate', s.saturation);
    container.style.setProperty('--reader-invert', s.invert);
    
    // Tone: Sepia vs Grayscale (mutually exclusive)
    if (s.toneMode === 'grayscale') {
        container.style.setProperty('--reader-grayscale', s.toneValue);
        container.style.setProperty('--reader-sepia', 0);
    } else {
        container.style.setProperty('--reader-sepia', s.toneValue);
        container.style.setProperty('--reader-grayscale', 0);
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

function renderScrubber() {
    const scrubber = document.getElementById('reader-scrubber');
    if (!scrubber || !state.currentComic) return;
    
    const comicId = state.currentComic.id;
    const total = state.totalPages;
    const current = state.currentPage;
    const windowSize = 50; // Show 50 thumbnails at a time
    
    let start = Math.max(0, current - Math.floor(windowSize / 2));
    let end = Math.min(total, start + windowSize);
    
    // Adjust start if end is at total
    if (end === total) {
        start = Math.max(0, end - windowSize);
    }

    // Clear and render window
    scrubber.innerHTML = '';
    
    // Add spacer for scroll position if not at start (optional, but complicates scrolling)
    // For simplicity, we just render the window.
    
    for (let i = start; i < end; i++) {
        const thumb = document.createElement('img');
        thumb.src = `/api/read/${comicId}/page/${i}`;
        thumb.className = 'scrubber-thumb';
        thumb.loading = 'lazy';
        thumb.dataset.page = i;
        thumb.onclick = (e) => {
            e.stopPropagation();
            jumpToPage(i);
        };
        scrubber.appendChild(thumb);
    }
    updateScrubberActive();
}

export function updateScrubberActive() {
    const scrubber = document.getElementById('reader-scrubber');
    if (!scrubber) return;
    
    // Check if current page is in currently rendered window
    const thumbs = scrubber.querySelectorAll('.scrubber-thumb');
    if (thumbs.length === 0) return;
    
    const firstPage = parseInt(thumbs[0].dataset.page);
    const lastPage = parseInt(thumbs[thumbs.length - 1].dataset.page);
    
    if (state.currentPage < firstPage || state.currentPage > lastPage) {
        renderScrubber(); // Re-render window
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

export function updateReaderUI() {
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
    
    // Update footer navigation buttons
    const prevBtn = document.getElementById('footer-prev-chapter');
    const nextBtn = document.getElementById('footer-next-chapter');
    if (prevBtn) {
        prevBtn.disabled = !state.readerNavigation.prevComic;
        prevBtn.title = state.readerNavigation.prevComic ? `Previous: ${state.readerNavigation.prevComic.title}` : 'No previous chapter';
    }
    if (nextBtn) {
        nextBtn.disabled = !state.readerNavigation.nextComic;
        nextBtn.title = state.readerNavigation.nextComic ? `Next: ${state.readerNavigation.nextComic.title}` : 'No next chapter';
    }

    // Update Reader Settings Buttons Active State
    const themeDark = document.getElementById('reader-theme-dark');
    const themeLight = document.getElementById('reader-theme-light');
    if (themeDark && themeLight) {
        themeDark.classList.toggle('active', state.theme === 'dark');
        themeLight.classList.toggle('active', state.theme === 'light');
    }

    const ereaderOn = document.getElementById('reader-ereader-on');
    const ereaderOff = document.getElementById('reader-ereader-off');
    if (ereaderOn && ereaderOff) {
        ereaderOn.classList.toggle('active', state.ereader === true);
        ereaderOff.classList.toggle('active', state.ereader === false);
    }

    const toneSepia = document.getElementById('tone-mode-sepia');
    const toneGray = document.getElementById('tone-mode-grayscale');
    if (toneSepia && toneGray) {
        toneSepia.classList.toggle('active', state.settings.toneMode === 'sepia');
        toneGray.classList.toggle('active', state.settings.toneMode === 'grayscale');
    }

    // Update other buttons
    document.querySelectorAll('.settings-panel [data-setting]').forEach(btn => {
        const type = btn.dataset.setting;
        const value = btn.dataset.value;
        btn.classList.toggle('active', state.settings[type] === value);
    });

    updateBookmarkUI();
    updateScrubberActive();
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
        router.replace('read', { comicId: state.currentComic.id });
        if (state.settings.autoAdvanceActive) startAutoAdvanceTimer();
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
        router.replace('read', { comicId: state.currentComic.id });
        if (state.settings.autoAdvanceActive) startAutoAdvanceTimer();
    }
}

export function jumpToPage(pageNum) {
    state.currentPage = parseInt(pageNum);
    loadPage(state.currentPage);
    updateReaderUI();
    router.replace('read', { comicId: state.currentComic.id });
    if (state.settings.autoAdvanceActive) startAutoAdvanceTimer();
}

export function handleSliderInput(value) {
    const tooltip = document.getElementById('reader-tooltip');
    const slider = document.getElementById('progress-slider');
    if (!tooltip || !slider) return;

    const pageNum = parseInt(value) + 1;
    tooltip.textContent = `Page ${pageNum}`;
    tooltip.classList.add('visible');

    // Position tooltip over the thumb
    const percent = (value / slider.max) * 100;
    tooltip.style.left = `${percent}%`;

    // Hide tooltip after a delay
    if (window.tooltipTimer) clearTimeout(window.tooltipTimer);
    window.tooltipTimer = setTimeout(() => {
        tooltip.classList.remove('visible');
    }, 1500);
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
    
    let additionalSeconds = 0;
    if (sessionStartTime) {
        additionalSeconds = Math.floor((Date.now() - sessionStartTime) / 1000);
        sessionStartTime = Date.now(); // Reset for next incremental save
    }

    state.readingProgress[state.currentComic.id] = {
        ...state.readingProgress[state.currentComic.id],
        page: state.currentPage,
        lastRead: Date.now(),
        completed: state.currentPage >= state.totalPages - 1
    };
    saveProgressToAPI(additionalSeconds);
}

export function closeReader() {
    console.log("[DEBUG] closeReader called");
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    document.getElementById('reader').classList.remove('active');
    document.getElementById('reader').classList.remove('ui-hidden');
    if (uiTimer) clearTimeout(uiTimer);
    if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
    if (autoAdvanceFrame) cancelAnimationFrame(autoAdvanceFrame);
    
    const autoAdvanceBar = document.getElementById('auto-advance-bar');
    if (autoAdvanceBar) autoAdvanceBar.style.display = 'none';
    
    saveProgress(); // Final save with time
    
    state.currentComic = null;
    state.currentBookmarks = [];
    sessionStartTime = null;
    state.settings.autoAdvanceActive = false;
    const btn = document.getElementById('auto-advance-toggle');
    if (btn) {
        btn.innerHTML = '▶ Start Auto-Advance';
        btn.classList.remove('active');
    }
}

export function goToSeriesInfo() {
    if (!state.currentComic || !state.currentComic.series) return;
    const seriesName = state.currentComic.series;
    closeReader();
    router.navigate('series', { name: seriesName });
}

export function toggleReaderUI() {
    if (isUIVisible) hideReaderUI(true); else showReaderUI();
}

export function toggleSettings() {
    document.getElementById('settings-panel').classList.toggle('open');
}

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
        if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
        if (autoAdvanceFrame) cancelAnimationFrame(autoAdvanceFrame);
        const autoAdvanceBar = document.getElementById('auto-advance-bar');
        if (autoAdvanceBar) autoAdvanceBar.style.display = 'none';
    }
}

function startAutoAdvanceTimer() {
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
            nextPage();
            startAutoAdvanceTimer();
        } else {
            toggleAutoAdvance(); // Stop at the end
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

export function setSetting(type, value, syncPreference = true) {
    // Parse numerical values
    const numericTypes = ['brightness', 'contrast', 'saturation', 'invert', 'toneValue', 'autoAdvanceInterval', 'sepia'];
    if (numericTypes.includes(type)) {
        value = parseFloat(value);
    }
    
    state.settings[type] = value;
    
    // Update UI buttons if they exist
    document.querySelectorAll(`[data-setting="${type}"]`).forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === value);
    });
    
    // Specific UI updates for toneMode buttons
    if (type === 'toneMode') {
        const toneSepia = document.getElementById('tone-mode-sepia');
        const toneGray = document.getElementById('tone-mode-grayscale');
        if (toneSepia) toneSepia.classList.toggle('active', value === 'sepia');
        if (toneGray) toneGray.classList.toggle('active', value === 'grayscale');
    }

    // Update UI sliders if they exist
    const slider = document.getElementById(`${type}-slider`);
    if (slider) slider.value = value;
    
    const valueDisplay = document.getElementById(`${type}-value`);
    if (valueDisplay) {
        if (type === 'autoAdvanceInterval') valueDisplay.textContent = `${value}s`;
        else valueDisplay.textContent = value;
    }

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
        setupClickZones(); // Update click zone behavior for new direction
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

    if (['brightness', 'contrast', 'saturation', 'invert', 'toneValue', 'toneMode'].includes(type)) {
        applyFilters();
    }

    if (type === 'autoAdvanceInterval' && state.settings.autoAdvanceActive) {
        startAutoAdvanceTimer(); // Reset timer with new interval
    }

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
    
    // Save per-comic progress only for layout-related settings (not visual filters)
    const layoutSettings = ['direction', 'display', 'zoom'];
    if (state.currentComic && layoutSettings.includes(type)) {
        saveProgress();
    }
}

export function resetAllFilters() {
    state.settings.brightness = 1.0;
    state.settings.contrast = 1.0;
    state.settings.saturation = 1.0;
    state.settings.invert = 0.0;
    state.settings.toneValue = 0.0;
    state.settings.toneMode = 'sepia';
    
    // Update all sliders
    const sliders = ['brightness', 'contrast', 'saturation', 'invert', 'toneValue'];
    sliders.forEach(type => {
        const slider = document.getElementById(`${type}-slider`);
        if (slider) slider.value = state.settings[type];
    });
    
    // Update tone buttons
    const toneSepia = document.getElementById('tone-mode-sepia');
    const toneGray = document.getElementById('tone-mode-grayscale');
    if (toneSepia) toneSepia.classList.add('active');
    if (toneGray) toneGray.classList.remove('active');
    
    applyFilters();
    showToast('Visual filters reset', 'info');
    
    if (state.currentComic) {
        saveProgress();
    }
}

export function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (!state.currentComic) return;
        const isRTL = state.settings.direction === 'rtl';
        const keys = state.settings.keybindings;

        if (keys.next.includes(e.key)) {
            e.preventDefault();
            if (isRTL) prevPage(); else nextPage();
        } else if (keys.prev.includes(e.key)) {
            e.preventDefault();
            if (isRTL) nextPage(); else prevPage();
        } else if (keys.exit.includes(e.key)) {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                history.back();
            }
        } else if (keys.fullscreen.includes(e.key)) {
            e.preventDefault();
            toggleFullscreen();
        } else if (keys.bookmark.includes(e.key)) {
            e.preventDefault();
            toggleBookmark();
        }

        if (e.shiftKey) {
            if (keys.nextChapter.includes(e.key)) {
                e.preventDefault();
                if (isRTL) {
                    if (state.readerNavigation.prevComic) navigateReaderComic('prev');
                } else {
                    if (state.readerNavigation.nextComic) navigateReaderComic('next');
                }
            } else if (keys.prevChapter.includes(e.key)) {
                e.preventDefault();
                if (isRTL) {
                    if (state.readerNavigation.nextComic) navigateReaderComic('next');
                } else {
                    if (state.readerNavigation.prevComic) navigateReaderComic('prev');
                }
            }
        }
    });
}

export function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable full-screen mode: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
}

function flashZone(zone) {
    zone.classList.add('active');
    setTimeout(() => zone.classList.remove('active'), 200);
}

// Setup click zone navigation based on reading direction
function setupClickZones() {
    const prevZone = document.getElementById('click-zone-prev');
    const middleZone = document.getElementById('click-zone-middle');
    const nextZone = document.getElementById('click-zone-next');
    
    if (!prevZone || !nextZone) return;
    
    // Remove existing listeners by cloning
    const newPrevZone = prevZone.cloneNode(true);
    const newNextZone = nextZone.cloneNode(true);
    const newMiddleZone = middleZone ? middleZone.cloneNode(true) : null;
    
    prevZone.parentNode.replaceChild(newPrevZone, prevZone);
    nextZone.parentNode.replaceChild(newNextZone, nextZone);
    if (middleZone && newMiddleZone) middleZone.parentNode.replaceChild(newMiddleZone, middleZone);
    
    // Add listeners based on direction
    const isRTL = state.settings.direction === 'rtl';
    
    newPrevZone.addEventListener('click', (e) => {
        e.stopPropagation();
        flashZone(newPrevZone);
        if (isRTL) nextPage(); else prevPage();
        if (isUIVisible) hideReaderUI(true);
    });
    
    newNextZone.addEventListener('click', (e) => {
        e.stopPropagation();
        flashZone(newNextZone);
        if (isRTL) prevPage(); else nextPage();
        if (isUIVisible) hideReaderUI(true);
    });

    if (newMiddleZone) {
        newMiddleZone.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isUIVisible) hideReaderUI(true); else showReaderUI();
        });
    }
}

// Call setupClickZones when reader opens and when direction changes
