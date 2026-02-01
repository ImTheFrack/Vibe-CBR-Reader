import { state } from './state.js';
import { apiPut } from './api.js';
import { showToast } from './utils.js';


// Theme
export function initTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) {
        themeIcon.textContent = state.theme === 'dark' ? '☀️' : '🌙';
    }
}

export function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', state.theme);
    initTheme();
    
    // Save to API if authenticated
    if (state.isAuthenticated) {
        // We need to import setPreference or define it here.
        // setPreference is in auth.js usually, but maybe it belongs in preferences.js?
        // For now, let's call the API directly to avoid circular dependency
        apiPut('/api/preferences', { default_theme: state.theme });
    }
}
