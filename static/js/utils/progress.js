// Centralized progress calculation logic

/**
 * Calculate progress for a single comic
 * @param {Object} comic - The comic object
 * @param {Object} readingProgress - The global reading progress state object
 * @returns {Object} Progress stats { percent, page, isCompleted, hasProgress, readPages, totalPages }
 */
export function calculateComicProgress(comic, readingProgress) {
    const progress = readingProgress[comic.id];
    const totalPages = comic.pages || 0;
    const readPages = progress ? progress.page : 0; // 0-based index usually, or raw page count
    // Note: progress.page is often 0-based index of current page. 
    // If we want "pages read", it might be page + 1? 
    // Existing code: const progressPercent = progress ? (progress.page / comic.pages * 100) : 0;
    // And: You've read ${progress.page + 1} of ${comic.pages} pages
    
    // We will stick to the existing logic: percent uses progress.page directly relative to total.
    
    const percent = totalPages > 0 && progress ? (readPages / totalPages * 100) : 0;
    
    return {
        percent: Math.min(100, Math.max(0, percent)),
        page: readPages,
        // Existing code checks completed flag
        isCompleted: progress ? !!progress.completed : false,
        hasProgress: !!progress && (progress.page > 0 || progress.completed),
        readPages: readPages,
        totalPages: totalPages
    };
}

/**
 * Calculate aggregated progress for a collection of comics (Title/Folder)
 * @param {Array} comics - Array of comic objects
 * @param {Object} readingProgress - The global reading progress state object
 * @returns {Object} Aggregated stats { percent, readPages, totalPages, completedCount, totalCount, hasProgress }
 */
export function aggregateProgress(comics, readingProgress) {
    if (!comics || comics.length === 0) {
        return { percent: 0, readPages: 0, totalPages: 0, completedCount: 0, totalCount: 0, hasProgress: false };
    }

    let totalPages = 0;
    let readPages = 0;
    let completedCount = 0;
    let hasProgress = false;

    comics.forEach(comic => {
        totalPages += comic.pages || 0;
        const progress = readingProgress[comic.id];
        if (progress) {
            readPages += progress.page; // Accumulate raw page numbers
            if (progress.completed) completedCount++;
            if (progress.page > 0 || progress.completed) hasProgress = true;
        }
    });

    const percent = totalPages > 0 ? (readPages / totalPages * 100) : 0;

    return {
        percent: Math.min(100, Math.max(0, percent)),
        readPages,
        totalPages,
        completedCount,
        totalCount: comics.length,
        hasProgress
    };
}
