/**
 * Recipe Mixer Module
 * AI-powered comic recommendation system with 7-category attribute controls.
 */

import { apiPost, apiGet } from './api.js';
import { showToast } from './utils.js';
import { state } from './state.js';

// State for the recipe mixer
const mixerState = {
  baseSeriesIds: [],
  attributes: {
    narrative_structure: 0.5,
    character_archetypes: 0.5,
    world_building: 0.5,
    visual_identity: 0.5,
    emotional_resonance: 0.5,
    niche_tropes: 0.5,
    meta_data: 0.5
  },
  useWebSearch: false,
  isLoading: false,
  recommendations: []
};

// Category definitions with descriptions
const CATEGORIES = [
  {
    key: 'narrative_structure',
    name: 'Narrative Structure',
    description: 'Pacing, complexity, format',
    icon: '📖'
  },
  {
    key: 'character_archetypes',
    name: 'Character Archetypes',
    description: 'Alignment, dynamics, relationships',
    icon: '👥'
  },
  {
    key: 'world_building',
    name: 'World Building',
    description: 'Power system, stakes, era',
    icon: '🌍'
  },
  {
    key: 'visual_identity',
    name: 'Visual Identity',
    description: 'Art style, design, paneling',
    icon: '🎨'
  },
  {
    key: 'emotional_resonance',
    name: 'Emotional Resonance',
    description: 'Iyashikei, hype, drama, comedy',
    icon: '💫'
  },
  {
    key: 'niche_tropes',
    name: 'Niche Tropes',
    description: 'Professional, survival, time manipulation',
    icon: '⚡'
  },
  {
    key: 'meta_data',
    name: 'Meta-Data',
    description: 'Author, magazine, awards, status',
    icon: '📋'
  }
];

/**
 * Opens the Recipe Mixer modal
 * @param {Array} baseSeriesIds - Optional array of series IDs to pre-fill
 */
export function openRecipeMixerModal(baseSeriesIds = []) {
  const modal = document.getElementById('recipe-mixer-modal');
  if (!modal) return;

  // Update state if provided
  if (baseSeriesIds && Array.isArray(baseSeriesIds) && baseSeriesIds.length > 0) {
    mixerState.baseSeriesIds = baseSeriesIds;
  }

  renderMixerUI();
  initCategorySliders();
  renderSelectedBaseSeries();
  
  modal.style.display = 'flex';
  setTimeout(() => modal.classList.add('active'), 10);
  
  document.addEventListener('keydown', handleEscapeKey);
}

/**
 * Closes the Recipe Mixer modal
 */
export function closeRecipeMixerModal() {
  const modal = document.getElementById('recipe-mixer-modal');
  if (!modal) return;
  
  modal.classList.remove('active');
  setTimeout(() => {
    modal.style.display = 'none';
  }, 300);
  
  document.removeEventListener('keydown', handleEscapeKey);
}

function handleEscapeKey(e) {
  if (e.key === 'Escape') {
    // Check if add-to-list modal is open first
    const listModal = document.getElementById('recipe-add-to-list-modal');
    
    if (listModal && listModal.style.display === 'flex') {
      closeAddToListModal();
      return;
    }
    
    closeRecipeMixerModal();
  }
}

/**
 * Renders the complete mixer UI with 7 category cards
 */
