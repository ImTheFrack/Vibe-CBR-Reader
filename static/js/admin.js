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

     tableBody.innerHTML = '<tr><td colspan="9" style="padding: 2rem; text-align: center;"><div class="spinner" style="margin: 0 auto;"></div></td></tr>';

     console.log('loadUsers: About to call apiGet...');
     const users = await apiGet('/api/admin/users');
     console.log('loadUsers: apiGet returned:', users);
     
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
     const stopBtn = document.getElementById('btn-scan-stop');
     
     console.log('setupScanButtons: Found buttons:', {
         incrementalBtn: !!incrementalBtn,
         fullBtn: !!fullBtn,
         thumbnailsBtn: !!thumbnailsBtn,
         metadataBtn: !!metadataBtn,
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
