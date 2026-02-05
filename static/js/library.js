import { state } from './state.js';
import { apiGet, apiPost, apiPut, apiDelete } from './api.js';
import { showToast } from './utils.js';
import { startReading } from './reader.js';
import { renderItems, renderFan, getTitleCoverIds, getFolderCoverIds } from './components/index.js';
import { calculateComicProgress, aggregateProgress } from './utils/progress.js';
import { sortItems, parseFileSize, TITLE_SORT_ACCESSORS, COMIC_SORT_ACCESSORS, FOLDER_SORT_ACCESSORS } from './utils/sorting.js';
import { navigate } from './router.js';

// Library Loading
export async function loadLibrary() {
    try {
        // Fetch library config first
        const configResponse = await fetch('/api/config', { credentials: 'include' });
        if (configResponse.ok) {
            const config = await configResponse.json();
            state.libraryRoot = config.comics_dir;
        }

        const response = await fetch('/api/books', { credentials: 'include' });
        if (!response.ok) {
            if (response.status === 401) {
                // Not authenticated, don't show error
                state.comics = [];
                return;
            }
            throw new Error(`HTTP ${response.status}`);
        }
        state.comics = await response.json();
        
        // Parse file paths to build folder structure
        buildFolderTree();
    } catch (error) {
        showToast('Failed to load library', 'error');
        console.error(error);
        state.comics = [];
    }
}

export async function scanLibrary(e) {
    // Check if shift key is held for full rescan
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
        
        // Confirm rescan
        state.awaitingRescan = false;
        if (btn && btn.originalText) {
            btn.innerHTML = btn.originalText;
            btn.classList.remove('btn-danger');
        }
        
        try {
            showToast('Starting full wipe and rescan...', 'info');
            const response = await fetch('/api/rescan', { method: 'POST', credentials: 'include' });
            if (!response.ok) throw new Error(`Rescan failed: ${response.status} ${response.statusText}`);
            
            // Wait longer for rescan as it wipes DB
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            showToast('Rescan started. This may take a while.', 'success');
            
            // Reload library
            await loadLibrary();
        } catch (error) {
            showToast('Failed to rescan: ' + error.message, 'error');
        }
        return;
    }

    // Normal scan
    state.awaitingRescan = false;
    const btn = e && e.target ? e.target.closest('button') : null;
    if (btn && btn.originalText) {
        btn.innerHTML = btn.originalText;
        btn.classList.remove('btn-danger');
    }

    try {
        showToast('Scanning... please wait', 'info');
        const response = await fetch('/api/scan', { method: 'POST', credentials: 'include' });
        if (!response.ok) throw new Error('Scan failed');
        const result = await response.json();
        
        showToast('Scan started! Check Scan Status page for progress.', 'success');
        
        // Reload library after a short delay to show new comics
        setTimeout(async () => {
            await loadLibrary();
        }, 5000);
    } catch (error) {
        showToast('Failed to scan library: ' + error.message, 'error');
    }
}

// Build folder tree from comic paths
export function buildFolderTree() {
    const root = { 
        name: 'Library', 
        categories: {},
        count: 0 
    };
    
    // Ensure comics is an array
    if (!Array.isArray(state.comics)) {
        state.comics = [];
    }
    
    // Normalize library root for comparison
    const normRoot = state.libraryRoot ? state.libraryRoot.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() : '';
    
    state.comics.forEach(comic => {
        let fullPath = comic.path.replace(/\\/g, '/');
        let relPath = '';
        
        const lowerPath = fullPath.toLowerCase();
        
        // Strategy 1: Subtraction of library root
        if (normRoot && lowerPath.includes(normRoot)) {
            const index = lowerPath.indexOf(normRoot);
            relPath = fullPath.substring(index + normRoot.length);
        } else {
            // Strategy 2: Fallback if subtraction fails
            const fallbackMarkers = ['/manga/', '/comics/', '/media/'];
            for (const marker of fallbackMarkers) {
                if (lowerPath.includes(marker)) {
                    const index = lowerPath.lastIndexOf(marker);
                    relPath = fullPath.substring(index + marker.length);
                    break;
                }
            }
        }
        
        // Strategy 3: Heuristic skip if still absolute
        if (!relPath || relPath.includes(':/')) {
            const pathSegments = fullPath.split('/').filter(s => s && !s.includes(':') && s !== 'ArrData' && s !== 'media' && s !== 'comics' && s !== 'manga');
            const parts = pathSegments.filter(p => !p.toLowerCase().endsWith('.cbz') && !p.toLowerCase().endsWith('.cbr'));
            buildTreeFromParts(root, parts, comic);
            return;
        }

        // Clean up leading/trailing slashes
        relPath = relPath.replace(/^\/+|\/+$/g, '');
        const parts = relPath.split('/').filter(p => p && !p.toLowerCase().endsWith('.cbz') && !p.toLowerCase().endsWith('.cbr'));
        
        buildTreeFromParts(root, parts, comic);
    });
    
    state.folderTree = root;
}

// Helper to build tree from path parts
function buildTreeFromParts(root, parts, comic) {
    if (parts.length >= 3) {
        const categoryName = parts[0];
        const subcategoryName = parts[1];
        const titleName = parts[2];
        
        if (!root.categories[categoryName]) {
            root.categories[categoryName] = { name: categoryName, subcategories: {}, count: 0 };
        }
        const category = root.categories[categoryName];
        category.count++;
        
        if (!category.subcategories[subcategoryName]) {
            category.subcategories[subcategoryName] = { name: subcategoryName, titles: {}, count: 0 };
        }
        const subcategory = category.subcategories[subcategoryName];
        subcategory.count++;
        
        if (!subcategory.titles[titleName]) {
            subcategory.titles[titleName] = { name: titleName, comics: [], count: 0 };
        }
        const title = subcategory.titles[titleName];
        title.comics.push(comic);
        title.count++;
        
        root.count++;
    } else if (parts.length === 2) {
        const categoryName = parts[0];
        const subcategoryName = parts[1];
        
        if (!root.categories[categoryName]) {
            root.categories[categoryName] = { name: categoryName, subcategories: {}, count: 0 };
        }
        const category = root.categories[categoryName];
        category.count++;
        
        if (!category.subcategories[subcategoryName]) {
            category.subcategories[subcategoryName] = { name: subcategoryName, titles: {}, count: 0 };
        }
        const subcategory = category.subcategories[subcategoryName];
        subcategory.count++;
        
        const titleName = comic.title || comic.series || 'Unknown';
        if (!subcategory.titles[titleName]) {
            subcategory.titles[titleName] = { name: titleName, comics: [], count: 0 };
        }
        subcategory.titles[titleName].comics.push(comic);
        subcategory.titles[titleName].count++;
        
        root.count++;
    } else if (parts.length === 1) {
        const categoryName = parts[0];
        
        if (!root.categories[categoryName]) {
            root.categories[categoryName] = { name: categoryName, subcategories: {}, count: 0 };
        }
        root.categories[categoryName].count++;
        root.count++;
        
        const subcategoryKey = '_direct';
        if (!root.categories[categoryName].subcategories[subcategoryKey]) {
            root.categories[categoryName].subcategories[subcategoryKey] = { name: 'Uncategorized', titles: {}, count: 0 };
        }
        const subcategory = root.categories[categoryName].subcategories[subcategoryKey];
        subcategory.count++;
        
        const titleName = comic.title || 'Unknown';
        if (!subcategory.titles[titleName]) {
            subcategory.titles[titleName] = { name: titleName, comics: [], count: 0 };
        }
        subcategory.titles[titleName].comics.push(comic);
        subcategory.titles[titleName].count++;
    }
}

