import { apiGet, apiPut, apiPost, apiDelete } from '../api.js';
import { showToast } from '../utils.js';

function formatReadingTime(totalSeconds) {
  if (totalSeconds === 0) return '—';

  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600) % 24;
  const days = Math.floor(totalSeconds / 86400);

  if (totalSeconds < 60) {
    return `${seconds}s`;
  } else if (totalSeconds < 3600) {
    return `${minutes}m ${seconds}s`;
  } else if (totalSeconds < 86400) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${days}d ${hours}h`;
  }
}

export async function loadUsers() {
  const tableBody = document.getElementById('admin-users-table-body');
  if (!tableBody) return;

  tableBody.innerHTML = '<tr><td colspan="9" class="admin-table-cell-center"><div class="spinner" style="margin: 0 auto;"></div></td></tr>';

  const users = await apiGet('/api/admin/users');

  if (users.error) {
    tableBody.innerHTML = `<tr><td colspan="9" class="admin-table-cell-center admin-table-cell-error">Error loading users: ${users.error}</td></tr>`;
    return;
  }

  if (users.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="9" class="admin-table-cell-center">No users found.</td></tr>';
    return;
  }

  tableBody.innerHTML = '';
  users.forEach(user => {
    const tr = document.createElement('tr');

    const lastLogin = user.last_login ? new Date(user.last_login).toLocaleString() : 'Never';
    const createdAt = new Date(user.created_at).toLocaleDateString();
    const comicsRead = (user.comics_completed === 0 && user.comics_started === 0) ? '—' : `${user.comics_completed}/${user.comics_started}`;
    const timeRead = formatReadingTime(user.total_seconds_read || 0);

    const approvalStatus = user.approved === 0 ? '⏳' : '✅';
    const approvalButton = user.approved === 0
      ? `<button data-action="admin-approve-user" data-user-id="${user.id}" class="btn-secondary admin-table-btn-small" style="color: var(--success);" title="Approve User">✓ Approve</button>`
      : '';

    tr.innerHTML = `
      <td class="admin-table-cell admin-table-cell-username">${user.username}</td>
      <td class="admin-table-cell admin-table-cell-secondary">${user.email || '-'}</td>
      <td class="admin-table-cell admin-table-cell-center admin-table-cell-approval" title="${user.approved === 0 ? 'Pending Approval' : 'Approved'}">${approvalStatus}</td>
      <td class="admin-table-cell">
        <select data-action="admin-update-role" data-user-id="${user.id}" class="sort-select admin-table-select">
          <option value="reader" ${user.role === 'reader' ? 'selected' : ''}>Reader</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </td>
      <td class="admin-table-cell admin-table-cell-secondary admin-table-cell-small">${comicsRead}</td>
      <td class="admin-table-cell admin-table-cell-secondary admin-table-cell-small">${timeRead}</td>
      <td class="admin-table-cell admin-table-cell-secondary admin-table-cell-small">${createdAt}</td>
      <td class="admin-table-cell admin-table-cell-secondary admin-table-cell-small">${lastLogin}</td>
      <td class="admin-table-cell admin-table-cell-actions">
        ${approvalButton}
        <button data-action="admin-reset-password" data-user-id="${user.id}" data-username="${user.username}" class="btn-secondary admin-table-btn-small" title="Reset Password">🔑 Reset</button>
        <button data-action="admin-delete-user" data-user-id="${user.id}" data-username="${user.username}" class="btn-secondary admin-table-btn-small" style="color: var(--danger);" title="Delete User">🗑️</button>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

export async function adminUpdateRole(userId, newRole) {
  if (!confirm(`Change role for user to ${newRole}?`)) {
    await loadUsers();
    return;
  }

  const result = await apiPut(`/api/admin/users/${userId}/role`, { role: newRole });
  if (result.error) {
    showToast(`Error: ${result.error}`, 'error');
    await loadUsers();
  } else {
    showToast('Role updated successfully');
  }
}

export async function adminDeleteUser(userId, username) {
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
}

export async function adminResetPassword(userId, username) {
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
}

export async function adminApproveUser(userId) {
  const result = await apiPut(`/api/admin/users/${userId}/approve`, {});
  if (result.error) {
    showToast(`Error: ${result.error}`, 'error');
  } else {
    showToast('User approved successfully');
    await loadUsers();
  }
}
