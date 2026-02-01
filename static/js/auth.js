import { state } from './state.js';
import { apiGet, apiPost } from './api.js';
import { showToast } from './utils.js';
import { initTheme } from './theme.js';
import { showPreferences } from './preferences.js';
import { navigateToRoot, loadRecentReads } from './library.js';

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
        }
    }
    updateAuthUI();
}

export async function loadUserData() {
    // Load progress from API
    const progressResult = await apiGet('/api/progress');
    if (!progressResult.error && Array.isArray(progressResult)) {
        state.readingProgress = {};
        progressResult.forEach(p => {
            state.readingProgress[p.comic_id] = {
                page: p.current_page,
                lastRead: new Date(p.last_read).getTime(),
                completed: p.completed
            };
        });
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
        if (prefsResult.default_theme && prefsResult.default_theme !== state.theme) {
            state.theme = prefsResult.default_theme;
            initTheme();
        }
    }
}

export function updateAuthUI() {
    const authSection = document.getElementById('auth-section');
    if (!authSection) return;

    if (state.isAuthenticated && state.currentUser) {
        authSection.innerHTML = `
            <div class="menu-item" style="cursor: default; opacity: 0.8;">
                <span class="menu-icon">👤</span>
                <span>${state.currentUser.username}</span>
            </div>
            <div class="menu-item" onclick="showPreferences(); toggleHamburger()">
                <span class="menu-icon">⚙️</span>
                <span>Preferences</span>
            </div>
            <div class="menu-item" onclick="logout(); toggleHamburger()">
                <span class="menu-icon">🚪</span>
                <span>Logout</span>
            </div>
        `;
    } else {
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
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeLoginModal();
    });
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
        showToast(result.error === 'Unauthorized' ? 'Invalid credentials' : 'Login failed', 'error');
    } else {
        state.isAuthenticated = true;
        state.currentUser = result.user;
        closeLoginModal();
        updateAuthUI();
        await loadUserData();
        showToast('Logged in successfully!', 'success');
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
        showToast('Registration successful! Please log in.', 'success');
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