export function getFoldersAtLevel() {
    const tree = state.folderTree;
    if (!tree) return []; // Guard against null folderTree
    switch (state.currentLevel) {
        case 'root': return Object.values(tree.categories || {});
        case 'category':
            const category = tree.categories[state.currentLocation.category];
            return category ? Object.values(category.subcategories) : [];
        case 'subcategory':
            const cat = tree.categories[state.currentLocation.category];
            if (!cat) return [];
            const subcategory = cat.subcategories[state.currentLocation.subcategory];
            return subcategory ? Object.values(subcategory.titles) : [];
        case 'title': return [];
        default: return [];
    }
}

export function getTitlesInLocation() {
    const tree = state.folderTree;
    if (!tree) return []; // Guard against null folderTree
    let titles = [];
    
    if (state.currentLevel === 'root') {
        Object.values(tree.categories || {}).forEach(category => {
            Object.values(category.subcategories).forEach(subcategory => {
                titles = titles.concat(Object.values(subcategory.titles));
            });
        });
    } else if (state.currentLevel === 'category') {
        const category = tree.categories[state.currentLocation.category];
        if (category) {
            Object.values(category.subcategories).forEach(subcategory => {
                titles = titles.concat(Object.values(subcategory.titles));
            });
        }
    } else if (state.currentLevel === 'subcategory') {
        const category = tree.categories[state.currentLocation.category];
        if (category) {
            const subcategory = category.subcategories[state.currentLocation.subcategory];
            if (subcategory) {
                titles = Object.values(subcategory.titles);
            }
        }
    } else if (state.currentLevel === 'title') {
        const category = tree.categories[state.currentLocation.category];
        if (category) {
            const subcategory = category.subcategories[state.currentLocation.subcategory];
            if (subcategory) {
                const title = subcategory.titles[state.currentLocation.title];
                if (title) titles = [title];
            }
        }
    }
    return titles;
}

export function getComicsInTitle() {
    const tree = state.folderTree;
    if (!tree) return []; // Guard against null folderTree
    if (state.currentLevel === 'title') {
        const category = tree.categories[state.currentLocation.category];
        if (category) {
            const subcategory = category.subcategories[state.currentLocation.subcategory];
            if (subcategory) {
                const title = subcategory.titles[state.currentLocation.title];
                if (title) return title.comics;
            }
        }
    }
    return [];
}

export function navigateToRoot() {
    state.currentLevel = 'root';
    state.currentLocation = { category: null, subcategory: null, title: null };
    state.searchQuery = '';
    updateLibraryView();
}

export function navigateToFolder(type, name) {
    if (type === 'category') {
        state.currentLevel = 'category';
        state.currentLocation.category = name;
        state.currentLocation.subcategory = null;
        state.currentLocation.title = null;
    } else if (type === 'subcategory') {
        state.currentLevel = 'subcategory';
        state.currentLocation.subcategory = name;
        state.currentLocation.title = null;
    } else if (type === 'title') {
        state.currentLevel = 'title';
        state.currentLocation.title = name;
        
        if (state.currentLocation.subcategory === null) {
            if (state.currentLocation.category === null && state.folderTree) {
                for (const [catName, category] of Object.entries(state.folderTree.categories || {})) {
                    let found = false;
                    for (const [subName, subcategory] of Object.entries(category.subcategories)) {
                        if (subcategory.titles[name]) {
                            state.currentLocation.category = category.name;
                            state.currentLocation.subcategory = subcategory.name;
                            found = true;
                            break;
                        }
                    }
                    if (found) break;
                }
            } else if (state.folderTree) {
                const category = state.folderTree.categories[state.currentLocation.category];
                if (category) {
                    for (const [subName, subcategory] of Object.entries(category.subcategories || {})) {
                        if (subcategory.titles[name]) {
                            state.currentLocation.subcategory = subcategory.name;
                            break;
                        }
                    }
                }
            }
        }
    }
    state.searchQuery = '';
    updateLibraryView();
}

export function navigateUp() {
    let params = {};
    
    switch (state.currentLevel) {
        case 'title':
            params = {
                category: state.currentLocation.category,
                subcategory: state.currentLocation.subcategory
            };
            break;
        case 'subcategory':
            params = {
                category: state.currentLocation.category
            };
            break;
        case 'category':
            params = {};
            break;
        default:
            return;
    }
    
    navigate('library', params);
}

export function toggleFlattenMode() {
    state.flattenMode = !state.flattenMode;
    const flattenCheckbox = document.getElementById('flatten-checkbox');
    if (flattenCheckbox) flattenCheckbox.checked = state.flattenMode;
    updateLibraryView();
    showToast(state.flattenMode ? 'Flatten mode enabled' : 'Flatten mode disabled', 'info');
}

