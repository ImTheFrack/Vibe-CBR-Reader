/**
 * Discovery Module
 * Handles loading and rendering discovery view content (Continue Reading and New Additions carousels).
 */

import { apiGet } from './api.js';
import { showToast } from './utils.js';

/**
 * Loads discovery data from both API endpoints concurrently
 * Fetches continue reading and new additions, then renders them
 */
export async function loadDiscoveryData() {
    try {
        // Show loading state
        const continueGrid = document.getElementById('discovery-continue-grid');
        const newGrid = document.getElementById('discovery-new-grid');
        
        if (continueGrid) continueGrid.innerHTML = '<div class="loading-state">Loading...</div>';
        if (newGrid) newGrid.innerHTML = '<div class="loading-state">Loading...</div>';
        
        // Fetch both endpoints concurrently
        const [continueData, newData] = await Promise.all([
            apiGet('/api/discovery/continue-reading'),
            apiGet('/api/discovery/new-additions')
        ]);
        
        // Handle errors
        if (continueData.error) {
            console.error('Failed to load continue reading:', continueData.error);
            if (continueGrid) continueGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">📖</div><div class="empty-title">Failed to load continue reading</div></div>';
        } else {
            const comics = Array.isArray(continueData) ? continueData : continueData.items || [];
            renderContinueReading(comics);
        }
        
        if (newData.error) {
            console.error('Failed to load new additions:', newData.error);
            if (newGrid) newGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">✨</div><div class="empty-title">Failed to load new additions</div></div>';
        } else {
            const comics = Array.isArray(newData) ? newData : newData.items || [];
            renderNewAdditions(comics);
        }
    } catch (error) {
        console.error('Error loading discovery data:', error);
        showToast('Failed to load discovery data', 'error');
    }
}

/**
 * Renders continue reading carousel cards
 * @param {Array} comics - Array of comic objects with progress data
 */
export function renderContinueReading(comics) {
    const grid = document.getElementById('discovery-continue-grid');
    if (!grid) return;
    
    if (!comics || comics.length === 0) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-icon">📖</div><div class="empty-title">No comics in progress</div><div class="empty-subtitle">Start reading to see your progress here</div></div>';
        return;
    }
    
    grid.innerHTML = comics.map(comic => createCarouselCard(comic, 'continue')).join('');
    
    // Attach click handlers
    grid.querySelectorAll('.carousel-card').forEach(card => {
        card.addEventListener('click', () => {
            const comicId = card.dataset.comicId;
            openComic(comicId);
        });
    });
}

/**
 * Renders new additions carousel cards
 * @param {Array} comics - Array of comic objects
 */
export function renderNewAdditions(comics) {
    const grid = document.getElementById('discovery-new-grid');
    if (!grid) return;
    
    if (!comics || comics.length === 0) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-icon">✨</div><div class="empty-title">No new additions</div><div class="empty-subtitle">Check back later for new comics</div></div>';
        return;
    }
    
    grid.innerHTML = comics.map(comic => createCarouselCard(comic, 'new')).join('');
    
    // Attach click handlers
    grid.querySelectorAll('.carousel-card').forEach(card => {
        card.addEventListener('click', () => {
            const comicId = card.dataset.comicId;
            openComic(comicId);
        });
    });
}

/**
 * Creates a carousel card HTML element
 * @param {Object} comic - Comic data object
 * @param {string} type - Card type: 'continue' or 'new'
 * @returns {string} HTML string for the card
 */
function createCarouselCard(comic, type) {
    const coverUrl = `/api/cover/${comic.id}`;
    const title = comic.title || 'Unknown';
    const series = comic.series || 'Unknown Series';
    
    let badgeHtml = '';
    let progressHtml = '';
    
    if (type === 'continue') {
        // Continue reading card with progress bar
        const progressPercent = comic.progress_percentage || 0;
        const currentPage = comic.current_page || 0;
        const totalPages = comic.total_pages || 0;
        
        progressHtml = `
            <div class="carousel-card-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progressPercent}%"></div>
                </div>
                <div class="progress-text">${currentPage}/${totalPages}</div>
            </div>
        `;
    } else if (type === 'new') {
        // New additions card with badge
        badgeHtml = '<div class="carousel-card-badge">New</div>';
    }
    
    return `
        <div class="carousel-card" data-comic-id="${comic.id}">
            <div class="carousel-card-cover">
                <img src="${coverUrl}" alt="${title}" loading="lazy">
                ${badgeHtml}
            </div>
            <div class="carousel-card-info">
                <div class="carousel-card-title">${title}</div>
                <div class="carousel-card-series">${series}</div>
                ${progressHtml}
            </div>
        </div>
    `;
}

/**
 * Scrolls a carousel container left or right
 * @param {string} type - Carousel type: 'continue' or 'new'
 * @param {number} direction - Scroll direction: -1 (left) or 1 (right)
 */
export function scrollCarousel(type, direction) {
    const containerId = type === 'continue' ? 'discovery-continue-grid' : 'discovery-new-grid';
    const container = document.getElementById(containerId);
    
    if (!container) return;
    
    // Calculate scroll amount (typically card width + gap)
    const scrollAmount = 320; // Adjust based on card width + gap
    const currentScroll = container.scrollLeft;
    const targetScroll = currentScroll + (direction * scrollAmount);
    
    container.scrollTo({
        left: targetScroll,
        behavior: 'smooth'
    });
}

/**
 * Opens a comic in the reader
 * @param {string} comicId - The comic ID to open
 */
function openComic(comicId) {
    if (window.routerNavigate) {
        window.routerNavigate('reader', { comicId: comicId });
    } else if (window.startReading) {
        window.startReading(comicId);
    } else {
        console.error('No navigation method available');
    }
}

// Export openComic for external use
export { openComic };
