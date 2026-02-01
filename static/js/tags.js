import { apiPost } from './api.js';
import { navigateToFolder, showView, renderTitleFan } from './library.js';

// State for tags view
const tagsState = {
    selectedTags: [],
    availableTags: [],
    matchingSeries: [],
    matchingCount: 0,
    isShowingResults: false
};

// Initialize the Tags View
export async function initTagsView() {
    tagsState.selectedTags = [];
    tagsState.isShowingResults = false;
    await updateTagsView();
}

// Main update function
export async function updateTagsView() {
    const container = document.getElementById('tags-grid');
    const resultsContainer = document.getElementById('tags-results');
    const subtitle = document.getElementById('tags-subtitle');
    const showBtn = document.getElementById('btn-show-results');
    
    // Default to empty arrays if elements are missing
    if (!container || !resultsContainer) return;

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
            renderResults();
            container.style.display = 'none';
            resultsContainer.style.display = 'grid';
            tagsState.isShowingResults = true; // Ensure state reflects this
        } else {
            // Show Tags Grid
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
        <div class="tag-chip" onclick="window.removeTag('${escapedTag}')">
            <span>${tag}</span>
            <span class="tag-remove">×</span>
        </div>`;
    }).join('');

    container.innerHTML = tagsHtml + `
        <button class="clear-tags-btn" onclick="window.clearAllTags()">Clear All</button>
    `;
}

// Render the grid of available tags (folders)
function renderTagsGrid() {
    const container = document.getElementById('tags-grid');
    if (!container) return;
    
    if (tagsState.availableTags.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🏷️</div>
                <div class="empty-title">No tags available</div>
                <p>Try clearing some filters or searching for something else.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = tagsState.availableTags.map(tag => {
        const escapedName = tag.name.replace(/'/g, "\\'");
        
        // Build fan HTML from cover IDs
        let fanHtml = '';
        if (tag.covers && tag.covers.length > 0) {
            fanHtml = `<div class="folder-fan">
`;
            if (tag.covers[0]) fanHtml += `<img src="/api/cover/${tag.covers[0]}" class="folder-fan-img fan-main" loading="lazy" alt="Cover">
`;
            if (tag.covers[1]) fanHtml += `<img src="/api/cover/${tag.covers[1]}" class="folder-fan-img fan-left" loading="lazy" alt="Cover">
`;
            if (tag.covers[2]) fanHtml += `<img src="/api/cover/${tag.covers[2]}" class="folder-fan-img fan-right" loading="lazy" alt="Cover">
`;
            fanHtml += `</div>`;
        }
        
        // Use fan if available, otherwise icon
        const iconContent = (tag.covers && tag.covers.length > 0)
            ? fanHtml 
            : `<span class="folder-icon" style="font-size: 2.5rem;">🏷️</span>`;

        let metaText = `${tag.count} series`;
        const names = tag.series_names || [];
        
        if (tag.count === 1 && names.length > 0) {
            metaText = `1 Series (${names[0]})`;
        } else if (tag.count === 2 && names.length >= 2) {
            metaText = `2 Series (${names[0]}, ${names[1]})`;
        } else if (tag.count >= 3 && names.length >= 2) {
            metaText = `${names[0]}, ${names[1]} and ${tag.count - 2} more`;
        }

        return `
            <div class="folder-card tag-card" onclick="window.selectTag('${escapedName}')">
                <div class="folder-card-icon">
                    ${iconContent}
                </div>
                <div class="folder-card-info">
                    <div class="folder-card-name">${tag.name}</div>
                    <div class="folder-card-meta">${metaText}</div>
                </div>
            </div>
        `;
    }).join('');
}

// Render the matching series results
function renderResults() {
    const container = document.getElementById('tags-results');
    if (!container) return;
    
    if (tagsState.matchingSeries.length === 0) {
        container.innerHTML = `
             <div class="empty-state">
                <div class="empty-icon">🔍</div>
                <div class="empty-title">No series found</div>
            </div>
        `;
        return;
    }

    container.innerHTML = tagsState.matchingSeries.map(series => {
        const seriesName = series.name || 'Unknown Series';
        const seriesTitle = series.title || seriesName;
        
        // Escape for HTML attributes
        const escapedName = seriesName.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const displayTitle = seriesTitle.replace(/"/g, '&quot;');
        
        // Use the library's renderTitleFan to get the fan look
        const fanHtml = renderTitleFan(series);

        return `
            <div class="comic-card title-card" onclick="navigateToFolder('title', '${escapedName}'); showView('library');" data-title-name="${displayTitle}">
                <div class="comic-cover">
                    ${fanHtml}
                    <div class="comic-badge">${series.count || 0} ch</div>
                </div>
                <div class="comic-info">
                    <div class="comic-title">${seriesTitle}</div>
                    <div class="comic-meta">
                        <span class="comic-chapter">${series.count || 0} chapters</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Global functions attached to window for HTML event access
window.selectTag = function(tagName) {
    if (!tagsState.selectedTags.includes(tagName)) {
        tagsState.selectedTags.push(tagName);
        updateTagsView();
    }
};

window.removeTag = function(tagName) {
    tagsState.selectedTags = tagsState.selectedTags.filter(t => t !== tagName);
    tagsState.isShowingResults = false; // Reset to grid view when criteria changes
    updateTagsView();
};

window.clearAllTags = function() {
    tagsState.selectedTags = [];
    tagsState.isShowingResults = false;
    updateTagsView();
};

window.showTagResults = function() {
    tagsState.isShowingResults = true;
    updateTagsView();
};
