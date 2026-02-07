import { apiGet, apiPut, apiPost, apiDelete } from './api.js';
import { showToast } from './utils.js';

console.log('[DEBUG] admin.js module loading...');

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

export async function initAdminView() {
    console.log('initAdminView: Starting...');
    await loadSettings();
    console.log('initAdminView: loadSettings done');
    await loadApprovalSetting();
    console.log('initAdminView: loadApprovalSetting done');
    await loadUsers();
    console.log('initAdminView: loadUsers done');
    setupApprovalToggle();
    console.log('initAdminView: setupApprovalToggle done');
    console.log('initAdminView: About to call setupScanButtons...');
    setupScanButtons();
    console.log('initAdminView: setupScanButtons done');
    console.log('initAdminView: About to call setupThumbnailSettings...');
    setupThumbnailSettings();
    console.log('initAdminView: setupThumbnailSettings done');
    initScanStatus();
    console.log('initAdminView: Complete!');
}

async function loadApprovalSetting() {
    const settings = await apiGet('/api/admin/settings');
    if (!settings.error) {
        const toggle = document.getElementById('toggle-require-approval');
        if (toggle) {
            toggle.checked = settings.require_approval === 1;
        }
    }
}

function setupApprovalToggle() {
    const toggle = document.getElementById('toggle-require-approval');
    if (toggle) {
        toggle.addEventListener('change', async (e) => {
            const result = await apiPut('/api/admin/settings', { 
                require_approval: e.target.checked ? 1 : 0 
            });
            if (result.error) {
                showToast(`Error: ${result.error}`, 'error');
                // Revert toggle
                e.target.checked = !e.target.checked;
            } else {
                showToast(`Approval requirement ${e.target.checked ? 'enabled' : 'disabled'}`);
            }
        });
    }
}

