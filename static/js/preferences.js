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
    
    // If already open, just update it
    if (document.getElementById('preferences-modal-overlay')) {
        updatePreferencesUI();
        return;
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
                <div class="form-group horizontal">
                    <label>E-Reader Mode</label>
                    <div class="setting-options">
                        <button class="setting-btn" data-pref="ereader" data-value="true" onclick="setPreference('ereader', true)">👓 On</button>
                        <button class="setting-btn" data-pref="ereader" data-value="false" onclick="setPreference('ereader', false)">🕶️ Off</button>
                    </div>
                </div>
                <div class="form-group horizontal">
                    <label>Default Theme</label>
                    <div class="setting-options">
                        <button class="setting-btn" data-pref="theme" data-value="dark" onclick="setPreference('theme', 'dark')">🌙 Dark</button>
                        <button class="setting-btn" data-pref="theme" data-value="light" onclick="setPreference('theme', 'light')">☀️ Light</button>
                    </div>
                </div>
                <div class="form-group horizontal">
                    <label>Reading Direction</label>
                    <div class="setting-options">
                        <button class="setting-btn" data-pref="reader_direction" data-value="ltr" onclick="setPreference('reader_direction', 'ltr')">➡️ LTR</button>
                        <button class="setting-btn" data-pref="reader_direction" data-value="rtl" onclick="setPreference('reader_direction', 'rtl')">⬅️ RTL</button>
                    </div>
                </div>
                <div class="form-group horizontal">
                    <label>Display Mode</label>
                    <div class="setting-options">
                        <button class="setting-btn" data-pref="reader_display" data-value="single" onclick="setPreference('reader_display', 'single')">📄 1P</button>
                        <button class="setting-btn" data-pref="reader_display" data-value="double" onclick="setPreference('reader_display', 'double')">📖 2P</button>
                        <button class="setting-btn" data-pref="reader_display" data-value="long" onclick="setPreference('reader_display', 'long')">📜 Long</button>
                    </div>
                </div>
                <div class="form-group horizontal">
                    <label>Title Card Style</label>
                    <div class="setting-options">
                        <button class="setting-btn" data-pref="title_card_style" data-value="fan" onclick="setPreference('title_card_style', 'fan')">📚 Fan</button>
                        <button class="setting-btn" data-pref="title_card_style" data-value="single" onclick="setPreference('title_card_style', 'single')">📄 Cover</button>
                    </div>
                </div>
                <div class="form-group horizontal">
                    <label>Zoom Mode</label>
                    <div class="setting-options">
                        <button class="setting-btn" data-pref="reader_zoom" data-value="fit" onclick="setPreference('reader_zoom', 'fit')">🔲 W+H</button>
                        <button class="setting-btn" data-pref="reader_zoom" data-value="width" onclick="setPreference('reader_zoom', 'width')">↔️ W</button>
                        <button class="setting-btn" data-pref="reader_zoom" data-value="height" onclick="setPreference('reader_zoom', 'height')">↕️ H</button>
                    </div>
                </div>

                <div class="setting-group" style="border: 1px solid var(--border-color); padding: 16px; border-radius: var(--radius-md); margin-top: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
                        <span style="font-size: 0.9rem; font-weight: 600;">Default Visual Filters</span>
                        <button class="setting-btn" style="padding: 2px 10px; font-size: 0.7rem; min-width: auto; max-width: 80px;" onclick="resetDefaultFilters()">Reset</button>
                    </div>
                    
                    <div class="form-group horizontal" style="margin-bottom: 8px;">
                        <label style="flex: 0 0 80px;">Brightness</label>
                        <input type="range" min="0.2" max="1.5" step="0.05" id="pref-slider-brightness" class="progress-slider" value="${state.settings.brightness}" oninput="setPreference('brightness', parseFloat(this.value), true, false, false)" onchange="setPreference('brightness', parseFloat(this.value))">
                    </div>
                    
                    <div class="form-group horizontal" style="margin-bottom: 8px;">
                        <label style="flex: 0 0 80px;">Contrast</label>
                        <input type="range" min="0.2" max="2.0" step="0.05" id="pref-slider-contrast" class="progress-slider" value="${state.settings.contrast}" oninput="setPreference('contrast', parseFloat(this.value), true, false, false)" onchange="setPreference('contrast', parseFloat(this.value))">
                    </div>
                    
                    <div class="form-group horizontal" style="margin-bottom: 8px;">
                        <label style="flex: 0 0 80px;">Color</label>
                        <input type="range" min="0" max="3.0" step="0.1" id="pref-slider-saturation" class="progress-slider" value="${state.settings.saturation}" oninput="setPreference('saturation', parseFloat(this.value), true, false, false)" onchange="setPreference('saturation', parseFloat(this.value))">
                    </div>
                    
                    <div class="form-group horizontal" style="margin-bottom: 8px;">
                        <label style="flex: 0 0 80px;">Invert</label>
                        <input type="range" min="0" max="1" step="0.05" id="pref-slider-invert" class="progress-slider" value="${state.settings.invert}" oninput="setPreference('invert', parseFloat(this.value), true, false, false)" onchange="setPreference('invert', parseFloat(this.value))">
                    </div>

                    <div class="form-group" style="margin-bottom: 0;">
                        <div style="display: flex; align-items: center; gap: 16px;">
                            <label style="flex: 0 0 80px; margin-bottom: 0;">Tone</label>
                            <input type="range" min="0" max="1" step="0.05" id="pref-slider-tone_value" class="progress-slider" value="${state.settings.toneValue}" oninput="setPreference('tone_value', parseFloat(this.value), true, false, false)" onchange="setPreference('tone_value', parseFloat(this.value))" style="flex: 1;">
                        </div>
                        <div class="setting-options" style="margin-left: 96px; margin-top: 8px; justify-content: flex-start;">
                            <button class="setting-btn" data-pref="tone_mode" data-value="sepia" onclick="setPreference('tone_mode', 'sepia')">Sepia</button>
                            <button class="setting-btn" data-pref="tone_mode" data-value="grayscale" onclick="setPreference('tone_mode', 'grayscale')">Gray</button>
                        </div>
                    </div>
                </div>

                <div class="form-group horizontal" style="margin-top: 16px;">
                    <label>Auto-Advance</label>
                    <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                        <input type="range" min="3" max="60" step="1" id="pref-slider-auto_advance_interval" class="progress-slider" value="${state.settings.autoAdvanceInterval}" oninput="this.nextElementSibling.textContent = this.value + 's'; setPreference('auto_advance_interval', parseInt(this.value), true, false, false)" onchange="setPreference('auto_advance_interval', parseInt(this.value))" style="flex: 1;">
                        <span id="pref-val-auto_advance_interval" style="font-size: 0.8rem; color: var(--text-secondary); min-width: 30px;">${state.settings.autoAdvanceInterval}s</span>
                    </div>
                </div>

                <div class="form-group">
                    <label>Keyboard Shortcuts</label>
                    <div class="setting-info" style="font-size: 0.8rem; line-height: 1.6; background: var(--bg-tertiary); padding: 12px; border-radius: var(--radius-sm);">
                        <div><b>Next Page:</b> ${state.settings.keybindings.next.join(', ')}</div>
                        <div><b>Prev Page:</b> ${state.settings.keybindings.prev.join(', ')}</div>
                        <div><b>Next Chapter:</b> Shift + ${state.settings.keybindings.nextChapter.join(', ')}</div>
                        <div><b>Prev Chapter:</b> Shift + ${state.settings.keybindings.prevChapter.join(', ')}</div>
                        <div><b>Fullscreen:</b> ${state.settings.keybindings.fullscreen.join(', ')}</div>
                        <div><b>Bookmark:</b> ${state.settings.keybindings.bookmark.join(', ')}</div>
                        <div><b>Exit:</b> ${state.settings.keybindings.exit.join(', ')}</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('active'), 10);
    
    // Initialize UI with current preferences
    updatePreferencesUI();
    
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

