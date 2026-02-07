import { state } from './state.js';
import { apiGet, apiPost } from './api.js';
import { showToast } from './utils.js';
import { initTheme } from './theme.js';
import { showPreferences } from './preferences.js';
import { navigateToRoot, loadRecentReads, updateLibraryView, renderFolderGrid, getFoldersAtLevel, renderTitleCards, renderComicsView, loadLibrary } from './library.js';
import { navigate as routerNavigate } from './router.js';

export async function checkAuthStatus() {
    const result = await apiGet('/api/auth/check');
    if (result.error) {
        state.isAuthenticated = false;
        state.currentUser = null;
    } else {
        state.isAuthenticated = result.authenticated;
        state.currentUser = result.user || null;
        if (state.isAuthenticated) {
            await loadUserData();
            
            // Check if password change is forced
            if (state.currentUser && state.currentUser.must_change_password) {
                showForcedPasswordModal();
            }
        } else {
            showLoginModal();
        }
    }
    updateAuthUI();
}

export async function loadUserData() {
    // Load progress from API
    const progressResult = await apiGet('/api/progress');
    if (!progressResult.error && progressResult && typeof progressResult === 'object') {
        state.readingProgress = {};
        // If it's an object {comic_id: progress_data}
        if (!Array.isArray(progressResult)) {
            Object.entries(progressResult).forEach(([comicId, p]) => {
                state.readingProgress[comicId] = {
                    page: p.current_page,
                    lastRead: new Date(p.last_read).getTime(),
                    completed: p.completed
                };
            });
        } else {
            // Fallback for array if it ever changes
            progressResult.forEach(p => {
                state.readingProgress[p.comic_id] = {
                    page: p.current_page,
                    lastRead: new Date(p.last_read).getTime(),
                    completed: p.completed
                };
            });
        }
    }

    // Load preferences from API
    const prefsResult = await apiGet('/api/preferences');
    if (!prefsResult.error) {
        state.userPreferences = prefsResult;
        
        // Apply preferences if they exist
        if (prefsResult.reader_direction) {
            state.settings.direction = prefsResult.reader_direction;
        }
        if (prefsResult.reader_display) {
            state.settings.display = prefsResult.reader_display;
        }
        if (prefsResult.reader_zoom) {
            state.settings.zoom = prefsResult.reader_zoom;
        }
        if (prefsResult.brightness !== undefined) state.settings.brightness = prefsResult.brightness;
        if (prefsResult.contrast !== undefined) state.settings.contrast = prefsResult.contrast;
        if (prefsResult.saturation !== undefined) state.settings.saturation = prefsResult.saturation;
        if (prefsResult.invert !== undefined) state.settings.invert = prefsResult.invert;
        if (prefsResult.tone_value !== undefined) state.settings.toneValue = prefsResult.tone_value;
        if (prefsResult.tone_mode !== undefined) state.settings.toneMode = prefsResult.tone_mode;
        if (prefsResult.auto_advance_interval !== undefined) state.settings.autoAdvanceInterval = prefsResult.auto_advance_interval;

        if (prefsResult.theme && prefsResult.theme !== state.theme) {
            state.theme = prefsResult.theme;
        }
        if (prefsResult.ereader !== undefined) {
            state.ereader = !!prefsResult.ereader;
        }
        initTheme();

        // Apply View Mode Preference
        if (prefsResult.default_view_mode) {
            state.viewMode = prefsResult.default_view_mode;
            document.querySelectorAll('.view-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.view === state.viewMode);
            });
        }

        // Apply Sort Preference
        if (prefsResult.default_sort_by) {
            state.sortBy = prefsResult.default_sort_by;
            const sortSelect = document.getElementById('sort-select');
            if (sortSelect) sortSelect.value = state.sortBy;
        }
        
        // Refresh library view if active
        if (state.currentView === 'library') {
             if (state.currentLevel === 'title') {
                renderComicsView();
            } else if (state.flattenMode || state.currentLevel === 'subcategory') {
                renderTitleCards();
            } else if (!state.flattenMode && (state.currentLevel === 'root' || state.currentLevel === 'category')) {
                const folders = getFoldersAtLevel();
                renderFolderGrid(folders);
            }
        }
    }
}

export function updateAuthUI() {
    const authSection = document.getElementById('auth-section');
    const headerInfo = document.getElementById('user-header-info');
    if (!authSection) return;

    if (state.isAuthenticated && state.currentUser) {
        if (headerInfo) headerInfo.textContent = `(User: ${state.currentUser.username})`;
        
        authSection.innerHTML = `
            <div class="menu-item" onclick="routerNavigate('profile', {}); toggleHamburger()">
                <span class="menu-icon">👤</span>
                <span>Profile (${state.currentUser.username})</span>
            </div>
            <div class="menu-item" onclick="showPreferences(); toggleHamburger()">
                <span class="menu-icon">⚙️</span>
                <span>Preferences</span>
            </div>
            <div class="menu-item" onclick="logout(); toggleHamburger()">
                <span class="menu-icon">🚪</span>
                <span>Logout</span>
            </div>
            ${state.currentUser.role === 'admin' ? `
            <div class="menu-divider"></div>
            <div class="menu-item" onclick="scanLibrary(event); toggleHamburger()">
                <span class="menu-icon">🔄</span>
                <span>Scan Library</span>
                <span style="margin-left: auto; font-size: 0.8em; opacity: 0.6;">🔒</span>
            </div>
            <div class="menu-item" onclick="showScanStatus(); toggleHamburger()">
                <span class="menu-icon">📊</span>
                <span>Scan Status</span>
            </div>
            <div class="menu-item" onclick="routerNavigate('admin', {}); toggleHamburger()">
                <span class="menu-icon">👥</span>
                <span>User Management</span>
            </div>
            ` : ''}
        `;
    } else {
        if (headerInfo) headerInfo.textContent = '';
        
        authSection.innerHTML = `
            <div class="menu-item" onclick="showLoginModal(); toggleHamburger()">
                <span class="menu-icon">🔑</span>
                <span>Login</span>
            </div>
        `;
    }
}

