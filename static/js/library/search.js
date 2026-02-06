import { state } from '../state.js';
import { renderItems, getTitleCoverIds } from '../components/index.js';
import { aggregateProgress } from '../utils/progress.js';
import { apiGet } from '../api.js';
import { debounce, findTitleInTree } from '../utils.js';

export async function handleSearch(query) {
    state.searchQuery = query.trim();
    
    // If scope is everywhere and we have a query, fetch deep search results from API
    if (state.searchQuery && state.searchScope === 'everywhere') {
        const results = await apiGet(`/api/search?q=${encodeURIComponent(state.searchQuery)}`);
        if (!results.error) {
            state.apiSearchResults = results;
        }
    } else {
        state.apiSearchResults = [];
    }
    
    if (window.updateLibraryView) window.updateLibraryView();
}

export async function toggleSearchScope() {
    state.searchScope = state.searchScope === 'current' ? 'everywhere' : 'current';
    const scopeBtn = document.getElementById('search-scope-btn');
    const searchInput = document.getElementById('searchInput');
    
    if (scopeBtn) {
        scopeBtn.textContent = state.searchScope === 'current' ? '📍 Current' : '🌐 Everywhere';
    }
    
    if (searchInput) {
        searchInput.placeholder = state.searchScope === 'current' ? 
            'Search titles in this folder...' : 
            'Deep search (synopsis, authors, etc)...';
    }
    
    // Re-run search with new scope
    if (state.searchQuery) {
        await handleSearch(state.searchQuery);
    }
}

export function getSearchResults() {
    if (!state.searchQuery) return [];
    const lowerQuery = state.searchQuery.toLowerCase();
    const titles = [];
    const seenTitles = new Set();
    
    // 1. First, add any results from deep metadata search (API)
    if (state.searchScope === 'everywhere' && state.apiSearchResults) {
        state.apiSearchResults.forEach(series => {
            // Find this series in our folder tree
            const titleName = series.name;
            if (!seenTitles.has(titleName)) {
                // We need to find the title object in our folder tree to have the comics list
                const titleObj = findTitleInTree(titleName);
                if (titleObj) {
                    titles.push(titleObj);
                    seenTitles.add(titleName);
                }
            }
        });
    }

    // 2. Add results from local folder tree (simple name match)
    let categoriesToSearch;
    if (!state.folderTree) return titles;
    
    if (state.searchScope === 'current') {
        if (state.currentLevel === 'root') categoriesToSearch = Object.keys(state.folderTree.categories || {});
        else if (state.currentLevel === 'category') categoriesToSearch = [state.currentLocation.category];
        else if (state.currentLevel === 'subcategory') {
            const cat = state.folderTree.categories[state.currentLocation.category];
            if (cat) {
                Object.values(cat.subcategories).forEach(sub => {
                    Object.values(sub.titles).forEach(title => {
                        if (title.name.toLowerCase().includes(lowerQuery)) {
                            if (!seenTitles.has(title.name)) { titles.push(title); seenTitles.add(title.name); }
                        }
                    });
                });
            }
            return titles;
        } else if (state.currentLevel === 'title') {
            const cat = state.folderTree.categories[state.currentLocation.category];
            if (cat) {
                const sub = cat.subcategories[state.currentLocation.subcategory];
                if (sub) {
                    const title = sub.titles[state.currentLocation.title];
                    if (title && title.name.toLowerCase().includes(lowerQuery)) {
                         if (!seenTitles.has(title.name)) { titles.push(title); seenTitles.add(title.name); }
                    }
                }
            }
            return titles;
        }
    } else {
        categoriesToSearch = Object.keys(state.folderTree.categories || {});
    }
    
    categoriesToSearch.forEach(catName => {
        const category = state.folderTree.categories[catName];
        if (!category) return;
        Object.values(category.subcategories).forEach(subcategory => {
            Object.values(subcategory.titles).forEach(title => {
                if (title.name.toLowerCase().includes(lowerQuery)) {
                    if (!seenTitles.has(title.name)) { titles.push(title); seenTitles.add(title.name); }
                } else if (state.searchScope === 'everywhere') {
                    // Only do deep comic search if everywhere? Or always?
                    const matchingComics = title.comics.filter(comic => 
                        comic.title.toLowerCase().includes(lowerQuery) ||
                        (comic.series && comic.series.toLowerCase().includes(lowerQuery)) ||
                        (comic.chapter && comic.chapter.toString().includes(lowerQuery))
                    );
                    if (matchingComics.length > 0 && !seenTitles.has(title.name)) {
                        titles.push(title);
                        seenTitles.add(title.name);
                    }
                }
            });
        });
    });
     return titles;
}

export function renderSearchResults() {
    const folderGrid = document.getElementById('folder-grid');
    const comicsContainer = document.getElementById('comics-container');
    const statsSummary = document.getElementById('stats-summary');
    
    if (statsSummary) statsSummary.style.display = 'grid';
    const results = getSearchResults();
    
    let totalComics = 0;
    let totalPages = 0;
    results.forEach(title => {
        totalComics += title.comics.length;
        totalPages += title.comics.reduce((sum, c) => sum + (c.pages || 0), 0);
    });
    
    const statComics = document.getElementById('stat-total-comics');
    const statPages = document.getElementById('stat-total-pages');
    if (statComics) statComics.textContent = totalComics;
    if (statPages) statPages.textContent = totalPages.toLocaleString();
    
    if (folderGrid) folderGrid.style.display = 'none';
    if (comicsContainer) {
        comicsContainer.style.display = 'grid';
        
        if (results.length === 0) {
            comicsContainer.className = 'comics-grid';
            comicsContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <div class="empty-title">No results found</div>
                    <p>No titles match "${state.searchQuery}" ${state.searchScope === 'current' ? 'in the current location' : 'anywhere in the library'}.</p>
                </div>
            `;
            return;
        }
        
        const sortedResults = [...results].sort((a, b) => a.name.localeCompare(b.name));
        
        const items = sortedResults.map(title => {
            const comicCount = title.comics.length;
            const progressStats = aggregateProgress(title.comics, state.readingProgress);
            const escapedName = title.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const coverIds = getTitleCoverIds(title);
            // Use routerNavigate to ensure hash updates and history works
            const onClick = `window.routerNavigate('library', { title: \`${escapedName}\` })`;
            
            return {
                title: title.name,
                coverIds: coverIds,
                progressPercent: progressStats.percent,
                badgeText: `${comicCount} ch`,
                metaText: `<span class="comic-chapter">${comicCount} chapter${comicCount !== 1 ? 's' : ''}</span>`,
                extraClasses: 'title-card',
                metaItems: [`${comicCount} chapters`, `${progressStats.totalPages} pages`],
                actionText: 'View',
                stats: [{ value: comicCount, label: 'Chapters' }],
                buttons: [{ text: '▶ View Series', class: 'primary', onClick: onClick }],
                onClick: onClick
            };
        });
        
        renderItems(comicsContainer, items, state.viewMode);
        
        // Sync selection state if we are already in selection mode
        if (window.updateSelectionUI) window.updateSelectionUI();
        if (window.updateSelectionButtonState) window.updateSelectionButtonState();
    }
}

// Create debounced version of handleSearch (300ms delay)
const debouncedHandleSearch = debounce(handleSearch, 300);

// Make globally available
window.renderSearchResults = renderSearchResults;
window.handleSearch = debouncedHandleSearch;
window.toggleSearchScope = toggleSearchScope;
