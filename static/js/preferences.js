import { state } from './state.js';
import { apiPut } from './api.js';
import { showToast } from './utils.js';
import { initTheme } from './theme.js';

export function showPreferences() {
    // Close user menu
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) {
        dropdown.classList.remove('open');
    }
    
    const overlay = document.createElement('div');
    overlay.id = 'preferences-modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal" id="preferences-modal">
            <div class="modal-header">
                <h3 class="modal-title">Preferences</h3>
                <button class="modal-close" onclick="closePreferencesModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Default Theme</label>
                    <div class="setting-options">
                        <button class="setting-btn ${state.theme === 'dark' ? 'active' : ''}" onclick="setPreference('default_theme', 'dark')">🌙 Dark</button>
                        <button class="setting-btn ${state.theme === 'light' ? 'active' : ''}" onclick="setPreference('default_theme', 'light')">☀️ Light</button>
                    </div>
                </div>
                <div class="form-group">
                    <label>Reading Direction</label>
                    <div class="setting-options">
                        <button class="setting-btn ${state.settings.direction === 'ltr' ? 'active' : ''}" onclick="setPreference('reader_direction', 'ltr')">➡️ Left to Right</button>
                        <button class="setting-btn ${state.settings.direction === 'rtl' ? 'active' : ''}" onclick="setPreference('reader_direction', 'rtl')">⬅️ Right to Left (Manga)</button>
                    </div>
                </div>
                <div class="form-group">
                    <label>Display Mode</label>
                    <div class="setting-options">
                        <button class="setting-btn ${state.settings.display === 'single' ? 'active' : ''}" onclick="setPreference('reader_display', 'single')">📄 Single Page</button>
                        <button class="setting-btn ${state.settings.display === 'double' ? 'active' : ''}" onclick="setPreference('reader_display', 'double')">📖 Double Page</button>
                    </div>
                </div>
                <div class="form-group">
                    <label>Title Card Style</label>
                    <div class="setting-options">
                        <button class="setting-btn ${state.settings.titleCardStyle === 'fan' ? 'active' : ''}" onclick="setPreference('title_card_style', 'fan')">📚 Fan (Stack)</button>
                        <button class="setting-btn ${state.settings.titleCardStyle === 'single' ? 'active' : ''}" onclick="setPreference('title_card_style', 'single')">📄 Single Cover</button>
                    </div>
                </div>
                <div class="form-group">
                    <label>Zoom Mode</label>
                    <div class="setting-options">
                        <button class="setting-btn ${state.settings.zoom === 'fit' ? 'active' : ''}" onclick="setPreference('reader_zoom', 'fit')">🔲 Fit to Screen</button>
                        <button class="setting-btn ${state.settings.zoom === 'width' ? 'active' : ''}" onclick="setPreference('reader_zoom', 'width')">↔️ Fit Width</button>
                        <button class="setting-btn ${state.settings.zoom === 'height' ? 'active' : ''}" onclick="setPreference('reader_zoom', 'height')">↕️ Fit Height</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('active'), 10);
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePreferencesModal();
    });
}

export function closePreferencesModal() {
    const overlay = document.getElementById('preferences-modal-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 300);
    }
}

export async function setPreference(key, value, showModal = true) {
    if (!state.isAuthenticated) {
        // Store locally if not authenticated
        if (key === 'default_theme') {
            state.theme = value;
            localStorage.setItem('theme', value);
            initTheme();
        } else if (key === 'reader_direction') {
            state.settings.direction = value;
        } else if (key === 'reader_display') {
            state.settings.display = value;
        } else if (key === 'reader_zoom') {
            state.settings.zoom = value;
        } else if (key === 'title_card_style') {
            state.settings.titleCardStyle = value;
        }
        // Update UI if requested
        if (showModal) showPreferences();
        return;
    }

    const updates = { [key]: value };
    const result = await apiPut('/api/preferences', updates);
    
    if (result.error) {
        showToast('Failed to save preferences', 'error');
    } else {
        // Update local state
        if (key === 'default_theme') {
            state.theme = value;
            state.userPreferences.default_theme = value;
            initTheme();
        } else if (key === 'reader_direction') {
            state.settings.direction = value;
            state.userPreferences.reader_direction = value;
        } else if (key === 'reader_display') {
            state.settings.display = value;
            state.userPreferences.reader_display = value;
        } else if (key === 'reader_zoom') {
            state.settings.zoom = value;
            state.userPreferences.reader_zoom = value;
        } else if (key === 'title_card_style') {
            state.settings.titleCardStyle = value;
            state.userPreferences.title_card_style = value;
            // Trigger re-render of library view if we are there
            const event = new Event('preferences-updated');
            document.dispatchEvent(event);
        }
        showToast('Preferences saved', 'success');
        // Refresh modal if it was already open and requested
        if (showModal) {
            closePreferencesModal();
            showPreferences();
        }
    }
}
