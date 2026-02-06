import { state } from '../state.js';
import { apiGet, apiPut } from '../api.js';
import { 
    renderItems, renderFan, getTitleCoverIds, getFolderCoverIds 
} from '../components/index.js';
import { calculateComicProgress, aggregateProgress } from '../utils/progress.js';
import { 
    sortItems, parseFileSize, TITLE_SORT_ACCESSORS, 
    COMIC_SORT_ACCESSORS, FOLDER_SORT_ACCESSORS 
} from '../utils/sorting.js';
import { startReading } from '../reader.js';
import { updateBreadcrumbs } from './navigation.js';

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

    const isViewingTitles = state.currentLevel === 'title' || state.flattenMode || state.currentLevel === 'subcategory';
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
        
        if (state.currentLevel === 'root') {
            clickHandler = `window.routerNavigate('library', { category: \`${escapedName}\` })`;
            const subcatCount = Object.keys(folder.subcategories).length;
            let titleCount = 0;
            Object.values(folder.subcategories).forEach(sub => { titleCount += Object.keys(sub.titles).length; });
            meta = `${subcatCount} subcategor${subcatCount === 1 ? 'y' : 'ies'}, ${titleCount} title${titleCount === 1 ? '' : 's'}`;
            typeLabel = 'Category';
            itemCount = titleCount;
        } else {
            clickHandler = `window.routerNavigate('library', { category: \`${state.currentLocation.category.replace(/'/g, "\\'")}\`, subcategory: \`${escapedName}\` })`;
            const titleCount = Object.keys(folder.titles).length;
            meta = `${titleCount} title${titleCount === 1 ? '' : 's'}`;
            typeLabel = 'Subcategory';
            itemCount = titleCount;
        }
        
        const coverIds = getFolderCoverIds(folder);

        return {
            title: folderName,
            coverIds: coverIds,
            isFolder: true,
            metaText: meta,
            metaItems: [typeLabel, meta],
            statValue: itemCount,
            statLabel: 'Items',
            actionText: 'Open',
            subtitle: typeLabel,
            badges: [{ text: `${itemCount} Items`, class: 'accent' }],
            stats: [
                { value: itemCount, label: 'Titles' },
                { value: '-', label: 'Size' },
                { value: '-', label: 'Progress' },
                { value: 'DIR', label: 'Format' }
            ],
            description: `Folder containing ${meta}. Click to browse contents.`,
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

        let onClick;
        if (state.currentLocation.category && state.currentLocation.subcategory) {
            onClick = `window.routerNavigate('library', { category: \`${state.currentLocation.category.replace(/'/g, "\\'")}\`, subcategory: \`${state.currentLocation.subcategory.replace(/'/g, "\\'")}\`, title: \`${escapedName}\` })`;
        } else {
            onClick = `window.routerNavigate('library', { title: \`${escapedName}\` })`;
        }

        const titleCardStyle = state.settings.titleCardStyle;
        let itemCoverIds = coverIds;
        let itemCoverUrl = undefined;
        
        if (titleCardStyle === 'single' && coverIds.length > 0) {
            itemCoverIds = undefined;
            itemCoverUrl = `/api/cover/${coverIds[0]}`;
        }

        return {
            title: title.name,
            coverIds: itemCoverIds,
            coverUrl: itemCoverUrl,
            progressPercent: progressStats.percent,
            badgeText: `${comicCount} ch`,
            metaText: `<span class="comic-chapter">${comicCount} chapter${comicCount !== 1 ? 's' : ''}</span>${state.currentLevel === 'root' ? `<span>${firstComic.category || 'Uncategorized'}</span>` : ''}`,
            dataAttrs: `data-title-name="${displayTitle}"`,
            extraClasses: 'title-card',
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

export async function renderTitleDetailView() {
    const container = document.getElementById('comics-container');
    if (!container) return;
    
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
    
    const authors = Array.isArray(seriesData.authors) ? seriesData.authors : (seriesData.authors ? [seriesData.authors] : []);
    const genres = Array.isArray(seriesData.genres) ? seriesData.genres : (seriesData.genres ? [seriesData.genres] : []);
    const tags = Array.isArray(seriesData.tags) ? seriesData.tags : (seriesData.tags ? [seriesData.tags] : []);
    const demographics = Array.isArray(seriesData.demographics) ? seriesData.demographics : (seriesData.demographics ? [seriesData.demographics] : []);
    
    const statusTag = seriesData.status ? `<span class="meta-tag status ${seriesData.status.toLowerCase().replace(/\s+/g, '-')}">${seriesData.status}</span>` : '';
    const yearTag = seriesData.release_year ? `<span class="meta-tag year">${seriesData.release_year}</span>` : '';
    
    const authorsDisplay = authors.length > 0 ? `<div class="meta-section"><span class="meta-label">Authors:</span> ${authors.join(', ')}</div>` : '';
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
    
    // Fetch Rating info
    const ratingData = await apiGet(`/api/series/rating/${seriesData.id}`);
    const userRating = ratingData.user_rating || 0;
    const avgRating = ratingData.series ? ratingData.series.avg_rating : 0;
    const ratingCount = ratingData.series ? ratingData.series.rating_count : 0;

    const ratingHtml = `
        <div class="series-rating-container" style="margin-bottom: 1.5rem; display: flex; align-items: center; gap: 12px;">
            <div class="stars-row" style="display: flex; gap: 4px; font-size: 1.25rem;">
                ${[1, 2, 3, 4, 5].map(i => `
                    <span class="star ${i <= userRating ? 'active' : ''}" 
                          onclick="handleRateSeries(${seriesData.id}, ${i})" 
                          style="cursor: pointer; color: ${i <= userRating ? 'var(--accent-primary)' : 'var(--text-tertiary)'}; transition: color 0.2s;">
                        ★
                    </span>
                `).join('')}
            </div>
            <div class="rating-stats" style="font-size: 0.85rem; color: var(--text-secondary);">
                <span style="font-weight: 600; color: var(--text-primary);">${avgRating}</span> (${ratingCount} votes)
            </div>
        </div>
    `;

    const metadataSection = `
        <div class="title-metadata-compact">
            ${ratingHtml}
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
    
    const comicsHtml = seriesData.comics ? seriesData.comics.map((comic) => {
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
            <div class="chapter-card ${readStatus}" onclick="handleCardClick(this, event)" data-id="${comic.id}" data-action="card-click">
                <div class="selection-checkbox" onclick="event.stopPropagation(); toggleItemSelection(this.parentElement.dataset.id, event)"></div>
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
                <div class="title-details-left">${synopsisHtml}</div>
                <div class="title-details-right">${metadataSection}</div>
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

    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    const viewEl = document.getElementById(`view-${viewName}`);
    if (viewEl) viewEl.classList.add('active');
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