export function updatePreferencesUI() {
    const overlay = document.getElementById('preferences-modal-overlay');
    if (!overlay) return;

    // Mapping from data-pref (API key) to state key
    const mapping = {
        'theme': () => state.theme,
        'ereader': () => state.ereader,
        'reader_direction': () => state.settings.direction,
        'reader_display': () => state.settings.display,
        'reader_zoom': () => state.settings.zoom,
        'title_card_style': () => state.settings.titleCardStyle,
        'brightness': () => state.settings.brightness,
        'contrast': () => state.settings.contrast,
        'saturation': () => state.settings.saturation,
        'invert': () => state.settings.invert,
        'tone_value': () => state.settings.toneValue,
        'tone_mode': () => state.settings.toneMode,
        'auto_advance_interval': () => state.settings.autoAdvanceInterval
    };

    // Update buttons
    overlay.querySelectorAll('[data-pref]').forEach(el => {
        const pref = el.dataset.pref;
        const val = el.dataset.value;
        const getter = mapping[pref];
        let currentVal = getter ? getter() : state.settings[pref];
        
        if (currentVal === undefined || currentVal === null) return;

        el.classList.toggle('active', currentVal.toString() === val);
    });

    // Update sliders
    const sliders = ['brightness', 'contrast', 'saturation', 'invert', 'tone_value', 'auto_advance_interval'];
    sliders.forEach(pref => {
        const el = document.getElementById(`pref-slider-${pref}`);
        if (el) {
            const getter = mapping[pref];
            const val = getter ? getter() : state.settings[pref];
            if (val !== undefined && val !== null) {
                el.value = val;
                
                // Update associated value text if it exists
                const valDisplay = document.getElementById(`pref-val-${pref}`);
                if (valDisplay) valDisplay.textContent = val + (pref === 'auto_advance_interval' ? 's' : '');
            }
        }
    });
}

