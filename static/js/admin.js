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

export async function loadGapsReport() {
    const container = document.getElementById('admin-gaps-container');
    if (!container) return;

    container.innerHTML = '<div class="spinner" style="margin: 2rem auto;"></div>';

    const gaps = await apiGet('/api/admin/gaps');
    
    if (gaps.error) {
        container.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--danger);">Error loading gaps: ${gaps.error}</div>`;
        return;
    }

    if (gaps.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 2rem;"><div class="empty-icon">✅</div><div class="empty-title">No gaps detected!</div><p>Your collection appears to be continuous.</p></div>';
        return;
    }

    let html = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem;">
    `;

    gaps.forEach(item => {
        html += `
            <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; border-left: 4px solid var(--accent);">
                <div style="font-weight: 600; margin-bottom: 0.5rem;">${item.series}</div>
                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
                    Missing ${item.type}s: <span style="color: var(--accent); font-weight: 600;">${item.count}</span>
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                    ${item.gaps.map(g => `<span style="background: var(--bg-secondary); padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">${g}</span>`).join('')}
                </div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

window.loadGapsReport = loadGapsReport;
