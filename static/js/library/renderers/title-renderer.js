import { state } from '../../state.js';
import { renderItems, getTitleCoverIds } from '../../components/index.js';
import { calculateComicProgress, aggregateProgress } from '../../utils/progress.js';
import { sortItems, TITLE_SORT_ACCESSORS, parseFileSize } from '../../utils/sorting.js';

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
    const nsfwOverlay = isNsfw ? '<div class="nsfw-overlay">18+</div>' : '';

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

export function renderTitleFan(title) {
  const { renderFan, getTitleCoverIds } = require('../../components/index.js');
  return renderFan(getTitleCoverIds(title));
}