export async function setPreference(key, value, updateUI = true, persist = true, doToast = true) {
    if (!state.isAuthenticated) {
        // Store locally if not authenticated
        if (key === 'theme') {
            state.theme = value;
            localStorage.setItem('theme', value);
            initTheme();
        } else if (key === 'ereader') {
            state.ereader = value;
            localStorage.setItem('ereader', value);
            initTheme();
        } else if (key === 'reader_direction') {
            state.settings.direction = value;
        } else if (key === 'reader_display') {
            state.settings.display = value;
        } else if (key === 'reader_zoom') {
            state.settings.zoom = value;
        } else if (key === 'title_card_style') {
            state.settings.titleCardStyle = value;
        } else if (['brightness', 'contrast', 'saturation', 'invert'].includes(key)) {
            state.settings[key] = value;
        } else if (key === 'tone_value') {
            state.settings.toneValue = value;
        } else if (key === 'tone_mode') {
            state.settings.toneMode = value;
        } else if (key === 'auto_advance_interval') {
            state.settings.autoAdvanceInterval = value;
        }

        // Apply filters immediately if reader is active
        if (state.currentComic && (['brightness', 'contrast', 'saturation', 'invert', 'tone_value', 'tone_mode'].includes(key))) {
            import('./reader.js').then(m => m.applyFilters());
        }

        if (persist && doToast) showToast('Preferences saved', 'success');

        // Update UI if requested
        if (updateUI) updatePreferencesUI();
        return;
    }

    if (persist) {
        const updates = { [key]: value };
        const result = await apiPut('/api/preferences', updates);
        
        if (result.error) {
            showToast('Failed to save preferences', 'error');
            return;
        }
    }

    // Update local state
    if (key === 'theme') {
        state.theme = value;
        localStorage.setItem('theme', value);
        if (state.userPreferences) state.userPreferences.theme = value;
        initTheme();
    } else if (key === 'ereader') {
        state.ereader = value;
        localStorage.setItem('ereader', value);
        if (state.userPreferences) state.userPreferences.ereader = value;
        initTheme();
    } else if (key === 'reader_direction') {
        state.settings.direction = value;
        if (state.userPreferences) state.userPreferences.reader_direction = value;
    } else if (key === 'reader_display') {
        state.settings.display = value;
        if (state.userPreferences) state.userPreferences.reader_display = value;
    } else if (key === 'reader_zoom') {
        state.settings.zoom = value;
        if (state.userPreferences) state.userPreferences.reader_zoom = value;
    } else if (key === 'title_card_style') {
        state.settings.titleCardStyle = value;
        if (state.userPreferences) state.userPreferences.title_card_style = value;
        // Trigger re-render of library view if we are there
        const event = new Event('preferences-updated');
        document.dispatchEvent(event);
    } else if (key === 'brightness') {
        state.settings.brightness = value;
        if (state.userPreferences) state.userPreferences.brightness = value;
    } else if (key === 'contrast') {
        state.settings.contrast = value;
        if (state.userPreferences) state.userPreferences.contrast = value;
    } else if (key === 'saturation') {
        state.settings.saturation = value;
        if (state.userPreferences) state.userPreferences.saturation = value;
    } else if (key === 'invert') {
        state.settings.invert = value;
        if (state.userPreferences) state.userPreferences.invert = value;
    } else if (key === 'tone_value') {
        state.settings.toneValue = value;
        if (state.userPreferences) state.userPreferences.tone_value = value;
    } else if (key === 'tone_mode') {
        state.settings.toneMode = value;
        if (state.userPreferences) state.userPreferences.tone_mode = value;
    } else if (key === 'auto_advance_interval') {
        state.settings.autoAdvanceInterval = value;
        if (state.userPreferences) state.userPreferences.auto_advance_interval = value;
    }

    // Apply filters immediately if reader is active
    if (state.currentComic && (['brightness', 'contrast', 'saturation', 'invert', 'tone_value', 'tone_mode'].includes(key))) {
        import('./reader.js').then(m => m.applyFilters());
    }
    
    if (persist && doToast) showToast('Preferences saved', 'success');
    
    // Update UI in-place if requested
    if (updateUI) updatePreferencesUI();
}

export function resetDefaultFilters() {
    setPreference('brightness', 1.0, false);
    setPreference('contrast', 1.0, false);
    setPreference('saturation', 1.0, false);
    setPreference('invert', 0.0, false);
    setPreference('tone_value', 0.0, false);
    setPreference('tone_mode', 'sepia', true); // Re-opens modal once after all updates
}
