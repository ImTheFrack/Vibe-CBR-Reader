import { renderFan } from './fan-renderer.js';

/**
 * Standard Card Templates
 * These templates replace the repeated HTML strings in library.js
 */

const CARD_SCHEMAS = {
    grid: {
        containerClass: 'comics-grid',
        // The template function takes the normalized item data
        template: (data) => {
            const coverHtml = data.coverHtml || (data.coverIds ? renderFan(data.coverIds) : 
                              `<img src="${data.coverUrl}" alt="${data.title}" loading="lazy">`);
            
            const progressHtml = data.progressPercent > 0 ? 
                `<div class="comic-progress"><div class="comic-progress-bar" style="width: ${data.progressPercent}%"></div></div>` : '';
            
            const badgeHtml = data.badgeText ? `<div class="comic-badge">${data.badgeText}</div>` : '';

            // Folder cards have slightly different class names in the original CSS
            // .folder-card vs .comic-card. 
            // If it's a folder (has icon instead of cover), use folder classes
            const isFolder = data.isFolder;
            const cardClass = isFolder ? 'folder-card' : `comic-card ${data.extraClasses || ''}`;
            const iconClass = isFolder ? 'folder-card-icon' : 'comic-cover';
            const infoClass = isFolder ? 'folder-card-info' : 'comic-info';
            const titleClass = isFolder ? 'folder-card-name' : 'comic-title';
            const metaClass = isFolder ? 'folder-card-meta' : 'comic-meta';
            
            const itemId = data.id || (data.title ? data.title.replace(/'/g, "\\'") : 'unknown');

            return `
                <div class="${cardClass}" 
                     data-action="card-click"
                     data-id="${data.id || data.title}" 
                     ${data.dataAttrs || ''}>
                    <div class="${iconClass}">
                        ${!isFolder ? `<div class="selection-checkbox" data-action="toggle-selection" data-id="${data.id || data.title}"></div>` : ''}
                        ${coverHtml}
                        ${!isFolder ? progressHtml : ''}
                        ${!isFolder ? badgeHtml : ''}
                    </div>
                    <div class="${infoClass}">
                        <div class="${titleClass}">${data.title}</div>
                        <div class="${metaClass}">${data.metaText}</div>
                    </div>
                </div>
            `;
        }
    },
    list: {
        containerClass: 'comics-list',
        template: (data) => {
            const coverHtml = data.coverHtml || (data.coverIds ? renderFan(data.coverIds) : 
                              `<img src="${data.coverUrl}" alt="${data.title}" loading="lazy">`);
            
            const metaHtml = data.metaItems.map(item => `<span>${item}</span>`).join('<span>•</span>');
            const itemId = data.id || data.title;

            const listClass = `list-item ${data.extraClasses || ''}`.trim();

            return `
                <div class="${listClass}" data-action="card-click" data-id="${itemId}">
                    <div class="list-cover" style="display:flex;align-items:center;justify-content:center;">
                        ${!data.isFolder ? `<div class="selection-checkbox" data-action="toggle-selection" data-id="${itemId}"></div>` : ''}
                        ${coverHtml}
                    </div>
                    <div class="list-info">
                        <div class="list-title">${data.title}</div>
                        <div class="list-meta">
                            ${metaHtml}
                        </div>
                    </div>
                    <div class="list-stat"><div>${data.statValue || '-'}</div><div class="list-stat-label">${data.statLabel || ''}</div></div>
                    <div class="list-actions">
                        <button class="list-btn" onclick="event.stopPropagation(); ${data.onAction || data.onClick}">${data.actionText || 'Open'}</button>
                    </div>
                </div>
            `;
        }
    },
    detailed: {
        containerClass: 'comics-detailed',
        template: (data) => {
            const coverHtml = data.coverHtml || (data.coverIds ? renderFan(data.coverIds) : 
                              `<img src="${data.coverUrl}" alt="${data.title}" loading="lazy">`);
            
            const badgesHtml = data.badges ? data.badges.map(b => 
                `<span class="detailed-badge ${b.class || ''}" ${b.style ? `style="${b.style}"` : ''}>${b.text}</span>`
            ).join('') : '';

            const statsHtml = data.stats ? data.stats.map(s => 
                `<div class="detailed-stat"><div class="detailed-stat-value">${s.value}</div><div class="detailed-stat-label">${s.label}</div></div>`
            ).join('') : '';

            const buttonsHtml = data.buttons ? data.buttons.map(btn => 
                `<button class="detailed-btn ${btn.class || ''}" onclick="event.stopPropagation(); ${btn.onClick}">${btn.text}</button>`
            ).join('') : '';

            const itemId = data.id || data.title;

            const detailedClass = `detailed-card ${data.extraClasses || ''}`.trim();

            return `
                <div class="${detailedClass}" data-action="card-click" data-id="${itemId}">
                    <div class="detailed-cover" style="display:flex;align-items:center;justify-content:center;">
                        ${!data.isFolder ? `<div class="selection-checkbox" data-action="toggle-selection" data-id="${itemId}"></div>` : ''}
                        ${coverHtml}
                    </div>
                    <div class="detailed-content">
                        <div class="detailed-header">
                            <div class="detailed-title-group"><div class="detailed-title">${data.title}</div><div class="detailed-subtitle">${data.subtitle || ''}</div></div>
                            <div class="detailed-badges">${badgesHtml}</div>
                        </div>
                        <div class="detailed-stats">
                            ${statsHtml}
                        </div>
                        <div class="detailed-description">${data.description || ''}</div>
                        <div class="detailed-actions">
                            ${buttonsHtml}
                        </div>
                    </div>
                </div>
            `;
        }
    }
};

/**
 * Main render function
 * @param {HTMLElement} container - DOM element to render into
 * @param {Array} items - Array of normalized data items
 * @param {string} viewMode - 'grid', 'list', or 'detailed'
 */
export function renderItems(container, items, viewMode) {
    if (!container) return;
    
    // Default to grid if invalid mode
    const schema = CARD_SCHEMAS[viewMode] || CARD_SCHEMAS['grid'];
    
    container.className = schema.containerClass;
    container.innerHTML = items.map(item => schema.template(item)).join('');
}
