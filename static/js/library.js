/**
 * Library Module
 * Handles library loading, scanning, folder tree generation, and core browsing logic.
 * 
 * This module has been refactored to delegate to sub-modules:
 * - navigation.js: Basic navigation logic
 * - view-renderers.js: Complex UI rendering
 * - search.js: Search functionality
 */

import { state } from './state.js';
import { apiGet, apiDelete, apiPut } from './api.js';
import { showToast } from './utils.js';
import { startReading } from './reader.js';
import { renderFan, getTitleCoverIds } from './components/index.js';
import { sortItems, parseFileSize, TITLE_SORT_ACCESSORS, COMIC_SORT_ACCESSORS, FOLDER_SORT_ACCESSORS } from './utils/sorting.js';
import { navigate } from './router.js';

// Re-export sub-module functions
export { navigateToRoot, navigateToFolder, navigateUp, updateBreadcrumbs, navigateTitleComic } from './library/navigation.js';
export { updateLibraryView, renderFolderGrid, renderTitleCards, renderComicsView, renderTitleDetailView, showView, renderTitleFan } from './library/view-renderers.js';
export { handleSearch, toggleSearchScope, getSearchResults, renderSearchResults } from './library/search.js';

// Import for internal use
import { navigateToRoot, navigateToFolder, updateBreadcrumbs } from './library/navigation.js';
import { updateLibraryView, renderComicsView, renderTitleCards, renderFolderGrid } from './library/view-renderers.js';
import { handleSearch } from './library/search.js';

/**
 * Core Data Loading
 */

export async function loadLibrary() {
    try {
        const configResponse = await fetch('/api/config', { credentials: 'include' });
        if (configResponse.ok) {
            const config = await configResponse.json();
            state.libraryRoot = config.comics_dir;
        }

        const response = await fetch('/api/books', { credentials: 'include' });
        if (!response.ok) {
            if (response.status === 401) {
                state.comics = [];
                return;
            }
            throw new Error(`HTTP ${response.status}`);
        }
        state.comics = await response.json();
        buildFolderTree();
        await initFilters();
    } catch (error) {
        showToast('Failed to load library', 'error');
        console.error(error);
        state.comics = [];
    }
}

export async function initFilters() {
    try {
        const metadata = await apiGet('/api/series/metadata');
        if (metadata.error) return;

        const genreSelect = document.getElementById('filter-genre');
        const statusSelect = document.getElementById('filter-status');

        if (genreSelect) {
            genreSelect.innerHTML = '<option value="">All Genres</option>' + 
                metadata.genres.map(g => `<option value="${g}">${g}</option>`).join('');
        }

        if (statusSelect) {
            statusSelect.innerHTML = '<option value="">All Statuses</option>' + 
                metadata.statuses.map(s => `<option value="${s}">${s}</option>`).join('');
        }
    } catch (err) {
        console.error('Failed to init filters:', err);
    }
}

export function handleFilterChange() {
    state.filters.genre = document.getElementById('filter-genre').value;
    state.filters.status = document.getElementById('filter-status').value;
    state.filters.read = document.getElementById('filter-read').value;
    
    updateLibraryView();
}

window.handleFilterChange = handleFilterChange;

