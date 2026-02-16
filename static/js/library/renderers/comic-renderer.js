import { state } from '../../state.js';
import { renderItems } from '../../components/index.js';
import { calculateComicProgress } from '../../utils/progress.js';
import { sortItems, COMIC_SORT_ACCESSORS } from '../../utils/sorting.js';

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

export function renderChapters(container, comics) {
  if (!container || !comics) return;

  if (comics.length === 0) {
    container.innerHTML = '<p>No chapters available.</p>';
    return;
  }

  comics.forEach(comic => {
    if (comic.user_progress) {
      state.readingProgress[comic.id] = {
        page: comic.user_progress.current_page,
        completed: comic.user_progress.completed,
        lastRead: comic.user_progress.last_read ? new Date(comic.user_progress.last_read).getTime() : Date.now()
      };
    }
  });

  const sortedComics = sortItems(comics, state.sortBy, COMIC_SORT_ACCESSORS(state.readingProgress));

  const items = sortedComics.map(comic => {
    const progressStats = calculateComicProgress(comic, state.readingProgress);
    const chapterText = comic.chapter ? `Ch. ${comic.chapter}` : (comic.volume ? `Vol. ${comic.volume}` : 'One-shot');

    return {
      id: comic.id,
      title: comic.title || comic.filename,
      coverUrl: `/api/cover/${comic.id}`,
      progressPercent: progressStats.percent,
      badgeText: chapterText,
      metaText: `<span>${chapterText}</span><span>•</span><span>${comic.pages} pages</span>`,
      metaItems: [
        chapterText,
        `${comic.pages} pages`,
        progressStats.isCompleted ? '✓ Completed' : (progressStats.hasProgress ? `${Math.round(progressStats.percent)}%` : 'Unread'),
        comic.size_str || 'Unknown size'
      ],
      statValue: comic.size_str || 'Unknown',
      statLabel: 'Size',
      actionText: 'Read',
      onAction: `startReading('${comic.id}')`,
      subtitle: comic.series,
      badges: [
        { text: chapterText, class: 'accent' },
        { text: `${comic.pages} pages` },
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
        { text: progressStats.hasProgress ? '▶ Continue Reading' : '▶ Start Reading', class: 'primary', onClick: `startReading('${comic.id}')` }
      ],
      onClick: `startReading('${comic.id}')`
    };
  });

  renderItems(container, items, state.viewMode);
}
