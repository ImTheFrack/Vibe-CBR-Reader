// Unified sorting logic

/**
 * Parse a human-readable size string into bytes
 * @param {string} sizeStr - e.g., "45.2 MB"
 * @returns {number} bytes
 */
export function parseFileSize(sizeStr) {
    if (!sizeStr) return 0;
    const match = sizeStr.match(/([\d.]+)\s*(B|KB|MB|GB)/);
    if (match) {
        const val = parseFloat(match[1]);
        const unit = match[2];
        const multiplier = { B: 1, KB: 1024, MB: 1024**2, GB: 1024**3 }[unit];
        return val * multiplier;
    }
    return 0;
}

/**
 * Sanitize a string for alphabetical sorting by removing punctuation and spacing
 * and converting to lowercase.
 * @param {string} str 
 * @returns {string}
 */
export function sanitizeForSort(str) {
    if (!str) return '';
    return str.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/**
 * Sort an array of items based on a criterion and accessor functions
 * @param {Array} items - Items to sort
 * @param {string} sortBy - Sort criteria ('alpha-asc', 'alpha-desc', 'date-added', 'page-count', 'file-size', 'recent-read')
 * @param {Object} accessors - Functions to extract values from items
 * @param {Function} accessors.name - (item) => string
 * @param {Function} accessors.date - (item) => string/number (for date-added)
 * @param {Function} accessors.pages - (item) => number
 * @param {Function} accessors.size - (item) => number (bytes) or string (to be parsed)
 * @param {Function} accessors.recent - (item) => number (timestamp)
 * @returns {Array} New sorted array
 */
export function sortItems(items, sortBy, accessors) {
    const sorted = [...items];
    const { name, date, pages, size, recent } = accessors;

    switch (sortBy) {
        case 'alpha-asc':
            sorted.sort((a, b) => {
                const sA = sanitizeForSort(name(a));
                const sB = sanitizeForSort(name(b));
                return sA.localeCompare(sB, undefined, { numeric: true, sensitivity: 'base' });
            });
            break;
        case 'alpha-desc':
            sorted.sort((a, b) => {
                const sA = sanitizeForSort(name(a));
                const sB = sanitizeForSort(name(b));
                return sB.localeCompare(sA, undefined, { numeric: true, sensitivity: 'base' });
            });
            break;
        case 'date-added':
            // If date accessor is provided
            if (date) {
                sorted.sort((a, b) => {
                    const da = date(a);
                    const db = date(b);
                    if (typeof da === 'string') return da.localeCompare(db);
                    return da - db;
                });
            }
            break;
        case 'page-count':
            if (pages) {
                sorted.sort((a, b) => pages(b) - pages(a));
            }
            break;
        case 'file-size':
            if (size) {
                sorted.sort((a, b) => {
                    let sa = size(a);
                    let sb = size(b);
                    if (typeof sa === 'string') sa = parseFileSize(sa);
                    if (typeof sb === 'string') sb = parseFileSize(sb);
                    return sb - sa;
                });
            }
            break;
        case 'recent-read':
            if (recent) {
                sorted.sort((a, b) => recent(b) - recent(a));
            }
            break;
        default:
            // Default to alpha-asc if unknown
            sorted.sort((a, b) => {
                const sA = sanitizeForSort(name(a));
                const sB = sanitizeForSort(name(b));
                return sA.localeCompare(sB, undefined, { numeric: true, sensitivity: 'base' });
            });
    }
    return sorted;
}

// Pre-defined accessors for common entities

export const FOLDER_SORT_ACCESSORS = {
    name: (f) => f.name,
    // Folders usually use 'count' for size/pages in some contexts, 
    // but the original code mapped page-count/file-size to count.
    pages: (f) => f.count, 
    size: (f) => f.count
};

export const TITLE_SORT_ACCESSORS = (readingProgress) => ({
    name: (t) => t.name,
    date: (t) => t.comics[0]?.id || '', // Approximation from original code
    pages: (t) => t.comics.reduce((sum, c) => sum + (c.pages || 0), 0),
    size: (t) => t.comics.reduce((sum, c) => sum + parseFileSize(c.size_str), 0),
    recent: (t) => {
        let maxTime = 0;
        t.comics.forEach(c => {
            const p = readingProgress[c.id];
            if (p && p.lastRead > maxTime) maxTime = new Date(p.lastRead).getTime();
        });
        return maxTime;
    }
});

export const COMIC_SORT_ACCESSORS = (readingProgress) => ({
    name: (c) => c.title,
    date: (c) => c.id,
    pages: (c) => c.pages || 0,
    size: (c) => c.size_str,
    recent: (c) => {
        const p = readingProgress[c.id];
        return p ? new Date(p.lastRead).getTime() : 0;
    }
});
