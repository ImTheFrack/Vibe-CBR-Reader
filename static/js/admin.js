import { apiGet, apiPut, apiDelete } from './api.js';
import { showToast } from './utils.js';

export async function initAdminView() {
    await loadUsers();
}

async function loadUsers() {
    const tableBody = document.getElementById('admin-users-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="6" style="padding: 2rem; text-align: center;"><div class="spinner" style="margin: 0 auto;"></div></td></tr>';

    const users = await apiGet('/api/admin/users');
    
    if (users.error) {
        tableBody.innerHTML = `<tr><td colspan="6" style="padding: 2rem; text-align: center; color: var(--danger);">Error loading users: ${users.error}</td></tr>`;
        return;
    }

    if (users.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="padding: 2rem; text-align: center;">No users found.</td></tr>';
        return;
    }

    tableBody.innerHTML = '';
    users.forEach(user => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border)';
        
        const lastLogin = user.last_login ? new Date(user.last_login).toLocaleString() : 'Never';
        const createdAt = new Date(user.created_at).toLocaleDateString();

        tr.innerHTML = `
            <td style="padding: 1rem; font-weight: 500;">${user.username}</td>
            <td style="padding: 1rem; color: var(--text-secondary);">${user.email || '-'}</td>
            <td style="padding: 1rem;">
                <select onchange="window.adminUpdateRole(${user.id}, this.value)" class="sort-select" style="padding: 4px 8px; font-size: 0.85rem;">
                    <option value="reader" ${user.role === 'reader' ? 'selected' : ''}>Reader</option>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
            </td>
            <td style="padding: 1rem; color: var(--text-tertiary); font-size: 0.85rem;">${createdAt}</td>
            <td style="padding: 1rem; color: var(--text-tertiary); font-size: 0.85rem;">${lastLogin}</td>
            <td style="padding: 1rem; text-align: right;">
                <button onclick="window.adminResetPassword(${user.id}, '${user.username}')" class="btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; margin-right: 4px;" title="Reset Password">
                    🔑 Reset
                </button>
                <button onclick="window.adminDeleteUser(${user.id}, '${user.username}')" class="btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; color: var(--danger);" title="Delete User">
                    🗑️
                </button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

// Exposed to window for onclick handlers
window.adminUpdateRole = async (userId, newRole) => {
    if (!confirm(`Change role for user to ${newRole}?`)) {
        await loadUsers(); // Reset select
        return;
    }

    const result = await apiPut(`/api/admin/users/${userId}/role`, { role: newRole });
    if (result.error) {
        showToast(`Error: ${result.error}`, 'error');
        await loadUsers();
    } else {
        showToast('Role updated successfully');
    }
};

window.adminDeleteUser = async (userId, username) => {
    if (!confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
        return;
    }

    const result = await apiDelete(`/api/admin/users/${userId}`);
    if (result.error) {
        showToast(`Error: ${result.error}`, 'error');
    } else {
        showToast(`User ${username} deleted`);
        await loadUsers();
    }
};

window.adminResetPassword = async (userId, username) => {
    const newPassword = prompt(`Enter new password for ${username} (min 6 characters):`);
    if (!newPassword) return;
    
    if (newPassword.length < 6) {
        alert('Password must be at least 6 characters');
        return;
    }

    const result = await apiPut(`/api/admin/users/${userId}/password`, { new_password: newPassword });
    if (result.error) {
        showToast(`Error: ${result.error}`, 'error');
    } else {
        showToast('Password reset successful. User must change it on next login.');
    }
};