export function updateLibraryView() {
    updateBreadcrumbs();
    renderFolderSidebar();
    
    const container = document.getElementById('content-area');
    const folderGrid = document.getElementById('folder-grid');
    const comicsContainer = document.getElementById('comics-container');
    const statsSummary = document.getElementById('stats-summary');
    const sidebar = document.getElementById('folder-sidebar');
    const libraryLayout = document.getElementById('library-layout');
    
    if (state.searchQuery) {
        renderSearchResults();
        return;
    }
    
    const shouldHideSidebar = state.currentLevel === 'title' || !state.sidebarVisible;
    sidebar.style.display = shouldHideSidebar ? 'none' : 'block';
    libraryLayout.classList.toggle('sidebar-hidden', shouldHideSidebar);

    if (state.currentLevel === 'title') {
        statsSummary.style.display = 'flex';
        statsSummary.classList.add('compact');
        updateStatsForCurrentView();
        folderGrid.style.display = 'none';
        comicsContainer.className = 'title-view-container';
        comicsContainer.style.display = 'block';
        renderTitleDetailView();
    } else {
        statsSummary.classList.remove('compact');
        comicsContainer.className = 'comics-grid';
        
        if (state.flattenMode || state.currentLevel === 'subcategory') {
            statsSummary.style.display = 'grid';
            updateStatsForCurrentView();
        } else {
            statsSummary.style.display = 'none';
        }
    }
    
    if (state.currentLevel === 'title') {
        // Handled above
    } else if (state.flattenMode || state.currentLevel === 'subcategory') {
        folderGrid.style.display = 'none';
        comicsContainer.className = 'comics-grid';
        comicsContainer.style.display = 'grid';
        renderTitleCards();
    } else {
        const folders = getFoldersAtLevel();
        if (folders.length > 0) {
            folderGrid.style.display = 'grid';
            comicsContainer.style.display = 'none';
            renderFolderGrid(folders);
        } else {
            folderGrid.style.display = 'none';
            comicsContainer.className = 'comics-grid';
            comicsContainer.style.display = 'grid';
            comicsContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📂</div>
                    <div class="empty-title">No items found</div>
                    <p>This location is empty.</p>
                </div>
            `;
        }
    }
    updateLibraryHeader();
}

export function updateLibraryHeader() {
    const titleEl = document.getElementById('library-title');
    const subtitleEl = document.getElementById('library-subtitle');
    const iconEl = document.getElementById('section-icon');
    
    if (state.searchQuery) {
        iconEl.textContent = '🔍';
        titleEl.textContent = 'Search Results';
        const resultsCount = getSearchResults().length;
        subtitleEl.textContent = `Found ${resultsCount} result${resultsCount !== 1 ? 's' : ''} for "${state.searchQuery}"`;
    } else if (state.currentLevel === 'root') {
        iconEl.textContent = '📚';
        titleEl.textContent = 'Categories';
        subtitleEl.textContent = state.flattenMode ? 'All titles in your library' : 'Select a category to browse';
    } else if (state.currentLevel === 'category') {
        iconEl.textContent = '📁';
        titleEl.textContent = state.currentLocation.category;
        subtitleEl.textContent = state.flattenMode ? 'All titles in this category' : 'Select a subcategory';
    } else if (state.currentLevel === 'subcategory') {
        iconEl.textContent = '📂';
        const subcategoryName = state.currentLocation.subcategory === '_direct' ? 'Uncategorized' : state.currentLocation.subcategory;
        titleEl.textContent = subcategoryName;
        subtitleEl.textContent = state.flattenMode ? 'All titles' : 'Select a title to read';
    } else if (state.currentLevel === 'title') {
        iconEl.textContent = '📖';
        titleEl.textContent = state.currentLocation.title;
        subtitleEl.textContent = '';
    }
}

export function updateBreadcrumbs() {
    const container = document.getElementById('breadcrumbs');
    const parts = ['<span class="breadcrumb-link" onclick="routerNavigate(\'library\', {})">Library</span>'];
    
    if (state.currentLevel === 'category') {
        parts.push(`<span class="breadcrumb-current">${state.currentLocation.category}</span>`);
    } else if (state.currentLevel === 'subcategory') {
        parts.push(`<span class="breadcrumb-link" onclick="routerNavigate('library', { category: '${state.currentLocation.category}' })">${state.currentLocation.category}</span>`);
        const subName = state.currentLocation.subcategory === '_direct' ? 'Uncategorized' : state.currentLocation.subcategory;
        parts.push(`<span class="breadcrumb-current">${subName}</span>`);
    } else if (state.currentLevel === 'title') {
        if (state.currentLocation.category) {
            parts.push(`<span class="breadcrumb-link" onclick="routerNavigate('library', { category: '${state.currentLocation.category}' })">${state.currentLocation.category}</span>`);
        }
        if (state.currentLocation.subcategory) {
            const subName = state.currentLocation.subcategory === '_direct' ? 'Uncategorized' : state.currentLocation.subcategory;
            parts.push(`<span class="breadcrumb-link" onclick="routerNavigate('library', { category: '${state.currentLocation.category}', subcategory: '${state.currentLocation.subcategory}' })">${subName}</span>`);
        }
    }
    
    container.innerHTML = parts.join(' <span class="breadcrumb-separator">›</span> ');
}

export function renderTitleFan(title) {
    return renderFan(getTitleCoverIds(title));
}

export function renderFolderGrid(folders) {
    const container = document.getElementById('folder-grid');
    if (folders.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    const sortedFolders = sortItems(folders, state.sortBy, FOLDER_SORT_ACCESSORS);
    
    const items = sortedFolders.map(folder => {
        let clickHandler, meta, typeLabel, itemCount;
        const folderName = folder.name === '_direct' ? 'Uncategorized' : folder.name;
        const escapedName = folder.name.replace(/'/g, "\\'");
        
        if (state.currentLevel === 'root') {
            clickHandler = `window.routerNavigate('library', { category: '${escapedName}' })`;
            const subcatCount = Object.keys(folder.subcategories).length;
            let titleCount = 0;
            Object.values(folder.subcategories).forEach(sub => { titleCount += Object.keys(sub.titles).length; });
            meta = `${subcatCount} subcategor${subcatCount === 1 ? 'y' : 'ies'}, ${titleCount} title${titleCount === 1 ? '' : 's'}`;
            typeLabel = 'Category';
            itemCount = titleCount;
        } else {
            clickHandler = `window.routerNavigate('library', { category: '${state.currentLocation.category.replace(/'/g, "\\'")}', subcategory: '${escapedName}' })`;
            const titleCount = Object.keys(folder.titles).length;
            meta = `${titleCount} title${titleCount === 1 ? '' : 's'}`;
            typeLabel = 'Subcategory';
            itemCount = titleCount;
        }
        
        const coverIds = getFolderCoverIds(folder);

        return {
            // Shared
            title: folderName,
            coverIds: coverIds,
            isFolder: true,
            
            // Grid
            metaText: meta,
            
            // List
            metaItems: [
                typeLabel,
                meta
            ],
            statValue: itemCount,
            statLabel: 'Items',
            actionText: 'Open',
            
            // Detailed
            subtitle: typeLabel,
            badges: [
                { text: `${itemCount} Items`, class: 'accent' }
            ],
            stats: [
                { value: itemCount, label: 'Titles' },
                { value: '-', label: 'Size' },
                { value: '-', label: 'Progress' },
                { value: 'DIR', label: 'Format' }
            ],
            description: `Folder containing ${meta}. Click to browse contents.`,
            buttons: [
                { text: '▶ Open Folder', class: 'primary', onClick: clickHandler }
            ],
            
            // Events
            onClick: clickHandler
        };
    });

    renderItems(container, items, state.viewMode);
}



