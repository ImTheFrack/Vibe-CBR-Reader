import { state } from '../../state.js';
import { apiGet } from '../../api.js';
import { parseMetadataField } from '../../utils.js';
import { renderChapters } from './comic-renderer.js';

export async function renderTitleDetailView() {
  const container = document.getElementById('comics-container');
  if (!container) return;

  const titleName = state.currentLocation.title;
  if (!titleName) return;

  let seriesData = state.currentSeries;

  if (!seriesData || seriesData.name !== titleName) {
    container.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading series information...</p>
      </div>
    `;

    seriesData = await apiGet(`/api/series/${encodeURIComponent(titleName)}`);

    if (seriesData.error) {
      if (window.renderComicsView) window.renderComicsView();
      return;
    }
    state.currentSeries = seriesData;
  }

  const uniqueId = Math.random().toString(36).substr(2, 9);

  const authors = Array.isArray(seriesData.authors) ? seriesData.authors : (seriesData.authors ? [seriesData.authors] : []);
  const genres = parseMetadataField(seriesData.genres);
  const tags = parseMetadataField(seriesData.tags);
  const demographics = parseMetadataField(seriesData.demographics);

  const statusTag = seriesData.status ? `<span class="meta-tag status ${seriesData.status.toLowerCase().replace(/\s+/g, '-')}">${seriesData.status}</span>` : '';
  const yearTag = seriesData.release_year ? `<span class="meta-tag year">${seriesData.release_year}</span>` : '';

  const authorsDisplay = authors.length > 0 ? `<div class="meta-section"><span class="meta-label">Authors:</span> ${authors.join(', ')}</div>` : '';
  const allTags = [...demographics, ...genres, ...tags];
  const allTagsHtml = allTags.length > 0 ? `
    <div class="tags-row">
      ${allTags.map(t => `<span class="meta-tag tag">${t}</span>`).join('')}
    </div>
  ` : '';

  const lists = seriesData.lists || [];
  let listsHtml = '';
  
  if (lists.length > 0) {
    const visibleLists = lists.slice(0, 3);
    const hiddenLists = lists.slice(3);
    const hasMore = hiddenLists.length > 0;
    
    listsHtml = `
      <div class="lists-row" style="margin-top: 8px; margin-left: 32px; display: flex; flex-wrap: wrap; gap: 6px;">
        ${visibleLists.map(l => `
          <span class="meta-tag list-badge" 
                data-action="navigate-to-list" 
                data-list-id="${l.id}"
                style="background-color: var(--accent-primary-dim); color: var(--accent-primary); cursor: pointer; border: 1px solid var(--accent-primary-dim); display: inline-flex; align-items: center; gap: 4px;">
            <span style="opacity: 0.7; font-size: 0.9em;">In List:</span> ${l.name}
          </span>
        `).join('')}
        ${hasMore ? `
          <span class="meta-tag list-badge-more" 
                onclick="this.style.display='none'; document.getElementById('hidden-lists-${uniqueId}').style.display='contents';"
                style="background-color: var(--bg-tertiary); cursor: pointer; color: var(--text-secondary);">
            +${hiddenLists.length} more
          </span>
          <div id="hidden-lists-${uniqueId}" style="display: none;">
            ${hiddenLists.map(l => `
              <span class="meta-tag list-badge" 
                    data-action="navigate-to-list" 
                    data-list-id="${l.id}"
                    style="background-color: var(--accent-primary-dim); color: var(--accent-primary); cursor: pointer; border: 1px solid var(--accent-primary-dim); display: inline-flex; align-items: center; gap: 4px;">
                <span style="opacity: 0.7; font-size: 0.9em;">In List:</span> ${l.name}
              </span>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  const malLink = seriesData.mal_id ? `<a href="https://myanimelist.net/manga/${seriesData.mal_id}" target="_blank" class="external-link mal">🔗 MAL</a>` : '';
  const anilistLink = seriesData.anilist_id ? `<a href="https://anilist.co/manga/${seriesData.anilist_id}" target="_blank" class="external-link anilist">🔗 AniList</a>` : '';
  const externalLinks = malLink || anilistLink ? `<div class="external-links-inline">${malLink}${anilistLink}</div>` : '';

  const synonyms = seriesData.synonyms || [];
  const synonymsHtml = synonyms.length > 0 ? `<div class="synonyms">Also known as: ${synonyms.join(', ')}</div>` : '';

  const ratingData = await apiGet(`/api/series/rating/${seriesData.id}`);
  const userRating = ratingData.user_rating || 0;
  const avgRating = ratingData.series ? ratingData.series.avg_rating : 0;
  const ratingCount = ratingData.series ? ratingData.series.rating_count : 0;

  let illuminationUrl = seriesData.cover_image;
  let bannerUrl = seriesData.banner_image;

  if (!illuminationUrl && seriesData.illumination) {
    if (seriesData.illumination !== bannerUrl) {
      illuminationUrl = seriesData.illumination;
    }
  }

  if (!illuminationUrl && seriesData.comics && seriesData.comics.length > 0) {
    illuminationUrl = `/api/cover/${seriesData.comics[0].id}`;
  }

  if (illuminationUrl && bannerUrl && illuminationUrl === bannerUrl) {
    bannerUrl = null;
  }

  const illuminationHtml = illuminationUrl ? `<img src="${illuminationUrl}" class="series-illumination" alt="Series Cover">` : '';
  const bannerHtml = bannerUrl ? `<div class="metadata-banner"><img src="${bannerUrl}" alt="Series Banner"></div>` : '';
  const titleHeaderHtml = `<div class="metadata-series-title">${seriesData.title || seriesData.name}</div>`;

  const ratingHtml = `
    <div class="series-rating-container" style="margin-bottom: 1rem; display: flex; align-items: center; gap: 12px;">
      <div class="stars-row" style="display: flex; gap: 4px; font-size: 1.1rem;">
        ${[1, 2, 3, 4, 5].map(i => `
          <span class="star ${i <= userRating ? 'active' : ''}" 
                data-action="rate-series" data-series-id="${seriesData.id}" data-rating="${i}"
                style="cursor: pointer; color: ${i <= userRating ? 'var(--accent-primary)' : 'var(--text-tertiary)'}; transition: color 0.2s;">
            ★
          </span>
        `).join('')}
      </div>
      <div class="rating-stats" style="font-size: 0.8rem; color: var(--text-secondary);">
        <span style="font-weight: 600; color: var(--text-primary);">${avgRating}</span> (${ratingCount})
      </div>
    </div>
  `;

  const metadataSection = `
    <div class="title-metadata-compact" style="padding: 0; overflow: hidden;">
      ${bannerHtml}
      <div style="padding: 16px;">
        ${titleHeaderHtml}
        ${ratingHtml}
          <div class="meta-header-row">
            <div class="meta-toggle-btn" data-action="toggle-meta" data-id="${uniqueId}">
              <span class="meta-expand-icon" id="meta-icon-${uniqueId}">▶</span>
            </div>
            ${allTagsHtml}
          </div>
          ${listsHtml}
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
    </div>
  `;

  const fileCountHtml = `<div class="meta-section" style="margin-top: 16px;"><span class="meta-label">Files:</span> ${seriesData.comics ? seriesData.comics.length : 0} chapters available</div>`;

  let quickActions = '';
  if (seriesData.continue_reading) {
    const cr = seriesData.continue_reading;
    const actionText = cr.page > 0 ? 'Continue Reading' : 'Start Reading';
    const chapterText = cr.chapter ? `Ch. ${cr.chapter}` : (cr.volume ? `Vol. ${cr.volume}` : '');
    quickActions = `
      <button class="btn-primary btn-large" data-action="start-reading" data-comic-id="${cr.comic_id}" data-page="${cr.page}">
        <span>▶</span> ${actionText} ${chapterText ? `- ${chapterText}` : ''}
      </button>
    `;
  } else if (seriesData.comics && seriesData.comics.length > 0) {
    quickActions = `
      <button class="btn-primary btn-large" data-action="start-reading" data-comic-id="${seriesData.comics[0].id}">
        <span>▶</span> Start Reading
      </button>
    `;
  }

  const readFirstBtn = seriesData.comics && seriesData.comics.length > 0 ? `
    <button class="btn-secondary" data-action="start-reading" data-comic-id="${seriesData.comics[0].id}">Read First</button>
  ` : '';

  const lastComic = seriesData.comics && seriesData.comics[seriesData.comics.length - 1];
  const readLatestBtn = lastComic ? `
    <button class="btn-secondary" data-action="start-reading" data-comic-id="${lastComic.id}">Read Latest</button>
  ` : '';

  const synopsisHtml = seriesData.synopsis ?
    `<div class="series-synopsis-block" id="synopsis-block-${uniqueId}" data-action="toggle-synopsis" data-id="${uniqueId}">
      <div class="synopsis-toggle-icon" id="toggle-icon-${uniqueId}">▶</div>
      <div class="series-synopsis-text" id="synopsis-${uniqueId}">
        ${illuminationHtml}
        ${seriesData.synopsis}
      </div>
    </div>` : '';

  container.innerHTML = `
    <div class="title-detail-container">
      <div class="title-detail-header-wrapper">
        <div class="title-detail-header-content">
          <div class="title-detail-header-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <button class="back-btn-inline" data-action="go-back" style="margin-bottom: 0;">
              <span>←</span> Back
            </button>
            <div class="title-detail-view-controls" style="display: flex; gap: 8px;">
              <div class="view-toggle">
                <button class="view-btn ${state.viewMode === 'grid' ? 'active' : ''}" data-view="grid" data-action="set-view-mode" data-mode="grid" title="Grid View">
                  <span>⊞</span>
                </button>
                <button class="view-btn ${state.viewMode === 'list' ? 'active' : ''}" data-view="list" data-action="set-view-mode" data-mode="list" title="List View">
                  <span>☰</span>
                </button>
                <button class="view-btn ${state.viewMode === 'detailed' ? 'active' : ''}" data-view="detailed" data-action="set-view-mode" data-mode="detailed" title="Detailed View">
                  <span>▤</span>
                </button>
              </div>
              <select class="sort-select" data-action="handle-sort">
                <option value="alpha-asc" ${state.sortBy === 'alpha-asc' ? 'selected' : ''}>A-Z</option>
                <option value="alpha-desc" ${state.sortBy === 'alpha-desc' ? 'selected' : ''}>Z-A</option>
                <option value="date-added" ${state.sortBy === 'date-added' ? 'selected' : ''}>Date</option>
                <option value="page-count" ${state.sortBy === 'page-count' ? 'selected' : ''}>Pages</option>
                <option value="file-size" ${state.sortBy === 'file-size' ? 'selected' : ''}>Size</option>
                <option value="recent-read" ${state.sortBy === 'recent-read' ? 'selected' : ''}>Recent</option>
              </select>
            </div>
          </div>

          <div class="title-details-grid">
            <div class="title-details-left">${synopsisHtml}</div>
            <div class="title-details-right" id="meta-section-${uniqueId}">${metadataSection}</div>
          </div>

          <div class="title-actions-bar" style="border-bottom: none; margin-bottom: 0; padding-bottom: 0; margin-top: 1rem;">
            ${quickActions}
            ${readFirstBtn}
            ${readLatestBtn}
            <button class="btn-secondary" data-action="add-to-list" data-series-id="${seriesData.id}">
              <span>📋</span> Add to List
            </button>
            <button class="btn-secondary" onclick="openRecipeMixerModal([${seriesData.id}])">
              <span>🤖</span> AI Suggestions
            </button>
            ${state.currentUser && state.currentUser.role === 'admin' ? `
            <button class="btn-secondary" onclick="showNsfwOverrideForSeries(${seriesData.id})" title="Override NSFW status">
              <span>🔞</span> ${seriesData.nsfw_override === 1 ? 'NSFW (forced)' : seriesData.nsfw_override === 0 ? 'Safe (forced)' : seriesData.is_nsfw ? 'NSFW (auto)' : 'Safe (auto)'}
            </button>
            ` : ''}
          </div>
        </div>
      </div>

      ${fileCountHtml}
      <div class="chapters-section">
        <div id="chapters-container"></div>
      </div>
    </div>
  `;

  if (seriesData.synopsis) {
    const synopsisEl = document.getElementById(`synopsis-${uniqueId}`);
    const metaEl = document.getElementById(`meta-section-${uniqueId}`);
    const blockEl = document.getElementById(`synopsis-block-${uniqueId}`);
    const toggleIcon = document.getElementById(`toggle-icon-${uniqueId}`);

    if (synopsisEl && metaEl && blockEl) {
      setTimeout(() => {
        const synopsisHeight = synopsisEl.scrollHeight;
        const metaHeight = metaEl.offsetHeight;

        if (synopsisHeight <= metaHeight) {
          synopsisEl.classList.add('expanded');
          if (toggleIcon) toggleIcon.style.visibility = 'hidden';
          blockEl.style.cursor = 'default';
        }
      }, 50);
    }
  }

  renderChapters(document.getElementById('chapters-container'), seriesData.comics, seriesData.is_nsfw);
  if (window.updateSelectionUI) window.updateSelectionUI();
}