export async function scanLibrary(e) {
    if (e && e.shiftKey) {
        const btn = e.target.closest('button') || e.target.closest('.menu-item');
        if (!state.awaitingRescan) {
            state.awaitingRescan = true;
            if (btn) {
                btn.originalText = btn.innerHTML;
                btn.innerHTML = '<span>⚠️</span> Confirm Rescan';
                btn.classList.add('btn-danger');
            }
            showToast('⚠️ Click again to ERASE database and rescan!', 'warning');
            return;
        }
        state.awaitingRescan = false;
        if (btn && btn.originalText) {
            btn.innerHTML = btn.originalText;
            btn.classList.remove('btn-danger');
        }
        try {
            showToast('Starting full wipe and rescan...', 'info');
            const response = await fetch('/api/rescan', { method: 'POST', credentials: 'include' });
            if (!response.ok) throw new Error(`Rescan failed: ${response.status}`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            showToast('Rescan started.', 'success');
            await loadLibrary();
        } catch (error) {
            showToast('Failed to rescan: ' + error.message, 'error');
        }
        return;
    }

    state.awaitingRescan = false;
    try {
        showToast('Scanning...', 'info');
        const response = await fetch('/api/scan', { method: 'POST', credentials: 'include' });
        if (!response.ok) throw new Error('Scan failed');
        showToast('Scan started!', 'success');
        setTimeout(async () => { await loadLibrary(); }, 5000);
    } catch (error) {
        showToast('Failed to scan: ' + error.message, 'error');
    }
}

/**
 * Data Processing
 */

export function buildFolderTree() {
    const root = { name: 'Library', categories: {}, count: 0 };
    if (!Array.isArray(state.comics)) state.comics = [];
    
    const normRoot = state.libraryRoot ? state.libraryRoot.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() : '';
    
    state.comics.forEach(comic => {
        let fullPath = comic.path.replace(/\\/g, '/');
        let relPath = '';
        const lowerPath = fullPath.toLowerCase();
        
        if (normRoot && lowerPath.includes(normRoot)) {
            const index = lowerPath.indexOf(normRoot);
            relPath = fullPath.substring(index + normRoot.length);
        } else {
            const fallbackMarkers = ['/manga/', '/comics/', '/media/'];
            for (const marker of fallbackMarkers) {
                if (lowerPath.includes(marker)) {
                    relPath = fullPath.substring(lowerPath.lastIndexOf(marker) + marker.length);
                    break;
                }
            }
        }
        
        if (!relPath || relPath.includes(':/')) {
            const parts = fullPath.split('/').filter(s => s && !s.includes(':') && s !== 'ArrData' && s !== 'media' && s !== 'comics' && s !== 'manga')
                .filter(p => !p.toLowerCase().endsWith('.cbz') && !p.toLowerCase().endsWith('.cbr'));
            buildTreeFromParts(root, parts, comic);
            return;
        }

        relPath = relPath.replace(/^\/+|\/+$/g, '');
        const parts = relPath.split('/').filter(p => p && !p.toLowerCase().endsWith('.cbz') && !p.toLowerCase().endsWith('.cbr'));
        buildTreeFromParts(root, parts, comic);
    });
    state.folderTree = root;
}

function buildTreeFromParts(root, parts, comic) {
    if (parts.length >= 3) {
        const [catName, subName, titleName] = parts;
        if (!root.categories[catName]) root.categories[catName] = { name: catName, subcategories: {}, count: 0 };
        const category = root.categories[catName];
        category.count++;
        if (!category.subcategories[subName]) category.subcategories[subName] = { name: subName, titles: {}, count: 0 };
        const sub = category.subcategories[subName];
        sub.count++;
        if (!sub.titles[titleName]) sub.titles[titleName] = { name: titleName, comics: [], count: 0 };
        sub.titles[titleName].comics.push(comic);
        sub.titles[titleName].count++;
        root.count++;
    } else if (parts.length === 2) {
        const [catName, subName] = parts;
        if (!root.categories[catName]) root.categories[catName] = { name: catName, subcategories: {}, count: 0 };
        const category = root.categories[catName];
        category.count++;
        if (!category.subcategories[subName]) category.subcategories[subName] = { name: subName, titles: {}, count: 0 };
        const sub = category.subcategories[subName];
        sub.count++;
        const titleName = comic.title || comic.series || 'Unknown';
        if (!sub.titles[titleName]) sub.titles[titleName] = { name: titleName, comics: [], count: 0 };
        sub.titles[titleName].comics.push(comic);
        sub.titles[titleName].count++;
        root.count++;
    } else if (parts.length === 1) {
        const catName = parts[0];
        if (!root.categories[catName]) root.categories[catName] = { name: catName, subcategories: {}, count: 0 };
        root.categories[catName].count++;
        root.count++;
        if (!root.categories[catName].subcategories['_direct']) root.categories[catName].subcategories['_direct'] = { name: 'Uncategorized', titles: {}, count: 0 };
        const sub = root.categories[catName].subcategories['_direct'];
        sub.count++;
        const titleName = comic.title || 'Unknown';
        if (!sub.titles[titleName]) sub.titles[titleName] = { name: titleName, comics: [], count: 0 };
        sub.titles[titleName].comics.push(comic);
        sub.titles[titleName].count++;
    }
}

/**
 * State Queries
 */

export function getFoldersAtLevel() {
    const tree = state.folderTree;
    if (!tree) return [];
    switch (state.currentLevel) {
        case 'root': return Object.values(tree.categories || {});
        case 'category':
            const category = tree.categories[state.currentLocation.category];
            return category ? Object.values(category.subcategories) : [];
        case 'subcategory':
            const cat = tree.categories[state.currentLocation.category];
            if (!cat) return [];
            const sub = cat.subcategories[state.currentLocation.subcategory];
            return sub ? Object.values(sub.titles) : [];
        default: return [];
    }
}

export function getTitlesInLocation() {
    const tree = state.folderTree;
    if (!tree) return [];
    let titles = [];
    if (state.currentLevel === 'root') {
        Object.values(tree.categories || {}).forEach(cat => {
            Object.values(cat.subcategories).forEach(sub => { titles = titles.concat(Object.values(sub.titles)); });
        });
    } else if (state.currentLevel === 'category') {
        const cat = tree.categories[state.currentLocation.category];
        if (cat) Object.values(cat.subcategories).forEach(sub => { titles = titles.concat(Object.values(sub.titles)); });
    } else if (state.currentLevel === 'subcategory') {
        const cat = tree.categories[state.currentLocation.category];
        if (cat) {
            const sub = cat.subcategories[state.currentLocation.subcategory];
            if (sub) titles = Object.values(sub.titles);
        }
    } else if (state.currentLevel === 'title') {
        const cat = tree.categories[state.currentLocation.category];
        if (cat) {
            const sub = cat.subcategories[state.currentLocation.subcategory];
            if (sub) {
                const title = sub.titles[state.currentLocation.title];
                if (title) titles = [title];
            }
        }
    }

    // Apply Filters
    const { genre, status, read } = state.filters;
    if (genre || status || read) {
        titles = titles.filter(title => {
            const firstComic = title.comics[0];
            
            // Genre/Status filters require metadata (from state.comics or cached series data)
            // But state.folderTree titles have comics, and comics have category which is often the source of genre if not in series.json
            // Actually, we should ideally have series metadata loaded for all titles.
            // For now, let's use the metadata we have in state.comics (though it's limited).
            
            // Note: genres/status are usually in the series table, but we don't have them all in state.comics for every title yet.
            // Let's assume for now that if we are filtering by genre/status, it's a global filter and we might need to fetch series data.
            // But wait, state.comics has 'category' which we use as a rough genre.
            
            if (genre) {
                // Check if any comic in title has the genre
                // Genres is now an array in comic metadata
                const hasGenre = title.comics.some(c => 
                    (c.genres && c.genres.includes(genre)) || 
                    c.category === genre
                );
                if (!hasGenre) return false;
            }
            
            if (status) {
                // Check series status
                const hasStatus = title.comics.some(c => c.series_status === status);
                if (!hasStatus) return false;
            }
            
            if (read) {
                const progress = title.comics.map(c => state.readingProgress[c.id]).filter(Boolean);
                const allCompleted = progress.length === title.comics.length && progress.every(p => p.completed);
                const someStarted = progress.some(p => p.page > 0 || p.completed);
                
                if (read === 'completed' && !allCompleted) return false;
                if (read === 'unread' && someStarted) return false;
                if (read === 'reading' && (!someStarted || allCompleted)) return false;
            }
            
            return true;
        });
    }

    return titles;
}

export function getComicsInTitle() {
    const tree = state.folderTree;
    if (!tree || state.currentLevel !== 'title') return [];
    const cat = tree.categories[state.currentLocation.category];
    if (cat) {
        const sub = cat.subcategories[state.currentLocation.subcategory];
        if (sub) {
            const title = sub.titles[state.currentLocation.title];
            if (title) {
                let comics = title.comics;
                
                // Apply Read Filter to individual comics
                const readFilter = state.filters.read;
                if (readFilter) {
                    comics = comics.filter(c => {
                        const prog = state.readingProgress[c.id];
                        if (readFilter === 'completed') return prog && prog.completed;
                        if (readFilter === 'unread') return !prog || (!prog.completed && prog.page === 0);
                        if (readFilter === 'reading') return prog && !prog.completed && prog.page > 0;
                        return true;
                    });
                }
                
                return comics;
            }
        }
    }
    return [];
}

/**
 * UI State Management
 */

export function toggleFlattenMode() {
    state.flattenMode = !state.flattenMode;
    const flattenCheckbox = document.getElementById('flatten-checkbox');
    if (flattenCheckbox) flattenCheckbox.checked = state.flattenMode;
    updateLibraryView();
    if (window.updateSelectionButtonState) window.updateSelectionButtonState();
    showToast(state.flattenMode ? 'Flatten mode enabled' : 'Flatten mode disabled', 'info');
}

export function updateLibraryHeader() {
    const titleEl = document.getElementById('library-title');
    const subtitleEl = document.getElementById('library-subtitle');
    const iconEl = document.getElementById('section-icon');
    if (!titleEl || !subtitleEl || !iconEl) return;

    if (state.searchQuery) {
        iconEl.textContent = '🔍';
        titleEl.textContent = 'Search Results';
        const resultsCount = window.getSearchResults ? window.getSearchResults().length : 0;
        subtitleEl.textContent = `Found ${resultsCount} results for "${state.searchQuery}"`;
    } else if (state.currentLevel === 'root') {
        iconEl.textContent = '📚';
        titleEl.textContent = 'Categories';
        subtitleEl.textContent = state.flattenMode ? 'All titles' : 'Select a category';
    } else if (state.currentLevel === 'category') {
        iconEl.textContent = '📁';
        titleEl.textContent = state.currentLocation.category;
        subtitleEl.textContent = 'Select a subcategory';
    } else if (state.currentLevel === 'subcategory') {
        iconEl.textContent = '📂';
        titleEl.textContent = state.currentLocation.subcategory === '_direct' ? 'Uncategorized' : state.currentLocation.subcategory;
        subtitleEl.textContent = 'Select a title';
    } else if (state.currentLevel === 'title') {
        iconEl.textContent = '📖';
        titleEl.textContent = state.currentLocation.title;
        subtitleEl.textContent = '';
    }
}

export function renderFolderSidebar() {
    const container = document.getElementById('folder-tree');
    const tree = state.folderTree;
    if (!tree || !container) return;
    let html = '';
    
    if (state.currentLevel === 'root') {
        html += `<div class="sidebar-section-title">Categories</div>`;
        Object.values(tree.categories || {}).forEach(category => {
            html += `<div class="folder-item"><div class="folder-header" onclick="routerNavigate('library', { category: \`${category.name}\` })"><span class="folder-icon">📁</span><span class="folder-name">${category.name}</span><span class="folder-count">${category.count}</span></div></div>`;
        });
    } else if (state.currentLevel === 'category') {
        const cat = tree.categories[state.currentLocation.category];
        if (cat) {
            html += `<div class="folder-item back-item"><div class="folder-header back-button" onclick="routerNavigate('library', {})"><span class="folder-icon">←</span><span class="folder-name">Back</span></div></div><div class="sidebar-section-title">${cat.name}</div>`;
            Object.values(cat.subcategories).forEach(sub => {
                const subName = sub.name === '_direct' ? 'Uncategorized' : sub.name;
                html += `<div class="folder-item"><div class="folder-header" onclick="routerNavigate('library', { category: \`${state.currentLocation.category}\`, subcategory: \`${sub.name}\` })"><span class="folder-icon">📁</span><span class="folder-name">${subName}</span><span class="folder-count">${sub.count}</span></div></div>`;
            });
        }
    } else if (state.currentLevel === 'subcategory' || state.currentLevel === 'title') {
        const cat = tree.categories[state.currentLocation.category];
        if (cat) {
            const sub = cat.subcategories[state.currentLocation.subcategory];
            if (sub) {
                const subName = sub.name === '_direct' ? 'Uncategorized' : sub.name;
                html += `<div class="folder-item back-item"><div class="folder-header back-button" onclick="routerNavigate('library', { category: \`${state.currentLocation.category}\` })"><span class="folder-icon">←</span><span class="folder-name">Back</span></div></div><div class="sidebar-section-title">${subName}</div>`;
                Object.values(sub.titles).forEach(title => {
                    const isActive = state.currentLocation.title === title.name;
                    html += `<div class="folder-item"><div class="folder-header ${isActive ? 'active' : ''}" onclick="routerNavigate('library', { category: \`${state.currentLocation.category}\`, subcategory: \`${state.currentLocation.subcategory}\`, title: \`${title.name.replace(/'/g, "\\'")}\` })"><span class="folder-icon">📚</span><span class="folder-name">${title.name}</span><span class="folder-count">${title.count}</span></div></div>`;
                });
            }
        }
    }
    container.innerHTML = html;
}

export function updateStatsForCurrentView() {
    let comics = [];
    if (state.currentLevel === 'title') comics = getComicsInTitle();
    else if (state.flattenMode || state.currentLevel === 'subcategory') {
        getTitlesInLocation().forEach(title => { comics = comics.concat(title.comics); });
    }
    updateStats(comics);
}

export function updateStats(comics) {
    const totalComics = document.getElementById('stat-total-comics');
    if (totalComics) totalComics.textContent = comics.length;
    
    const totalPages = document.getElementById('stat-total-pages');
    if (totalPages) totalPages.textContent = comics.reduce((sum, c) => sum + (c.pages || 0), 0).toLocaleString();
    
    const totalSizeEl = document.getElementById('stat-total-size');
    if (totalSizeEl) {
        const totalSize = comics.reduce((sum, c) => {
            const match = (c.size_str || '0 MB').match(/([\d.]+)\s*(B|KB|MB|GB)/);
            if (match) return sum + (parseFloat(match[1]) * { B: 1, KB: 1024, MB: 1024**2, GB: 1024**3 }[match[2]]);
            return sum;
        }, 0);
        totalSizeEl.textContent = totalSize > 1024**3 ? (totalSize / 1024**3).toFixed(1) + ' GB' : (totalSize / 1024**2).toFixed(1) + ' MB';
    }
    
    const readingEl = document.getElementById('stat-reading');
    if (readingEl) readingEl.textContent = comics.filter(c => state.readingProgress[c.id] && !state.readingProgress[c.id].completed).length;
}

export function setViewMode(mode) {
    state.viewMode = mode;
    document.querySelectorAll('.view-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === mode));
    if (state.isAuthenticated) apiPut('/api/preferences', { default_view_mode: mode });
    updateLibraryView();
}

export function handleSort(sortValue) {
    state.sortBy = sortValue;
    if (state.isAuthenticated) apiPut('/api/preferences', { default_sort_by: sortValue });
    updateLibraryView();
}

/**
 * Legacy Support & Integration
 */

export function toggleMobileSidebar() {
    state.sidebarVisible = !state.sidebarVisible;
    updateLibraryView();
}

export async function loadRecentProgressFromAPI() {
    if (!state.isAuthenticated) return [];
    const result = await apiGet('/api/progress/recent');
    return (!result.error && Array.isArray(result)) ? result : [];
}

export async function loadRecentReads() {
    // If state.comics is empty, wait a moment and try again once (in case loadLibrary is finishing)
    if (state.comics.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
        if (state.comics.length === 0) {
            const grid = document.getElementById('recent-grid');
            if (grid) grid.innerHTML = '<div class="empty-state"><div class="empty-icon">📖</div><div class="empty-title">Library is loading...</div></div>';
            return;
        }
    }

    let recentComics = [];
    if (state.isAuthenticated) {
        const apiRecent = await loadRecentProgressFromAPI();
        recentComics = apiRecent.map(item => {
            const comic = state.comics.find(c => c.id === item.comic_id);
            if (!comic) return null;
            
            // Handle potentially missing pages count
            const totalPages = comic.pages || 0;
            const currentPage = item.current_page || 0;
            const percent = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
            
            return { 
                ...comic, 
                progress: { 
                    page: currentPage, 
                    completed: item.completed, 
                    lastRead: item.last_read ? new Date(item.last_read).getTime() : Date.now(),
                    percent: percent
                } 
            };
        }).filter(Boolean);
    } else {
        const recentIds = Object.keys(state.readingProgress).sort((a, b) => state.readingProgress[b].lastRead - state.readingProgress[a].lastRead).slice(0, 12);
        recentComics = recentIds.map(id => {
            const comic = state.comics.find(c => c.id === id);
            if (!comic) return null;
            
            const prog = state.readingProgress[id];
            const totalPages = comic.pages || 0;
            const percent = totalPages > 0 ? Math.round((prog.page / totalPages) * 100) : 0;
            
            return { ...comic, progress: { ...prog, percent: percent } };
        }).filter(Boolean);
    }
    
    const grid = document.getElementById('recent-grid');
    if (!grid) return;
    if (recentComics.length === 0) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-icon">📖</div><div class="empty-title">No recent reads</div></div>';
    } else {
        grid.innerHTML = recentComics.map(comic => {
            const prog = comic.progress;
            const chText = comic.chapter ? `Ch. ${comic.chapter}` : (comic.volume ? `Vol. ${comic.volume}` : 'One-shot');
            const percent = prog.percent || 0;
            
            return `
                <div class="comic-card" onclick="continueReading('${comic.id}')">
                    <button class="card-remove-btn" onclick="event.stopPropagation(); removeSingleHistory('${comic.id}')">×</button>
                    <div class="comic-cover">
                        <img src="/api/cover/${comic.id}" loading="lazy">
                        <div class="comic-progress">
                            <div class="comic-progress-bar" style="width: ${percent}%"></div>
                        </div>
                        <div class="comic-badge">${percent}%</div>
                    </div>
                    <div class="comic-info">
                        <div class="comic-title">${comic.title}</div>
                        <div class="comic-meta">
                            <span>${chText}</span> • <span>Page ${prog.page + 1}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

export function openComic(comicId) {
    // This is the old "Series Detail View" renderer that was in app.js
    // For now we keep it here for compatibility, but it could be moved.
    const comic = state.comics.find(c => c.id === comicId);
    if (!comic) return;
    
    const seriesComics = state.comics.filter(c => c.series === comic.series).sort((a, b) => {
        if (a.volume !== b.volume) return (a.volume || 0) - (b.volume || 0);
        return (a.chapter || 0) - (b.chapter || 0);
    });

    const detailDiv = document.getElementById('series-detail');
    if (!detailDiv) return;
    
    detailDiv.innerHTML = `
        <div class="series-hero">
            <div class="series-cover"><img src="/api/cover/${comicId}"></div>
            <div class="series-info">
                <h1>${comic.series}</h1>
                <div class="series-meta"><span class="series-tag status">${comic.category}</span>${comic.volume ? `<span class="series-tag">Vol. ${comic.volume}</span>` : ''}${comic.chapter ? `<span class="series-tag">Ch. ${comic.chapter}</span>` : ''}</div>
                <div class="series-actions"><button class="btn-primary" onclick="startReading('${comicId}')">Read Now</button><button class="btn-secondary" onclick="history.back()">Back</button></div>
            </div>
        </div>
        <div class="chapter-list">${seriesComics.map(c => `<div class="chapter-item" onclick="startReading('${c.id}')"><div class="chapter-title">${c.chapter ? `Chapter ${c.chapter}` : c.filename}</div></div>`).join('')}</div>
    `;
    if (window.showView) window.showView('series');
}

export function continueReading(comicId) {
    const progress = state.readingProgress[comicId];
    startReading(comicId, progress ? progress.page : 0);
}

export function toggleSynopsis(id) {
    const el = document.getElementById(`synopsis-${id}`);
    if (el) el.classList.toggle('expanded');
}

export function toggleMeta(id) {
    const el = document.getElementById(`meta-content-${id}`);
    if (el) el.classList.toggle('expanded');
}

export function handleLibraryClick() {
    navigate('library', {});
}

export async function handleRateSeries(seriesId, rating) {
    try {
        const result = await apiPost('/api/series/rating', { series_id: seriesId, rating: rating });
        if (result.error) throw new Error(result.error);
        showToast("Rating saved!", "success");
        // Re-render detail view to show updated rating
        if (window.renderTitleDetailView) await window.renderTitleDetailView();
    } catch (error) { showToast("Failed to rate: " + error.message, "error"); }
}

window.handleRateSeries = handleRateSeries;

async function purgeHistory() {
    try {
        const result = await apiDelete('/api/progress');
        if (result.error) throw new Error(result.error);
        showToast("History purged", "success");
        await loadRecentReads();
    } catch (error) { showToast("Failed: " + error.message, "error"); }
}

async function removeSingleHistory(comicId) {
    try {
        const result = await apiDelete(`/api/progress/${comicId}`);
        if (result.error) throw new Error(result.error);
        showToast("Removed", "success");
        await loadRecentReads();
    } catch (error) { showToast("Failed: " + error.message, "error"); }
}

// Global Exports for HTML
window.getFoldersAtLevel = getFoldersAtLevel;
window.getTitlesInLocation = getTitlesInLocation;
window.getComicsInTitle = getComicsInTitle;
window.updateLibraryHeader = updateLibraryHeader;
window.renderFolderSidebar = renderFolderSidebar;
window.updateStatsForCurrentView = updateStatsForCurrentView;
window.confirmPurgeHistory = async () => { if (confirm("Purge history?")) await purgeHistory(); };
window.removeSingleHistory = removeSingleHistory;
window.toggleSynopsis = toggleSynopsis;
window.toggleMeta = toggleMeta;
window.navigateToRoot = navigateToRoot;
window.navigateToFolder = navigateToFolder;
window.navigateTitleComic = navigateTitleComic;
window.renderTitleFan = renderTitleFan;
window.loadRecentReads = loadRecentReads;
window.continueReading = continueReading;