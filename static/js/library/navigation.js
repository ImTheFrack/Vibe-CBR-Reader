import { state } from '../state.js';
import { navigate } from '../router.js';

export function navigateToRoot() {
    state.currentLevel = 'root';
    state.currentLocation = { category: null, subcategory: null, title: null };
    state.searchQuery = '';
    // This will be defined in a separate module but we need to call it
    if (window.updateLibraryView) window.updateLibraryView();
}

export function navigateToFolder(type, name) {
    if (type === 'category') {
        state.currentLevel = 'category';
        state.currentLocation.category = name;
        state.currentLocation.subcategory = null;
        state.currentLocation.title = null;
    } else if (type === 'subcategory') {
        state.currentLevel = 'subcategory';
        state.currentLocation.subcategory = name;
        state.currentLocation.title = null;
    } else if (type === 'title') {
        state.currentLevel = 'title';
        state.currentLocation.title = name;
        
        if (state.currentLocation.subcategory === null) {
            if (state.currentLocation.category === null && state.folderTree) {
                for (const [catName, category] of Object.entries(state.folderTree.categories || {})) {
                    let found = false;
                    for (const [subName, subcategory] of Object.entries(category.subcategories)) {
                        if (subcategory.titles[name]) {
                            state.currentLocation.category = category.name;
                            state.currentLocation.subcategory = subcategory.name;
                            found = true;
                            break;
                        }
                    }
                    if (found) break;
                }
            } else if (state.folderTree) {
                const category = state.folderTree.categories[state.currentLocation.category];
                if (category) {
                    for (const [subName, subcategory] of Object.entries(category.subcategories || {})) {
                        if (subcategory.titles[name]) {
                            state.currentLocation.subcategory = subcategory.name;
                            break;
                        }
                    }
                }
            }
        }
    }
    state.searchQuery = '';
    if (window.updateLibraryView) window.updateLibraryView();
}

export function navigateUp() {
    let params = {};
    
    switch (state.currentLevel) {
        case 'title':
            params = {
                category: state.currentLocation.category,
                subcategory: state.currentLocation.subcategory
            };
            break;
        case 'subcategory':
            params = {
                category: state.currentLocation.category
            };
            break;
        case 'category':
            params = {};
            break;
        default:
            return;
    }
    
    navigate('library', params);
}

export function updateBreadcrumbs() {
    const container = document.getElementById('breadcrumbs');
    if (!container) return;
    
    const parts = [`<span class="breadcrumb-link" onclick="routerNavigate('library', {})">Library</span>`];
    
    if (state.currentLevel === 'category') {
        parts.push(`<span class="breadcrumb-current">${state.currentLocation.category}</span>`);
    } else if (state.currentLevel === 'subcategory') {
        parts.push(`<span class="breadcrumb-link" onclick="routerNavigate('library', { category: \`${state.currentLocation.category}\` })">${state.currentLocation.category}</span>`);
        const subName = state.currentLocation.subcategory === '_direct' ? 'Uncategorized' : state.currentLocation.subcategory;
        parts.push(`<span class="breadcrumb-current">${subName}</span>`);
    } else if (state.currentLevel === 'title') {
        if (state.currentLocation.category) {
            parts.push(`<span class="breadcrumb-link" onclick="routerNavigate('library', { category: \`${state.currentLocation.category}\` })">${state.currentLocation.category}</span>`);
        }
        if (state.currentLocation.subcategory) {
            const subName = state.currentLocation.subcategory === '_direct' ? 'Uncategorized' : state.currentLocation.subcategory;
            parts.push(`<span class="breadcrumb-link" onclick="routerNavigate('library', { category: \`${state.currentLocation.category}\`, subcategory: \`${state.currentLocation.subcategory}\` })">${subName}</span>`);
        }
    }
    
    container.innerHTML = parts.join(' <span class="breadcrumb-separator">›</span> ');
}

export function navigateTitleComic(direction) {
    if (!state.currentSeries || !state.currentSeries.comics) return;
    const comics = state.currentSeries.comics;
    let targetComic = null;
    
    if (direction === -1) {
        for (let i = comics.length - 1; i >= 0; i--) {
            const progress = comics[i].user_progress;
            if (progress && !progress.completed) {
                targetComic = comics[i];
                break;
            }
        }
        if (!targetComic && comics.length > 0) targetComic = comics[comics.length - 1];
    } else {
        for (let i = 0; i < comics.length; i++) {
            const progress = comics[i].user_progress;
            if (!progress || (!progress.completed && progress.current_page === 0)) {
                targetComic = comics[i];
                break;
            }
        }
        if (!targetComic) {
            for (let i = 0; i < comics.length; i++) {
                const progress = comics[i].user_progress;
                if (progress && !progress.completed) {
                    targetComic = comics[i];
                    break;
                }
            }
        }
        if (!targetComic && comics.length > 0) targetComic = comics[0];
    }
    
    if (targetComic) {
        const progress = targetComic.user_progress;
        const page = progress && !progress.completed ? progress.current_page : 0;
        startReading(targetComic.id, page);
    }
}

// Global Export
window.navigateTitleComic = navigateTitleComic;