export function renderMixerUI() {
  const container = document.getElementById('recipe-mixer-modal-body');
  if (!container) return;

  container.innerHTML = `
    <div class="recipe-mixer-layout">
      <!-- Base Series (from context) -->
      <div class="mixer-section base-series-section">
        <h3 class="mixer-section-title">Base Series</h3>
        <div id="selected-base-series" class="selected-series-chips">
          <span class="empty-hint">No base series from context - AI will use attribute weights only</span>
        </div>
      </div>

      <!-- Category Sliders -->
      <div class="mixer-section categories-section">
        <h3 class="mixer-section-title">Attribute Weights</h3>
        <p class="mixer-section-subtitle">Adjust sliders to emphasize what matters most to you</p>
        <div class="category-cards-grid">
          ${CATEGORIES.map(cat => createCategoryCard(cat)).join('')}
        </div>
      </div>

      <!-- Options Row -->
      <div class="mixer-section options-section">
        <div class="options-row">
          <label class="web-search-toggle">
            <input type="checkbox" id="web-search-checkbox" onchange="toggleWebSearch()" ${mixerState.useWebSearch ? 'checked' : ''}>
            <span class="toggle-slider"></span>
            <span class="toggle-label">
              <span>🌐</span> Enable Web Search
            </span>
          </label>
          <button class="btn-primary btn-large" onclick="getRecommendations()" id="get-recommendations-btn">
            <span>🎯</span> Get Recommendations
          </button>
        </div>
      </div>

      <!-- Results Section -->
      <div class="mixer-section results-section" id="results-section" style="display: none;">
        <div class="section-header-row">
          <h3 class="mixer-section-title">Recommendations</h3>
          <span id="results-count" class="results-count"></span>
        </div>
        <div id="recommendations-grid" class="recommendations-grid">
          <!-- Results rendered here -->
        </div>
      </div>
    </div>

    <!-- Add to List Modal -->
    <div id="recipe-add-to-list-modal" class="modal-overlay" style="display: none; z-index: 10010;">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Add to List</h3>
          <button class="modal-close" onclick="closeAddToListModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div id="user-lists-container" class="user-lists-list">
            <div class="loading">Loading your lists...</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeAddToListModal()">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Creates a single category card HTML
 */
function createCategoryCard(category) {
  const value = mixerState.attributes[category.key];
  const percentage = Math.round(value * 100);

  return `
    <div class="category-card" data-category="${category.key}">
      <div class="category-header">
        <span class="category-icon">${category.icon}</span>
        <div class="category-info">
          <h4 class="category-name">${category.name}</h4>
          <p class="category-description">${category.description}</p>
        </div>
      </div>
      <div class="category-slider-wrapper">
        <input type="range" 
               class="category-slider" 
               id="slider-${category.key}"
               min="0" 
               max="1" 
               step="0.05" 
               value="${value}"
               data-category="${category.key}">
        <div class="slider-labels">
          <span>Ignore</span>
          <span class="slider-value" id="value-${category.key}">${percentage}%</span>
          <span>Essential</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Initializes all category sliders with event listeners
 */
export function initCategorySliders() {
  CATEGORIES.forEach(category => {
    const slider = document.getElementById(`slider-${category.key}`);
    const valueDisplay = document.getElementById(`value-${category.key}`);

    if (slider && valueDisplay) {
      slider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        mixerState.attributes[category.key] = value;
        valueDisplay.textContent = `${Math.round(value * 100)}%`;
      });
    }
  });
}

/**
 * Renders selected base series chips (from context)
 */
function renderSelectedBaseSeries() {
  const container = document.getElementById('selected-base-series');
  if (!container) return;

  if (mixerState.baseSeriesIds.length === 0) {
    container.innerHTML = '<span class="empty-hint">No base series from context - AI will use attribute weights only</span>';
    return;
  }

  const seriesNames = mixerState.baseSeriesIds.map(id => {
    if (state.comics && state.comics.length > 0) {
      const comic = state.comics.find(c => c.series_id == id);
      if (comic) return comic.series;
    }
    return `Series ${id}`;
  });

  const maxDisplay = 3;
  let displayText = '';
  
  if (seriesNames.length <= maxDisplay) {
    displayText = seriesNames.join(', ');
  } else {
    const displayed = seriesNames.slice(0, maxDisplay).join(', ');
    const remaining = seriesNames.length - maxDisplay;
    displayText = `${displayed}, and ${remaining} others`;
  }

  container.innerHTML = `
    <div class="series-chip">
      <span>Series: ${displayText}</span>
    </div>
  `;
}

/**
 * Toggles web search enabled state
 */
export function toggleWebSearch() {
  const checkbox = document.getElementById('web-search-checkbox');
  if (checkbox) {
    mixerState.useWebSearch = checkbox.checked;
  }
}

/**
 * Calls the AI recommendations API
 */
export async function getRecommendations() {
  if (mixerState.isLoading) return;

  const btn = document.getElementById('get-recommendations-btn');
  const resultsSection = document.getElementById('results-section');
  const grid = document.getElementById('recommendations-grid');

  mixerState.isLoading = true;

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-small"></span> Getting recommendations...';
  }

  if (resultsSection) {
    resultsSection.style.display = 'block';
  }

  if (grid) {
    grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>AI is cooking up recommendations...</p></div>';
  }

  try {
    const response = await apiPost('/api/ai/recommendations', {
      series_ids: mixerState.baseSeriesIds,
      attributes: mixerState.attributes,
      use_web_search: mixerState.useWebSearch
    });

    if (response.error) {
      throw new Error(response.error);
    }

    mixerState.recommendations = response.recommendations || [];
    renderRecommendations(mixerState.recommendations);

    if (response.cached) {
      showToast('Showing cached recommendations', 'info');
    }
  } catch (error) {
    console.error('Error getting recommendations:', error);

    if (grid) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <div class="empty-title">Failed to get recommendations</div>
          <div class="empty-subtitle">${error.message || 'Please try again later'}</div>
        </div>
      `;
    }

    showToast('Failed to get recommendations: ' + error.message, 'error');
  } finally {
    mixerState.isLoading = false;

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>🎯</span> Get Recommendations';
    }
  }
}

/**
 * Renders recommendation results in a grid
 */
export function renderRecommendations(results) {
  const grid = document.getElementById('recommendations-grid');
  const countEl = document.getElementById('results-count');

  if (!grid) return;

  if (countEl) {
    countEl.textContent = `${results.length} result${results.length !== 1 ? 's' : ''}`;
  }

  if (!results || results.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">No recommendations found</div>
        <div class="empty-subtitle">Try adjusting your attribute weights or selecting different base series</div>
      </div>
    `;
    return;
  }

  grid.innerHTML = results.map((rec, index) => createRecommendationCard(rec, index)).join('');
}

