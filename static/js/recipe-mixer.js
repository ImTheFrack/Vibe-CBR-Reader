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
  ignoreCache: false,
  useCustomWeights: false,
  customRequest: '',
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
      closeRecipeAddToListModal();
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
        <div class="section-header-collapsible">
          <label class="web-search-toggle" style="margin: 0;">
            <input type="checkbox" id="custom-weights-checkbox" onchange="toggleCustomWeights()" ${mixerState.useCustomWeights ? 'checked' : ''}>
            <span class="toggle-slider"></span>
            <span class="toggle-label">
              <span>⚖️</span> Custom Attribute Weights
            </span>
          </label>
        </div>
        <div id="attribute-weights-content" style="display: ${mixerState.useCustomWeights ? 'block' : 'none'};">
          <p class="mixer-section-subtitle">Adjust sliders to emphasize what matters most to you</p>
          <div class="category-cards-grid">
            ${CATEGORIES.map(cat => createCategoryCard(cat)).join('')}
          </div>
        </div>
      </div>

      <!-- Custom Request -->
      <div class="mixer-section">
        <label class="mixer-section-subtitle" for="custom-request-input" style="display: block; margin-bottom: 6px;">
          Custom Instructions <span style="color: var(--text-tertiary); font-weight: normal;">(optional — overrides default request prompt)</span>
        </label>
        <textarea id="custom-request-input" class="custom-request-textarea" rows="3"
          placeholder="e.g. Only recommend completed series with at least 10 volumes. Avoid anything with heavy fan-service."
          oninput="updateCustomRequest()">${mixerState.customRequest || ''}</textarea>
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
          <label class="web-search-toggle">
            <input type="checkbox" id="ignore-cache-checkbox" onchange="toggleIgnoreCache()" ${mixerState.ignoreCache ? 'checked' : ''}>
            <span class="toggle-slider"></span>
            <span class="toggle-label">
              <span>🔄</span> Ignore Cache
            </span>
          </label>
          <button class="btn-primary btn-large" onclick="getRecommendations()" id="get-recommendations-btn">
            <span>🎯</span> Get Recommendations
          </button>
        </div>
      </div>

      <!-- AI Prompt/Response Debug Section -->
      <div class="mixer-section debug-section" id="debug-section" style="display: none;">
        <div class="section-header-collapsible" onclick="toggleDebugSection()">
          <h3 class="mixer-section-title">🐛 AI Prompt & Response</h3>
          <span class="collapse-icon" id="debug-section-icon">▶</span>
        </div>
        <div id="debug-section-content" style="display: none;">
          <div class="debug-panel">
            <div class="debug-subpanel">
              <h4>System Prompt</h4>
              <pre id="ai-system-prompt-display" class="debug-content">Waiting for request...</pre>
            </div>
            <div class="debug-subpanel">
              <h4>User Prompt</h4>
              <pre id="ai-user-prompt-display" class="debug-content">Waiting for request...</pre>
            </div>
            <div class="debug-subpanel">
              <h4>Response</h4>
              <pre id="ai-response-display" class="debug-content">No response yet...</pre>
            </div>
          </div>
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
          <button class="modal-close" onclick="closeRecipeAddToListModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div id="user-lists-container" class="user-lists-list">
            <div class="loading">Loading your lists...</div>
          </div>
          <div id="recipe-create-list-section" style="display: none; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.85rem; color: var(--text-tertiary);">CREATE NEW LIST</label>
            <input type="text" id="recipe-new-list-name" class="search-input" style="width: 100%; margin-bottom: 0.75rem;" placeholder="List name">
            <input type="text" id="recipe-new-list-description" class="search-input" style="width: 100%; margin-bottom: 0.75rem;" placeholder="Description (optional)">
            <button class="btn-primary" style="width: 100%;" onclick="handleRecipeCreateListAndAdd()">Create & Add</button>
          </div>
        </div>
        <div class="modal-footer" style="display: flex; gap: 0.75rem;">
          <button class="btn-secondary" onclick="closeRecipeAddToListModal()" style="flex: 1;">Cancel</button>
          <button class="btn-text" onclick="toggleRecipeCreateList()" style="font-size: 0.85rem; color: var(--accent);">+ Create new list</button>
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

