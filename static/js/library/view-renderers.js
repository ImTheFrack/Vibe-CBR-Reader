import { state } from '../state.js';
import { apiPut } from '../api.js';
import { 
    renderItems, renderFan, getTitleCoverIds, getFolderCoverIds, getFolderCoverComics 
} from '../components/index.js';
import { calculateComicProgress, aggregateProgress } from '../utils/progress.js';
import { 
    sortItems, parseFileSize, TITLE_SORT_ACCESSORS, 
    COMIC_SORT_ACCESSORS, FOLDER_SORT_ACCESSORS 
} from '../utils/sorting.js';

import { updateBreadcrumbs } from './navigation.js';
import { renderTitleDetailView } from './renderers/detail-renderer.js';

export function updateLibraryView() {
    updateBreadcrumbs();
    // These functions should be available in this module or via window
    if (window.renderFolderSidebar) window.renderFolderSidebar();
    
    const folderGrid = document.getElementById('folder-grid');
    const comicsContainer = document.getElementById('comics-container');
    const statsSummary = document.getElementById('stats-summary');
    const sidebar = document.getElementById('folder-sidebar');
    const libraryLayout = document.getElementById('library-layout');
    const filtersContainer = document.getElementById('library-filters');
    
    // Sync button states
    const btnFolders = document.getElementById('btn-toggle-folders');
    if (btnFolders) btnFolders.classList.toggle('active', state.sidebarVisible);

    const btnFlatten = document.getElementById('btn-flatten');
    if (btnFlatten) {
        btnFlatten.classList.toggle('active', state.flattenMode);
        const isViewingTitlesOrChapters = state.currentLevel === 'subcategory' || state.currentLevel === 'title';
        btnFlatten.style.display = isViewingTitlesOrChapters ? 'none' : 'flex';
    }

    if (state.searchQuery) {
        if (filtersContainer) filtersContainer.style.display = 'flex';
        if (window.updateDynamicFilters) window.updateDynamicFilters();
        if (window.renderSearchResults) window.renderSearchResults();
        return;
    }
    
    const shouldHideSidebar = !state.sidebarVisible;
    if (sidebar) sidebar.style.display = shouldHideSidebar ? 'none' : 'block';
    if (libraryLayout) libraryLayout.classList.toggle('sidebar-hidden', shouldHideSidebar);

    const isViewingTitles = state.flattenMode || state.currentLevel === 'subcategory';
    if (filtersContainer) {
        filtersContainer.style.display = isViewingTitles ? 'flex' : 'none';
        if (isViewingTitles && window.updateDynamicFilters) {
            window.updateDynamicFilters();
        }
    }

    if (state.currentLevel === 'title') {
        if (statsSummary) {
            statsSummary.style.display = 'flex';
            statsSummary.classList.add('compact');
        }
        if (window.updateStatsForCurrentView) window.updateStatsForCurrentView();
        if (folderGrid) folderGrid.style.display = 'none';
        if (comicsContainer) {
            comicsContainer.className = 'title-view-container';
            comicsContainer.style.display = 'block';
        }
        renderTitleDetailView();
    } else {
        if (statsSummary) statsSummary.classList.remove('compact');
        if (comicsContainer) comicsContainer.className = 'comics-grid';
        
        if (state.flattenMode || state.currentLevel === 'subcategory') {
            if (statsSummary) statsSummary.style.display = 'grid';
            if (window.updateStatsForCurrentView) window.updateStatsForCurrentView();
        } else {
            if (statsSummary) statsSummary.style.display = 'none';
        }
    }
    
    if (state.currentLevel === 'title') {
        // Handled above
    } else if (state.flattenMode || state.currentLevel === 'subcategory') {
        if (folderGrid) folderGrid.style.display = 'none';
        if (comicsContainer) {
            comicsContainer.className = 'comics-grid';
            comicsContainer.style.display = 'grid';
        }
        renderTitleCards();
    } else {
        // Need access to getFoldersAtLevel which might stay in library.js or move to a data module
        if (window.getFoldersAtLevel) {
            const folders = window.getFoldersAtLevel();
            if (folders.length > 0) {
                if (folderGrid) folderGrid.style.display = 'grid';
                if (comicsContainer) comicsContainer.style.display = 'none';
                renderFolderGrid(folders);
            } else {
                if (folderGrid) folderGrid.style.display = 'none';
                if (comicsContainer) {
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
        }
    }
    if (window.updateLibraryHeader) window.updateLibraryHeader();
}

// Make globally available for other modules
window.updateLibraryView = updateLibraryView;

function buildFolderDescription(titlesWithCount, meta, folderClickHandler) {
    const sorted = [...titlesWithCount].sort((a, b) => b.count - a.count);
    const topTitles = sorted.slice(0, 5);
    const remaining = sorted.length - topTitles.length;

    if (topTitles.length === 0) return meta;

    const links = topTitles.map(t => {
        const escaped = t.name.replace(/'/g, "\\'").replace(/`/g, "\\`");
        return `<a class="folder-desc-link" onclick="event.stopPropagation(); window.routerNavigate('library', { title: \`${escaped}\` })">${t.name}</a> <span class="folder-desc-count">(${t.count})</span>`;
    });

    let html = links.join('<br>');
    if (remaining > 0) {
        html += `<br><a class="folder-desc-link folder-desc-more" onclick="event.stopPropagation(); ${folderClickHandler}">+ ${remaining} more</a>`;
    }
    return html;
}

export function renderFolderGrid(folders) {
    const container = document.getElementById('folder-grid');
    if (!container) return;
    
    if (folders.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    const sortedFolders = sortItems(folders, state.sortBy, FOLDER_SORT_ACCESSORS);
    
    const items = sortedFolders.map(folder => {
        let clickHandler, meta, typeLabel, itemCount;
        const folderName = folder.name === '_direct' ? 'Uncategorized' : folder.name;
        const escapedName = folder.name.replace(/'/g, "\\'");
        
        const allTitlesWithCount = [];
        const nsfwBlur = state.settings.nsfwMode === 'blur';
        let totalComics = 0;
        let nsfwComics = 0;
        function collectTitles(node) {
            if (node.titles) {
                Object.values(node.titles).forEach(t => {
                    allTitlesWithCount.push({ name: t.name, count: t.comics ? t.comics.length : 0 });
                    if (nsfwBlur && t.comics) {
                        t.comics.forEach(c => {
                            totalComics++;
                            if (c.is_nsfw) nsfwComics++;
                        });
                    }
                });
            }
            if (node.subcategories) Object.values(node.subcategories).forEach(sub => collectTitles(sub));
        }
        collectTitles(folder);
        const allTitleNames = allTitlesWithCount.map(t => t.name);
        const nsfwRatio = totalComics > 0 ? nsfwComics / totalComics : 0;
        const folderMostlyNsfw = nsfwBlur && nsfwRatio > 0.8;

        if (state.currentLevel === 'root') {
            clickHandler = `window.routerNavigate('library', { category: \`${escapedName}\` })`;
            const subcatCount = Object.keys(folder.subcategories).length;
            itemCount = allTitleNames.length;
            meta = `${subcatCount} subcategor${subcatCount === 1 ? 'y' : 'ies'}, ${itemCount} title${itemCount === 1 ? '' : 's'}`;
            typeLabel = 'Category';
        } else {
            clickHandler = `window.routerNavigate('library', { category: \`${state.currentLocation.category.replace(/'/g, "\\'")}\`, subcategory: \`${escapedName}\` })`;
            itemCount = Object.keys(folder.titles).length;
            meta = `${itemCount} title${itemCount === 1 ? '' : 's'}`;
            typeLabel = 'Subcategory';
        }
        
        let coverIds;
        let coverHtml = undefined;
        if (nsfwBlur && nsfwComics > 0 && !folderMostlyNsfw) {
            const coverComics = getFolderCoverComics(folder);
            coverIds = coverComics.map(c => c.id);
            const nsfwFlags = coverComics.map(c => !!c.is_nsfw);
            coverHtml = renderFan(coverIds, { nsfwFlags });
        } else {
            coverIds = getFolderCoverIds(folder);
        }

        const shuffled = [...allTitleNames].sort(() => Math.random() - 0.5);
        const sampleNames = shuffled.slice(0, 2);
        const remaining = allTitleNames.length - sampleNames.length;
        let sampleText = '';
        if (sampleNames.length > 0) {
            sampleText = sampleNames.join(', ');
            if (remaining > 0) sampleText += ` and ${remaining} more`;
        }

        return {
            title: folderName,
            coverIds: folderMostlyNsfw ? undefined : coverIds,
            coverHtml: folderMostlyNsfw ? renderFan(coverIds, { nsfwFlags: coverIds.map(() => true) }) : coverHtml,
            isFolder: false,
            extraClasses: folderMostlyNsfw ? 'folder-cover-card nsfw-content' : 'folder-cover-card',
            badgeText: `${itemCount} titles`,
            metaText: `<span class="comic-chapter">${typeLabel}</span><span>${sampleText || meta}</span>`,
            metaItems: [typeLabel, sampleText || meta],
            statValue: itemCount,
            statLabel: 'Titles',
            actionText: 'Open',
            subtitle: typeLabel,
            badges: [{ text: `${itemCount} Titles`, class: 'accent' }],
            stats: [
                { value: itemCount, label: 'Titles' },
                { value: '-', label: 'Size' },
                { value: '-', label: 'Progress' },
                { value: 'DIR', label: 'Format' }
            ],
            description: buildFolderDescription(allTitlesWithCount, meta, clickHandler),
            buttons: [{ text: '▶ Open Folder', class: 'primary', onClick: clickHandler }],
            onClick: clickHandler
        };
    });

    renderItems(container, items, state.viewMode);
}

export function renderTitleCards() {
    const container = document.getElementById('comics-container');
    if (!container) return;
    
    if (!window.getTitlesInLocation) return;
    const titles = window.getTitlesInLocation();
    
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
        
        const totalSize = title.comics.reduce((sum, c) => sum + parseFileSize(c.size_str), 0);
        let sizeDisplay;
        if (totalSize > 1024**3) sizeDisplay = (totalSize / 1024**3).toFixed(1) + ' GB';
        else if (totalSize > 1024**2) sizeDisplay = (totalSize / 1024**2).toFixed(1) + ' MB';
        else sizeDisplay = (totalSize / 1024).toFixed(1) + ' KB';

        const escapedName = title.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const displayTitle = title.name.replace(/"/g, '&quot;');
        const coverIds = getTitleCoverIds(title);
        const nsfwBlur = state.settings.nsfwMode === 'blur';
        const isNsfw = nsfwBlur && title.comics.some(c => c.is_nsfw);

        let onClick;
        if (state.currentLocation.category && state.currentLocation.subcategory) {
            onClick = `window.routerNavigate('library', { category: \`${state.currentLocation.category.replace(/'/g, "\\'")}\`, subcategory: \`${state.currentLocation.subcategory.replace(/'/g, "\\'")}\`, title: \`${escapedName}\` })`;
        } else {
            onClick = `window.routerNavigate('library', { title: \`${escapedName}\` })`;
        }

        const titleCardStyle = state.settings.titleCardStyle;
        let itemCoverIds = coverIds;
        let itemCoverUrl = undefined;
        let titleCoverHtml = undefined;
        
        if (titleCardStyle === 'single' && coverIds.length > 0) {
            itemCoverIds = undefined;
            itemCoverUrl = `/api/cover/${coverIds[0]}`;
            if (isNsfw) {
                titleCoverHtml = `<img src="${itemCoverUrl}" alt="${title.name}" loading="lazy" class="nsfw-blur">`;
            }
        } else if (isNsfw) {
            const nsfwFlags = coverIds.map(() => true);
            titleCoverHtml = renderFan(coverIds, { nsfwFlags });
            itemCoverIds = undefined;
        }

        return {
            title: title.name,
            coverIds: itemCoverIds,
            coverUrl: isNsfw ? undefined : itemCoverUrl,
            coverHtml: titleCoverHtml,
            progressPercent: progressStats.percent,
            badgeText: `${comicCount} ch`,
            metaText: `<span class="comic-chapter">${comicCount} chapter${comicCount !== 1 ? 's' : ''}</span>${state.currentLevel === 'root' ? `<span>${firstComic.category || 'Uncategorized'}</span>` : ''}`,
            dataAttrs: `data-title-name="${displayTitle}"`,
            extraClasses: isNsfw ? 'title-card nsfw-content' : 'title-card',
            metaItems: [
                `${comicCount} chapters`,
                firstComic.category,
                `${progressStats.totalPages} pages total`,
                `${Math.round(progressStats.percent)}% read`
            ],
            statValue: sizeDisplay,
            statLabel: 'Total Size',
            actionText: 'View',
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
            description: `Series containing ${comicCount} chapters or volumes. Total of ${progressStats.totalPages} pages.`,
            buttons: [{ text: '▶ View Series', class: 'primary', onClick: onClick }],
            onClick: onClick
        };
    });
    
    renderItems(container, items, state.viewMode);
}

export function renderComicsView() {
    const container = document.getElementById('comics-container');
    if (!container) return;
    
    if (!window.getComicsInTitle) return;
    const comics = window.getComicsInTitle();
    
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
    
    const sortedComics = sortItems(comics, state.sortBy, COMIC_SORT_ACCESSORS(state.readingProgress));
    
    const items = sortedComics.map(comic => {
        const progressStats = calculateComicProgress(comic, state.readingProgress);
        const chapterText = comic.chapter ? `Ch. ${comic.chapter}` : (comic.volume ? `Vol. ${comic.volume}` : 'One-shot');
        
        return {
            id: comic.id,
            title: comic.title,
            coverUrl: `/api/cover/${comic.id}`,
            progressPercent: progressStats.percent,
            badgeText: chapterText,
            metaText: `<span>${chapterText}</span><span>•</span><span>${comic.category}</span>`,
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
            description: `${comic.series} - ${chapterText}.`,
            buttons: [
                { text: progressStats.hasProgress ? '▶ Continue Reading' : '▶ Start Reading', class: 'primary', onClick: `startReading('${comic.id}')` },
                { text: '📖 View Details', class: 'secondary', onClick: `window.routerNavigate('series', { name: \`${comic.series.replace(/'/g, "\\'")}\` })` }
            ],
            onClick: `window.routerNavigate('series', { name: \`${comic.series.replace(/'/g, "\\'")}\` })`
        };
    });

    renderItems(container, items, state.viewMode);
}

export function showView(viewName) {
     document.querySelectorAll('.header-btn').forEach(btn => btn.classList.remove('active'));
     if (viewName === 'library') {
         const el = document.getElementById('nav-library');
         if (el) el.classList.add('active');
     }
     if (viewName === 'recent') {
         const el = document.getElementById('nav-recent');
         if (el) el.classList.add('active');
     }
     if (viewName === 'tags') {
         const el = document.getElementById('nav-tags');
         if (el) el.classList.add('active');
     }
     if (viewName === 'discovery') {
         const el = document.getElementById('nav-discovery');
         if (el) el.classList.add('active');
     }

     document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
     const viewEl = document.getElementById(`view-${viewName}`);
     if (viewEl) {
         viewEl.classList.add('active');
         console.log(`showView: Made view-${viewName} active`);
     } else {
         console.warn(`showView: Could not find view-${viewName}`);
     }
     state.currentView = viewName;

     // Trigger specific view loading
     if (viewName === 'recent') {
         if (window.loadRecentReads) window.loadRecentReads();
     }
     
     updateSelectionButtonState();
 }

export function updateSelectionButtonState() {
    const buttons = document.querySelectorAll('.btn-selection-mode');
    if (buttons.length === 0) return;

    let allowed = false;
    
    // Always allowed if searching (search results are titles)
    if (state.searchQuery) {
        allowed = true;
    } else if (state.currentView === 'library') {
        // Allowed if we are showing titles (subcategory level or flatten mode)
        if (state.flattenMode || state.currentLevel === 'subcategory' || state.currentLevel === 'title') {
            allowed = true;
        }
    } else if (state.currentView === 'tags' || state.currentView === 'search') {
        // These views show titles
        allowed = true;
    } else if (state.currentView === 'recent') {
        // Shows comic cards
        allowed = true;
    }

    buttons.forEach(btn => {
        btn.disabled = !allowed;
        btn.style.opacity = allowed ? '1' : '0.3';
        btn.style.cursor = allowed ? 'pointer' : 'not-allowed';
    });
    
    // If we were in selection mode but it's no longer allowed, clear it
    if (!allowed && state.selectionMode) {
        if (window.clearSelection) window.clearSelection();
    }
}

// Make globally available
window.showView = showView;
window.updateSelectionButtonState = updateSelectionButtonState;

export function renderTitleFan(title) {
    return renderFan(getTitleCoverIds(title));
}

window.renderTitleFan = renderTitleFan;

