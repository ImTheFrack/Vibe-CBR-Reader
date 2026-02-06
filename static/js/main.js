import { state } from './state.js';
import { initTheme, toggleTheme, toggleEReader } from './theme.js';
import {
    checkAuthStatus, setupAuthEventListeners, toggleUserMenu,
    showLoginModal, closeLoginModal, handleLogin, handleRegister,
    logout, showRegisterForm, showLoginForm
} from './auth.js';
import { 
     loadLibrary, scanLibrary, navigateToRoot, navigateToFolder, 
     navigateUp, toggleFlattenMode, setViewMode, handleSort, 
     handleSearch, toggleSearchScope, showView, openComic, 
     toggleMobileSidebar, navigateTitleComic, renderTitleFan, toggleMeta, continueReading,
     handleLibraryClick
 } from './library.js';
import { 
    setupKeyboardShortcuts, startReading, closeReader, 
    prevPage, nextPage, jumpToPage, handleSliderInput, toggleBookmark, 
    showBookmarksList, closeBookmarksModal, removeBookmark, 
    toggleSettings, setSetting, navigateReaderComic, closeComicEndModal,
    toggleFullscreen, toggleAutoAdvance, resetAllFilters
} from './reader.js';
import { 
    showPreferences, closePreferencesModal, setPreference, resetDefaultFilters 
} from './preferences.js';
import { 
    toggleSelectionMode, clearSelection, handleBatchExport, handleCardClick, toggleItemSelection 
} from './library/selection.js';
import { showToast } from './utils.js';
import { initTagsView } from './tags.js';
import { showScanStatus, startScanPolling } from './scan-status.js';
import * as router from './router.js';
import { loadDiscoveryData, scrollCarousel } from './discovery.js';

// Hamburger Menu
export function toggleHamburger() {
    const menu = document.getElementById('hamburger-menu');
    menu.classList.toggle('active');
}

export function closeHamburger() {
    const menu = document.getElementById('hamburger-menu');
    if (menu) menu.classList.remove('active');
}

// Expose functions to window for HTML event handlers
window.toggleHamburger = toggleHamburger;
window.closeHamburger = closeHamburger;
window.toggleTheme = toggleTheme;
window.toggleEReader = toggleEReader;
window.toggleUserMenu = toggleUserMenu;
window.showLoginModal = showLoginModal;
window.closeLoginModal = closeLoginModal;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.logout = logout;
window.showRegisterForm = showRegisterForm;
window.showLoginForm = showLoginForm;
window.scanLibrary = scanLibrary;
window.navigateToRoot = navigateToRoot;
window.handleLibraryClick = handleLibraryClick;
window.navigateToFolder = navigateToFolder;
window.navigateUp = navigateUp;
window.toggleFlattenMode = toggleFlattenMode;
window.setViewMode = setViewMode;
window.handleSort = handleSort;
window.handleSearch = handleSearch;
window.toggleSearchScope = toggleSearchScope;
window.showView = (view) => {
    showView(view);
    if (view === 'tags') {
        router.navigate('tags', {});
    }
};
window.routerNavigate = router.navigate;
window.openComic = openComic;
window.continueReading = continueReading;
window.toggleMobileSidebar = toggleMobileSidebar;
window.navigateTitleComic = navigateTitleComic;
window.toggleMeta = toggleMeta;
window.startReading = startReading;
window.closeReader = closeReader;
window.prevPage = prevPage;
window.nextPage = nextPage;
window.jumpToPage = jumpToPage;
window.handleSliderInput = handleSliderInput;
window.toggleBookmark = toggleBookmark;
window.showBookmarksList = showBookmarksList;
window.closeBookmarksModal = closeBookmarksModal;
window.removeBookmark = removeBookmark;
window.toggleSettings = toggleSettings;
window.setSetting = setSetting;
window.toggleAutoAdvance = toggleAutoAdvance;
window.resetAllFilters = resetAllFilters;
window.readerToggleFullscreen = toggleFullscreen;
window.navigateReaderComic = navigateReaderComic;
window.closeComicEndModal = closeComicEndModal;
window.showPreferences = showPreferences;
window.closePreferencesModal = closePreferencesModal;
window.setPreference = setPreference;
window.resetDefaultFilters = resetDefaultFilters;
window.showToast = showToast;
window.showScanStatus = showScanStatus;
window.scrollCarousel = scrollCarousel;

