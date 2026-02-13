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
    await loadAdminTags();
    console.log('initAdminView: loadAdminTags done');
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
    console.log('loadApprovalSetting: Starting...');
    const settings = await apiGet('/api/admin/settings');
    console.log('loadApprovalSetting: apiGet returned:', settings);
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
    console.log('loadUsers: Starting...');
    const tableBody = document.getElementById('admin-users-table-body');
    if (!tableBody) {
        console.log('loadUsers: No tableBody found, returning');
        return;
    }

     tableBody.innerHTML = '<tr><td colspan="9" class="admin-table-cell-center"><div class="spinner" style="margin: 0 auto;"></div></td></tr>';

     console.log('loadUsers: About to call apiGet...');
     const users = await apiGet('/api/admin/users');
     console.log('loadUsers: apiGet returned:', users);
     
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
              ? `<button onclick="window.adminApproveUser(${user.id})" class="btn-secondary admin-table-btn-small" style="color: var(--success);" title="Approve User">✓ Approve</button>`
              : '';

          tr.innerHTML = `
              <td class="admin-table-cell admin-table-cell-username">${user.username}</td>
              <td class="admin-table-cell admin-table-cell-secondary">${user.email || '-'}</td>
              <td class="admin-table-cell admin-table-cell-center admin-table-cell-approval" title="${user.approved === 0 ? 'Pending Approval' : 'Approved'}">${approvalStatus}</td>
              <td class="admin-table-cell">
                  <select onchange="window.adminUpdateRole(${user.id}, this.value)" class="sort-select admin-table-select">
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
                  <button onclick="window.adminResetPassword(${user.id}, '${user.username}')" class="btn-secondary admin-table-btn-small" title="Reset Password">
                      🔑 Reset
                  </button>
                  <button onclick="window.adminDeleteUser(${user.id}, '${user.username}')" class="btn-secondary admin-table-btn-small" style="color: var(--danger);" title="Delete User">
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

// --- Tag Management ---
let allAdminTags = [];
let allModifications = [];

export async function loadAdminTags() {
    const activeList = document.getElementById('admin-active-tags-list');
    const modifiedList = document.getElementById('admin-modified-tags-list');
    if (!activeList || !modifiedList) return;

    activeList.innerHTML = '<div class="spinner" style="margin: 2rem auto;"></div>';
    modifiedList.innerHTML = '<div class="spinner" style="margin: 2rem auto;"></div>';

     const data = await apiGet('/api/admin/tags');
     if (data.error) {
         activeList.innerHTML = `<div class="admin-tag-list-error">Error: ${data.error}</div>`;
         return;
     }

    allAdminTags = data.tags || [];
    allModifications = data.modifications || [];
    renderAdminTags();
}

window.filterAdminTags = (val) => {
    renderAdminTags(val);
};

window.loadAdminTags = loadAdminTags;

// Modal Logic
let currentModTagNorm = null;

window.openTagModModal = (norm, currentDisplay) => {
    currentModTagNorm = norm;
    
    // Check if there's an existing modification for this tag
    const existingMod = allModifications.find(m => m.norm === norm);
    
    document.getElementById('tag-mod-original').textContent = norm;
    
    if (existingMod) {
        document.getElementById('tag-mod-action').value = 
            existingMod.action === 'whitelist' ? 'rename' : existingMod.action;
        document.getElementById('tag-mod-display').value = existingMod.display_name || existingMod.current_display || '';
        document.getElementById('tag-mod-target').value = existingMod.target_norm || '';
    } else {
        document.getElementById('tag-mod-action').value = 'rename';
        document.getElementById('tag-mod-display').value = currentDisplay || '';
        document.getElementById('tag-mod-target').value = '';
    }
    
    window.updateTagModUI();
    
    const modal = document.getElementById('tag-mod-modal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
};

window.updateTagModUI = () => {
    const action = document.getElementById('tag-mod-action').value;
    document.getElementById('tag-mod-rename-group').style.display = (action === 'rename') ? 'block' : 'none';
    document.getElementById('tag-mod-merge-group').style.display = (action === 'merge') ? 'block' : 'none';
    
    if (action === 'merge') {
        window.filterMergeTargets('');
    }
};

window.filterMergeTargets = (val) => {
    const resultsContainer = document.getElementById('tag-mod-target-results');
    if (!resultsContainer) return;

    if (!val && val !== '') {
        resultsContainer.style.display = 'none';
        return;
    }

    const lowerVal = val.toLowerCase();
    const suggestions = allAdminTags.filter(t => 
        t.norm !== currentModTagNorm && 
        (t.norm.includes(lowerVal) || t.display.toLowerCase().includes(lowerVal))
    ).slice(0, 50); // Limit to 50 suggestions

     if (suggestions.length === 0) {
         resultsContainer.innerHTML = '<div class="admin-tag-suggestion-empty">No matching tags</div>';
     } else {
         resultsContainer.innerHTML = suggestions.map(tag => `
             <div onclick="window.selectMergeTarget('${tag.norm}', '${tag.display.replace(/'/g, "\\'")}')" 
                  class="admin-tag-suggestion">
                 <span class="admin-tag-suggestion-name">${tag.display}</span>
                 <span class="admin-tag-suggestion-count">(${tag.count})</span>
             </div>
         `).join('');
     }
    resultsContainer.style.display = 'block';
};

window.selectMergeTarget = (norm, display) => {
    const input = document.getElementById('tag-mod-target');
    const resultsContainer = document.getElementById('tag-mod-target-results');
    const preview = document.getElementById('tag-mod-merge-preview');
    
    input.value = display;
    resultsContainer.style.display = 'none';
    preview.innerHTML = `Will merge <strong>${currentModTagNorm}</strong> into <strong>${norm}</strong> (${display})`;
};

window.saveTagModification = async () => {
    const action = document.getElementById('tag-mod-action').value;
    let result;
    
    if (action === 'blacklist') {
        result = await apiPost('/api/admin/tags/blacklist', { tag: currentModTagNorm });
    } else if (action === 'rename') {
        const display = document.getElementById('tag-mod-display').value.trim();
        result = await apiPost('/api/admin/tags/whitelist', { tag: currentModTagNorm, display });
    } else if (action === 'merge') {
        const target = document.getElementById('tag-mod-target').value.trim();
        if (!target) {
            showToast('Target tag required', 'error');
            return;
        }
        result = await apiPost('/api/admin/tags/merge', { tag: currentModTagNorm, target });
    }
    
    if (result && !result.error) {
        showToast('Tag modification saved');
        window.closeTagModModal();
        await loadAdminTags();
    } else {
        showToast(result.error || 'Failed to save modification', 'error');
    }
};

window.closeTagModModal = () => {
    const modal = document.getElementById('tag-mod-modal');
    modal.classList.remove('active');
    setTimeout(() => modal.style.display = 'none', 300);
};

window.addWhitelistTag = async () => {
    const tag = document.getElementById('admin-whitelist-tag').value.trim();
    const display = document.getElementById('admin-whitelist-display').value.trim();
    if (!tag) return;

    const result = await apiPost('/api/admin/tags/whitelist', { tag, display: display || tag });
    if (result.error) {
        showToast(result.error, 'error');
    } else {
        showToast('Tag whitelisted');
        document.getElementById('admin-whitelist-tag').value = '';
        document.getElementById('admin-whitelist-display').value = '';
        await loadAdminTags();
    }
};

window.removeTagModification = async (norm) => {
    const result = await apiDelete(`/api/admin/tags/modification/${norm}`);
    if (result.error) {
        showToast(result.error, 'error');
    } else {
        showToast('Modification removed');
        await loadAdminTags();
    }
};

window.adminBlacklistTag = async (tag) => {
    const result = await apiPost('/api/admin/tags/blacklist', { tag });
    if (result.error) {
        showToast(result.error, 'error');
    } else {
        showToast('Tag blacklisted');
        await loadAdminTags();
    }
};

// --- Tag Management Rendering ---
function renderAdminTags(filter = '') {
    const activeList = document.getElementById('admin-active-tags-list');
    const modifiedList = document.getElementById('admin-modified-tags-list');
    if (!activeList || !modifiedList) return;

    const lowerFilter = filter.toLowerCase();
    const filteredTags = allAdminTags.filter(t => 
        !t.is_blacklisted && 
        (t.norm.includes(lowerFilter) || t.display.toLowerCase().includes(lowerFilter))
    );
    
     // Render Active Tags
     if (filteredTags.length === 0) {
         activeList.innerHTML = '<div class="admin-tag-list-empty">No active tags found.</div>';
     } else {
         activeList.innerHTML = filteredTags.map((tag, index) => `
             <div class="admin-tag-item ${index % 2 === 0 ? 'even-row' : 'odd-row'}" 
                  title="${tag.series_names.slice(0, 15).join(', ')}${tag.count > tag.series_names.length ? '...' : ''}">
                 <div class="admin-tag-item-content">
                     <span class="admin-tag-item-name">${tag.display}</span>
                     <span class="admin-tag-item-count">(${tag.count})</span>
                     ${tag.is_whitelisted ? '<span class="admin-tag-item-badge">Whitelist</span>' : ''}
                 </div>
                 <div class="admin-tag-item-actions">
                     <button onclick="window.openTagModModal('${tag.norm}', '${tag.display.replace(/'/g, "\\'")}')" class="btn-secondary admin-tag-btn-small" title="Modify Tag">modify</button>
                     <button onclick="window.adminBlacklistTag('${tag.norm}')" class="btn-secondary admin-tag-btn-small admin-tag-btn-danger" title="Blacklist Tag">blacklist</button>
                 </div>
             </div>
         `).join('');
     }

     // Render Modified Tags
     if (allModifications.length === 0) {
         modifiedList.innerHTML = '<div class="admin-tag-list-empty">No tag modifications.</div>';
     } else {
         modifiedList.innerHTML = allModifications.map((mod, index) => {
             let actionText = '';
             
             if (mod.action === 'blacklist') {
                 actionText = `----> <span class="admin-tag-action-blacklist">Blacklist</span>`;
             } else if (mod.action === 'merge') {
                 actionText = ` --Merge--> <span class="admin-tag-action-merge">${mod.target_norm}</span>`;
             } else if (mod.action === 'whitelist') {
                 actionText = ` --Renamed--> <span class="admin-tag-action-rename">${mod.display_name}</span>`;
             }

             return `
                 <div class="admin-tag-item admin-tag-item-modified ${index % 2 === 0 ? 'even-row' : 'odd-row'}">
                     <div class="admin-tag-item-content">
                         <span class="admin-tag-item-norm">${mod.norm}</span>
                         <span class="admin-tag-item-action">${actionText}</span>
                     </div>
                     <div class="admin-tag-item-actions">
                         <button onclick="window.openTagModModal('${mod.norm}')" class="btn-secondary admin-tag-btn-tiny" title="Edit modification">edit</button>
                         <button onclick="window.removeTagModification('${mod.norm}')" class="btn-secondary admin-tag-btn-tiny admin-tag-btn-success" title="Restore to default">restore</button>
                     </div>
                 </div>
             `;
         }).join('');
     }
}

window.filterAdminTags = (val) => {
    renderAdminTags(val);
};

export async function loadGapsReport() {
    const container = document.getElementById('admin-gaps-container');
    if (!container) return;

    container.innerHTML = '<div class="spinner" style="margin: 2rem auto;"></div>';

    const gaps = await apiGet('/api/admin/gaps');
    
     if (gaps.error) {
         container.innerHTML = `<div class="admin-gaps-error">Error loading gaps: ${gaps.error}</div>`;
         return;
     }

     if (gaps.length === 0) {
         container.innerHTML = '<div class="empty-state admin-gaps-empty"><div class="empty-icon">✅</div><div class="empty-title">No gaps detected!</div><p>Your collection appears to be continuous.</p></div>';
         return;
     }

     let html = `
         <div class="admin-gaps-grid">
     `;

     gaps.forEach(item => {
         html += `
             <div class="admin-gaps-card">
                 <div class="admin-gaps-card-title">${item.series}</div>
                 <div class="admin-gaps-card-subtitle">
                     Missing ${item.type}s: <span class="admin-gaps-card-count">${item.count}</span>
                 </div>
                 <div class="admin-gaps-card-tags">
                     ${item.gaps.map(g => `<span class="admin-gaps-tag">${g}</span>`).join('')}
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
    console.log('loadSettings: Starting...');
    const settings = await apiGet('/api/admin/settings');
    console.log('loadSettings: apiGet returned:', settings);
    if (settings.error) return;
    
    // Update thumbnail settings
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
    
    // Update library stats
    const totalSeriesEl = document.getElementById('library-total-series');
    const totalComicsEl = document.getElementById('library-total-comics');
    if (totalSeriesEl) totalSeriesEl.textContent = settings.total_series || 0;
    if (totalComicsEl) totalComicsEl.textContent = settings.total_comics || 0;
}

