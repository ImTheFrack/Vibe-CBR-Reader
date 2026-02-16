import { state } from '../../state.js';
import { renderItems, getFolderCoverIds } from '../../components/index.js';
import { sortItems, FOLDER_SORT_ACCESSORS } from '../../utils/sorting.js';

function buildFolderDescription(titlesWithCount, meta, folderClickHandler) {
  const sorted = [...titlesWithCount].sort((a, b) => b.count - a.count);
  const topTitles = sorted.slice(0, 5);
  const remaining = sorted.length - topTitles.length;

  if (topTitles.length === 0) return meta;

  const links = topTitles.map(t => {
    const escaped = t.name.replace(/'/g, "\\'").replace(/`/g, "\\`");
    return `<a class="folder-desc-link" data-action="navigate-library" data-title="${escaped}">${t.name}</a> <span class="folder-desc-count">(${t.count})</span>`;
  });

  let html = links.join('<br>');
  if (remaining > 0) {
    html += `<br><a class="folder-desc-link folder-desc-more" data-action="navigate-folder" data-handler="${folderClickHandler}">+ ${remaining} more</a>`;
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
    function collectTitles(node) {
      if (node.titles) {
        Object.values(node.titles).forEach(t => {
          allTitlesWithCount.push({ name: t.name, count: t.comics ? t.comics.length : 0 });
        });
      }
      if (node.subcategories) Object.values(node.subcategories).forEach(sub => collectTitles(sub));
    }
    collectTitles(folder);
    const allTitleNames = allTitlesWithCount.map(t => t.name);

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

    const coverIds = getFolderCoverIds(folder);

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
      coverIds: coverIds,
      isFolder: false,
      extraClasses: 'folder-cover-card',
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