export function renderTitleCards() {
    const container = document.getElementById('comics-container');
    const titles = getTitlesInLocation();
    
    if (titles.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📂</div>
                <div class="empty-title">No titles found</div>
                <p>No titles available at this location.</p>
            </div>
        `;
        return;
    }
    
    const sortedTitles = sortItems(titles, state.sortBy, TITLE_SORT_ACCESSORS(state.readingProgress));
    
    const items = sortedTitles.map(title => {
        const firstComic = title.comics[0];
        const comicCount = title.comics.length;
        const progressStats = aggregateProgress(title.comics, state.readingProgress);
        
        // Calculate size
        const totalSize = title.comics.reduce((sum, c) => sum + parseFileSize(c.size_str), 0);
        let sizeDisplay;
        if (totalSize > 1024**3) sizeDisplay = (totalSize / 1024**3).toFixed(1) + ' GB';
        else if (totalSize > 1024**2) sizeDisplay = (totalSize / 1024**2).toFixed(1) + ' MB';
        else sizeDisplay = (totalSize / 1024).toFixed(1) + ' KB';

        const escapedName = title.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const displayTitle = title.name.replace(/"/g, '&quot;');
        
        // Get cover IDs for fan
        const coverIds = getTitleCoverIds(title);

        const onClick = `navigateToFolder('title', '${escapedName}')`;

        // Determine cover style
        const titleCardStyle = state.settings.titleCardStyle;
        let itemCoverIds = coverIds;
        let itemCoverUrl = undefined;
        
        if (titleCardStyle === 'single' && coverIds.length > 0) {
            itemCoverIds = undefined; // Disable fan
            itemCoverUrl = `/api/cover/${coverIds[0]}`; // Use first cover
        }

        return {
            // Shared
            title: title.name,
            coverIds: itemCoverIds,
            coverUrl: itemCoverUrl,
            
            // Grid
            progressPercent: progressStats.percent,
            badgeText: `${comicCount} ch`,
            metaText: `<span class="comic-chapter">${comicCount} chapter${comicCount !== 1 ? 's' : ''}</span>${state.currentLevel === 'root' ? `<span>${firstComic.category || 'Uncategorized'}</span>` : ''}`,
            dataAttrs: `data-title-name="${displayTitle}"`,
            extraClasses: 'title-card',
            
            // List
            metaItems: [
                `${comicCount} chapters`,
                firstComic.category,
                `${progressStats.totalPages} pages total`,
                `${Math.round(progressStats.percent)}% read`
            ],
            statValue: sizeDisplay,
            statLabel: 'Total Size',
            actionText: 'View',
            
            // Detailed
            subtitle: firstComic.category,
            badges: [
                { text: `${comicCount} Chapters`, class: 'accent' },
                { text: `${progressStats.totalPages} Pages` }
            ],
            stats: [
                { value: comicCount, label: 'Chapters' },
                { value: sizeDisplay, label: 'Total Size' },
                { value: `${Math.round(progressStats.percent)}%`, label: 'Total Progress' },
                { value: firstComic.filename.split('.').pop().toUpperCase(), label: 'Format' }
            ],
            description: `Series containing ${comicCount} chapters or volumes. Total of ${progressStats.totalPages} pages. ${progressStats.readPages > 0 ? `You have read ${progressStats.readPages} pages (${Math.round(progressStats.percent)}%).` : 'Not started.'}`,
            buttons: [
                { text: '▶ View Series', class: 'primary', onClick: onClick }
            ],
            
            // Events
            onClick: onClick
        };
    });
    
    renderItems(container, items, state.viewMode);
}



export function renderComicsView() {
    const container = document.getElementById('comics-container');
    const comics = getComicsInTitle();
    
    if (comics.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📚</div>
                <div class="empty-title">No comics found</div>
                <p>This title is empty.</p>
            </div>
        `;
        return;
    }
    
    // Use unified sorting
    // We need to pass the readingProgress to the accessor factory
    const sortedComics = sortItems(comics, state.sortBy, COMIC_SORT_ACCESSORS(state.readingProgress));
    
    // Transform data for the unified renderer
    const items = sortedComics.map(comic => {
        const progressStats = calculateComicProgress(comic, state.readingProgress);
        const chapterText = comic.chapter ? `Ch. ${comic.chapter}` : (comic.volume ? `Vol. ${comic.volume}` : 'One-shot');
        
        return {
            // Shared
            id: comic.id,
            title: comic.title,
            coverUrl: `/api/cover/${comic.id}`,
            
            // Grid
            progressPercent: progressStats.percent,
            badgeText: chapterText,
            metaText: `<span>${chapterText}</span><span>•</span><span>${comic.category}</span>`,
            
            // List
            metaItems: [
                chapterText,
                comic.category,
                `${comic.pages} pages`,
                progressStats.isCompleted ? '✓ Completed' : (progressStats.hasProgress ? `${Math.round(progressStats.percent)}%` : 'Unread')
            ],
            statValue: comic.size_str || 'Unknown',
            statLabel: 'Size',
            actionText: 'Read',
            onAction: `startReading('${comic.id}')`,
            
            // Detailed
            subtitle: comic.series,
            badges: [
                { text: comic.category, class: 'accent' },
                { text: chapterText },
                ...(progressStats.isCompleted ? [{ text: '✓ Completed', style: 'background: var(--success);' }] : [])
            ],
            stats: [
                { value: comic.pages, label: 'Pages' },
                { value: comic.size_str || 'Unknown', label: 'File Size' },
                { value: `${Math.round(progressStats.percent)}%`, label: 'Progress' },
                { value: comic.filename.split('.').pop().toUpperCase(), label: 'Format' }
            ],
            description: `${comic.series} - ${chapterText}. ${progressStats.hasProgress ? `You've read ${progressStats.readPages} of ${progressStats.totalPages} pages (${Math.round(progressStats.percent)}% complete).` : 'Not started yet. Click to begin reading.'}`,
            buttons: [
                { text: progressStats.hasProgress ? '▶ Continue Reading' : '▶ Start Reading', class: 'primary', onClick: `startReading('${comic.id}')` },
                { text: '📖 View Details', class: 'secondary', onClick: `window.routerNavigate('series', { name: '${comic.series.replace(/'/g, "\\'")}' })` }
            ],
            
            // Events
            onClick: `window.routerNavigate('series', { name: '${comic.series.replace(/'/g, "\\'")}' })`
        };
    });

    renderItems(container, items, state.viewMode);
}