export function toggleAttributeWeights() {
  const content = document.getElementById('attribute-weights-content');
  if (content) {
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
  }
}

export function toggleCustomWeights() {
  const checkbox = document.getElementById('custom-weights-checkbox');
  if (checkbox) {
    mixerState.useCustomWeights = checkbox.checked;
    const content = document.getElementById('attribute-weights-content');
    if (content) {
      content.style.display = checkbox.checked ? 'block' : 'none';
    }
  }
}

export function toggleDebugSection() {
  const content = document.getElementById('debug-section-content');
  const icon = document.getElementById('debug-section-icon');
  if (content && icon) {
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    icon.textContent = isHidden ? '▼' : '▶';
  }
}

export function showDebugSection() {
  const section = document.getElementById('debug-section');
  if (section) section.style.display = 'block';
}

export function hideDebugSection() {
  const section = document.getElementById('debug-section');
  if (section) section.style.display = 'none';
}

export function updateDebugPrompt(systemPrompt, userPrompt) {
  const systemDisplay = document.getElementById('ai-system-prompt-display');
  const userDisplay = document.getElementById('ai-user-prompt-display');
  if (systemDisplay) systemDisplay.textContent = systemPrompt || 'Not available';
  if (userDisplay) userDisplay.textContent = userPrompt || 'Not available';
}

export function updateDebugResponse(response) {
  const display = document.getElementById('ai-response-display');
  if (display) display.textContent = response;
}

export function updateCustomRequest() {
  const textarea = document.getElementById('custom-request-input');
  if (textarea) {
    mixerState.customRequest = textarea.value;
  }
}

export function toggleWebSearch() {
  const checkbox = document.getElementById('web-search-checkbox');
  if (checkbox) {
    mixerState.useWebSearch = checkbox.checked;
  }
}

export function toggleIgnoreCache() {
  const checkbox = document.getElementById('ignore-cache-checkbox');
  if (checkbox) {
    mixerState.ignoreCache = checkbox.checked;
  }
}

