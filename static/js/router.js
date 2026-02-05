/**
 * Centralized Hash Router Module
 * Provides hash-based routing for the vanilla JS SPA
 * No dependencies on other app modules to avoid circular imports
 */

// Navigation generation counter for async race protection
let navGeneration = 0;

// View cleanup registry
const cleanupHandlers = new Map();

// Flag to skip hashchange handling during programmatic navigation
let skipNextHashChange = false;

/**
 * Parse a hash string into a route object
 * @param {string} hash - The hash string (e.g., '#/library/Manga' or '')
 * @returns {Object} - { view: string, params: object }
 */
export function parseHash(hash) {
    // Default to library root
    if (!hash || hash === '#' || hash === '#/') {
        return { view: 'library', params: {} };
    }

    // Remove leading #/
    const path = hash.startsWith('#/') ? hash.slice(2) : hash.startsWith('#') ? hash.slice(1) : hash;

    // Parse search params if present
    const [pathPart, searchPart] = path.split('?');
    const params = {};

    if (searchPart) {
        const searchParams = new URLSearchParams(searchPart);
        for (const [key, value] of searchParams) {
            params[key] = decodeURIComponent(value);
        }
    }

    // Split path into segments
    const segments = pathPart.split('/').filter(s => s.length > 0);

    if (segments.length === 0) {
        return { view: 'library', params };
    }

    const view = segments[0];

    switch (view) {
        case 'library':
            // #/library - root
            // #/library/{category}
            // #/library/{category}/{subcategory}
            // #/library/{category}/{subcategory}/{title}
            // #/library/_title/{title} - special case for tags navigation
            if (segments.length >= 2) {
                if (segments[1] === '_title' && segments.length >= 3) {
                    params.title = decodeURIComponent(segments[2]);
                } else {
                    params.category = decodeURIComponent(segments[1]);
                    if (segments.length >= 3) {
                        params.subcategory = decodeURIComponent(segments[2]);
                    }
                    if (segments.length >= 4) {
                        params.title = decodeURIComponent(segments[3]);
                    }
                }
            }
            return { view: 'library', params };

        case 'recent':
            return { view: 'recent', params };

        case 'tags':
            // #/tags?tags=Fantasy,Action
            return { view: 'tags', params };

        case 'series':
            // #/series/{name}
            if (segments.length >= 2) {
                params.name = decodeURIComponent(segments[1]);
            }
            return { view: 'series', params };

        case 'read':
            // #/read/{comicId}
            if (segments.length >= 2) {
                params.comicId = decodeURIComponent(segments[1]);
            }
            return { view: 'read', params };

        case 'search':
            // #/search?q={query}&scope={scope}
            return { view: 'search', params };

        case 'scan':
            return { view: 'scan', params };

        default:
            // Unknown route - fall back to library
            console.warn(`Unknown route: ${view}, falling back to library`);
            return { view: 'library', params: {} };
    }
}

/**
 * Build a hash string from a view name and params
 * @param {string} view - The view name
 * @param {Object} params - Route parameters
 * @returns {string} - The hash string (e.g., '#/library/Manga')
 */
export function buildHash(view, params = {}) {
    let hash = `#/${view}`;

    switch (view) {
        case 'library':
            if (params.category) {
                hash += `/${encodeURIComponent(params.category)}`;
                if (params.subcategory) {
                    hash += `/${encodeURIComponent(params.subcategory)}`;
                    if (params.title) {
                        hash += `/${encodeURIComponent(params.title)}`;
                    }
                }
            } else if (params.title) {
                // If only title is provided (from tags), encode it as a special marker
                // The hashchange handler will call navigateToFolder('title', name) to resolve it
                hash += `/_title/${encodeURIComponent(params.title)}`;
            }
            break;

        case 'series':
            if (params.name) {
                hash += `/${encodeURIComponent(params.name)}`;
            }
            break;

        case 'read':
            if (params.comicId) {
                hash += `/${encodeURIComponent(params.comicId)}`;
            }
            break;

        case 'search':
            // Search params go in query string within the hash
            if (params.q !== undefined || params.scope !== undefined) {
                const searchParams = new URLSearchParams();
                if (params.q !== undefined) {
                    searchParams.set('q', params.q);
                }
                if (params.scope !== undefined) {
                    searchParams.set('scope', params.scope);
                }
                hash += `?${searchParams.toString()}`;
            }
            return hash;

        case 'tags':
            const tagParams = new URLSearchParams();
            let hasParams = false;
            if (params.tags) {
                tagParams.set('tags', params.tags);
                hasParams = true;
            }
            if (params.view) {
                tagParams.set('view', params.view);
                hasParams = true;
            }
            if (hasParams) {
                hash += `?${tagParams.toString()}`;
            }
            break;

        // recent, scan - no additional params
    }

    return hash;
}

