/**
 * Discovery Module
 * Handles loading and rendering discovery view content (New Additions and Suggestions carousels).
 */

import { apiGet } from './api.js';
import { showToast } from './utils.js';

/**
 * Loads discovery data from API endpoints concurrently
 * Fetches new additions, suggestions, and user lists, then renders them
 */
export async function loadDiscoveryData() {
    try {
        const newGrid = document.getElementById('discovery-new-grid');
        const suggestionsGrid = document.getElementById('discovery-suggestions-grid');
        const myListsGrid = document.getElementById('discovery-my-lists-grid');
        const publicListsGrid = document.getElementById('discovery-public-lists-grid');
        
        if (newGrid) newGrid.innerHTML = '<div class="loading-state">Loading...</div>';
        if (suggestionsGrid) suggestionsGrid.innerHTML = '<div class="loading-state">Loading...</div>';
        if (myListsGrid) myListsGrid.innerHTML = '<div class="loading-state">Loading...</div>';
        if (publicListsGrid) publicListsGrid.innerHTML = '<div class="loading-state">Loading...</div>';
        
        const [newData, suggestionsData, myListsData, publicListsData] = await Promise.all([
            apiGet('/api/discovery/new-additions'),
            apiGet('/api/discovery/suggestions'),
            apiGet('/api/discovery/my-lists'),
            apiGet('/api/discovery/public-lists')
        ]);
        
        if (newData.error) {
            console.error('Failed to load new additions:', newData.error);
            if (newGrid) newGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">✨</div><div class="empty-title">Failed to load new additions</div></div>';
        } else {
            const comics = Array.isArray(newData) ? newData : newData.items || [];
            renderNewAdditions(comics);
        }
        
        if (suggestionsData.error) {
            console.error('Failed to load suggestions:', suggestionsData.error);
            const suggGrid = document.getElementById('discovery-suggestions-grid');
            if (suggGrid) suggGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">💡</div><div class="empty-title">No suggestions yet</div><div class="empty-subtitle">Read more manga to get personalized recommendations</div></div>';
        } else {
            const suggestions = Array.isArray(suggestionsData) ? suggestionsData : suggestionsData.items || [];
            renderSuggestions(suggestions);
        }
        
        if (myListsData.error) {
            console.error('Failed to load my lists:', myListsData.error);
            if (myListsGrid) myListsGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Failed to load lists</div></div>';
        } else {
            const myLists = myListsData.items || [];
            renderMyListsCarousel(myLists);
        }
        
        if (publicListsData.error) {
            console.error('Failed to load public lists:', publicListsData.error);
            if (publicListsGrid) publicListsGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">🌐</div><div class="empty-title">Failed to load public lists</div></div>';
        } else {
            const publicLists = publicListsData.items || [];
            renderPublicListsCarousel(publicLists);
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
    const title = sugg.title || sugg.name || 'Unknown Series';
    const tags = sugg.matching_tags ? sugg.matching_tags.slice(0, 3).join(', ') : '';
    
    const coverHtml = sugg.cover_comic_id
        ? `<img src="/api/cover/${sugg.cover_comic_id}" alt="${title}" loading="lazy">`
        : `<div class="carousel-card-placeholder">📚</div>`;
    
    return `
        <div class="carousel-card suggestion-card" data-series-name="${sugg.name}" title="${sugg.synopsis || ''}">
            <div class="carousel-card-cover">
                ${coverHtml}
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
 * Renders user's lists carousel
 * @param {Array} lists - Array of list objects
 */
export function renderMyListsCarousel(lists) {
    const grid = document.getElementById('discovery-my-lists-grid');
    const section = document.getElementById('discovery-my-lists-section');
    if (!grid) return;
    
    if (section) {
        section.style.display = 'block';
        
        const header = section.querySelector('.discovery-section-header');
        if (header && !header.querySelector('.discovery-actions')) {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'discovery-actions';
            actionsDiv.style.display = 'flex';
            actionsDiv.style.gap = '8px';
            actionsDiv.style.marginLeft = 'auto';
            actionsDiv.style.marginRight = '16px';
            
            actionsDiv.innerHTML = `
                <button class="btn-secondary" onclick="showCreateListModal()" style="padding: 6px 12px; font-size: 0.85rem; display: flex; align-items: center; gap: 6px;">
                    <span>➕</span> Create
                </button>
                <button class="btn-secondary" onclick="routerNavigate('lists', {})" style="padding: 6px 12px; font-size: 0.85rem; display: flex; align-items: center; gap: 6px;">
                    <span>⚙️</span> Manage
                </button>
            `;
            
            const nav = header.querySelector('.carousel-nav');
            if (nav) {
                header.insertBefore(actionsDiv, nav);
            } else {
                header.appendChild(actionsDiv);
            }
        }
    }
    
    if (!lists || lists.length === 0) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No lists yet</div><div class="empty-subtitle">Create a list to organize your collection</div></div>';
        return;
    }
    
    grid.innerHTML = lists.map(list => createListCard(list, 'my')).join('');
    
    grid.querySelectorAll('.carousel-card').forEach(card => {
        card.addEventListener('click', () => {
            const listId = card.dataset.listId;
            if (listId) {
                openListDetail(listId);
            }
        });
    });
}

/**
 * Renders public lists carousel
 * @param {Array} lists - Array of public list objects
 */
export function renderPublicListsCarousel(lists) {
    const grid = document.getElementById('discovery-public-lists-grid');
    const section = document.getElementById('discovery-public-lists-section');
    if (!grid) return;
    
    if (!lists || lists.length === 0) {
        if (section) section.style.display = 'none';
        return;
    }
    
    if (section) section.style.display = 'block';
    grid.innerHTML = lists.map(list => createListCard(list, 'public')).join('');
    
    grid.querySelectorAll('.carousel-card').forEach(card => {
        card.addEventListener('click', () => {
            const listId = card.dataset.listId;
            if (listId) {
                openListDetail(listId);
            }
        });
    });
}

/**
 * Creates a list card HTML element
 * @param {Object} list - List data object
 * @param {string} type - Card type: 'my' or 'public'
 * @returns {string} HTML string for the card
 */
function createListCard(list, type) {
    const coverHtml = list.cover_url
        ? `<img src="${list.cover_url}" alt="${list.name}" loading="lazy">`
        : `<div class="carousel-card-placeholder">📋</div>`;
    
    const subtitle = type === 'public' && list.owner_username
        ? `by ${list.owner_username} • ${list.item_count} items`
        : `${list.item_count} item${list.item_count !== 1 ? 's' : ''}`;
    
    const publicBadge = type === 'my' && list.is_public
        ? '<div class="carousel-card-badge">Public</div>'
        : '';
    
    return `
        <div class="carousel-card list-card" data-list-id="${list.id}" title="${list.description || ''}">
            <div class="carousel-card-cover">
                ${coverHtml}
                ${publicBadge}
            </div>
            <div class="carousel-card-info">
                <div class="carousel-card-title">${list.name}</div>
                <div class="carousel-card-series">${subtitle}</div>
            </div>
        </div>
    `;
}

/**
 * Opens a list detail view
 * @param {string} listId - The list ID to navigate to
 */
function openListDetail(listId) {
    if (window.routerNavigate) {
        window.routerNavigate('list-detail', { listId: listId });
    } else {
        console.error('No navigation method available');
    }
}

/**
 * Scrolls a carousel container left or right
 * @param {string} type - Carousel type: 'new', 'suggestions', 'my-lists', or 'public-lists'
 * @param {number} direction - Scroll direction: -1 (left) or 1 (right)
 */
export function scrollCarousel(type, direction) {
     const containerMap = {
         'new': 'discovery-new-grid',
         'suggestions': 'discovery-suggestions-grid',
         'my-lists': 'discovery-my-lists-grid',
         'public-lists': 'discovery-public-lists-grid'
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
 * Refreshes the suggestions carousel
 * Re-fetches suggestions from the API and re-renders
 */
async function refreshSuggestions() {
    const grid = document.getElementById('discovery-suggestions-grid');
    if (grid) {
        grid.innerHTML = '<div class="loading-state">Loading...</div>';
    }
    
    try {
        const suggestionsData = await apiGet('/api/discovery/suggestions');
        
        if (suggestionsData.error) {
            console.error('Failed to refresh suggestions:', suggestionsData.error);
            if (grid) {
                grid.innerHTML = '<div class="empty-state"><div class="empty-icon">💡</div><div class="empty-title">Failed to refresh</div></div>';
            }
        } else {
            const suggestions = Array.isArray(suggestionsData) ? suggestionsData : suggestionsData.items || [];
            renderSuggestions(suggestions);
        }
    } catch (error) {
        console.error('Error refreshing suggestions:', error);
        showToast('Failed to refresh suggestions', 'error');
    }
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
export { openComic, openSeries, refreshSuggestions };
