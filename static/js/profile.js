import { state } from './state.js';
import { apiGet, apiPost } from './api.js';
import { showToast } from './utils.js';

export async function renderProfileView() {
    if (!state.isAuthenticated || !state.currentUser) {
        showToast('Please log in to view your profile', 'error');
        window.location.hash = '#/library';
        return;
    }

    // Set user info
    document.getElementById('profile-username').textContent = state.currentUser.username;
    document.getElementById('profile-email').textContent = state.currentUser.email || 'None provided';
    document.getElementById('profile-role').textContent = state.currentUser.role;

    // Load stats
    const stats = await apiGet('/api/users/me/stats');
    if (!stats.error) {
        document.getElementById('stats-comics-started').textContent = stats.total_comics;
        document.getElementById('stats-comics-completed').textContent = stats.completed_comics;
        document.getElementById('stats-pages-read').textContent = stats.total_pages_read.toLocaleString();
        
        // Convert seconds to hours
        const hours = (stats.total_seconds / 3600).toFixed(1);
        document.getElementById('stats-time-spent').textContent = `${hours}h`;
        
        document.getElementById('stats-completion-rate').textContent = `${stats.completion_rate}%`;
        document.getElementById('stats-completion-bar').style.width = `${stats.completion_rate}%`;
    }

    // Reset password form
    const form = document.getElementById('profile-password-form');
    if (form) form.reset();
}

export async function handleProfilePasswordChange(event) {
    event.preventDefault();
    const currentPassword = document.getElementById('profile-current-password').value;
    const newPassword = document.getElementById('profile-new-password').value;
    const confirmPassword = document.getElementById('profile-confirm-password').value;

    if (newPassword !== confirmPassword) {
        showToast('New passwords do not match', 'error');
        return;
    }

    if (newPassword.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }

    const result = await apiPost('/api/users/me/password', {
        current_password: currentPassword,
        new_password: newPassword
    });

    if (result.error) {
        showToast(result.error || 'Failed to update password', 'error');
    } else {
        showToast('Password updated successfully!', 'success');
        event.target.reset();
    }
}

// Expose to window for inline onclicks
window.handleProfilePasswordChange = handleProfilePasswordChange;
