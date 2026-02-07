/**
 * Discovery Module
 * Handles loading and rendering discovery view content (New Additions and Suggestions carousels).
 */

import { apiGet } from './api.js';
import { showToast } from './utils.js';

/**
 * Loads discovery data from API endpoints concurrently
 * Fetches new additions and suggestions, then renders them
 */
export async function loadDiscoveryData() {
    try {
        // Show loading state
        const newGrid = document.getElementById('discovery-new-grid');
        const suggestionsGrid = document.getElementById('discovery-suggestions-grid');
        
        if (newGrid) newGrid.innerHTML = '<div class="loading-state">Loading...</div>';
        if (suggestionsGrid) suggestionsGrid.innerHTML = '<div class="loading-state">Loading...</div>';
        
        // Fetch new additions and suggestions endpoints concurrently
        const [newData, suggestionsData] = await Promise.all([
            apiGet('/api/discovery/new-additions'),
            apiGet('/api/discovery/suggestions')
        ]);
        
        // Handle new additions
        if (newData.error) {
            console.error('Failed to load new additions:', newData.error);
            if (newGrid) newGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">✨</div><div class="empty-title">Failed to load new additions</div></div>';
        } else {
            const comics = Array.isArray(newData) ? newData : newData.items || [];
            renderNewAdditions(comics);
        }
        
        // Handle suggestions
        if (suggestionsData.error) {
            console.error('Failed to load suggestions:', suggestionsData.error);
            const suggGrid = document.getElementById('discovery-suggestions-grid');
            if (suggGrid) suggGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">💡</div><div class="empty-title">No suggestions yet</div><div class="empty-subtitle">Read more manga to get personalized recommendations</div></div>';
        } else {
            const suggestions = Array.isArray(suggestionsData) ? suggestionsData : suggestionsData.items || [];
            renderSuggestions(suggestions);
        }
    } catch (error) {
        console.error('Error loading discovery data:', error);
        showToast('Failed to load discovery data', 'error');
    }
}

/**
 * Renders new additions carousel cards
 * Handles both individual comics and consolidated series groups
 * @param {Array} items - Array of comic objects or series_group objects
 */
export function renderNewAdditions(items) {
     const grid = document.getElementById('discovery-new-grid');
     if (!grid) return;
     
     if (!items || items.length === 0) {
         grid.innerHTML = '<div class="empty-state"><div class="empty-icon">✨</div><div class="empty-title">No new additions</div><div class="empty-subtitle">Check back later for new comics</div></div>';
         return;
     }
     
     grid.innerHTML = items.map(item => {
         if (item.type === 'series_group') {
             return createSeriesGroupCard(item);
         }
         return createCarouselCard(item, 'new');
     }).join('');
     
      // Attach click handlers
      grid.querySelectorAll('.carousel-card').forEach(card => {
          card.addEventListener('click', () => {
              const seriesName = card.dataset.seriesName;
              const comicId = card.dataset.comicId;
              if (seriesName) {
                  openSeries(seriesName);
              } else if (comicId) {
                  openComic(comicId);
              }
          });
      });
}

/**
 * Renders suggestions carousel cards
 * @param {Array} suggestions - Array of suggestion objects with matching tags
 */
export function renderSuggestions(suggestions) {
    const grid = document.getElementById('discovery-suggestions-grid');
    if (!grid) return;
    
    if (!suggestions || suggestions.length === 0) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-icon">💡</div><div class="empty-title">No suggestions yet</div><div class="empty-subtitle">Read more manga to get personalized recommendations</div></div>';
        return;
    }
    
    grid.innerHTML = suggestions.map(sugg => createSuggestionCard(sugg)).join('');
    
    // Attach click handlers
    grid.querySelectorAll('.carousel-card').forEach(card => {
        card.addEventListener('click', () => {
            const seriesName = card.dataset.seriesName;
            if (seriesName) {
                openSeries(seriesName);
            }
        });
    });
}

/**
 * Creates a series group card HTML element
 * @param {Object} group - Series group data object with type, series, series_id, count, first_comic_id, chapter_titles
 * @returns {string} HTML string for the series group card
 */