// Hash Change Handler
function onHashChange() {
    console.log("[DEBUG] Hashchange fired, hash:", location.hash, "lastHash:", window.lastHash);
    const newHash = location.hash;
    const oldHash = window.lastHash || '';
    window.lastHash = newHash;
    
    // Check if we should skip this hashchange
    if (router.shouldSkipHashChange()) {
        return;
    }
    
    const oldRoute = router.parseHash(oldHash);
    const route = router.handleRouteChange(newHash, oldHash);
    
    // Clear selection ONLY if the view changed
    if (oldRoute.view !== route.view) {
        if (window.clearSelection) window.clearSelection();
    }
    
    if (oldRoute.view === 'read' && route.view !== 'read') {
        console.log("[DEBUG] Closing reader, oldRoute:", oldRoute, "new route:", route);
        closeReader();
    }
    
    // Route to appropriate view
    switch (route.view) {
        case 'library':
            showView('library');
            if (route.params.category) {
                navigateToFolder('category', route.params.category);
                if (route.params.subcategory) {
                    navigateToFolder('subcategory', route.params.subcategory);
                    if (route.params.title) {
                        navigateToFolder('title', route.params.title);
                    }
                }
            } else if (route.params.title) {
                // Special case: title-only navigation from tags
                navigateToFolder('title', route.params.title);
            } else {
                navigateToRoot();
            }
            break;
        
        case 'recent':
            showView('recent');
            break;
        
        case 'tags':
            showView('tags');
            initTagsView(route.params);
            break;
        
        case 'series':
            if (route.params.name) {
                // Find first comic in the series
                const seriesComic = state.comics.find(c => c.series === route.params.name);
                if (seriesComic) {
                    openComic(seriesComic.id);
                }
            }
            break;
        
        case 'read':
            if (route.params.comicId) {
                startReading(route.params.comicId);
            }
            break;
        
        case 'search':
            if (route.params.q) {
                state.searchQuery = route.params.q;
                if (route.params.scope) {
                    state.searchScope = route.params.scope;
                }
                showView('library');
                handleSearch(route.params.q);
            }
            break;
        
        case 'scan':
            showScanStatus();
            startScanPolling();
            break;
        
        case 'admin':
            showView('admin');
            import('./admin.js').then(m => m.initAdminView());
            break;

        case 'profile':
            showView('profile');
            import('./profile.js').then(m => m.renderProfileView());
            break;
        
        case 'discovery':
            showView('discovery');
            loadDiscoveryData();
            break;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    await checkAuthStatus();
    
    // Only load library if authenticated
    if (state.isAuthenticated) {
        await loadLibrary();
        
        // Handle initial route after library loads
        if (!location.hash || location.hash === '#' || location.hash === '#/') {
            router.navigate('library', {});
        } else {
            // Let hashchange handler deal with it
            onHashChange();
        }
    }
    
    // Add hashchange listener
    window.addEventListener('hashchange', onHashChange);
    
    // Setup Navigation Listeners
    const navLibrary = document.getElementById('nav-library');
    if (navLibrary) {
        navLibrary.addEventListener('click', handleLibraryClick);
    }

    setupKeyboardShortcuts();
    setupAuthEventListeners();
    
    // Global event delegation for data-action elements (catches clicks from any view)
    document.addEventListener('click', (event) => {
        const actionElement = event.target.closest('[data-action]');
        if (!actionElement) return;
        
        const action = actionElement.dataset.action;
        
        if (action === 'card-click') {
            handleCardClick(actionElement, event);
        } else if (action === 'toggle-selection') {
            event.stopPropagation();
            toggleItemSelection(actionElement.dataset.id, event);
        } else if (action === 'rate-series') {
            event.stopPropagation();
            const seriesId = parseInt(actionElement.dataset.seriesId);
            const rating = parseInt(actionElement.dataset.rating);
            if (window.handleRateSeries) {
                window.handleRateSeries(seriesId, rating);
            }
        } else if (action === 'start-reading') {
            event.stopPropagation();
            const comicId = actionElement.dataset.comicId;
            const page = actionElement.dataset.page ? parseInt(actionElement.dataset.page) : undefined;
            startReading(comicId, page);
        }
    });
    
    if (window.updateSelectionButtonState) window.updateSelectionButtonState();

    // Close hamburger when clicking outside
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('hamburger-menu');
        const btn = document.querySelector('.hamburger-btn');
        if (menu && menu.classList.contains('active') && !menu.contains(e.target) && !btn.contains(e.target)) {
            closeHamburger();
        }
    });
});