/**
 * Creates a single recommendation card HTML
 */
function createRecommendationCard(rec, index) {
  const coverUrl = rec.cover_comic_id ? `/api/cover/${rec.cover_comic_id}` : '/static/placeholder-cover.png';
  const matchScore = rec.match_score ? Math.round(rec.match_score * 100) : 0;
  const reasons = rec.match_reasons || [];

  return `
    <div class="recommendation-card" style="animation-delay: ${index * 0.05}s">
      <div class="rec-card-cover">
        <img src="${coverUrl}" alt="${rec.title}" loading="lazy">
        <div class="rec-match-badge">${matchScore}% match</div>
      </div>
      <div class="rec-card-info">
        <h4 class="rec-title">${rec.title}</h4>
        <p class="rec-synopsis">${rec.synopsis || 'No synopsis available'}</p>
        ${reasons.length > 0 ? `
          <div class="rec-reasons">
            ${reasons.map(r => `<span class="rec-reason-tag">${r}</span>`).join('')}
          </div>
        ` : ''}
        <div class="rec-actions">
          <button class="btn-primary btn-small" onclick="handleAddToList('${rec.series_id}')">
            <span>➕</span> Add to List
          </button>
          <button class="btn-secondary btn-small" onclick="viewSeries('${rec.series_name}')">
            <span>👁️</span> View
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Handles adding a recommendation to a list
 */
export async function handleAddToList(seriesId) {
  window._seriesToAdd = seriesId;

  const modal = document.getElementById('recipe-add-to-list-modal');
  const container = document.getElementById('user-lists-container');

  if (!modal || !container) return;

  modal.style.display = 'flex';
  container.innerHTML = '<div class="loading">Loading your lists...</div>';

  try {
    const response = await apiGet('/api/lists');
    if (response.error) {
      throw new Error(response.error);
    }

    const lists = response.lists || [];
    renderUserLists(lists);
  } catch (error) {
    console.error('Error loading lists:', error);
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <div class="empty-title">Failed to load lists</div>
      </div>
    `;
  }
}

/**
 * Renders user's lists in the add-to-list modal
 */
function renderUserLists(lists) {
  const container = document.getElementById('user-lists-container');
  if (!container) return;

  if (lists.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">No lists yet</div>
        <div class="empty-subtitle">Create a list first to add series</div>
      </div>
    `;
    return;
  }

  container.innerHTML = lists.map(list => `
    <div class="user-list-item" onclick="addSeriesToList('${list.id}')">
      <div class="list-item-icon">📋</div>
      <div class="list-item-info">
        <div class="list-item-name">${list.name}</div>
        <div class="list-item-meta">${list.item_count || 0} items</div>
      </div>
      <button class="list-item-add-btn">➕</button>
    </div>
  `).join('');
}

/**
 * Adds the selected series to a specific list
 */
export async function addSeriesToList(listId) {
  const seriesId = window._seriesToAdd;
  if (!seriesId) return;

  try {
    const response = await apiPost(`/api/lists/${listId}/items`, {
      series_id: seriesId
    });

    if (response.error) {
      throw new Error(response.error);
    }

    showToast('Added to list successfully');
    closeAddToListModal();
  } catch (error) {
    console.error('Error adding to list:', error);
    showToast('Failed to add to list: ' + error.message, 'error');
  }
}

/**
 * Closes the add-to-list modal
 */
export function closeAddToListModal() {
  const modal = document.getElementById('recipe-add-to-list-modal');
  if (modal) modal.style.display = 'none';
  window._seriesToAdd = null;
}

/**
 * Navigates to a series detail view
 */
function viewSeries(seriesName) {
  if (window.routerNavigate) {
    window.routerNavigate('series', { name: seriesName });
  } else {
    console.error('No navigation method available');
  }
}

// Export all functions to window for HTML onclick handlers
window.openRecipeMixerModal = openRecipeMixerModal;
window.closeRecipeMixerModal = closeRecipeMixerModal;
window.renderMixerUI = renderMixerUI;
window.initCategorySliders = initCategorySliders;
window.toggleWebSearch = toggleWebSearch;
window.getRecommendations = getRecommendations;
window.renderRecommendations = renderRecommendations;
window.handleAddToList = handleAddToList;
window.addSeriesToList = addSeriesToList;
window.closeAddToListModal = closeAddToListModal;
