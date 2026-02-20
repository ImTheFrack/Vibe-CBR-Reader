import { apiGet, apiPut, apiPost } from '../api.js';
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

export async function loadNSFWConfig() {
  const container = document.getElementById('nsfw-config-content');
  if (!container) return;

  const data = await apiGet('/api/admin/nsfw-config');
  if (data.error) {
    container.innerHTML = `<p style="color: var(--danger);">Failed to load NSFW config: ${data.error}</p>`;
    return;
  }

  const { categories = [], subcategories = [], tag_patterns = [], available_categories = [], available_subcategories = [] } = data;

  const buildMultiSelect = (id, available, selected) => {
    const options = available
      .map(
        (val) =>
          `<option value="${val}"${selected.includes(val) ? ' selected' : ''}>${val}</option>`
      )
      .join('');
    return `<select id="${id}" multiple class="admin-select nsfw-multi-select" style="height: 140px; width: 100%;">${options}</select>`;
  };

  container.innerHTML = `
    <div class="admin-grid-2col" style="gap: 16px;">
      <div>
        <label class="admin-form-label">NSFW Categories</label>
        <p style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 6px;">Hold Ctrl/Cmd to select multiple</p>
        ${buildMultiSelect('nsfw-categories-select', available_categories, categories)}
      </div>
      <div>
        <label class="admin-form-label">NSFW Subcategories</label>
        <p style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 6px;">Hold Ctrl/Cmd to select multiple</p>
        ${buildMultiSelect('nsfw-subcategories-select', available_subcategories, subcategories)}
      </div>
      <div style="grid-column: 1 / -1;">
        <label class="admin-form-label">Tag Patterns (one per line)</label>
        <p style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 6px;">Series matching any of these tags will be flagged as NSFW</p>
        <textarea id="nsfw-tag-patterns-textarea" class="search-input" rows="8" style="width: 100%; resize: vertical; font-family: monospace; font-size: 0.85rem;">${tag_patterns.join('\n')}</textarea>
      </div>
    </div>
  `;
}

export async function saveNSFWConfig() {
  const categoriesEl = document.getElementById('nsfw-categories-select');
  const subcategoriesEl = document.getElementById('nsfw-subcategories-select');
  const tagPatternsEl = document.getElementById('nsfw-tag-patterns-textarea');

  if (!categoriesEl || !subcategoriesEl || !tagPatternsEl) {
    showToast('NSFW config form not loaded', 'error');
    return;
  }

  const categories = Array.from(categoriesEl.selectedOptions).map((o) => o.value);
  const subcategories = Array.from(subcategoriesEl.selectedOptions).map((o) => o.value);
  const tag_patterns = tagPatternsEl.value
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const result = await apiPut('/api/admin/nsfw-config', { categories, subcategories, tag_patterns });
  if (!result.error) {
    showToast('NSFW config saved successfully');
    await loadNSFWConfig();
  } else {
    showToast(`Error saving NSFW config: ${result.error}`, 'error');
  }
}

export async function loadDefaultNSFWTags() {
  const result = await apiPost('/api/admin/nsfw-config/load-defaults', {});
  if (!result.error) {
    showToast('Default NSFW tag patterns loaded');
    await loadNSFWConfig();
  } else {
    showToast(`Error loading defaults: ${result.error}`, 'error');
  }
}
