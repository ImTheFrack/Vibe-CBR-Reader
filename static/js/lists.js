/**
 * Lists Module
 * Handles loading and rendering of user lists and list details.
 */

import { apiGet, apiPost, apiDelete } from './api.js';
import { state } from './state.js';
import { showToast } from './utils.js';

/**
 * Main entry point for Lists view
 * Fetches user's lists from API and renders the grid
 */
export async function loadListsView() {
  const grid = document.getElementById('lists-grid');
  if (grid) {
    grid.innerHTML = '<div class="loading-state">Loading...</div>';
  }

  try {
    const data = await apiGet('/api/lists');

    if (data.error) {
      console.error('Failed to load lists:', data.error);
      if (grid) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Failed to load lists</div></div>';
      }
      return;
    }

    const lists = Array.isArray(data) ? data : data.items || [];
    state.lists = lists;
    renderListsGrid(lists);
  } catch (error) {
    console.error('Error loading lists:', error);
    if (grid) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Failed to load lists</div></div>';
    }
    showToast('Failed to load lists', 'error');
  }
}

/**
 * Renders the grid of list cards
 * @param {Array} lists - Array of list objects
 */
export function renderListsGrid(lists) {
  const grid = document.getElementById('lists-grid');
  if (!grid) return;

  if (!lists || lists.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">No lists yet</div>
        <div class="empty-subtitle">Create your first list to organize your comics</div>
        <button class="btn-primary" onclick="showCreateListModal()" style="margin-top: 16px;">
          <span>➕</span> Create List
        </button>
      </div>
    `;
    return;
  }

  const createButtonHtml = `
    <div class="list-card create-list-card" onclick="showCreateListModal()">
      <div class="list-card-cover create-list-cover">
        <span class="create-list-icon">➕</span>
      </div>
      <div class="list-card-info">
        <div class="list-card-title">Create New List</div>
        <div class="list-card-meta">Add a new collection</div>
      </div>
    </div>
  `;

  const listsHtml = lists.map(list => createListCard(list)).join('');
  grid.innerHTML = createButtonHtml + listsHtml;

  // Attach click handlers to list cards
  grid.querySelectorAll('.list-card:not(.create-list-card)').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't navigate if clicking delete button
      if (e.target.closest('.list-card-delete')) return;
      const listId = card.dataset.listId;
      if (listId) {
        loadListDetail(listId);
      }
    });
  });
}

/**
 * Creates a single list card HTML
 * @param {Object} list - List data object
 * @returns {string} HTML string for the card
 */
export function createListCard(list) {
  const title = list.name || 'Untitled List';
  const description = list.description || '';
  const itemCount = list.item_count || 0;
  const isPublic = list.is_public || false;
  const privacyBadge = isPublic
    ? '<span class="privacy-badge public">🌐 Public</span>'
    : '<span class="privacy-badge private">🔒 Private</span>';

  // Use first series cover if available, otherwise placeholder
  const coverUrl = list.first_cover_id
    ? `/api/cover/${list.first_cover_id}`
    : '';
  const coverHtml = coverUrl
    ? `<img src="${coverUrl}" alt="${title}" loading="lazy">`
    : '<div class="list-card-placeholder">📋</div>';

  return `
    <div class="list-card" data-list-id="${list.id}">
      <div class="list-card-cover">
        ${coverHtml}
        ${privacyBadge}
        <button class="list-card-delete" onclick="handleDeleteList('${list.id}')" title="Delete list">
          <span>🗑️</span>
        </button>
      </div>
      <div class="list-card-info">
        <div class="list-card-title">${title}</div>
        ${description ? `<div class="list-card-description">${description}</div>` : ''}
        <div class="list-card-meta">${itemCount} series</div>
      </div>
    </div>
  `;
}

/**
 * Shows the create list modal
 */
export function showCreateListModal() {
  // Remove existing modal if present
  const existingModal = document.getElementById('create-list-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const modalHtml = `
    <div id="create-list-modal" class="modal-overlay active" onclick="closeCreateListModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3>📋 Create New List</h3>
          <button class="modal-close" onclick="closeCreateListModal()">&times;</button>
        </div>
        <form id="create-list-form" onsubmit="handleCreateListSubmit(event)">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">List Name *</label>
              <input type="text" id="list-name-input" class="form-input" required
                placeholder="e.g., My Favorite Shonen" maxlength="100">
            </div>
            <div class="form-group">
              <label class="form-label">Description</label>
              <textarea id="list-description-input" class="form-input" rows="3"
                placeholder="Optional description..."></textarea>
            </div>
            <div class="form-group">
              <label class="form-checkbox">
                <input type="checkbox" id="list-public-input">
                <span>Make this list public</span>
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-secondary" onclick="closeCreateListModal()">Cancel</button>
            <button type="submit" class="btn-primary">Create List</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // Focus the name input
  setTimeout(() => {
    const nameInput = document.getElementById('list-name-input');
    if (nameInput) nameInput.focus();
  }, 100);
}

/**
 * Closes the create list modal
 * @param {Event} event - Click event (optional)
 */
export function closeCreateListModal(event) {
  // If event provided, only close if clicking overlay (not content)
  if (event && event.target !== event.currentTarget) return;

  const modal = document.getElementById('create-list-modal');
  if (modal) {
    modal.remove();
  }
}

/**
 * Handles create list form submission
 * @param {Event} event - Form submit event
 */
export async function handleCreateListSubmit(event) {
  event.preventDefault();

  const nameInput = document.getElementById('list-name-input');
  const descriptionInput = document.getElementById('list-description-input');
  const publicInput = document.getElementById('list-public-input');

  const name = nameInput?.value?.trim();
  if (!name) {
    showToast('List name is required', 'error');
    return;
  }

  const data = {
    name: name,
    description: descriptionInput?.value?.trim() || '',
    is_public: publicInput?.checked || false
  };

  try {
    const result = await apiPost('/api/lists', data);

    if (result.error) {
      console.error('Failed to create list:', result.error);
      showToast(`Failed to create list: ${result.error}`, 'error');
      return;
    }

    showToast('List created successfully');
    closeCreateListModal();

    // Refresh the lists view
    await loadListsView();
  } catch (error) {
    console.error('Error creating list:', error);
    showToast('Failed to create list', 'error');
  }
}

/**
 * Loads and displays list detail view
 * @param {string} listId - The list ID to load
 */
export async function loadListDetail(listId) {
  state.currentList = listId;

  // Show the detail view
  document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
  const detailView = document.getElementById('view-list-detail');
  if (detailView) {
    detailView.classList.add('active');
  }

  const grid = document.getElementById('list-detail-grid');
  const titleEl = document.getElementById('list-detail-title');
  const subtitleEl = document.getElementById('list-detail-subtitle');

  if (grid) {
    grid.innerHTML = '<div class="loading-state">Loading...</div>';
  }

  try {
    const data = await apiGet(`/api/lists/${listId}`);

    if (data.error) {
      console.error('Failed to load list detail:', data.error);
      if (grid) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Failed to load list</div></div>';
      }
      return;
    }

    // Update header
    if (titleEl) titleEl.textContent = data.name || 'Untitled List';
    if (subtitleEl) {
      const itemCount = data.items?.length || 0;
      const privacyText = data.is_public ? '🌐 Public' : '🔒 Private';
      subtitleEl.textContent = `${itemCount} series • ${privacyText}`;
    }

    renderListDetail(data);
  } catch (error) {
    console.error('Error loading list detail:', error);
    if (grid) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Failed to load list</div></div>';
    }
    showToast('Failed to load list details', 'error');
  }
}