async function loadUsers() {
    const tableBody = document.getElementById('admin-users-table-body');
    if (!tableBody) return;

     tableBody.innerHTML = '<tr><td colspan="9" style="padding: 2rem; text-align: center;"><div class="spinner" style="margin: 0 auto;"></div></td></tr>';

     const users = await apiGet('/api/admin/users');
     
     if (users.error) {
         tableBody.innerHTML = `<tr><td colspan="9" style="padding: 2rem; text-align: center; color: var(--danger);">Error loading users: ${users.error}</td></tr>`;
         return;
     }

     if (users.length === 0) {
         tableBody.innerHTML = '<tr><td colspan="9" style="padding: 2rem; text-align: center;">No users found.</td></tr>';
        return;
    }

    tableBody.innerHTML = '';
    users.forEach(user => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border)';
        
         const lastLogin = user.last_login ? new Date(user.last_login).toLocaleString() : 'Never';
         const createdAt = new Date(user.created_at).toLocaleDateString();
         const comicsRead = (user.comics_completed === 0 && user.comics_started === 0) ? '—' : `${user.comics_completed}/${user.comics_started}`;
         const timeRead = formatReadingTime(user.total_seconds_read || 0);

         const approvalStatus = user.approved === 0 ? '⏳' : '✅';
         const approvalButton = user.approved === 0 
             ? `<button onclick="window.adminApproveUser(${user.id})" class="btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; margin-right: 4px; color: var(--success);" title="Approve User">✓ Approve</button>`
             : '';

         tr.innerHTML = `
             <td style="padding: 1rem; font-weight: 500;">${user.username}</td>
             <td style="padding: 1rem; color: var(--text-secondary);">${user.email || '-'}</td>
             <td style="padding: 1rem; text-align: center; font-size: 1.2rem;" title="${user.approved === 0 ? 'Pending Approval' : 'Approved'}">${approvalStatus}</td>
             <td style="padding: 1rem;">
                 <select onchange="window.adminUpdateRole(${user.id}, this.value)" class="sort-select" style="padding: 4px 8px; font-size: 0.85rem;">
                     <option value="reader" ${user.role === 'reader' ? 'selected' : ''}>Reader</option>
                     <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                 </select>
             </td>
             <td style="padding: 1rem; color: var(--text-tertiary); font-size: 0.85rem;">${comicsRead}</td>
             <td style="padding: 1rem; color: var(--text-tertiary); font-size: 0.85rem;">${timeRead}</td>
             <td style="padding: 1rem; color: var(--text-tertiary); font-size: 0.85rem;">${createdAt}</td>
             <td style="padding: 1rem; color: var(--text-tertiary); font-size: 0.85rem;">${lastLogin}</td>
             <td style="padding: 1rem; text-align: right;">
                 ${approvalButton}
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

window.adminApproveUser = async (userId) => {
    const result = await apiPut(`/api/admin/users/${userId}/approve`, {});
    if (result.error) {
        showToast(`Error: ${result.error}`, 'error');
    } else {
        showToast('User approved successfully');
        await loadUsers();
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

// Task 8: Scan buttons, thumbnail settings, and scan status
let scanPollingInterval = null;

export async function loadSettings() {
    const settings = await apiGet('/api/admin/settings');
    if (settings.error) return;
    
    const formatSelect = document.getElementById('thumb-format-select');
    const qualitySlider = document.getElementById('thumb-quality-slider');
    const qualityValue = document.getElementById('thumb-quality-value');
    const ratioSelect = document.getElementById('thumb-ratio-select');
    const widthSlider = document.getElementById('thumb-width-slider');
    const widthValue = document.getElementById('thumb-width-value');
    
    if (formatSelect) formatSelect.value = settings.thumb_format || 'webp';
    if (qualitySlider) qualitySlider.value = settings.thumb_quality || 70;
    if (qualityValue) qualityValue.textContent = settings.thumb_quality || 70;
    if (ratioSelect) ratioSelect.value = settings.thumb_ratio || '9:14';
    if (widthSlider) widthSlider.value = settings.thumb_width || 225;
    if (widthValue) widthValue.textContent = settings.thumb_width || 225;
    
    // Disable quality slider if PNG selected
    if (qualitySlider && formatSelect) {
        qualitySlider.disabled = formatSelect.value === 'png';
    }
}

function setupScanButtons() {
     const incrementalBtn = document.getElementById('btn-scan-incremental');
     const fullBtn = document.getElementById('btn-scan-full');
     const thumbnailsBtn = document.getElementById('btn-scan-thumbnails');
     const metadataBtn = document.getElementById('btn-scan-metadata');
     
     console.log('setupScanButtons: Found buttons:', {
         incrementalBtn: !!incrementalBtn,
         fullBtn: !!fullBtn,
         thumbnailsBtn: !!thumbnailsBtn,
         metadataBtn: !!metadataBtn
     });
     
     if (incrementalBtn) {
         incrementalBtn.addEventListener('click', async () => {
             console.log('Incremental scan clicked');
             await apiPost('/api/admin/scan');
             startScanPolling();
         });
     }
     
     if (fullBtn) {
         fullBtn.addEventListener('click', () => {
             console.log('Full scan clicked');
             showRescanConfirmationModal();
         });
     }
     
     if (thumbnailsBtn) {
         thumbnailsBtn.addEventListener('click', async () => {
             console.log('Thumbnails scan clicked');
             await apiPost('/api/admin/scan/thumbnails');
             startScanPolling();
         });
     }
     
     if (metadataBtn) {
         metadataBtn.addEventListener('click', async () => {
             console.log('Metadata scan clicked');
             await apiPost('/api/admin/scan/metadata');
             startScanPolling();
         });
     }
 }

function setupThumbnailSettings() {
     const formatSelect = document.getElementById('thumb-format-select');
     const qualitySlider = document.getElementById('thumb-quality-slider');
     const qualityValue = document.getElementById('thumb-quality-value');
     const ratioSelect = document.getElementById('thumb-ratio-select');
     const widthSlider = document.getElementById('thumb-width-slider');
     const widthValue = document.getElementById('thumb-width-value');
     const saveBtn = document.getElementById('thumb-save-btn');
     
     console.log('setupThumbnailSettings: Found elements:', {
         formatSelect: !!formatSelect,
         qualitySlider: !!qualitySlider,
         qualityValue: !!qualityValue,
         ratioSelect: !!ratioSelect,
         widthSlider: !!widthSlider,
         widthValue: !!widthValue,
         saveBtn: !!saveBtn
     });
     
     if (formatSelect && qualitySlider) {
         formatSelect.addEventListener('change', () => {
             console.log('Format changed to:', formatSelect.value);
             qualitySlider.disabled = formatSelect.value === 'png';
         });
     }
     
     if (qualitySlider && qualityValue) {
         qualitySlider.addEventListener('input', () => {
             console.log('Quality slider moved to:', qualitySlider.value);
             qualityValue.textContent = qualitySlider.value;
         });
     }
     
     if (widthSlider && widthValue) {
         widthSlider.addEventListener('input', () => {
             console.log('Width slider moved to:', widthSlider.value);
             widthValue.textContent = widthSlider.value;
         });
     }
     
     if (saveBtn) {
         saveBtn.addEventListener('click', async () => {
             console.log('Save button clicked');
             const settings = {
                 thumb_format: formatSelect?.value || 'webp',
                 thumb_quality: parseInt(qualitySlider?.value || 70),
                 thumb_ratio: ratioSelect?.value || '9:14',
                 thumb_width: parseInt(widthSlider?.value || 225),
                 thumb_height: Math.round(parseInt(widthSlider?.value || 225) * 14 / 9)
             };
             
             console.log('Saving settings:', settings);
             const result = await apiPut('/api/admin/settings', settings);
             if (!result.error) {
                 showToast('Settings saved successfully');
             } else {
                 showToast('Error saving settings', 'error');
             }
         });
     }
 }

function initScanStatus() {
    // Initial check
    checkScanStatus();
}

function startScanPolling() {
    if (scanPollingInterval) return;
    
    const statusPanel = document.getElementById('admin-scan-status');
    if (statusPanel) statusPanel.style.display = 'block';
    
    scanPollingInterval = setInterval(checkScanStatus, 3000);
}

function stopScanPolling() {
    if (scanPollingInterval) {
        clearInterval(scanPollingInterval);
        scanPollingInterval = null;
    }
}

async function checkScanStatus() {
    const status = await apiGet('/api/admin/scan/status');
    
    const statusPanel = document.getElementById('admin-scan-status');
    const progressFill = document.getElementById('admin-scan-progress-fill');
    const currentFile = document.getElementById('admin-scan-current-file');
    const processedEl = document.getElementById('admin-scan-processed');
    const newEl = document.getElementById('admin-scan-new');
    const changedEl = document.getElementById('admin-scan-changed');
    
    if (!status || status.error) {
        if (statusPanel) statusPanel.style.display = 'none';
        stopScanPolling();
        return;
    }
    
    if (status.status === 'running') {
        if (statusPanel) statusPanel.style.display = 'block';
        
        const total = status.total_comics || 1;
        const processed = status.processed_comics || 0;
        const progress = (processed / total) * 100;
        
        if (progressFill) progressFill.style.width = `${progress}%`;
        if (currentFile) currentFile.textContent = status.current_file || 'Processing...';
        if (processedEl) processedEl.textContent = processed;
        if (newEl) newEl.textContent = status.new_comics || 0;
        if (changedEl) changedEl.textContent = status.changed_comics || 0;
        
        // Disable scan buttons during scan
        setScanButtonsDisabled(true);
    } else {
        if (statusPanel) statusPanel.style.display = 'none';
        stopScanPolling();
        setScanButtonsDisabled(false);
    }
}

function setScanButtonsDisabled(disabled) {
    const buttons = [
        document.getElementById('btn-scan-incremental'),
        document.getElementById('btn-scan-full'),
        document.getElementById('btn-scan-thumbnails'),
        document.getElementById('btn-scan-metadata')
    ];
    
    buttons.forEach(btn => {
        if (btn) btn.disabled = disabled;
    });
}

function showRescanConfirmationModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000;';
    
    overlay.innerHTML = `
        <div class="modal" style="background: var(--bg-secondary); padding: 2rem; border-radius: 12px; max-width: 400px; text-align: center;">
            <h3 style="margin-bottom: 1rem; color: var(--danger);">⚠️ Warning</h3>
            <p style="margin-bottom: 1.5rem;">Full Re-Scan will erase all data and re-scan from scratch. This cannot be undone.</p>
            <div style="display: flex; gap: 1rem; justify-content: center;">
                <button id="modal-cancel" class="btn-secondary">Cancel</button>
                <button id="modal-confirm" class="btn-danger" style="background: var(--danger);">Continue</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    overlay.querySelector('#modal-cancel').addEventListener('click', () => {
        overlay.remove();
    });
    
    overlay.querySelector('#modal-confirm').addEventListener('click', async () => {
        overlay.remove();
        await apiPost('/api/admin/rescan');
        startScanPolling();
    });
}

// Register cleanup for admin view
if (typeof registerCleanup === 'function') {
    registerCleanup('admin', stopScanPolling);
}
