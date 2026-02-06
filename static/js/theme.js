import { state } from './state.js';
import { apiPut } from './api.js';
import { showToast } from './utils.js';


// Theme
export function initTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    document.documentElement.setAttribute('data-ereader', state.ereader);
    
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) {
        themeIcon.textContent = state.theme === 'dark' ? '☀️' : '🌙';
    }
    
    const themeIconMenu = document.getElementById('theme-icon-menu');
    if (themeIconMenu) {
        themeIconMenu.textContent = state.theme === 'dark' ? '☀️' : '🌙';
    }

    const ereaderIconMenu = document.getElementById('ereader-icon-menu');
    if (ereaderIconMenu) {
        ereaderIconMenu.textContent = state.ereader ? '👓' : '🕶️';
    }

    // Update reader buttons if open
    if (state.currentComic) {
        import('./reader.js').then(m => m.updateReaderUI());
    }
}

export function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', state.theme);
    initTheme();
    
    // Save to API if authenticated
    if (state.isAuthenticated) {
        apiPut('/api/preferences', { theme: state.theme });
    }
}

export function toggleEReader() {
    state.ereader = !state.ereader;
    localStorage.setItem('ereader', state.ereader);
    initTheme();
    
    // Save to API if authenticated
    if (state.isAuthenticated) {
        apiPut('/api/preferences', { ereader: state.ereader });
    }
}