function createSeriesGroupCard(group) {
     const coverUrl = `/api/cover/${group.first_comic_id}`;
     const series = group.series || 'Unknown Series';
     const count = group.count || 0;
     const chapterPreview = group.chapter_titles?.slice(0, 3).join(', ') || '';
     
     return `
         <div class="carousel-card series-group-card" data-series-name="${series}" title="${chapterPreview}">
             <div class="carousel-card-cover">
                 <img src="${coverUrl}" alt="${series}" loading="lazy">
                 <div class="carousel-card-badge">${count} new</div>
             </div>
             <div class="carousel-card-info">
                 <div class="carousel-card-title">${series}</div>
                 <div class="carousel-card-series">${count} new chapter${count !== 1 ? 's' : ''}</div>
             </div>
         </div>
     `;
}

/**
 * Creates a carousel card HTML element
 * @param {Object} comic - Comic data object
 * @param {string} type - Card type: 'new'
 * @returns {string} HTML string for the card
 */
function createCarouselCard(comic, type) {
     const coverUrl = `/api/cover/${comic.id}`;
     const title = comic.title || 'Unknown';
     const series = comic.series || 'Unknown Series';
     
     let badgeHtml = '';
     
     if (type === 'new') {
         badgeHtml = '<div class="carousel-card-badge">New</div>';
     }
     
     return `
         <div class="carousel-card" data-comic-id="${comic.id}">
             <div class="carousel-card-cover">
                 <img src="${coverUrl}" alt="${title}" loading="lazy">
                 ${badgeHtml}
             </div>
             <div class="carousel-card-info">
                 <div class="carousel-card-title">${title}</div>
                 <div class="carousel-card-series">${series}</div>
             </div>
         </div>
     `;
}

/**
 * Creates a suggestion card HTML element
 * @param {Object} sugg - Suggestion object with cover_comic_id, title, name, matching_tags, match_score, synopsis
 * @returns {string} HTML string for the suggestion card
 */
function createSuggestionCard(sugg) {
    const coverUrl = sugg.cover_comic_id ? `/api/cover/${sugg.cover_comic_id}` : '/static/images/default-cover.png';
    const title = sugg.title || sugg.name || 'Unknown Series';
    const tags = sugg.matching_tags ? sugg.matching_tags.slice(0, 3).join(', ') : '';
    
    return `
        <div class="carousel-card suggestion-card" data-series-name="${sugg.name}" title="${sugg.synopsis || ''}">
            <div class="carousel-card-cover">
                <img src="${coverUrl}" alt="${title}" loading="lazy">
                <div class="carousel-card-badge">${sugg.match_score} matches</div>
            </div>
            <div class="carousel-card-info">
                <div class="carousel-card-title">${title}</div>
                <div class="carousel-card-series">${tags}</div>
            </div>
        </div>
    `;
}

/**
 * Scrolls a carousel container left or right
 * @param {string} type - Carousel type: 'new' or 'suggestions'
 * @param {number} direction - Scroll direction: -1 (left) or 1 (right)
 */
export function scrollCarousel(type, direction) {
     const containerMap = {
         'new': 'discovery-new-grid',
         'suggestions': 'discovery-suggestions-grid'
     };
     const containerId = containerMap[type];
     if (!containerId) return;
     
     const container = document.getElementById(containerId);
     if (!container) return;
     
     const scrollAmount = 320;
     const targetScroll = container.scrollLeft + (direction * scrollAmount);
     
     container.scrollTo({
         left: targetScroll,
         behavior: 'smooth'
     });
}

/**
 * Opens a series detail view
 * @param {string} seriesName - The series name to navigate to
 */
function openSeries(seriesName) {
     if (window.routerNavigate) {
         window.routerNavigate('series', { name: seriesName });
     } else {
         console.error('No navigation method available');
     }
}

/**
 * Opens a comic in the reader
 * @param {string} comicId - The comic ID to open
 */
function openComic(comicId) {
     if (window.routerNavigate) {
         window.routerNavigate('reader', { comicId: comicId });
     } else if (window.startReading) {
         window.startReading(comicId);
     } else {
         console.error('No navigation method available');
     }
}

// Export functions for external use
export { openComic, openSeries };