function buildAIPrompt() {
  const seriesNames = mixerState.baseSeriesIds.map(id => {
    if (state.comics && state.comics.length > 0) {
      const comic = state.comics.find(c => c.series_id == id);
      if (comic) return comic.series;
    }
    return `Series ${id}`;
  });
  
  const activeAttributes = Object.entries(mixerState.attributes)
    .filter(([key, value]) => value > 0)
    .map(([key, value]) => {
      const cat = CATEGORIES.find(c => c.key === key);
      return `${cat ? cat.name : key}: ${Math.round(value * 100)}%`;
    });
  
  let prompt = 'Recommend manga similar to';
  if (seriesNames.length > 0) {
    prompt += `: ${seriesNames.join(', ')}`;
  }
  
  if (activeAttributes.length > 0) {
    prompt += `\n\nAttribute weights:\n${activeAttributes.join('\n')}`;
  }
  
  if (mixerState.useWebSearch) {
    prompt += '\n\n(Web search enabled)';
  }
  
  return prompt;
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
    btn.innerHTML = '<span class="spinner-small"></span> Starting...';
  }

  if (resultsSection) {
    resultsSection.style.display = 'block';
  }

  if (grid) {
    grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p id="rec-loading-msg">Contacting AI...</p></div>';
  }

  showDebugSection();
  updateDebugPrompt('Sending request to AI...');
  updateDebugResponse('Waiting for response...');

  try {
    // 1. Start the job
    const startResponse = await apiPost('/api/ai/recommendations', {
      series_ids: mixerState.baseSeriesIds,
      attributes: mixerState.useCustomWeights ? mixerState.attributes : {},
      use_web_search: mixerState.useWebSearch,
      ignore_cache: mixerState.ignoreCache || false,
      custom_request: mixerState.customRequest || ''
    });

    if (startResponse.error) {
      throw new Error(startResponse.error);
    }

    const jobId = startResponse.job_id;
    let jobStatus = 'pending';
    let result = null;

    // 2. Poll for status
    while (jobStatus === 'pending' || jobStatus === 'processing') {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s
      
      const statusResponse = await apiGet(`/api/ai/recommendations/status/${jobId}`);
      if (statusResponse.error) {
        throw new Error(`Status check failed: ${statusResponse.error}`);
      }
      
      jobStatus = statusResponse.status;
      
      // Update UI with progress message
      const msgEl = document.getElementById('rec-loading-msg');
      if (msgEl && statusResponse.progress_message) {
        msgEl.textContent = statusResponse.progress_message;
      }
      
      if (jobStatus === 'completed') {
        result = statusResponse.result;
      } else if (jobStatus === 'failed') {
        throw new Error(statusResponse.error || 'AI Job failed');
      }
    }

    // 3. Process Result
    if (!result) throw new Error('Job completed but no result returned');

    updateDebugPrompt(result.system_prompt, result.prompt);
    updateDebugResponse(JSON.stringify(result.recommendations, null, 2));

    mixerState.recommendations = result.recommendations || [];
    renderRecommendations(mixerState.recommendations);

    if (result.cached) {
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

  const batchBar = `
    <div class="rec-batch-bar">
      <label class="rec-select-all-label">
        <input type="checkbox" id="rec-select-all" onchange="toggleSelectAllRecs()"> Select All
      </label>
      <button class="btn-primary btn-small" onclick="handleBatchAddToList()">
        <span>➕</span> Add Selected to List
      </button>
    </div>
  `;

  grid.innerHTML = batchBar + results.map((rec, index) => createRecommendationCard(rec, index)).join('');
}

/**
 * Creates a single recommendation card HTML
 */
function createRecommendationCard(rec, index) {
  const matchScore = rec.match_score ? Math.round(rec.match_score) : 0;
  const description = rec.why || rec.reason || rec.synopsis || 'No description available';
  const inLibrary = rec.in_library === true;
  const hasMultiple = rec.in_library === 'multiple';
  const escapedTitle = (rec.series_name || rec.title || '').replace(/'/g, "\\'");

  const notInLibrarySvg = `<svg viewBox="0 0 120 180" xmlns="http://www.w3.org/2000/svg" class="rec-no-match-svg">
    <rect width="120" height="180" fill="var(--bg-tertiary)"/>
    <rect x="4" y="4" width="112" height="172" rx="4" fill="none" stroke="var(--border-color)" stroke-width="1" stroke-dasharray="4 2"/>
    <text x="60" y="80" text-anchor="middle" font-size="11" fill="var(--text-tertiary)" font-family="system-ui">Not in</text>
    <text x="60" y="96" text-anchor="middle" font-size="11" fill="var(--text-tertiary)" font-family="system-ui">Library</text>
    <text x="60" y="120" text-anchor="middle" font-size="24">📖</text>
  </svg>`;

  const multiMatchSvg = `<svg viewBox="0 0 120 180" xmlns="http://www.w3.org/2000/svg" class="rec-no-match-svg">
    <rect width="120" height="180" fill="var(--bg-tertiary)"/>
    <rect x="4" y="4" width="112" height="172" rx="4" fill="none" stroke="var(--accent-secondary, #f59e0b)" stroke-width="1.5" stroke-dasharray="4 2"/>
    <text x="60" y="72" text-anchor="middle" font-size="11" fill="var(--text-secondary)" font-family="system-ui">Make a</text>
    <text x="60" y="88" text-anchor="middle" font-size="11" fill="var(--text-secondary)" font-family="system-ui">Selection</text>
    <text x="60" y="118" text-anchor="middle" font-size="28">?</text>
  </svg>`;

  let coverHtml;
  if (rec.cover_comic_id) {
    coverHtml = `<img src="/api/cover/${rec.cover_comic_id}" alt="${rec.title}" loading="lazy">`;
  } else if (hasMultiple) {
    coverHtml = multiMatchSvg;
  } else {
    coverHtml = notInLibrarySvg;
  }

  const canSelect = inLibrary && rec.series_id;
  const checkboxHtml = canSelect
    ? `<input type="checkbox" class="rec-checkbox" data-series-id="${rec.series_id}" onchange="updateBatchCount()">`
    : '';

  let actionsHtml;
  if (inLibrary) {
    actionsHtml = `
      <button class="btn-secondary btn-small" onclick="viewSeriesNewTab('${escapedTitle}')">
        <span>👁️</span> View
      </button>
    `;
  } else if (hasMultiple) {
    const matches = rec.library_matches || [];
    actionsHtml = `
      <div class="rec-multi-match">
        <span class="rec-multi-label">${matches.length} matches found — pick one:</span>
        <div class="rec-match-options">
          ${matches.map(m => {
            const eName = (m.name || '').replace(/'/g, "\\'");
            return `
              <button class="btn-secondary btn-small rec-match-option" onclick="selectRecMatch(this, ${m.id}, '${eName}', '${m.cover_comic_id || ''}')">
                ${m.name}
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;
  } else {
    actionsHtml = '<span class="rec-not-in-library">Not in your library</span>';
  }

  let badgeHtml = '';
  if (inLibrary) badgeHtml = '<span class="rec-library-badge-inline">In Library</span>';
  else if (hasMultiple) badgeHtml = `<span class="rec-library-badge-inline rec-multi-badge">${(rec.library_matches || []).length} matches</span>`;

  return `
    <div class="recommendation-card" data-rec-index="${index}" style="animation-delay: ${index * 0.05}s">
      ${checkboxHtml ? `<div class="rec-checkbox-col">${checkboxHtml}</div>` : ''}
      <div class="rec-card-cover">
        ${coverHtml}
      </div>
      <div class="rec-card-info">
        <div class="rec-title-row">
          <h4 class="rec-title">${rec.title}${rec.author ? ` <span class="rec-author">by ${rec.author}</span>` : ''}</h4>
          ${matchScore > 0 ? `<span class="rec-match-badge">${matchScore}%</span>` : ''}
          ${badgeHtml}
        </div>
        <p class="rec-synopsis">${description}</p>
        <div class="rec-actions">
          ${actionsHtml}
        </div>
      </div>
    </div>
  `;
}

function selectRecMatch(btn, seriesId, seriesName, coverComicId) {
  const card = btn.closest('.recommendation-card');
  if (!card) return;

  if (coverComicId) {
    const coverEl = card.querySelector('.rec-card-cover');
    if (coverEl) {
      coverEl.innerHTML = `<img src="/api/cover/${coverComicId}" alt="${seriesName}" loading="lazy">`;
    }
  }

  if (!card.querySelector('.rec-checkbox-col')) {
    const checkboxCol = document.createElement('div');
    checkboxCol.className = 'rec-checkbox-col';
    checkboxCol.innerHTML = `<input type="checkbox" class="rec-checkbox" data-series-id="${seriesId}" onchange="updateBatchCount()">`;
    card.insertBefore(checkboxCol, card.firstChild);
  }

  const titleRow = card.querySelector('.rec-title-row');
  if (titleRow) {
    const oldBadge = titleRow.querySelector('.rec-multi-badge');
    if (oldBadge) {
      oldBadge.className = 'rec-library-badge-inline';
      oldBadge.textContent = 'In Library';
    }
  }

  const actionsEl = card.querySelector('.rec-actions');
  if (actionsEl) {
    const escaped = seriesName.replace(/'/g, "\\'");
    actionsEl.innerHTML = `
      <button class="btn-secondary btn-small" onclick="viewSeriesNewTab('${escaped}')">
        <span>👁️</span> View
      </button>
    `;
  }
}

/**
 * Handles adding a recommendation to a list
 */
export async function handleRecipeAddToList(seriesId) {
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

    const lists = response.items || [];
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
        <div class="empty-subtitle">Use "+ Create new list" below to get started</div>
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
  const batchIds = window._seriesToAddBatch;
  const singleId = window._seriesToAdd;

  if (batchIds && batchIds.length > 0) {
    let added = 0;
    let failed = 0;
    for (const sid of batchIds) {
      try {
        const response = await apiPost(`/api/lists/${listId}/items`, { series_id: sid });
        if (response.error) { failed++; } else { added++; }
      } catch { failed++; }
    }
    showToast(`Added ${added} series to list${failed > 0 ? ` (${failed} failed)` : ''}`);
    closeRecipeAddToListModal();
    return;
  }

  if (!singleId) return;

  try {
    const response = await apiPost(`/api/lists/${listId}/items`, { series_id: singleId });
    if (response.error) throw new Error(response.error);
    showToast('Added to list successfully');
    closeRecipeAddToListModal();
  } catch (error) {
    console.error('Error adding to list:', error);
    showToast('Failed to add to list: ' + error.message, 'error');
  }
}

/**
 * Closes the add-to-list modal
 */
export function closeRecipeAddToListModal() {
  const modal = document.getElementById('recipe-add-to-list-modal');
  if (modal) modal.style.display = 'none';
  window._seriesToAdd = null;
  window._seriesToAddBatch = null;
  const createSection = document.getElementById('recipe-create-list-section');
  if (createSection) createSection.style.display = 'none';
}

function toggleRecipeCreateList() {
  const section = document.getElementById('recipe-create-list-section');
  if (!section) return;
  section.style.display = section.style.display === 'none' ? 'block' : 'none';
  if (section.style.display === 'block') {
    const nameInput = document.getElementById('recipe-new-list-name');
    if (nameInput) nameInput.focus();
  }
}

async function handleRecipeCreateListAndAdd() {
  const nameInput = document.getElementById('recipe-new-list-name');
  const descInput = document.getElementById('recipe-new-list-description');
  const name = nameInput ? nameInput.value.trim() : '';

  if (!name) {
    showToast('Please enter a list name', 'error');
    return;
  }

  try {
    const createResult = await apiPost('/api/lists', {
      name,
      description: descInput ? descInput.value.trim() || null : null,
      is_public: false,
    });
    if (createResult.error) throw new Error(createResult.error);

    await addSeriesToList(createResult.id);
    showToast(`Created "${name}" and added series`, 'success');
  } catch (err) {
    console.error('Failed to create list:', err);
    showToast('Failed to create list: ' + err.message, 'error');
  }
}

function viewSeriesNewTab(seriesName) {
  window.open(`/#/series/${encodeURIComponent(seriesName)}`, '_blank');
}

function toggleSelectAllRecs() {
  const selectAll = document.getElementById('rec-select-all');
  if (!selectAll) return;
  const checkboxes = document.querySelectorAll('.rec-checkbox');
  checkboxes.forEach(cb => { cb.checked = selectAll.checked; });
  updateBatchCount();
}

function updateBatchCount() {
  const checked = document.querySelectorAll('.rec-checkbox:checked');
  const btn = document.querySelector('.rec-batch-bar .btn-primary');
  if (btn) {
    const count = checked.length;
    btn.innerHTML = `<span>➕</span> Add Selected to List${count > 0 ? ` (${count})` : ''}`;
  }
}

async function handleBatchAddToList() {
  const checked = document.querySelectorAll('.rec-checkbox:checked');
  const seriesIds = [...checked].map(cb => parseInt(cb.dataset.seriesId)).filter(Boolean);

  if (seriesIds.length === 0) {
    showToast('Select at least one recommendation first', 'info');
    return;
  }

  window._seriesToAddBatch = seriesIds;

  const modal = document.getElementById('recipe-add-to-list-modal');
  const container = document.getElementById('user-lists-container');
  if (!modal || !container) return;

  modal.style.display = 'flex';
  container.innerHTML = '<div class="loading">Loading your lists...</div>';

  try {
    const response = await apiGet('/api/lists');
    if (response.error) throw new Error(response.error);
    renderUserLists(response.items || [], true);
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

window.openRecipeMixerModal = openRecipeMixerModal;
window.closeRecipeMixerModal = closeRecipeMixerModal;
window.renderMixerUI = renderMixerUI;
window.initCategorySliders = initCategorySliders;
window.toggleWebSearch = toggleWebSearch;
window.toggleIgnoreCache = toggleIgnoreCache;
window.toggleCustomWeights = toggleCustomWeights;
window.updateCustomRequest = updateCustomRequest;
window.getRecommendations = getRecommendations;
window.renderRecommendations = renderRecommendations;
window.handleRecipeAddToList = handleRecipeAddToList;
window.handleBatchAddToList = handleBatchAddToList;
window.addSeriesToList = addSeriesToList;
window.closeRecipeAddToListModal = closeRecipeAddToListModal;
window.toggleRecipeCreateList = toggleRecipeCreateList;
window.handleRecipeCreateListAndAdd = handleRecipeCreateListAndAdd;
window.toggleAttributeWeights = toggleAttributeWeights;
window.toggleDebugSection = toggleDebugSection;
window.viewSeriesNewTab = viewSeriesNewTab;
window.selectRecMatch = selectRecMatch;
window.toggleSelectAllRecs = toggleSelectAllRecs;
window.updateBatchCount = updateBatchCount;