export async function renderTitleDetailView() {
    const container = document.getElementById('comics-container');
    const titleName = state.currentLocation.title;
    
    if (!titleName) return;
    
    container.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>Loading series information...</p>
        </div>
    `;
    
    const seriesData = await apiGet(`/api/series/${encodeURIComponent(titleName)}`);
    
    if (seriesData.error) {
        renderComicsView();
        return;
    }
    
    state.currentSeries = seriesData;
    const uniqueId = Math.random().toString(36).substr(2, 9);
    
    const title = seriesData.title || seriesData.name || titleName;
    const coverId = seriesData.cover_comic_id || (seriesData.comics && seriesData.comics[0] && seriesData.comics[0].id);
    const authors = Array.isArray(seriesData.authors) ? seriesData.authors : (seriesData.authors ? [seriesData.authors] : []);
    const genres = Array.isArray(seriesData.genres) ? seriesData.genres : (seriesData.genres ? [seriesData.genres] : []);
    const tags = Array.isArray(seriesData.tags) ? seriesData.tags : (seriesData.tags ? [seriesData.tags] : []);
    const demographics = Array.isArray(seriesData.demographics) ? seriesData.demographics : (seriesData.demographics ? [seriesData.demographics] : []);
    
    const statusTag = seriesData.status ? `<span class="meta-tag status ${seriesData.status.toLowerCase().replace(/\s+/g, '-')}">${seriesData.status}</span>` : '';
    const yearTag = seriesData.release_year ? `<span class="meta-tag year">${seriesData.release_year}</span>` : '';
    const genreTags = genres.map(g => `<span class="meta-tag genre">${g}</span>`).join('');
    const demoTags = demographics.map(d => `<span class="meta-tag demographic">${d}</span>`).join('');
    
    const authorsDisplay = authors.length > 0 ? `<div class="meta-section"><span class="meta-label">Authors:</span> ${authors.join(', ')}</div>` : '';
    
    // Combine all tags
    const allTags = [...demographics, ...genres, ...tags];
    const allTagsHtml = allTags.length > 0 ? `
        <div class="tags-row">
            ${allTags.map(t => `<span class="meta-tag tag">${t}</span>`).join('')}
        </div>
    ` : '';

    const malLink = seriesData.mal_id ? `<a href="https://myanimelist.net/manga/${seriesData.mal_id}" target="_blank" class="external-link mal">🔗 MAL</a>` : '';
    const anilistLink = seriesData.anilist_id ? `<a href="https://anilist.co/manga/${seriesData.anilist_id}" target="_blank" class="external-link anilist">🔗 AniList</a>` : '';
    const externalLinks = malLink || anilistLink ? `<div class="external-links-inline">${malLink}${anilistLink}</div>` : '';
    
    const synonyms = seriesData.synonyms || [];
    const synonymsHtml = synonyms.length > 0 ? `<div class="synonyms">Also known as: ${synonyms.join(', ')}</div>` : '';
    
    const metadataSection = `
        <div class="title-metadata-compact">
            <div class="meta-header-row">
                <div class="meta-toggle-btn" onclick="window.toggleMeta('${uniqueId}')">
                    <span class="meta-expand-icon" id="meta-icon-${uniqueId}">▶</span>
                </div>
                ${allTagsHtml}
            </div>
            <div class="meta-expand-content" id="meta-content-${uniqueId}">
                ${synonymsHtml}
                <div class="title-meta-row-compact">
                    ${statusTag}
                    ${yearTag}
                    ${externalLinks}
                </div>
                ${authorsDisplay}
            </div>
        </div>
    `;

    const fileCountHtml = `<div class="meta-section" style="margin-top: 16px;"><span class="meta-label">Files:</span> ${seriesData.comics ? seriesData.comics.length : 0} chapters available</div>`;

    let quickActions = '';
    if (seriesData.continue_reading) {
        const cr = seriesData.continue_reading;
        const actionText = cr.page > 0 ? 'Continue Reading' : 'Start Reading';
        const chapterText = cr.chapter ? `Ch. ${cr.chapter}` : (cr.volume ? `Vol. ${cr.volume}` : '');
        quickActions = `
            <button class="btn-primary btn-large" onclick="startReading('${cr.comic_id}', ${cr.page})">
                <span>▶</span> ${actionText} ${chapterText ? `- ${chapterText}` : ''}
            </button>
        `;
    } else if (seriesData.comics && seriesData.comics.length > 0) {
        quickActions = `
            <button class="btn-primary btn-large" onclick="startReading('${seriesData.comics[0].id}')">
                <span>▶</span> Start Reading
            </button>
        `;
    }
    
    const readFirstBtn = seriesData.comics && seriesData.comics.length > 0 ? `
        <button class="btn-secondary" onclick="startReading('${seriesData.comics[0].id}')">Read First</button>
    ` : '';
    
    const lastComic = seriesData.comics && seriesData.comics[seriesData.comics.length - 1];
    const readLatestBtn = lastComic ? `
        <button class="btn-secondary" onclick="startReading('${lastComic.id}')">Read Latest</button>
    ` : '';
    
    const navButtons = `
        <div class="title-nav-buttons">
            <button class="nav-btn prev" onclick="navigateTitleComic(-1)" title="Previous chapter/volume">← Prev</button>
            <button class="nav-btn next" onclick="navigateTitleComic(1)" title="Next chapter/volume">Next →</button>
        </div>
    `;
    
    const comicsHtml = seriesData.comics ? seriesData.comics.map((comic, index) => {
        const progress = comic.user_progress;
        const progressPercent = progress ? Math.round((progress.current_page / comic.pages) * 100) : 0;
        const isCompleted = progress && progress.completed;
        const isInProgress = progress && !progress.completed && progress.current_page > 0;
        const chapterText = comic.chapter ? `Chapter ${comic.chapter}` : (comic.volume ? `Volume ${comic.volume}` : comic.filename);
        const readStatus = isCompleted ? 'completed' : isInProgress ? 'in-progress' : '';
        const statusIcon = isCompleted ? '✓' : isInProgress ? '⏸' : '';
        
        const prevBtn = comic.prev_comic ? `<button class="chapter-nav prev" onclick="event.stopPropagation(); startReading('${comic.prev_comic.id}')" title="Previous: ${comic.prev_comic.title}">←</button>` : '';
        const nextBtn = comic.next_comic ? `<button class="chapter-nav next" onclick="event.stopPropagation(); startReading('${comic.next_comic.id}')" title="Next: ${comic.next_comic.title}">→</button>` : '';
        
        return `
            <div class="chapter-card ${readStatus}" onclick="startReading('${comic.id}')">
                <div class="chapter-nav-buttons">${prevBtn}${nextBtn}</div>
                <div class="chapter-cover">
                    <img src="/api/cover/${comic.id}" alt="${chapterText}" loading="lazy">
                    ${progress ? `<div class="chapter-progress"><div class="progress-bar" style="width: ${progressPercent}%"></div></div>` : ''}
                    ${statusIcon ? `<div class="chapter-status">${statusIcon}</div>` : ''}
                </div>
                <div class="chapter-info">
                    <div class="chapter-title">${chapterText}</div>
                    <div class="chapter-meta">${comic.pages} pages ${progress ? `• ${progressPercent}% read` : ''}</div>
                </div>
            </div>
        `;
    }).join('') : '';
    
    // Synopsis
    // Use the unique ID generated at the top for the synopsis to toggle
    const synopsisHtml = seriesData.synopsis ? 
        `<div class="series-synopsis-block" onclick="window.toggleSynopsis('${uniqueId}')">
            <div class="synopsis-toggle-icon" id="toggle-icon-${uniqueId}">▶</div>
            <p class="series-synopsis-text" id="synopsis-${uniqueId}">${seriesData.synopsis}</p>
        </div>` : '';

    container.innerHTML = `
        <div class="title-detail-container">
            <button class="back-btn-inline" onclick="history.back()">
                <span>←</span> Back
            </button>
            <div class="title-details-grid">
                <div class="title-details-left">
                    ${synopsisHtml}
                </div>
                <div class="title-details-right">
                    ${metadataSection}
                </div>
            </div>
            
            <div class="title-actions-bar">
                ${quickActions}
                ${readFirstBtn}
                ${readLatestBtn}
            </div>
            ${fileCountHtml}
            
            <div class="chapters-section">
                <div class="chapters-grid">${comicsHtml || '<p>No chapters available.</p>'}</div>
            </div>
        </div>
    `;
}

export function navigateTitleComic(direction) {
    if (!state.currentSeries || !state.currentSeries.comics) return;
    const comics = state.currentSeries.comics;
    let targetComic = null;
    
    if (direction === -1) {
        for (let i = comics.length - 1; i >= 0; i--) {
            const progress = comics[i].user_progress;
            if (progress && !progress.completed) {
                targetComic = comics[i];
                break;
            }
        }
        if (!targetComic && comics.length > 0) targetComic = comics[comics.length - 1];
    } else {
        for (let i = 0; i < comics.length; i++) {
            const progress = comics[i].user_progress;
            if (!progress || (!progress.completed && progress.current_page === 0)) {
                targetComic = comics[i];
                break;
            }
        }
        if (!targetComic) {
            for (let i = 0; i < comics.length; i++) {
                const progress = comics[i].user_progress;
                if (progress && !progress.completed) {
                    targetComic = comics[i];
                    break;
                }
            }
        }
        if (!targetComic && comics.length > 0) targetComic = comics[0];
    }
    
    if (targetComic) {
        const progress = targetComic.user_progress;
        const page = progress && !progress.completed ? progress.current_page : 0;
        startReading(targetComic.id, page);
    }
}



export function renderFolderSidebar() {
    const container = document.getElementById('folder-tree');
    const tree = state.folderTree;
    if (!tree || !container) return; // Guard against null
    let html = '';
    
    if (state.currentLevel === 'root') {
        html += `<div class="sidebar-section-title">Categories</div>`;
        Object.values(tree.categories || {}).forEach(category => {
            html += `
                <div class="folder-item">
                    <div class="folder-header" onclick="routerNavigate('library', { category: '${category.name}' })">
                        <span class="folder-icon">📁</span><span class="folder-name">${category.name}</span><span class="folder-count">${category.count}</span>
                    </div>
                </div>
            `;
        });
    } else if (state.currentLevel === 'category') {
        const category = tree.categories[state.currentLocation.category];
        if (category) {
            html += `
                <div class="folder-item back-item">
                    <div class="folder-header back-button" onclick="routerNavigate('library', {})">
                        <span class="folder-icon">←</span><span class="folder-name">Back to Categories</span>
                    </div>
                </div>
                <div class="sidebar-section-title">${category.name}</div>
            `;
            Object.values(category.subcategories).forEach(subcategory => {
                const subName = subcategory.name === '_direct' ? 'Uncategorized' : subcategory.name;
                html += `
                    <div class="folder-item">
                        <div class="folder-header" onclick="routerNavigate('library', { category: '${state.currentLocation.category}', subcategory: '${subcategory.name}' })">
                            <span class="folder-icon">📁</span><span class="folder-name">${subName}</span><span class="folder-count">${subcategory.count}</span>
                        </div>
                    </div>
                `;
            });
        }
    } else if (state.currentLevel === 'subcategory' || state.currentLevel === 'title') {
        const category = tree.categories[state.currentLocation.category];
        if (category) {
            const subcategory = category.subcategories[state.currentLocation.subcategory];
            if (subcategory) {
                const subName = subcategory.name === '_direct' ? 'Uncategorized' : subcategory.name;
                html += `
                    <div class="folder-item back-item">
                        <div class="folder-header back-button" onclick="routerNavigate('library', { category: '${state.currentLocation.category}' })">
                            <span class="folder-icon">←</span><span class="folder-name">Back to ${state.currentLocation.category}</span>
                        </div>
                    </div>
                    <div class="sidebar-section-title">${subName}</div>
                `;
                Object.values(subcategory.titles).forEach(title => {
                    const isActive = state.currentLocation.title === title.name;
                    html += `
                        <div class="folder-item">
                            <div class="folder-header ${isActive ? 'active' : ''}" onclick="routerNavigate('library', { category: '${state.currentLocation.category}', subcategory: '${state.currentLocation.subcategory}', title: '${title.name.replace(/'/g, "\\'")}' })">
                                <span class="folder-icon">📚</span><span class="folder-name">${title.name}</span><span class="folder-count">${title.count}</span>
                            </div>
                        </div>
                    `;
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
        const titles = getTitlesInLocation();
        titles.forEach(title => { comics = comics.concat(title.comics); });
    }
    updateStats(comics);
}

export function updateStats(comics) {
    document.getElementById('stat-total-comics').textContent = comics.length;
    const totalPages = comics.reduce((sum, c) => sum + (c.pages || 0), 0);
    document.getElementById('stat-total-pages').textContent = totalPages.toLocaleString();
    
    const totalSize = comics.reduce((sum, c) => {
        const sizeStr = c.size_str || '0 MB';
        const match = sizeStr.match(/([\d.]+)\s*(B|KB|MB|GB)/);
        if (match) {
            const val = parseFloat(match[1]);
            const unit = match[2];
            const multiplier = { B: 1, KB: 1024, MB: 1024**2, GB: 1024**3 }[unit];
            return sum + (val * multiplier);
        }
        return sum;
    }, 0);
    
    let sizeDisplay;
    if (totalSize > 1024**3) sizeDisplay = (totalSize / 1024**3).toFixed(1) + ' GB';
    else if (totalSize > 1024**2) sizeDisplay = (totalSize / 1024**2).toFixed(1) + ' MB';
    else sizeDisplay = (totalSize / 1024).toFixed(1) + ' KB';
    
    document.getElementById('stat-total-size').textContent = sizeDisplay;
    const reading = comics.filter(c => state.readingProgress[c.id] && !state.readingProgress[c.id].completed).length;
    document.getElementById('stat-reading').textContent = reading;
}

export function setViewMode(mode) {
    state.viewMode = mode;
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === mode);
    });
    
    // Save preference if logged in
    if (state.isAuthenticated) {
        apiPut('/api/preferences', { default_view_mode: mode });
    }

    if (state.currentLevel === 'title') {
        renderComicsView();
    } else if (state.flattenMode || state.currentLevel === 'subcategory') {
        renderTitleCards();
    } else if (!state.flattenMode && (state.currentLevel === 'root' || state.currentLevel === 'category')) {
        const folders = getFoldersAtLevel();
        renderFolderGrid(folders);
    }
}

export function handleSort(sortValue) {
    state.sortBy = sortValue;
    
    // Save preference if logged in
    if (state.isAuthenticated) {
        apiPut('/api/preferences', { default_sort_by: sortValue });
    }

    if (state.currentLevel === 'title') {
        renderComicsView();
    } else if (state.flattenMode || state.currentLevel === 'subcategory') {
        renderTitleCards();
    } else if (!state.flattenMode && (state.currentLevel === 'root' || state.currentLevel === 'category')) {
        const folders = getFoldersAtLevel();
        renderFolderGrid(folders);
    }
}



export function handleSearch(query) {
    state.searchQuery = query.trim();
    if (!state.searchQuery) {
        updateLibraryView();
        return;
    }
    updateLibraryView();
}

export function toggleSearchScope() {
    state.searchScope = state.searchScope === 'current' ? 'everywhere' : 'current';
    const scopeBtn = document.getElementById('search-scope-btn');
    if (scopeBtn) scopeBtn.textContent = state.searchScope === 'current' ? '📍 Current' : '🌐 Everywhere';
    if (state.searchQuery) updateLibraryView();
}

export function getSearchResults() {
    if (!state.searchQuery) return [];
    const lowerQuery = state.searchQuery.toLowerCase();
    const titles = [];
    const seenTitles = new Set();
    
    let categoriesToSearch;
    if (!state.folderTree) return []; // Guard against null folderTree
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
    
    statsSummary.style.display = 'grid';
    const results = getSearchResults();
    
    let totalComics = 0;
    let totalPages = 0;
    results.forEach(title => {
        totalComics += title.comics.length;
        totalPages += title.comics.reduce((sum, c) => sum + (c.pages || 0), 0);
    });
    
    document.getElementById('stat-total-comics').textContent = totalComics;
    document.getElementById('stat-total-pages').textContent = totalPages.toLocaleString();
    document.getElementById('stat-total-size').textContent = '-';
    document.getElementById('stat-reading').textContent = '-';
    
    folderGrid.style.display = 'none';
    comicsContainer.style.display = 'grid';
    
    if (results.length === 0) {
        comicsContainer.className = 'comics-grid'; // Default for empty
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
        
        // Use fan view for consistency
        const coverIds = getTitleCoverIds(title);
        const onClick = `navigateToFolder('title', '${escapedName}')`;
        
        return {
            // Shared
            title: title.name,
            coverIds: coverIds,
            
            // Grid
            progressPercent: progressStats.percent,
            badgeText: `${comicCount} ch`,
            metaText: `<span class="comic-chapter">${comicCount} chapter${comicCount !== 1 ? 's' : ''}</span>`,
            extraClasses: 'title-card',
            
            // List
            metaItems: [
                `${comicCount} chapters`,
                `${progressStats.totalPages} pages`
            ],
            actionText: 'View',
            
            // Detailed
            stats: [
                { value: comicCount, label: 'Chapters' }
            ],
            buttons: [
                { text: '▶ View Series', class: 'primary', onClick: onClick }
            ],
            
            // Events
            onClick: onClick
        };
    });
    
    renderItems(comicsContainer, items, state.viewMode);
}

export function toggleMobileSidebar() {
    state.sidebarVisible = !state.sidebarVisible;
    updateLibraryView();
}

export async function loadRecentProgressFromAPI() {
    if (!state.isAuthenticated) return [];
    const result = await apiGet('/api/progress/recent');
    if (!result.error && Array.isArray(result)) return result;
    return [];
}

export async function loadRecentReads() {
    let recentComics = [];
    
    if (state.isAuthenticated) {
        const apiRecent = await loadRecentProgressFromAPI();
        recentComics = apiRecent.map(item => {
            const comic = state.comics.find(c => c.id === item.comic_id);
            if (comic) {
                return {
                    ...comic,
                    progress: {
                        page: item.current_page,
                        completed: item.completed,
                        lastRead: new Date(item.last_read).getTime()
                    }
                };
            }
            return null;
        }).filter(Boolean);
    } else {
        const recentIds = Object.keys(state.readingProgress)
            .sort((a, b) => state.readingProgress[b].lastRead - state.readingProgress[a].lastRead)
            .slice(0, 12);
        
        recentComics = recentIds.map(id => {
            const comic = state.comics.find(c => c.id === id);
            if (comic) {
                return { ...comic, progress: state.readingProgress[id] };
            }
            return null;
        }).filter(Boolean);
    }
    
    const grid = document.getElementById('recent-grid');
    if (recentComics.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📖</div>
                <div class="empty-title">No recent reads</div>
                <p>Start reading some comics to see them here!</p>
            </div>
        `;
    } else {
        grid.innerHTML = recentComics.map(comic => {
            const progress = comic.progress;
            const chapterText = comic.chapter ? `Ch. ${comic.chapter}` : (comic.volume ? `Vol. ${comic.volume}` : 'One-shot');
            return `
                <div class="comic-card" onclick="continueReading('${comic.id}')">
                    <button class="card-remove-btn" onclick="event.stopPropagation(); removeSingleHistory('${comic.id}')" title="Remove from history">×</button>
                    <div class="comic-cover">
                        <img src="/api/cover/${comic.id}" alt="${comic.title}" loading="lazy">
                        <div class="comic-progress">
                            <div class="comic-progress-bar" style="width: ${(progress.page / comic.pages * 100)}%"></div>
                        </div>
                        <div class="comic-badge">${Math.round((progress.page / comic.pages) * 100)}%</div>
                    </div>
                    <div class="comic-info">
                        <div class="comic-title">${comic.title}</div>
                        <div class="comic-meta">
                            <span class="comic-chapter">${chapterText}</span>
                            <span>•</span>
                            <span>Page ${progress.page + 1}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

export function openComic(comicId) {
    const comic = state.comics.find(c => c.id === comicId);
    if (!comic) return;
    
    // For series detail view (this was confusingly named openComic in app.js, same as Detailed Card click handler)
    // The previous implementation of openComic rendered the "Series Detail View".
    
    // Actually, openComic in app.js renders #view-series.
    // I need to make sure I am doing the right thing.
    // Yes, renderDetailedCard calls openComic. renderGridCard calls openComic.
    
    const seriesComics = state.comics.filter(c => c.series === comic.series).sort((a, b) => {
        if (a.volume !== b.volume) return (a.volume || 0) - (b.volume || 0);
        return (a.chapter || 0) - (b.chapter || 0);
    });

    const detailDiv = document.getElementById('series-detail');
    detailDiv.innerHTML = `
        <div class="series-hero">
            <div class="series-cover">
                <img src="/api/cover/${comicId}" alt="${comic.title}">
            </div>
            <div class="series-info">
                <h1>${comic.series}</h1>
                <div class="series-meta">
                    <span class="series-tag status">${comic.category}</span>
                    ${comic.volume ? `<span class="series-tag">Vol. ${comic.volume}</span>` : ''}
                    ${comic.chapter ? `<span class="series-tag">Ch. ${comic.chapter}</span>` : ''}
                    <span class="series-tag">${comic.pages} pages</span>
                </div>
                <p class="series-synopsis">Click "Read Now" to start reading this comic. The reader supports multiple viewing modes including single page, double page, and long strip (webtoon) formats.</p>
                <div class="series-actions">
                    <button class="btn-primary" onclick="startReading('${comicId}')">
                        <span>▶</span> Read Now
                    </button>
                    <button class="btn-secondary" onclick="history.back()">
                        <span>←</span> Back
                    </button>
                </div>
            </div>
        </div>

        <div class="chapter-list">
            <div class="chapter-header">
                <h3>All Chapters</h3>
                <span class="chapter-count">${seriesComics.length} ${seriesComics.length === 1 ? 'chapter' : 'chapters'}</span>
            </div>
            ${seriesComics.map((c) => {
                const progress = state.readingProgress[c.id];
                const isReading = progress && progress.page > 0 && !progress.completed;
                const chapterTitle = c.chapter ? `Chapter ${c.chapter}` : (c.volume ? `Volume ${c.volume}` : c.filename);
                return `
                    <div class="chapter-item ${isReading ? 'reading' : ''}" onclick="startReading('${c.id}')">
                        <div class="chapter-info">
                            <div class="chapter-title">${chapterTitle}</div>
                            <div class="chapter-meta">
                                ${progress ? `Page ${progress.page + 1} of ${c.pages}` : `${c.pages} pages`}
                                ${progress?.completed ? ' • ✓ Completed' : ''}
                            </div>
                        </div>
                        <button class="chapter-read-btn">Read</button>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    showView('series');
}

export function continueReading(comicId) {
    const progress = state.readingProgress[comicId];
    const page = progress ? progress.page : 0;
    startReading(comicId, page);
}

export function toggleSynopsis(id) {
    const textEl = document.getElementById(`synopsis-${id}`);
    const iconEl = document.getElementById(`toggle-icon-${id}`);
    
    if (textEl) {
        textEl.classList.toggle('expanded');
        const isExpanded = textEl.classList.contains('expanded');
        if (iconEl) iconEl.textContent = isExpanded ? '▼' : '▶';
    }
}

export function toggleMeta(id) {
    const contentEl = document.getElementById(`meta-content-${id}`);
    const iconEl = document.getElementById(`meta-icon-${id}`);
    
    if (contentEl) {
        contentEl.classList.toggle('expanded');
        const isExpanded = contentEl.classList.contains('expanded');
        if (iconEl) iconEl.textContent = isExpanded ? '▼' : '▶';
    }
}

// Helper to show view (needs to be exported or available)
export function showView(viewName) {
    document.querySelectorAll('.header-btn').forEach(btn => btn.classList.remove('active'));
    if (viewName === 'library') document.getElementById('nav-library').classList.add('active');
    if (viewName === 'recent') document.getElementById('nav-recent').classList.add('active');
    if (viewName === 'tags') document.getElementById('nav-tags').classList.add('active');

    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');
    state.currentView = viewName;

    if (viewName === 'recent') {
        loadRecentReads();
    }
}

// Handle click on Library tab
export function handleLibraryClick() {
    navigate('library', {});
}

// Listen for preferences updates to re-render titles
document.addEventListener('preferences-updated', () => {
    // Re-render if we are viewing titles (either flat mode or in a subcategory)
    if (state.currentView === 'library' && (state.currentLevel === 'subcategory' || state.flattenMode)) {
        renderTitleCards();
    }
});

/**
 * History Management
 */

export async function confirmPurgeHistory() {
    if (confirm("Are you sure you want to purge your entire reading history? This cannot be undone.")) {
        await purgeHistory();
    }
}

export async function purgeHistory() {
    try {
        const result = await apiDelete('/api/progress');
        if (result.error) throw new Error(result.error);
        
        showToast("Reading history purged successfully", "success");
        
        // Refresh view
        await loadRecentReads();
    } catch (error) {
        console.error("Failed to purge history:", error);
        showToast("Failed to purge history: " + error.message, "error");
    }
}

export async function removeSingleHistory(comicId) {
    try {
        const result = await apiDelete(`/api/progress/${comicId}`);
        if (result.error) throw new Error(result.error);
        
        showToast("Item removed from history", "success");
        
        // Refresh view
        await loadRecentReads();
    } catch (error) {
        console.error("Failed to remove item from history:", error);
        showToast("Failed to remove item: " + error.message, "error");
    }
}

// Expose to window for HTML onclick
window.confirmPurgeHistory = confirmPurgeHistory;
window.removeSingleHistory = removeSingleHistory;