export function toggleUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('open');
    }
}

export function showLoginModal() {
    // Remove existing modal if any
    closeLoginModal();
    
    const overlay = document.createElement('div');
    overlay.id = 'login-modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal" id="login-modal">
            <div class="modal-header">
                <h3 class="modal-title">Login</h3>
                <button class="modal-close" onclick="closeLoginModal()">&times;</button>
            </div>
            <div class="modal-body">
                <form id="login-form" onsubmit="handleLogin(event)">
                    <div class="form-group">
                        <label class="form-label" for="login-username">Username</label>
                        <input type="text" id="login-username" class="form-input" required autofocus>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="login-password">Password</label>
                        <input type="password" id="login-password" class="form-input" required>
                    </div>
                    <div class="modal-footer" style="padding: 0; border: none;">
                        <button type="submit" class="btn-primary">Login</button>
                        <button type="button" class="btn-secondary" onclick="showRegisterForm()">Create Account</button>
                    </div>
                </form>
                <form id="register-form" style="display: none;" onsubmit="handleRegister(event)">
                    <div class="form-group">
                        <label class="form-label" for="register-username">Username</label>
                        <input type="text" id="register-username" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="register-password">Password</label>
                        <input type="password" id="register-password" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="register-password-confirm">Confirm Password</label>
                        <input type="password" id="register-password-confirm" class="form-input" required>
                    </div>
                    <div class="modal-footer" style="padding: 0; border: none;">
                        <button type="submit" class="btn-primary">Register</button>
                        <button type="button" class="btn-secondary" onclick="showLoginForm()">Back to Login</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    // Trigger animation
    setTimeout(() => overlay.classList.add('active'), 10);
}

export function closeLoginModal() {
    const overlay = document.getElementById('login-modal-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 300);
    }
}

export function showRegisterForm() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
}

export function showLoginForm() {
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
}

export async function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    const result = await apiPost('/api/auth/login', { username, password });
    
    if (result.error) {
        if (result.status === 403) {
            showToast('Account pending administrator approval', 'error');
        } else if (result.error === 'Unauthorized') {
            showToast('Invalid credentials', 'error');
        } else {
            showToast('Login failed', 'error');
        }
    } else {
        state.isAuthenticated = true;
        state.currentUser = result.user;
        closeLoginModal();
        updateAuthUI();
        await loadUserData();
        await loadLibrary();
        
        // Check if password change is forced
        if (state.currentUser && state.currentUser.must_change_password) {
            showForcedPasswordModal();
        } else {
            showToast('Logged in successfully!', 'success');
        }

        // Refresh the view to show progress
        if (state.currentView === 'library') {
            navigateToRoot();
        } else if (state.currentView === 'recent') {
            loadRecentReads();
        }
    }
}

export async function handleRegister(event) {
    event.preventDefault();
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    const passwordConfirm = document.getElementById('register-password-confirm').value;

    if (password !== passwordConfirm) {
        showToast('Passwords do not match', 'error');
        return;
    }

    const result = await apiPost('/api/auth/register', { username, password });
    
    if (result.error) {
        showToast(result.error === 'Unauthorized' ? 'Registration failed' : result.error, 'error');
    } else {
        if (result.message && result.message.includes('pending approval')) {
            showToast('Registration successful! Your account will be reviewed by an administrator.', 'success');
        } else {
            showToast('Registration successful! Please log in.', 'success');
        }
        showLoginForm();
    }
}

export async function logout() {
    const result = await apiPost('/api/auth/logout', {});
    state.isAuthenticated = false;
    state.currentUser = null;
    state.readingProgress = {};
    state.userPreferences = null;
    updateAuthUI();
    showToast('Logged out successfully', 'success');
    
    // Show login modal
    showLoginModal();

    // Refresh view
    if (state.currentView === 'library') {
        navigateToRoot();
    } else if (state.currentView === 'recent') {
        loadRecentReads();
    }
}

export function setupAuthEventListeners() {
    // Close user menu when clicking outside
    document.addEventListener('click', (e) => {
        const userMenu = document.querySelector('.user-menu');
        const dropdown = document.getElementById('user-dropdown');
        if (userMenu && dropdown && dropdown.classList.contains('open')) {
            if (!userMenu.contains(e.target)) {
                dropdown.classList.remove('open');
            }
        }
    });
}

export function showForcedPasswordModal() {
    const modal = document.getElementById('forced-password-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

export async function handleForcedPasswordChange(event) {
    event.preventDefault();
    const newPassword = document.getElementById('forced-new-password').value;
    const confirmPassword = document.getElementById('forced-confirm-password').value;

    if (newPassword !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }

    if (newPassword.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }

    const result = await apiPut(`/api/admin/users/${state.currentUser.id}/password`, { new_password: newPassword });
    
    if (result.error) {
        showToast(`Error: ${result.error}`, 'error');
    } else {
        showToast('Password updated successfully!', 'success');
        document.getElementById('forced-password-modal').style.display = 'none';
        state.currentUser.must_change_password = false;
    }
}

window.handleForcedPasswordChange = handleForcedPasswordChange;
