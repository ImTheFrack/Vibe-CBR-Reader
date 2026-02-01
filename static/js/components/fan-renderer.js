// Shared Fan Renderer for folder/series stacks

/**
 * Render a "fan" of cover images
 * @param {Array<string>} coverIds - Array of comic IDs to show covers for
 * @param {Object} options - Configuration options
 * @param {string} options.containerClass - Additional class for container (default: 'folder-fan')
 * @param {number} options.max - Maximum covers to show (default: 3)
 * @returns {string} HTML string
 */
export function renderFan(coverIds, options = {}) {
    const { containerClass = 'folder-fan', max = 3 } = options;
    const count = Math.min(coverIds.length, max);
    
    if (count === 0) {
        return `<div class="empty-cover"></div>`;
    }

    // Determine layout classes based on position
    // Position 0: Main (Top)
    // Position 1: Left
    // Position 2: Right
    const positionClasses = ['fan-main', 'fan-left', 'fan-right'];

    let html = `<div class="${containerClass}">`;
    
    for (let i = 0; i < count; i++) {
        // If we have more images than classes, default to just piling them or ignoring?
        // The CSS likely only supports these 3 specific classes.
        if (i >= positionClasses.length) break;
        
        const posClass = positionClasses[i];
        html += `<img src="/api/cover/${coverIds[i]}" class="folder-fan-img ${posClass}" loading="lazy" alt="Cover">`;
    }
    
    html += `</div>`;
    return html;
}

/**
 * Helper to sort comics for the fan view (Volume 1 -> ... -> Volume X)
 * @param {Array} comics - Array of comic objects
 * @returns {Array} Sorted comics array (top 3)
 */
export function getSortedComicsForFan(comics) {
    if (!comics || comics.length === 0) return [];

    const sorted = [...comics].sort((a, b) => {
        // 1. Volumes first
        const volA = (a.volume && a.volume > 0) ? a.volume : 999999;
        const volB = (b.volume && b.volume > 0) ? b.volume : 999999;
        if (volA !== volB) return volA - volB;
        
        // 2. Chapter
        const chapA = (a.chapter !== null && a.chapter !== undefined) ? a.chapter : 0;
        const chapB = (b.chapter !== null && b.chapter !== undefined) ? b.chapter : 0;
        if (chapA !== chapB) return chapA - chapB;
        
        // 3. Filename
        return a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: 'base' });
    });
    
    return sorted.slice(0, 3);
}

/**
 * Extract cover IDs from a Title object for the fan
 * @param {Object} title - Title object
 * @returns {Array<string>} Array of IDs
 */
export function getTitleCoverIds(title) {
    const sortedComics = getSortedComicsForFan(title.comics);
    return sortedComics.map(c => c.id);
}

/**
 * Extract cover IDs from a Folder object (Random selection)
 * @param {Object} folder - Folder object
 * @returns {Array<string>} Array of IDs
 */
export function getFolderCoverIds(folder) {
    // 1. Collect all series (titles)
    const allTitles = [];
    function traverse(node) {
        if (node.titles) {
            Object.values(node.titles).forEach(title => {
                if (title.comics && title.comics.length > 0) allTitles.push(title);
            });
        }
        if (node.subcategories) Object.values(node.subcategories).forEach(sub => traverse(sub));
        if (node.categories) Object.values(node.categories).forEach(cat => traverse(cat));
    }
    traverse(folder);

    if (allTitles.length === 0) return [];

    // 2. Shuffle titles
    for (let i = allTitles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allTitles[i], allTitles[j]] = [allTitles[j], allTitles[i]];
    }

    // 3. Select one comic from each of up to 3 titles
    const selectedComics = [];
    for (let i = 0; i < Math.min(3, allTitles.length); i++) {
        const title = allTitles[i];
        // Pick random comic from title
        const randomIdx = Math.floor(Math.random() * title.comics.length);
        selectedComics.push(title.comics[randomIdx]);
    }

    // 4. Fill if needed
    if (selectedComics.length < 3 && allTitles.length > 0) {
        // Collect all others
        const allComics = [];
        allTitles.forEach(t => allComics.push(...t.comics));
        const pickedIds = new Set(selectedComics.map(c => c.id));
        const available = allComics.filter(c => !pickedIds.has(c.id));
        
        // Shuffle available
        for (let i = available.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [available[i], available[j]] = [available[j], available[i]];
        }
        
        for (let i = 0; i < Math.min(3 - selectedComics.length, available.length); i++) {
            selectedComics.push(available[i]);
        }
    }

    return selectedComics.map(c => c.id);
}
