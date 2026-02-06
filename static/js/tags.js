import { apiPost } from './api.js';
import { navigateToFolder, showView } from './library.js';
import { state } from './state.js';
import { renderItems, renderFan, getTitleCoverIds } from './components/index.js';
import { navigate } from './router.js';
import { updateSelectOptions } from './utils.js';

// State for tags view
const tagsState = {
    selectedTags: [],
    availableTags: [],
    matchingSeries: [],
    matchingCount: 0,
    isShowingResults: false,
    filterText: ''
};

// Initialize the Tags View
export async function initTagsView(params = {}) {
    // Sync tags from URL params if present
    if (params.tags) {
        tagsState.selectedTags = params.tags.split(',').map(t => decodeURIComponent(t)).filter(t => t.length > 0);
    } else {
        tagsState.selectedTags = [];
    }
    
    // Sync results view state from URL
    tagsState.isShowingResults = params.view === 'results';
    
    tagsState.filterText = '';
    
    const input = document.getElementById('tagSearchInput');
    if (input) {
        input.value = '';
        input.oninput = (e) => window.filterTags(e.target.value);
    }

    await updateTagsView();
}

/**
 * Helper to update URL with current selected tags
 */
function syncTagsToUrl() {
    const params = {};
    if (tagsState.selectedTags.length > 0) {
        params.tags = tagsState.selectedTags.join(',');
    }
    if (tagsState.isShowingResults) {
        params.view = 'results';
    }
    navigate('tags', params);
}