/**
 * Renders the list detail view with series items
 * @param {Object} list - List data with items array
 */
export function renderListDetail(list) {
  const grid = document.getElementById('list-detail-grid');
  if (!grid) return;

  const items = list.items || [];

  if (items.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">This list is empty</div>
        <div class="empty-subtitle">Add series to this list from the library</div>
      </div>
    `;
    return;
  }

  grid.innerHTML = items.map(item => createListItemCard(item, list.id)).join('');

  // Attach click handlers
  grid.querySelectorAll('.list-item-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't navigate if clicking remove button
      if (e.target.closest('.list-item-remove')) return;
      const seriesName = card.dataset.seriesName;
      if (seriesName && window.routerNavigate) {
        window.routerNavigate('series', { name: seriesName });
      }
    });
  });
}

/**
 * Creates a card for a series in a list
 * @param {Object} item - Series item data
 * @param {string} listId - Parent list ID
 * @returns {string} HTML string for the card
 */
function createListItemCard(item, listId) {
  const seriesName = item.series_name || 'Unknown Series';
  const coverUrl = item.cover_comic_id
    ? `/api/cover/${item.cover_comic_id}`
    : '';
  const coverHtml = coverUrl
    ? `<img src="${coverUrl}" alt="${seriesName}" loading="lazy">`
    : '<div class="list-item-placeholder">📚</div>';

  return `
    <div class="list-item-card" data-series-name="${seriesName}">
      <div class="list-item-cover">
        ${coverHtml}
        <button class="list-item-remove" onclick="handleRemoveFromList('${listId}', '${item.series_id}')" title="Remove from list">
          <span>✕</span>
        </button>
      </div>
      <div class="list-item-info">
        <div class="list-item-title">${seriesName}</div>
      </div>
    </div>
  `;
}

/**
 * Handles removing a series from a list
 * @param {string} listId - List ID
 * @param {string} seriesId - Series ID to remove
 */
export async function handleRemoveFromList(listId, seriesId) {
  if (!confirm('Remove this series from the list?')) return;

  try {
    const result = await apiDelete(`/api/lists/${listId}/items/${seriesId}`);

    if (result.error) {
      console.error('Failed to remove from list:', result.error);
      showToast(`Failed to remove: ${result.error}`, 'error');
      return;
    }

    showToast('Series removed from list');

    // Refresh the detail view
    await loadListDetail(listId);
  } catch (error) {
    console.error('Error removing from list:', error);
    showToast('Failed to remove series', 'error');
  }
}

/**
 * Handles deleting a list
 * @param {string} listId - List ID to delete
 */
export async function handleDeleteList(listId) {
  if (!confirm('Are you sure you want to delete this list? This action cannot be undone.')) return;

  try {
    const result = await apiDelete(`/api/lists/${listId}`);

    if (result.error) {
      console.error('Failed to delete list:', result.error);
      showToast(`Failed to delete: ${result.error}`, 'error');
      return;
    }

    showToast('List deleted successfully');

    // If we're on the detail view, go back to lists
    const detailView = document.getElementById('view-list-detail');
    if (detailView && detailView.classList.contains('active')) {
      if (window.routerNavigate) {
        window.routerNavigate('lists', {});
      } else {
        await loadListsView();
      }
    } else {
      // Refresh the lists view
      await loadListsView();
    }
  } catch (error) {
    console.error('Error deleting list:', error);
    showToast('Failed to delete list', 'error');
  }
}

// Export all public functions to window for HTML onclick handlers
window.loadListsView = loadListsView;
window.renderListsGrid = renderListsGrid;
window.createListCard = createListCard;
window.showCreateListModal = showCreateListModal;
window.closeCreateListModal = closeCreateListModal;
window.handleCreateListSubmit = handleCreateListSubmit;
window.loadListDetail = loadListDetail;
window.renderListDetail = renderListDetail;
window.handleRemoveFromList = handleRemoveFromList;
window.handleDeleteList = handleDeleteList;
