import { state } from '../state.js';
import { showToast, findTitleInTree } from '../utils.js';
import { apiGet, apiPost, apiDelete } from '../api.js';

let currentExportJobId = null;

const actionDispatcher = {
    'card-click': (id, event) => {
        // Check if we're in tags view
        if (state.currentView === 'tags') {
            if (window.selectTag) {
                window.selectTag(id);
            }
            return;
        }
        
        const allComics = state.comics || [];
        const comic = allComics.find(c => String(c.id) === String(id));
        
        if (comic) {
            if (window.startReading) {
                window.startReading(id);
            }
            return;
        }
        
        const titleObj = findTitleInTree(id);
        if (titleObj) {
            if (state.currentLocation.category && state.currentLocation.subcategory) {
                window.routerNavigate('library', { 
                    category: state.currentLocation.category, 
                    subcategory: state.currentLocation.subcategory, 
                    title: id 
                });
            } else {
                window.routerNavigate('library', { title: id });
            }
            return;
        }
        
        if (state.currentLevel === 'root') {
            window.routerNavigate('library', { category: id });
        } else if (state.currentLevel === 'category') {
            window.routerNavigate('library', { 
                category: state.currentLocation.category, 
                subcategory: id 
            });
        }
    }
};

export function registerAction(name, handler) {
    actionDispatcher[name] = handler;
}

// Clean up if user closes window
window.addEventListener('beforeunload', () => {
    if (currentExportJobId) {
        // We use fetch with keepalive or synchronous XHR if needed, 
        // but a simple DELETE request is usually enough for the server to pick up.
        fetch(`/api/export/cancel/${currentExportJobId}`, { method: 'DELETE', keepalive: true });
    }
});

export function toggleSelectionMode() {
    state.selectionMode = !state.selectionMode;
    const buttons = document.querySelectorAll('.btn-selection-mode');
    const main = document.querySelector('.main-container');
    
    if (state.selectionMode) {
        buttons.forEach(btn => btn.classList.add('active'));
        main.classList.add('selection-mode-active');
        state.selectedIds = new Set();
    } else {
        buttons.forEach(btn => btn.classList.remove('active'));
        main.classList.remove('selection-mode-active');
        clearSelection();
    }
}

export function toggleItemSelection(id, event) {
    if (!state.selectionMode) return false;
    if (event) event.stopPropagation();
    
    if (state.selectedIds.has(id)) {
        state.selectedIds.delete(id);
    } else {
        state.selectedIds.add(id);
    }
    
    updateSelectionUI();
    return true;
}

export function handleCardClick(el, event) {
    const id = el.dataset.id;
    if (state.selectionMode) {
        toggleItemSelection(id, event);
    } else {
        const action = el.dataset.action || 'card-click';
        if (actionDispatcher[action]) {
            try {
                actionDispatcher[action](id, event);
            } catch (err) {
                console.error("Failed to execute card action:", err, action, id);
            }
        }
    }
}

