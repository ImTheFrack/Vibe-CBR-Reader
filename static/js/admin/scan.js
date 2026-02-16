import { apiGet, apiPost } from '../api.js';
import { showToast } from '../utils.js';

let scanPollingInterval = null;

export function setupScanButtons() {
  const incrementalBtn = document.getElementById('btn-scan-incremental');
  const fullBtn = document.getElementById('btn-scan-full');
  const thumbnailsBtn = document.getElementById('btn-scan-thumbnails');
  const metadataBtn = document.getElementById('btn-scan-metadata');
  const reloadBtn = document.getElementById('btn-library-reload');
  const restartBtn = document.getElementById('btn-restart-server');
  const stopBtn = document.getElementById('btn-scan-stop');

  if (incrementalBtn) {
    incrementalBtn.addEventListener('click', async () => {
      setScanButtonsDisabled(true);
      await apiPost('/api/admin/scan');
      startScanPolling();
    });
  }

  if (fullBtn) {
    fullBtn.addEventListener('click', () => {
      showRescanConfirmationModal();
    });
  }

  if (thumbnailsBtn) {
    thumbnailsBtn.addEventListener('click', async () => {
      setScanButtonsDisabled(true);
      await apiPost('/api/admin/scan/thumbnails');
      startScanPolling();
    });
  }

  if (metadataBtn) {
    metadataBtn.addEventListener('click', async () => {
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
        apiPost('/api/admin/system/restart');
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
            }
          }, 2000);
        }, 3000);
      }
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to stop the current scan?')) {
        const result = await apiPost('/api/admin/scan/stop');
        if (result.error) {
          showToast(`Error: ${result.error}`, 'error');
        } else {
          showToast('Scan cancellation requested');
          stopBtn.disabled = true;
          stopBtn.textContent = 'Stopping...';
        }
      }
    });
  }
}

export function initScanStatus() {
  checkScanStatus(true);
}

export function startScanPolling() {
  if (scanPollingInterval) return;

  const statusPanel = document.getElementById('admin-scan-status');
  if (statusPanel) statusPanel.style.display = 'block';

  checkScanStatus();
  scanPollingInterval = setInterval(checkScanStatus, 3000);
}

export function stopScanPolling() {
  if (scanPollingInterval) {
    clearInterval(scanPollingInterval);
    scanPollingInterval = null;
  }
}

async function checkScanStatus(initial = false) {
  const status = await apiGet('/api/admin/scan/status');

  const statusPanel = document.getElementById('admin-scan-status');
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

    if (initial && !scanPollingInterval) {
      startScanPolling();
    }

    setScanButtonsDisabled(true);

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
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
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