// Main update function
export async function updateTagsView() {
    const container = document.getElementById('tags-grid');
    const resultsContainer = document.getElementById('tags-results');
    const subtitle = document.getElementById('tags-subtitle');
    const showBtn = document.getElementById('btn-show-results');
    
    // Default to empty arrays if elements are missing
    if (!container || !resultsContainer) return;

    // Show loading state
    container.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>Filtering tags...</p>
        </div>
    `;
    if (subtitle) subtitle.textContent = 'Updating filters...';

    try {
        const data = await apiPost('/api/series/tags/filter', { 
            selected_tags: tagsState.selectedTags 
        });

        if (data.error) throw new Error(data.error);

        tagsState.availableTags = data.related_tags || [];
        tagsState.matchingSeries = data.series || [];
        tagsState.matchingCount = data.matching_count || 0;

        // Render Selected Tags
        renderSelectedTags();

        // Update Header Controls
        if (tagsState.matchingCount > 0) {
            if (showBtn) {
                showBtn.style.display = 'inline-flex';
                showBtn.innerHTML = `<span>▶</span> Display Selected (${tagsState.matchingCount})`;
            }
            if (subtitle) {
                subtitle.textContent = `${tagsState.matchingCount} series match your criteria`;
            }
        } else {
            if (showBtn) showBtn.style.display = 'none';
            if (subtitle) subtitle.textContent = 'No series match the selected criteria';
        }

        // Logic to switch between Tags Grid and Results Grid
        // Auto-switch if explicitly requested OR if we have matches but no more tags to drill down OR if only 1 match remains
        const shouldShowResults = tagsState.isShowingResults || 
                                  (tagsState.availableTags.length === 0 && tagsState.matchingCount > 0) ||
                                  (tagsState.matchingCount === 1);

        if (shouldShowResults) {
            // Show Series Results
            if (showBtn) showBtn.style.display = 'none';
            const tagSearch = document.getElementById('tag-search-container');
            if (tagSearch) tagSearch.style.display = 'none';
            
            const filters = document.getElementById('tags-filters');
            if (filters) {
                filters.style.display = 'flex';
                updateTagDynamicFilters();
            }

            renderResults();
            container.style.display = 'none';
            resultsContainer.style.display = 'grid';
            tagsState.isShowingResults = true; // Ensure state reflects this
        } else {
            // Show Tags Grid
            const tagSearch = document.getElementById('tag-search-container');
            if (tagSearch) tagSearch.style.display = 'block';
            
            const filters = document.getElementById('tags-filters');
            if (filters) filters.style.display = 'none';

            renderTagsGrid();
            container.style.display = 'grid';
            resultsContainer.style.display = 'none';
            tagsState.isShowingResults = false;
        }

    } catch (error) {
        console.error('Failed to load tags:', error);
        container.innerHTML = '<div class="error-message">Failed to load tags.</div>';
    }
}

export function handleTagFilterChange() {
    state.filters.genre = document.getElementById('tag-filter-genre').value;
    state.filters.status = document.getElementById('tag-filter-status').value;
    state.filters.read = document.getElementById('tag-filter-read').value;
    
    renderResults();
    updateTagDynamicFilters();
}

window.handleTagFilterChange = handleTagFilterChange;

function updateTagDynamicFilters() {
    const rawTitles = tagsState.matchingSeries;
    if (!rawTitles || rawTitles.length === 0) return;

    const currentGenre = document.getElementById('tag-filter-genre').value;
    const currentStatus = document.getElementById('tag-filter-status').value;
    const currentRead = document.getElementById('tag-filter-read').value;

    const availableGenres = new Set();
    const availableStatuses = new Set();

    // We can use the same titleMatchesFilter if we ensure series objects have the same structure
    // tagsState.matchingSeries items are from /api/series/tags/filter which returns series objects
    // We need to check their structure. They usually have 'genres', 'status', etc.
    
    rawTitles.forEach(t => {
        // Populate available genres based on other filters
        if (matchesFilter(t, 'status', currentStatus) && matchesFilter(t, 'read', currentRead)) {
            if (t.genres && Array.isArray(t.genres)) t.genres.forEach(g => availableGenres.add(g));
            if (t.category) availableGenres.add(t.category);
        }
        
        // Populate available statuses based on other filters
        if (matchesFilter(t, 'genre', currentGenre) && matchesFilter(t, 'read', currentRead)) {
            if (t.status) availableStatuses.add(t.status);
        }
    });

    updateSelectOptions('tag-filter-genre', Array.from(availableGenres).sort(), currentGenre, 'All Genres');
    updateSelectOptions('tag-filter-status', Array.from(availableStatuses).sort(), currentStatus, 'All Statuses');
}

function matchesFilter(series, type, value) {
    if (!value) return true;
    if (type === 'genre') {
        return (series.genres && series.genres.includes(value)) || series.category === value;
    }
    if (type === 'status') {
        return series.status === value;
    }
    if (type === 'read') {
        // For series results in tags, we might not have the full comic list with progress here
        // The API returns 'user_progress' or similar?
        // Actually, matchingSeries items are series objects.
        // Let's assume they have some progress info or we check state.readingProgress if we have comic IDs.
        // For now, if we don't have enough info, return true or implement basic check.
        return true; 
    }
     return true;
}

// Render the bar of selected filter tags
function renderSelectedTags() {
    const container = document.getElementById('selected-tags-container');
    if (!container) return;

    if (tagsState.selectedTags.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    container.style.display = 'flex';
    
    const tagsHtml = tagsState.selectedTags.map(tag => {
        // Escape single quotes for the onclick handler
        const escapedTag = tag.replace(/'/g, "\\'");
        return `
        <div class="tag-chip" onclick="window.removeTag(\`${escapedTag}\`)">
            <span>${tag}</span>
            <span class="tag-remove">×</span>
        </div>`;
    }).join('');

    container.innerHTML = tagsHtml + `
        <button class=\"clear-tags-btn\" onclick=\"window.clearAllTags()\">Clear All</button>
    `;
}

// Render the grid of available tags (folders)
function renderTagsGrid() {
    const container = document.getElementById('tags-grid');
    if (!container) return;
    
    // Filter tags
    let tagsToRender = tagsState.availableTags;
    if (tagsState.filterText) {
        tagsToRender = tagsState.availableTags.filter(tag => 
            tag.name.toLowerCase().includes(tagsState.filterText)
        );
    }
    
    if (tagsToRender.length === 0) {
        container.innerHTML = `
            <div class=\"empty-state\">
                <div class=\"empty-icon\">🏷️</div>
                <div class=\"empty-title\">No tags found</div>
                <p>${tagsState.availableTags.length === 0 ? 'Try clearing some filters.' : 'No tags match your search.'}</p>
            </div>
        `;
        return;
    }

    const items = tagsToRender.map(tag => {
        const escapedName = tag.name.replace(/'/g, "\\'");
        
        let metaText = `${tag.count} series`;
        const names = tag.series_names || [];
        
        if (tag.count === 1 && names.length > 0) {
            metaText = `1 Series (${names[0]})`;
        } else if (tag.count === 2 && names.length >= 2) {
            metaText = `2 Series (${names[0]}, ${names[1]})`;
        } else if (tag.count >= 3 && names.length >= 2) {
            metaText = `${names[0]}, ${names[1]} and ${tag.count - 2} more`;
        }

        const coverHtml = (tag.covers && tag.covers.length > 0)
            ? renderFan(tag.covers)
            : `<span class="folder-icon" style="font-size: 2.5rem;">🏷️</span>`;
            
        const onClick = `window.selectTag(\`${escapedName}\`)`;

        return {
            title: tag.name,
            coverHtml: coverHtml,
            isFolder: true,
            
            metaText: metaText,
            
            // For list view compatibility
            metaItems: [metaText],
            statValue: tag.count,
            statLabel: 'Series',
            actionText: 'Filter',
            onAction: onClick,
            
            // For detailed view compatibility
            subtitle: 'Tag',
            badges: [{ text: `${tag.count} Series` }],
            stats: [{ value: tag.count, label: 'Series' }],
            description: `Filter by tag "${tag.name}". Contains ${metaText}.`,
            buttons: [{ text: 'Select Tag', class: 'primary', onClick: onClick }],
            
            onClick: onClick
        };
    });
    
    renderItems(container, items, state.viewMode || 'grid');
}

