import { apiGet, apiPost, apiDelete } from '../api.js';
import { showToast } from '../utils.js';

let allAdminTags = [];
let allModifications = [];
let currentModTagNorm = null;

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

export function filterAdminTags(val) {
  renderAdminTags(val);
}

export function openTagModModal(norm, currentDisplay) {
  currentModTagNorm = norm;
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

  updateTagModUI();

  const modal = document.getElementById('tag-mod-modal');
  modal.style.display = 'flex';
  setTimeout(() => modal.classList.add('active'), 10);
}

export function updateTagModUI() {
  const action = document.getElementById('tag-mod-action').value;
  document.getElementById('tag-mod-rename-group').style.display = (action === 'rename') ? 'block' : 'none';
  document.getElementById('tag-mod-merge-group').style.display = (action === 'merge') ? 'block' : 'none';

  if (action === 'merge') {
    filterMergeTargets('');
  }
}

export function filterMergeTargets(val) {
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
  ).slice(0, 50);

  if (suggestions.length === 0) {
    resultsContainer.innerHTML = '<div class="admin-tag-suggestion-empty">No matching tags</div>';
  } else {
    resultsContainer.innerHTML = suggestions.map(tag => `
      <div data-action="select-merge-target" data-norm="${tag.norm}" data-display="${tag.display.replace(/'/g, "\\'")}" class="admin-tag-suggestion">
        <span class="admin-tag-suggestion-name">${tag.display}</span>
        <span class="admin-tag-suggestion-count">(${tag.count})</span>
      </div>
    `).join('');
  }
  resultsContainer.style.display = 'block';
}

export function selectMergeTarget(norm, display) {
  const input = document.getElementById('tag-mod-target');
  const resultsContainer = document.getElementById('tag-mod-target-results');
  const preview = document.getElementById('tag-mod-merge-preview');

  input.value = display;
  resultsContainer.style.display = 'none';
  preview.innerHTML = `Will merge <strong>${currentModTagNorm}</strong> into <strong>${norm}</strong> (${display})`;
}

export async function saveTagModification() {
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
    closeTagModModal();
    await loadAdminTags();
  } else {
    showToast(result.error || 'Failed to save modification', 'error');
  }
}

export function closeTagModModal() {
  const modal = document.getElementById('tag-mod-modal');
  modal.classList.remove('active');
  setTimeout(() => modal.style.display = 'none', 300);
}

export async function addWhitelistTag() {
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
}

export async function removeTagModification(norm) {
  const result = await apiDelete(`/api/admin/tags/modification/${norm}`);
  if (result.error) {
    showToast(result.error, 'error');
  } else {
    showToast('Modification removed');
    await loadAdminTags();
  }
}

export async function adminBlacklistTag(tag) {
  const result = await apiPost('/api/admin/tags/blacklist', { tag });
  if (result.error) {
    showToast(result.error, 'error');
  } else {
    showToast('Tag blacklisted');
    await loadAdminTags();
  }
}

function renderAdminTags(filter = '') {
  const activeList = document.getElementById('admin-active-tags-list');
  const modifiedList = document.getElementById('admin-modified-tags-list');
  if (!activeList || !modifiedList) return;

  const lowerFilter = filter.toLowerCase();
  const filteredTags = allAdminTags.filter(t =>
    !t.is_blacklisted &&
    (t.norm.includes(lowerFilter) || t.display.toLowerCase().includes(lowerFilter))
  );

  if (filteredTags.length === 0) {
    activeList.innerHTML = '<div class="admin-tag-list-empty">No active tags found.</div>';
  } else {
    activeList.innerHTML = filteredTags.map((tag, index) => `
      <div class="admin-tag-item ${index % 2 === 0 ? 'even-row' : 'odd-row'}" title="${tag.series_names.slice(0, 15).join(', ')}${tag.count > tag.series_names.length ? '...' : ''}">
        <div class="admin-tag-item-content">
          <span class="admin-tag-item-name">${tag.display}</span>
          <span class="admin-tag-item-count">(${tag.count})</span>
          ${tag.is_whitelisted ? '<span class="admin-tag-item-badge">Whitelist</span>' : ''}
        </div>
        <div class="admin-tag-item-actions">
          <button data-action="open-tag-mod-modal" data-norm="${tag.norm}" data-display="${tag.display.replace(/'/g, "\\'")}" class="btn-secondary admin-tag-btn-small" title="Modify Tag">modify</button>
          <button data-action="admin-blacklist-tag" data-tag="${tag.norm}" class="btn-secondary admin-tag-btn-small admin-tag-btn-danger" title="Blacklist Tag">blacklist</button>
        </div>
      </div>
    `).join('');
  }

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
            <button data-action="open-tag-mod-modal" data-norm="${mod.norm}" class="btn-secondary admin-tag-btn-tiny" title="Edit modification">edit</button>
            <button data-action="remove-tag-modification" data-norm="${mod.norm}" class="btn-secondary admin-tag-btn-tiny admin-tag-btn-success" title="Restore to default">restore</button>
          </div>
        </div>
      `;
    }).join('');
  }
}
