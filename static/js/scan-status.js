import { state } from './state.js';
import { apiGet } from './api.js';
import { registerCleanup } from './router.js';

let pollInterval = null;

export function stopScanPolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
}

registerCleanup('scan', stopScanPolling);

export function startScanPolling() {
    // Start polling
    pollScanStatus();
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(pollScanStatus, 3000);
}

export function showScanStatus() {
    // Hide all views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-scan-status').classList.add('active');
    state.currentView = 'scan-status';
    
    // Start polling
    startScanPolling();
}

async function pollScanStatus() {
    const result = await apiGet('/api/scan/status');
    if (!result.error) {
        updateScanUI(result);
        if (result.status !== 'running' && pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }
}

function updateScanUI(data) {
    const subtitle = document.getElementById('scan-status-subtitle');
    const fill = document.getElementById('scan-progress-fill');
    const processed = document.getElementById('scan-processed');
    const total = document.getElementById('scan-total');
    const statusText = document.getElementById('scan-status-text');
    const started = document.getElementById('scan-started');
    const completed = document.getElementById('scan-completed');
    const completedContainer = document.getElementById('scan-completed-container');
    const currentFile = document.getElementById('scan-current-file');
    
    // Metrics
    const metricNew = document.getElementById('metric-new');
    const metricChanged = document.getElementById('metric-changed');
    const metricDeleted = document.getElementById('metric-deleted');
    const metricPages = document.getElementById('metric-pages');
    const metricPageErr = document.getElementById('metric-page-err');
    const metricThumbs = document.getElementById('metric-thumbs');
    const metricThumbErr = document.getElementById('metric-thumb-err');
    
    if (data.status === 'idle') {
        subtitle.textContent = 'No active scan';
        fill.style.width = '0%';
        processed.textContent = '0';
        total.textContent = '0';
        statusText.textContent = 'Idle';
        started.textContent = '-';
        completedContainer.style.display = 'none';
        currentFile.textContent = '-';
        
        // Reset metrics
        metricNew.textContent = '0';
        metricChanged.textContent = '0';
        metricDeleted.textContent = '0';
        metricPages.textContent = '0';
        metricPageErr.textContent = '(0 err)';
        metricThumbs.textContent = '0';
        metricThumbErr.textContent = '(0 err)';
    } else {
        subtitle.textContent = data.status === 'running' ? 'Scan in progress...' : 'Scan complete';
        const pct = data.total_comics > 0 ? (data.processed_comics / data.total_comics * 100) : 0;
        fill.style.width = pct + '%';
        processed.textContent = data.processed_comics;
        total.textContent = data.total_comics;
        statusText.textContent = data.phase || data.status;
        started.textContent = data.started_at ? new Date(data.started_at).toLocaleString() : '-';
        currentFile.textContent = data.current_file || '-';
        
        // Update metrics
        metricNew.textContent = data.new_comics || 0;
        metricChanged.textContent = data.changed_comics || 0;
        metricDeleted.textContent = data.deleted_comics || 0;
        metricPages.textContent = data.processed_pages || 0;
        metricPageErr.textContent = `(${data.page_errors || 0} err)`;
        metricThumbs.textContent = data.processed_thumbnails || 0;
        metricThumbErr.textContent = `(${data.thumbnail_errors || 0} err)`;

        if (data.completed_at) {
            completed.textContent = new Date(data.completed_at).toLocaleString();
            completedContainer.style.display = 'block';
        } else {
            completedContainer.style.display = 'none';
        }
    }
}
