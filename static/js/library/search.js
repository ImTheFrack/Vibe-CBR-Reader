import { state } from '../state.js';
import { renderItems, getTitleCoverIds } from '../components/index.js';
import { aggregateProgress } from '../utils/progress.js';

export function handleSearch(query) {
    state.searchQuery = query.trim();
    if (window.updateLibraryView) window.updateLibraryView();
}

export function toggleSearchScope() {
    state.searchScope = state.searchScope === 'current' ? 'everywhere' : 'current';
    const scopeBtn = document.getElementById('search-scope-btn');
    if (scopeBtn) scopeBtn.textContent = state.searchScope === 'current' ? '📍 Current' : '🌐 Everywhere';
    if (state.searchQuery && window.updateLibraryView) window.updateLibraryView();
}

export function getSearchResults() {
    if (!state.searchQuery) return [];
    const lowerQuery = state.searchQuery.toLowerCase();
    const titles = [];
    const seenTitles = new Set();
    
    let categoriesToSearch;
    if (!state.folderTree) return [];
    
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
                    if (title && title.name.toLowerCase().includes(lowerQuery)) return [title];
                }
            }
            return [];
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
                } else {
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
    }
}

// Make globally available
window.renderSearchResults = renderSearchResults;
window.handleSearch = handleSearch;
window.toggleSearchScope = toggleSearchScope;
