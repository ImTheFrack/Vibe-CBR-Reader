// State management
export const state = {
    comics: [],
    currentView: 'library',
    previousView: null,
    // New navigation state
    currentLevel: 'root', // 'root', 'category', 'subcategory', 'title'
    flattenMode: false,
    currentLocation: {
        category: null,
        subcategory: null,
        title: null
    },
    folderTree: null, // Hierarchical structure
    viewMode: 'grid', // 'grid', 'list', 'detailed'
    sidebarVisible: window.innerWidth > 1024,
    currentComic: null,
    currentPage: 0,
    totalPages: 0,
    settings: {
        direction: 'ltr',
        display: 'single',
        zoom: 'fit'
    },
    theme: localStorage.getItem('theme') || 'dark',
    sortBy: 'alpha-asc',
    // Search state
    searchQuery: '',
    previousSearchQuery: '',
    searchScope: 'current', // 'current' or 'everywhere'
    // Authentication state
    currentUser: null,
    isAuthenticated: false,
    // Progress data (loaded from API)
    readingProgress: {},
    // User preferences (loaded from API)
    userPreferences: null,
    // Bookmarks for current comic
    currentBookmarks: [],
    // Current series data (for title detail view)
    currentSeries: null,
    // Reader navigation state
    readerNavigation: {
        prevComic: null,
        nextComic: null
    }
};
