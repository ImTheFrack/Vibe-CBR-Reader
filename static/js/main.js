import { initTheme, toggleTheme } from './theme.js';
import { 
    checkAuthStatus, setupAuthEventListeners, toggleUserMenu, 
    showLoginModal, closeLoginModal, handleLogin, handleRegister, 
    logout, showRegisterForm, showLoginForm 
} from './auth.js';
import { 
    loadLibrary, scanLibrary, navigateToRoot, navigateToFolder, 
    navigateUp, toggleFlattenMode, setViewMode, handleSort, 
    handleSearch, toggleSearchScope, showView, openComic, 
    toggleMobileSidebar, navigateTitleComic, renderTitleFan, toggleSynopsis, toggleMeta, continueReading, handleBack 
} from './library.js';
import { 
    setupKeyboardShortcuts, startReading, closeReader, 
    prevPage, nextPage, jumpToPage, toggleBookmark, 
    showBookmarksList, closeBookmarksModal, removeBookmark, 
    toggleSettings, setSetting, navigateReaderComic, closeComicEndModal 
} from './reader.js';
import { 
    showPreferences, closePreferencesModal, setPreference 
} from './preferences.js';
import { showToast } from './utils.js';
import { initTagsView } from './tags.js';

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
        initTagsView();
    }
};
window.openComic = openComic;
window.continueReading = continueReading;
window.handleBack = handleBack;
window.toggleMobileSidebar = toggleMobileSidebar;
window.navigateTitleComic = navigateTitleComic;
window.toggleSynopsis = toggleSynopsis;
window.toggleMeta = toggleMeta;
window.startReading = startReading;
window.closeReader = closeReader;
window.prevPage = prevPage;
window.nextPage = nextPage;
window.jumpToPage = jumpToPage;
window.toggleBookmark = toggleBookmark;
window.showBookmarksList = showBookmarksList;
window.closeBookmarksModal = closeBookmarksModal;
window.removeBookmark = removeBookmark;
window.toggleSettings = toggleSettings;
window.setSetting = setSetting;
window.navigateReaderComic = navigateReaderComic;
window.closeComicEndModal = closeComicEndModal;
window.showPreferences = showPreferences;
window.closePreferencesModal = closePreferencesModal;
window.setPreference = setPreference;
window.showToast = showToast;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    checkAuthStatus();
    loadLibrary();
    setupKeyboardShortcuts();
    setupAuthEventListeners();
    
    // Close hamburger when clicking outside
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('hamburger-menu');
        const btn = document.querySelector('.hamburger-btn');
        if (menu && menu.classList.contains('active') && !menu.contains(e.target) && !btn.contains(e.target)) {
            closeHamburger();
        }
    });
});
