import { apiGet, apiPut } from '../api.js';
import { showToast } from '../utils.js';

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

  if (qualitySlider && formatSelect) {
    qualitySlider.disabled = formatSelect.value === 'png';
  }

  const totalSeriesEl = document.getElementById('library-total-series');
  const totalComicsEl = document.getElementById('library-total-comics');
  if (totalSeriesEl) totalSeriesEl.textContent = settings.total_series || 0;
  if (totalComicsEl) totalComicsEl.textContent = settings.total_comics || 0;
}

export async function loadApprovalSetting() {
  const settings = await apiGet('/api/admin/settings');
  if (!settings.error) {
    const toggle = document.getElementById('toggle-require-approval');
    if (toggle) {
      toggle.checked = settings.require_approval === 1;
    }
  }
}

export function setupApprovalToggle() {
  const toggle = document.getElementById('toggle-require-approval');
  if (toggle) {
    toggle.addEventListener('change', async (e) => {
      const result = await apiPut('/api/admin/settings', {
        require_approval: e.target.checked ? 1 : 0
      });
      if (result.error) {
        showToast(`Error: ${result.error}`, 'error');
        e.target.checked = !e.target.checked;
      } else {
        showToast(`Approval requirement ${e.target.checked ? 'enabled' : 'disabled'}`);
      }
    });
  }
}

export function setupThumbnailSettings() {
  const formatSelect = document.getElementById('thumb-format-select');
  const qualitySlider = document.getElementById('thumb-quality-slider');
  const qualityValue = document.getElementById('thumb-quality-value');
  const ratioSelect = document.getElementById('thumb-ratio-select');
  const widthSlider = document.getElementById('thumb-width-slider');
  const widthValue = document.getElementById('thumb-width-value');
  const saveBtn = document.getElementById('thumb-save-btn');

  if (formatSelect && qualitySlider) {
    formatSelect.addEventListener('change', () => {
      qualitySlider.disabled = formatSelect.value === 'png';
    });
  }

  if (qualitySlider && qualityValue) {
    qualitySlider.addEventListener('input', () => {
      qualityValue.textContent = qualitySlider.value;
    });
  }

  if (widthSlider && widthValue) {
    widthSlider.addEventListener('input', () => {
      widthValue.textContent = widthSlider.value;
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const settings = {
        thumb_format: formatSelect?.value || 'webp',
        thumb_quality: parseInt(qualitySlider?.value || 70),
        thumb_ratio: ratioSelect?.value || '9:14',
        thumb_width: parseInt(widthSlider?.value || 225),
        thumb_height: Math.round(parseInt(widthSlider?.value || 225) * 14 / 9)
      };

      const result = await apiPut('/api/admin/settings', settings);
      if (!result.error) {
        showToast('Settings saved successfully');
      } else {
        showToast('Error saving settings', 'error');
      }
    });
  }
}