// Render the matching series results
function renderResults() {
    const container = document.getElementById('tags-results');
    if (!container) return;
    
    let filteredSeries = tagsState.matchingSeries;
    
    // Apply filters
    const { genre, status, read } = state.filters;
    if (genre || status || read) {
        filteredSeries = filteredSeries.filter(s => 
            matchesFilter(s, 'genre', genre) &&
            matchesFilter(s, 'status', status) &&
            matchesFilter(s, 'read', read)
        );
    }
    
    if (filteredSeries.length === 0) {
        container.innerHTML = `
             <div class=\"empty-state\">
                <div class=\"empty-icon\">🔍</div>
                <div class=\"empty-title\">No series found matching these filters</div>
            </div>
        `;
        return;
    }

     const items = filteredSeries.map(series => {
         const seriesName = series.name || 'Unknown Series';
         const seriesTitle = series.title || seriesName;
         
         // Escape for HTML attributes
         const escapedName = seriesName.replace(/'/g, "\\'").replace(/"/g, '&quot;');
         const displayTitle = seriesTitle.replace(/'/g, '&quot;');
         
         const coverIds = getTitleCoverIds(series);
         const onClick = `window.routerNavigate('library', { title: \`${escapedName}\` })`;

        return {
            title: seriesTitle,
            coverIds: coverIds,
            
            badgeText: `${series.count || 0} ch`,
            metaText: `<span class="comic-chapter">${series.count || 0} chapters</span>`,
            extraClasses: 'title-card',
            dataAttrs: `data-title-name="${displayTitle}"`,
            
            // List view compatibility
            metaItems: [`${series.count || 0} chapters`],
            actionText: 'View',
            
            // Detailed view compatibility
            subtitle: 'Series',
            badges: [{ text: `${series.count || 0} Chapters`, class: 'accent' }],
            stats: [{ value: series.count || 0, label: 'Chapters' }],
            description: series.synopsis || `Series containing ${series.count || 0} chapters.`,
            buttons: [{ text: '▶ View Series', class: 'primary', onClick: onClick }],
            
            onClick: onClick
        };
    });

    renderItems(container, items, state.viewMode || 'grid');

    // Sync selection state if we are already in selection mode
    if (window.updateSelectionUI) window.updateSelectionUI();
    if (window.updateSelectionButtonState) window.updateSelectionButtonState();
}

// Global functions attached to window for HTML event access
window.selectTag = function(tagName) {
    if (!tagsState.selectedTags.includes(tagName)) {
        tagsState.selectedTags.push(tagName);
        
        // Clear filter and input
        tagsState.filterText = '';
        const input = document.getElementById('tagSearchInput');
        if (input) input.value = '';
        
        syncTagsToUrl();
    }
};

window.filterTags = function(text) {
    tagsState.filterText = text.toLowerCase();
    renderTagsGrid();
};

window.removeTag = function(tagName) {
    tagsState.selectedTags = tagsState.selectedTags.filter(t => t !== tagName);
    tagsState.isShowingResults = false; // Reset to grid view when criteria changes
    syncTagsToUrl();
};

window.clearAllTags = function() {
    tagsState.selectedTags = [];
    tagsState.isShowingResults = false;
    syncTagsToUrl();
};

window.showTagResults = function() {

    tagsState.isShowingResults = true;

    syncTagsToUrl();

};
