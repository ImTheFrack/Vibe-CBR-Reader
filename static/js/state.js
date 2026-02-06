// State management
export const state = {
    comics: [],
    currentView: 'library',
    // New navigation state
    currentLevel: 'root', // 'root', 'category', 'subcategory', 'title'
    flattenMode: false,
    currentLocation: {
        category: null,
        subcategory: null,
        title: null
    },
    libraryRoot: null,
    folderTree: null, // Hierarchical structure
    viewMode: 'grid', // 'grid', 'list', 'detailed'
    sidebarVisible: window.innerWidth > 1024,
    currentComic: null,
    currentPage: 0,
    totalPages: 0,
    settings: {
        direction: 'ltr',
        display: 'single',
        zoom: 'fit',
        titleCardStyle: 'fan',
        brightness: 1.0,
        contrast: 1.0,
        saturation: 1.0,
        invert: 0.0,
        toneValue: 0.0,
        toneMode: 'sepia',
        autoAdvanceActive: false,
        autoAdvanceInterval: 10,
        keybindings: {
            next: ['ArrowRight', 'd', 'D', ' '],
            prev: ['ArrowLeft', 'a', 'A'],
            prevChapter: ['ArrowLeft'], // With Shift
            nextChapter: ['ArrowRight'], // With Shift
            fullscreen: ['f', 'F'],
            bookmark: ['b', 'B'],
            exit: ['Escape']
        }
    },
    theme: localStorage.getItem('theme') || 'dark',
    ereader: localStorage.getItem('ereader') === 'true',
    sortBy: 'alpha-asc',
    // Search state
    searchQuery: '',
    searchScope: 'current', // 'current' or 'everywhere'
    apiSearchResults: [], // Results from FTS5 deep search
    // Filters state
    filters: {
        genre: '',
        status: '',
        read: ''
    },
    // Selection state
    selectionMode: false,
    selectedIds: new Set(),
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
