import { apiGet } from '../api.js';

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

  let html = '<div class="admin-gaps-grid">';

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