export async function handleBatchExport() {
    if (state.selectedIds.size === 0) return;
    
    const resolvedIds = new Set();
    const allComics = state.comics || [];
    const mangaTitles = new Set();
    
    for (const selectedId of state.selectedIds) {
        const comic = allComics.find(c => c.id === selectedId);
        if (comic) {
            resolvedIds.add(selectedId);
            mangaTitles.add(comic.series);
        } else {
            const titleObj = findTitleInTree(selectedId);
            if (titleObj && titleObj.comics) {
                mangaTitles.add(selectedId);
                titleObj.comics.forEach(c => resolvedIds.add(c.id));
            } else {
                const seriesComics = allComics.filter(c => c.series === selectedId);
                if (seriesComics.length > 0) {
                    mangaTitles.add(selectedId);
                    seriesComics.forEach(c => resolvedIds.add(c.id));
                }
            }
        }
    }
    
    const ids = Array.from(resolvedIds);
    if (ids.length === 0) {
        showToast('No comics found in selection', 'error');
        return;
    }

    const mangaCount = mangaTitles.size;
    const totalChapters = ids.length;
    let exportFilename = "";

    if (mangaCount === 1) {
        exportFilename = `${Array.from(mangaTitles)[0]} export.cbz`;
    } else {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        exportFilename = `[${year}-${month}-${day} ${hours}:${minutes}] Export (${mangaCount} Manga ${totalChapters} Chapters).cbz`;
    }
    
    exportFilename = exportFilename.replace(/[\\/*?:"<>|]/g, "_");
    
    showProgressModal('Exporting...', `Packing ${totalChapters} chapters...`);
    
    try {
        const result = await apiPost('/api/export/cbz', { 
            comic_ids: ids, 
            filename: exportFilename 
        });
        
        if (result.error) throw new Error(result.error);
        
        currentExportJobId = result.job_id;
        await pollExportStatus(currentExportJobId, exportFilename);
        
    } catch (err) {
        hideProgressModal();
        showToast('Export failed: ' + err.message, 'error');
    }
}

async function pollExportStatus(jobId, filename) {
    const poll = async () => {
        if (currentExportJobId !== jobId) return; // Stop if job ID changed (cancelled)

        const status = await apiGet(`/api/export/status/${jobId}`);
        if (status.error) {
            hideProgressModal();
            showToast('Export failed: ' + status.error, 'error');
            return;
        }
        
        if (status.status === 'cancelled') {
            hideProgressModal();
            showToast('Export cancelled', 'info');
            currentExportJobId = null;
            return;
        }

        updateProgressModal(status.progress, `Processing ${status.progress}%`);
        
        if (status.disk) {
            const diskInfo = document.getElementById('disk-info');
            const diskFree = document.getElementById('disk-free');
            const diskBar = document.getElementById('disk-bar-fill');
            
            if (diskInfo && diskFree && diskBar) {
                diskInfo.style.display = 'block';
                const freeGB = (status.disk.free / (1024 ** 3)).toFixed(1);
                diskFree.textContent = `${freeGB} GB Free`;
                diskBar.style.width = `${status.disk.percent}%`;
                
                // Color bar red if disk is very full (< 5GB)
                if (status.disk.free < 5 * (1024 ** 3)) {
                    diskBar.style.background = 'var(--danger)';
                } else {
                    diskBar.style.background = 'var(--text-tertiary)';
                }
            }
        }

        if (status.status === 'completed') {
            updateProgressModal(100, 'Finishing up...');
            const downloadUrl = `/api/export/download/${jobId}`;
            const finalFilename = filename;
            
            setTimeout(() => {
                hideProgressModal();
                // Clear the ID BEFORE triggering download so beforeunload doesn't trip
                currentExportJobId = null; 
                
                triggerDownload(downloadUrl, finalFilename);
                showToast('Export successful!', 'success');
                clearSelection();
            }, 500);
        } else if (status.status === 'failed') {
            hideProgressModal();
            showToast('Export failed: ' + (status.error || 'Unknown error'), 'error');
            currentExportJobId = null;
        } else {
            setTimeout(poll, 1000);
        }
    };
    
    setTimeout(poll, 1000);
}

export async function handleCancelExport() {
    if (!currentExportJobId) return;
    
    const jobId = currentExportJobId;
    // Update UI immediately
    updateProgressModal(0, 'Cancelling...');
    
    const result = await apiDelete(`/api/export/cancel/${jobId}`);
    if (result.error) {
        showToast('Failed to cancel export: ' + result.error, 'error');
    }
    
    // UI will be hidden by the poll loop when it detects 'cancelled' status
}

function triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    if (filename) a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

function showProgressModal(title, subtitle) {
    const modal = document.getElementById('progress-modal');
    if (!modal) return;
    document.getElementById('progress-title').textContent = title;
    document.getElementById('progress-subtitle').textContent = subtitle;
    updateProgressModal(0, 'Initializing...');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
}

function hideProgressModal() {
    const modal = document.getElementById('progress-modal');
    if (!modal) return;
    modal.classList.remove('active');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
}

function updateProgressModal(percent, detail) {
    document.getElementById('progress-bar-fill').style.width = `${percent}%`;
    document.getElementById('progress-status').textContent = `${percent}%`;
    if (detail) document.getElementById('progress-detail').textContent = detail;
}

export function clearSelection() {
    state.selectedIds = new Set();
    state.selectionMode = false;
    const buttons = document.querySelectorAll('.btn-selection-mode');
    const main = document.querySelector('.main-container');
    const bar = document.getElementById('selection-action-bar');
    buttons.forEach(btn => btn.classList.remove('active'));
    if (main) main.classList.remove('selection-mode-active');
    if (bar) bar.classList.remove('active');
    document.querySelectorAll('.comic-card.selected, .selection-checkbox.selected').forEach(el => el.classList.remove('selected'));
}

function updateSelectionUI() {
    const bar = document.getElementById('selection-action-bar');
    const countEl = document.getElementById('selection-count');
    const count = state.selectedIds.size;
    if (count > 0) {
        bar.classList.add('active');
        countEl.textContent = count;
    } else {
        bar.classList.remove('active');
    }
    // Update individual cards (both library title cards and series chapter cards)
    document.querySelectorAll('.comic-card, .chapter-card').forEach(card => {
        const id = card.dataset.id;
        if (id) {
            const isSelected = state.selectedIds.has(id);
            card.classList.toggle('selected', isSelected);
            const checkbox = card.querySelector('.selection-checkbox');
            if (checkbox) checkbox.classList.toggle('selected', isSelected);
        }
    });
}

window.toggleSelectionMode = toggleSelectionMode;
window.clearSelection = clearSelection;
window.handleBatchExport = handleBatchExport;
window.handleCardClick = handleCardClick;
window.toggleItemSelection = toggleItemSelection;
window.handleCancelExport = handleCancelExport;
window.updateSelectionUI = updateSelectionUI;