function setupScanButtons() {
     const incrementalBtn = document.getElementById('btn-scan-incremental');
     const fullBtn = document.getElementById('btn-scan-full');
     const thumbnailsBtn = document.getElementById('btn-scan-thumbnails');
     const metadataBtn = document.getElementById('btn-scan-metadata');
     const reloadBtn = document.getElementById('btn-library-reload');
     const restartBtn = document.getElementById('btn-restart-server');
     const stopBtn = document.getElementById('btn-scan-stop');
     
     console.log('setupScanButtons: Found buttons:', {
         incrementalBtn: !!incrementalBtn,
         fullBtn: !!fullBtn,
         thumbnailsBtn: !!thumbnailsBtn,
         metadataBtn: !!metadataBtn,
         reloadBtn: !!reloadBtn,
         restartBtn: !!restartBtn,
         stopBtn: !!stopBtn
     });
     
     if (incrementalBtn) {
         incrementalBtn.addEventListener('click', async () => {
             console.log('Incremental scan clicked');
             setScanButtonsDisabled(true);
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
             setScanButtonsDisabled(true);
             await apiPost('/api/admin/scan/thumbnails');
             startScanPolling();
         });
     }
     
     if (metadataBtn) {
         metadataBtn.addEventListener('click', async () => {
             console.log('Metadata scan clicked');
             setScanButtonsDisabled(true);
             await apiPost('/api/admin/scan/metadata');
             startScanPolling();
         });
     }

     if (reloadBtn) {
         reloadBtn.addEventListener('click', async () => {
             if (confirm('Force backend reload and refresh frontend? This will clear all system caches.')) {
                 showToast('Reloading library data...', 'info');
                 await apiPost('/api/admin/system/reload');
                 window.location.reload();
             }
         });
     }

     if (restartBtn) {
         restartBtn.addEventListener('click', async () => {
             if (confirm('Are you sure you want to RESTART the entire server? This will pick up any code changes but will disconnect all users temporarily.')) {
                 showToast('Server restarting... please wait.', 'info');
                 
                 // Trigger restart
                 apiPost('/api/admin/system/restart');
                 
                 // Wait a bit then poll for server to come back
                 setTimeout(() => {
                     const poll = setInterval(async () => {
                         try {
                             const check = await fetch('/api/auth/check');
                             if (check.ok) {
                                 clearInterval(poll);
                                 showToast('Server is back online!', 'success');
                                 setTimeout(() => window.location.reload(), 1000);
                             }
                         } catch (e) {
                             // Still down
                         }
                     }, 2000);
                 }, 3000);
             }
         });
     }

     if (stopBtn) {
         stopBtn.addEventListener('click', async () => {
             console.log('Stop scan clicked');
             if (confirm('Are you sure you want to stop the current scan?')) {
                 const result = await apiPost('/api/admin/scan/stop');
                 if (result.error) {
                     showToast(`Error: ${result.error}`, 'error');
                 } else {
                     showToast('Scan cancellation requested');
                     stopBtn.disabled = true; // Disable immediately to prevent double-click
                     stopBtn.textContent = 'Stopping...';
                 }
             }
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
    checkScanStatus(true);
}

function startScanPolling() {
    if (scanPollingInterval) return;
    
    const statusPanel = document.getElementById('admin-scan-status');
    if (statusPanel) statusPanel.style.display = 'block';
    
    // Check immediately then interval
    checkScanStatus();
    scanPollingInterval = setInterval(checkScanStatus, 3000);
}

function stopScanPolling() {
    if (scanPollingInterval) {
        clearInterval(scanPollingInterval);
        scanPollingInterval = null;
    }
}

async function checkScanStatus(initial = false) {
    const status = await apiGet('/api/admin/scan/status');
    
    const statusPanel = document.getElementById('admin-scan-status');
    const progressFill = document.getElementById('admin-scan-progress-fill');
    const currentFileEl = document.getElementById('admin-scan-current-file');
    const processedEl = document.getElementById('admin-scan-processed');
    const totalEl = document.getElementById('admin-scan-total');
    const newEl = document.getElementById('admin-metric-new');
    const changedEl = document.getElementById('admin-metric-changed');
    const deletedEl = document.getElementById('admin-metric-deleted');
    const pagesEl = document.getElementById('admin-metric-pages');
    const pageErrEl = document.getElementById('admin-metric-page-err');
    const thumbsEl = document.getElementById('admin-metric-thumbs');
    const thumbErrEl = document.getElementById('admin-metric-thumb-err');
    const statusTextEl = document.getElementById('admin-scan-status-text');
    const startedEl = document.getElementById('admin-scan-started');
    const stopBtn = document.getElementById('btn-scan-stop');
    
    if (!status || status.error) {
        if (statusPanel) statusPanel.style.display = 'none';
        stopScanPolling();
        if (stopBtn) {
            stopBtn.disabled = true;
            stopBtn.textContent = '🛑 Stop Scan';
        }
        return;
    }
    
    if (status.status === 'running') {
        if (statusPanel) statusPanel.style.display = 'block';
        
        // Ensure polling is active if we found a running scan on initial check
        if (initial && !scanPollingInterval) {
            startScanPolling();
        }
        
        const total = status.total_comics || 0;
        const processed = status.processed_comics || 0;
        const phase = status.phase || '';
        
        // Relativize path
        let displayPath = status.current_file || 'Starting...';
        if (window.state && window.state.config && window.state.config.comics_dir && status.current_file) {
             const rootDir = window.state.config.comics_dir;
             if (displayPath.startsWith(rootDir)) {
                 displayPath = displayPath.substring(rootDir.length);
                 if (displayPath.startsWith('/') || displayPath.startsWith('\\')) {
                     displayPath = displayPath.substring(1);
                 }
             }
        }
        if (currentFileEl) currentFileEl.textContent = displayPath;
        
        // Phase-specific display
        if (phase.includes('Phase 1')) {
            // Syncing phase: Total grows as we find files. "Processed" tracks total found.
            if (progressFill) {
                progressFill.style.width = '100%';
                progressFill.classList.add('indeterminate'); // We need to add this CSS class
            }
            // Show "Found: X"
            const statusText = document.getElementById('admin-scan-text-container');
            if (statusText) {
                statusText.innerHTML = `Found <span id="admin-scan-total" style="font-weight: 600;">${total}</span> files`;
            }
        } else {
             // Processing phase: Fixed total, tracking processed
             const progress = total > 0 ? (processed / total) * 100 : 0;
             if (progressFill) {
                 progressFill.style.width = `${progress}%`;
                 progressFill.classList.remove('indeterminate');
             }
             
             // Restore "X of Y"
             const statusText = document.getElementById('admin-scan-text-container');
             if (statusText) {
                 statusText.innerHTML = `<span id="admin-scan-processed">${processed}</span> of <span id="admin-scan-total">${total}</span> comics processed`;
             }
        }
        
        if (newEl) newEl.textContent = status.new_comics || 0;
        if (changedEl) changedEl.textContent = status.changed_comics || 0;
        if (deletedEl) deletedEl.textContent = status.deleted_comics || 0;
        
        if (pagesEl) pagesEl.textContent = status.processed_pages || 0;
        if (pageErrEl) {
            const errs = status.page_errors || 0;
            pageErrEl.textContent = `(${errs} err)`;
            pageErrEl.style.display = errs > 0 ? 'inline' : 'none';
        }
        
        if (thumbsEl) thumbsEl.textContent = status.processed_thumbnails || 0;
        if (thumbErrEl) {
            const errs = status.thumbnail_errors || 0;
            thumbErrEl.textContent = `(${errs} err)`;
            thumbErrEl.style.display = errs > 0 ? 'inline' : 'none';
        }
        
        const storageEl = document.getElementById('admin-metric-storage');
        if (storageEl) {
            const written = status.thumb_bytes_written || 0;
            const saved = status.thumb_bytes_saved || 0;
            
            if (written > 0) {
                const formatBytes = (b) => {
                    if (b === 0) return '0 B';
                    const i = Math.floor(Math.log(b) / Math.log(1024));
                    return (b / Math.pow(1024, i)).toFixed(1) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
                };
                
                let text = formatBytes(written);
                if (saved > 0) {
                    text += ` (Saved ${formatBytes(saved)})`;
                    storageEl.style.color = 'var(--success)';
                } else {
                    storageEl.style.color = 'var(--text-tertiary)';
                }
                storageEl.textContent = text;
            } else {
                storageEl.textContent = '-';
            }
        }
        
        if (statusTextEl) statusTextEl.textContent = `Running (${status.phase || 'init'})`;
        if (startedEl) {
            const startDate = new Date(status.started_at);
            startedEl.textContent = startDate.toLocaleTimeString();
        }
        
        // Disable scan buttons during scan
        setScanButtonsDisabled(true);
        
        // Enable stop button
        if (stopBtn) {
            if (status.cancel_requested) {
                stopBtn.disabled = true;
                stopBtn.textContent = 'Stopping...';
            } else {
                stopBtn.disabled = false;
                stopBtn.textContent = '🛑 Stop Scan';
            }
        }
    } else {
        if (statusPanel) statusPanel.style.display = 'none';
        stopScanPolling();
        setScanButtonsDisabled(false);
        
        // Disable stop button
        if (stopBtn) {
            stopBtn.disabled = true;
            stopBtn.textContent = '🛑 Stop Scan';
        }
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
    console.log('showRescanConfirmationModal: Creating modal...');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    // Use high z-index to ensure it's on top of everything. Add opacity: 1 because CSS defaults to 0.
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10002; opacity: 1;';
    
    overlay.innerHTML = `
        <div class="modal" style="background: var(--bg-secondary); padding: 2rem; border-radius: 12px; max-width: 400px; text-align: center;">
            <h3 style="margin-bottom: 1rem; color: var(--danger);">⚠️ Warning</h3>
            <p style="margin-bottom: 1.5rem;">Full Re-Scan will erase all data and re-scan from scratch. This cannot be undone.</p>
            <div style="display: flex; gap: 1rem; justify-content: center;">
                <button id="modal-cancel" class="btn-secondary">Cancel</button>
                <button id="modal-confirm" class="btn-primary" style="background: var(--danger); justify-content: center;">Continue</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Force display flex (class might be hidden by default depending on CSS)
    overlay.style.display = 'flex';
    
    overlay.querySelector('#modal-cancel').addEventListener('click', () => {
        overlay.remove();
    });
    
    overlay.querySelector('#modal-confirm').addEventListener('click', async () => {
        overlay.remove();
        setScanButtonsDisabled(true);
        await apiPost('/api/admin/rescan');
        startScanPolling();
    });
}

// Register cleanup for admin view
if (typeof registerCleanup === 'function') {
    registerCleanup('admin', stopScanPolling);
}