/**
 * Navigate to a new route (pushes history entry)
 * @param {string} view - The view name
 * @param {Object} params - Route parameters
 */
export function navigate(view, params = {}) {
    const hash = buildHash(view, params);
    if (location.hash !== hash) {
        skipNextHashChange = false; // Allow hashchange to fire
        location.hash = hash;
    }
}

/**
 * Replace current route without pushing history entry
 * @param {string} view - The view name
 * @param {Object} params - Route parameters
 */
export function replace(view, params = {}) {
    const hash = buildHash(view, params);
    if (location.hash !== hash) {
        skipNextHashChange = true; // Skip the next hashchange event
        history.replaceState(null, '', hash);
        // Manually trigger route handling since we suppressed hashchange
        handleRouteChange(hash, location.hash);
    }
}

/**
 * Get the current route
 * @returns {Object} - { view: string, params: object }
 */
export function getCurrentRoute() {
    return parseHash(location.hash);
}

/**
 * Get the current navigation generation
 * Used by async callbacks to check if navigation is still current
 * @returns {number} - Current generation number
 */
export function getNavGeneration() {
    return navGeneration;
}

/**
 * Increment navigation generation
 * Called by hashchange handler at start of route change
 */
export function incrementNavGeneration() {
    navGeneration++;
    return navGeneration;
}

/**
 * Close all open modal overlays
 * Removes them immediately to prevent orphaned setTimeout callbacks
 */
export function closeAllModals() {
    const modalIds = [
        'bookmarks-modal-overlay',
        'comic-end-overlay',
        'preferences-modal-overlay'
    ];

    modalIds.forEach(id => {
        const modal = document.getElementById(id);
        if (modal) {
            // Remove immediately without animation
            modal.remove();
        }
    });
}

/**
 * Register a cleanup handler for a view
 * @param {string} view - The view name
 * @param {Function} handler - Cleanup function to call when leaving the view
 */
export function registerCleanup(view, handler) {
    cleanupHandlers.set(view, handler);
}

/**
 * Run cleanup handler for a view
 * @param {string} view - The view name
 */
export function runCleanup(view) {
    const handler = cleanupHandlers.get(view);
    if (handler) {
        try {
            handler();
        } catch (err) {
            console.error(`Cleanup error for view ${view}:`, err);
        }
    }
}

/**
 * Check if we should skip the next hashchange event
 * Used by replace() to prevent double-handling
 * @returns {boolean}
 */
export function shouldSkipHashChange() {
    if (skipNextHashChange) {
        skipNextHashChange = false;
        return true;
    }
    return false;
}

/**
 * Handle route change
 * This is called by main.js from its hashchange listener
 * @param {string} newHash - The new hash
 * @param {string} oldHash - The previous hash
 * @returns {Object} - The parsed new route
 */
export function handleRouteChange(newHash, oldHash) {
    // Increment generation for async race protection
    incrementNavGeneration();

    // Close any open modals
    closeAllModals();

    // Parse the old route to determine which view we're leaving
    const oldRoute = parseHash(oldHash);

    // Run cleanup for the view being left
    runCleanup(oldRoute.view);

    // Parse and return the new route
    return parseHash(newHash);
}

/**
 * Initialize the router
 * Should be called once from main.js during app initialization
 */
export function initRouter() {
    // Ensure we have a valid hash on init
    const currentRoute = getCurrentRoute();
    if (!location.hash || location.hash === '#' || location.hash === '#/') {
        navigate('library', {});
    }
    return currentRoute;
}
