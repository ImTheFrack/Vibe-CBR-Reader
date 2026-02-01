# Vibe CBR Reader Project Context

## Overview
A web-based comic book reader for CBR/CBZ archives.
**Backend**: Python (FastAPI)
**Frontend**: HTML/JS (Modular Vanilla JS)
**Database**: SQLite
**Design**: Dark/Light theme, responsive, MangaDex-inspired interface

## Current Architecture

### Core Files

#### Backend (Modularized)
- **server.py**: Main entry point, initializes app, database, and includes routers
- **routes/**: Directory containing API route modules
    - **auth.py**: User registration, login, session management
    - **library.py**: Library scanning, book listing, cover images, comic reading
    - **users.py**: User progress, bookmarks, preferences
    - **series.py**: Series metadata and details
    - **admin.py**: Admin-specific operations
- **dependencies.py**: Shared dependencies (e.g., `get_current_user`)
- **scanner.py**: Background library scanning, metadata extraction, thumbnail generation
- **database.py**: SQLite connection and schema management
- **config.py**: Global configuration constants

#### Frontend (ES6 Modules)
- **index.html**: Main HTML template loading `static/js/main.js` as a module
- **static/js/**: Directory containing modular JavaScript files
    - **main.js**: Entry point, exposes functions to window, initializes app
    - **api.js**: Reusable API helper functions (`apiGet`, `apiPost`, etc.)
    - **state.js**: Centralized global state management
    - **auth.js**: Authentication logic and UI
    - **library.js**: Library browsing, navigation, search, and view rendering
    - **reader.js**: Comic reader functionality, page navigation, settings
    - **preferences.js**: User preferences management
    - **theme.js**: Theme toggling and initialization
    - **utils.js**: Utility functions (e.g., `showToast`)
- **static/styles.css**: Global CSS styling

### Database Schema
```sql
-- Core comic tables
CREATE TABLE comics (
    id TEXT PRIMARY KEY,           -- MD5 hash of file path
    path TEXT UNIQUE,              -- Full file path to archive
    title TEXT,                    -- Series title
    series TEXT,                   -- Series name
    category TEXT,                 -- Top-level category (e.g., "Action & Adventure")
    filename TEXT,                 -- Original filename
    size_str TEXT,                 -- Human-readable size (e.g., "45.2 MB")
    pages INTEGER,                 -- Total page count
    processed BOOLEAN DEFAULT 0,   -- Cover extracted flag
    volume REAL,                   -- Volume number (parsed from filename)
    chapter REAL                   -- Chapter number (parsed from filename)
)

-- User authentication and management
CREATE TABLE users (
    id TEXT PRIMARY KEY,           -- UUID
    username TEXT UNIQUE,          -- Unique username
    password_hash TEXT,            -- Bcrypt hashed password
    role TEXT DEFAULT 'user',      -- 'user' or 'admin'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
)

-- User reading progress (per-user, per-comic)
CREATE TABLE reading_progress (
    user_id TEXT,
    comic_id TEXT,
    current_page INTEGER DEFAULT 1,
    total_pages INTEGER,
    percentage REAL DEFAULT 0,
    is_completed BOOLEAN DEFAULT 0,
    last_read TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, comic_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE
)

-- User preferences and settings
CREATE TABLE user_preferences (
    user_id TEXT PRIMARY KEY,
    theme TEXT DEFAULT 'dark',           -- 'dark', 'light', 'auto'
    display_mode TEXT DEFAULT 'single',  -- 'single', 'double', 'long'
    reading_direction TEXT DEFAULT 'ltr', -- 'ltr', 'rtl'
    zoom_mode TEXT DEFAULT 'fit',        -- 'fit', 'width', 'height'
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)

-- Session management with cookies
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,           -- Session token
    user_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)

-- User bookmarks (per-page)
CREATE TABLE bookmarks (
    id TEXT PRIMARY KEY,           -- UUID
    user_id TEXT,
    comic_id TEXT,
    page INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE,
    UNIQUE(user_id, comic_id, page)
)

-- Series metadata table
CREATE TABLE series (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,     -- Series name (from folder)
    title TEXT,                    -- Display title
    title_english TEXT,
    title_japanese TEXT,           -- JSON array
    synonyms TEXT,                 -- JSON array
    authors TEXT,                  -- JSON array
    synopsis TEXT,
    genres TEXT,                   -- JSON array
    tags TEXT,                     -- JSON array
    demographics TEXT,             -- JSON array
    status TEXT,                   -- 'Ongoing', 'Complete', etc.
    total_volumes INTEGER,
    total_chapters INTEGER,
    release_year INTEGER,
    mal_id INTEGER,                -- MyAnimeList ID
    anilist_id INTEGER,            -- AniList ID
    cover_comic_id TEXT,           -- Reference to cover image
    category TEXT,                 -- Category path
    subcategory TEXT,              -- Subcategory path
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

-- Note: comics table also has series_id foreign key
-- ALTER TABLE comics ADD COLUMN series_id INTEGER REFERENCES series(id)
```

### API Endpoints

#### Comic and Library
- `GET /` - Serves index.html
- `GET /static/*` - Serves CSS and JS files
- `GET /api/scan` - Triggers background library scan (incremental)
- `POST /api/rescan` - Wipes comics/series tables and performs a full library rescan
- `GET /api/books` - Lists all comics in database
- `GET /api/cover/{comic_id}` - Returns cover image JPEG
- `GET /api/read/{comic_id}` - Returns comic metadata
- `GET /api/read/{comic_id}/page/{page_num}` - Streams single page image

#### Authentication
- `POST /api/auth/register` - Register new user (username, password)
- `POST /api/auth/login` - Login (username, password) - sets session cookie
- `POST /api/auth/logout` - Logout and clear session cookie
- `GET /api/auth/me` - Get current user info (requires authentication)
- `GET /api/auth/session` - Validate session and return user info

#### Reading Progress
- `GET /api/progress` - Get all reading progress for current user
- `GET /api/progress/{comic_id}` - Get progress for specific comic
- `POST /api/progress/{comic_id}` - Update reading progress (current_page, total_pages, percentage)
- `DELETE /api/progress/{comic_id}` - Reset progress for a comic
- `GET /api/progress/recent` - Get recently read comics

#### User Preferences
- `GET /api/preferences` - Get user preferences (theme, display mode, etc.)
- `POST /api/preferences` - Update user preferences

#### Bookmarks
- `GET /api/bookmarks` - Get all bookmarks for current user
- `GET /api/bookmarks/{comic_id}` - Get bookmarks for specific comic
- `POST /api/bookmarks/{comic_id}` - Create new bookmark (page)
- `DELETE /api/bookmarks/{bookmark_id}` - Delete a bookmark
- `POST /api/bookmarks/{comic_id}/toggle` - Toggle bookmark on/off for page

#### Series Metadata
- `GET /api/series` - List all series with optional filtering (category, subcategory)
- `GET /api/series/{series_name}` - Full series details including:
  - All metadata from series.json (title, synopsis, authors, genres, etc.)
  - All comics in the series with user progress
  - Prev/next comic references for each chapter
  - Series statistics (total chapters, pages, reading progress %)
  - `continue_reading` object with next unread/in-progress comic

## Navigation System

The application features a sophisticated hierarchical navigation system designed for browsing large comic libraries efficiently.

### Folder-Based Hierarchy
The library follows a strict 5-level hierarchy:
```
Root → Category → Subcategory → Title → Comics
```

- **Root**: Library entry point
- **Category**: Top-level genres (e.g., "Action & Adventure", "Comedy")
- **Subcategory**: Sub-genres (e.g., "Cyberpunk", "Modern", "Fantasy")
- **Title**: Individual series (e.g., "One Piece", "Naruto")
- **Comics**: Individual volume/chapter files (CBR/CBZ)

### Contextual Sidebar Navigation
- Shows only folders relevant to the **current level** in the hierarchy
- **Back buttons** at the top to navigate up the hierarchy
- Clicking a folder navigates into it and updates both the main view and sidebar
- Text wrapping for long folder names with proper truncation and hover tooltips

### Breadcrumb Navigation
- **Inline breadcrumbs** displayed above the page title (small, subtle text)
- Format: "Library > Category > Subcategory > Title"
- Clickable links to jump to any parent level
- Consolidated into a single breadcrumb trail for cleaner UI

### Header Navigation
- **Large header** prominently displaying the current location
- Clear visual hierarchy showing where you are in the library
- Dynamic based on current navigation depth

### Flatten Mode
- **Toggle checkbox** (not a separate view mode) to show all comics in current subtree
- When enabled: displays all comics from current location downward (recursively)
- Respects current location - only flattens from where you are
- Works at any level (Category, Subcategory, or Title)
- Sorting options available in flat mode

### Text Wrapping & Display
- Long folder names wrap intelligently to prevent overflow
- Multi-line display with proper line-height and spacing
- Truncation with "..." for extremely long names with full text on hover

## Frontend Features (Implemented)

### Multiple View Modes
- **Grid View**: Cover thumbnails with progress bars (default)
- **List View**: Compact list with metadata columns
- **Detailed View**: Rich cards with cover, stats, description, and actions

### Navigation System
- **Hierarchical Browsing**: Navigate through Category → Subcategory → Title
- **Contextual Sidebar**: Shows only relevant folders at current level with back buttons
- **Inline Breadcrumbs**: Small breadcrumbs above title ("Library > Category > Subcategory")
- **Large Location Header**: Prominent display of current position
- **Flatten Mode**: Toggle to view all comics recursively from current location
- **Text Wrapping**: Proper display of long folder names with truncation and tooltips

### Search
- **Scoped Search**: Search within current location only
- **Global Search**: Option to search across entire library
- Real-time filtering of results
- Searches across titles, series, and categories

### Sorting Options
- Alphabetical (A-Z, Z-A)
- Date Added
- Page Count
- File Size

### Title Detail View (Rich Metadata Display)
When clicking on a title, a beautiful metadata-rich view is displayed:
- **Big Header**: Prominent series title at the top of the view.
- **Synopsis Section**: Legible block of text for the series description (from series.json).
- **Metadata & Tags**: Genres, demographics, authors, and other metadata displayed below the synopsis.
- **Stats**: Displays total chapter count ("X chapters available").
- **Action Bar**: Streamlined bar with primary actions:
    - **Continue/Start Reading**: Context-aware button (Vol/Ch ##).
    - **Read First / Read Latest**: Quick jump buttons.
- **Chapter Grid**: Thumbnails with progress bars and completion indicators.

### Reader Features
... (rest of the section)

### Administrative Features
- **Incremental Scan**: Standard scan for new files.
- **Full Rescan (Shift+Click)**: Option to wipe library database and re-index everything. Includes a two-click confirmation flow with visual feedback on the button.

## File Structure
The comics directory follows a hierarchical structure:

```
comics/
├── Category (e.g., "Action & Adventure", "Isekai & New Worlds", "Comedy")
│   ├── Subcategory (e.g., "Cyberpunk & Dystopian", "Modern", "Fantasy")
│   │   ├── Title (e.g., "Attack on Titan", "Naruto", "One Piece")
│   │   │   ├── series.json           # Metadata file
│   │   │   ├── Title v01-v100/       # Volume range folder
│   │   │   │   ├── Title v01.cbz
│   │   │   │   ├── Title v02.cbz
│   │   │   │   └── ...
│   │   │   └── Title v101+/          # Chapter range folder
│   │   │       ├── Title c1201.cbz
│   │   │       ├── Title c1202.cbz
│   │   │       └── ...
```

### Naming Conventions
- **Volume files**: `Title vXXX[.cbr/.cbz]` (e.g., "One Piece v01.cbz")
- **Chapter files**: `Title [XXX/unitXXX/cXXX][.cbr/.cbz]` (e.g., "One Piece c1201.cbz")
- Comics may be stored directly in Title folder OR in volume range subfolders

## series.json Structure
Metadata file at series level (not all fields may be present):

```json
{
    "title": "You Can't Bluff the Sharp-Eyed Sister",
    "title_english": "You Can't Bluff the Sharp-Eyed Sister",
    "title_japanese": ["聖女に嘘は通じない"],
    "synonyms": "Seijo ni Uso wa Tsuujinai",
    "authors": ["Natsu Hyuuga", "You Asami", "Chiho Shinishi"],
    "synopsis": "Chloe, a priestess-in-training...",
    "genres": ["Fantasy", "Mystery", "Crime", "Romance"],
    "tags": ["Isekai", "Super Powers", "Shounen"],
    "demographics": ["Shounen"],
    "status": "Ongoing",
    "total_volumes": 5,
    "total_chapters": 44,
    "release_year": 2023,
    "mal_id": 157036,
    "anilist_id": 165952
}
```

## Development Roadmap

### Phase 1: Core Infrastructure ✅ COMPLETED
1. ✅ **Frontend UI** - Responsive HTML/CSS/JS with modular structure
2. ✅ **Reader View** - Multiple display modes, navigation, settings
3. ✅ **Library Browser** - Grid/List/Detailed views with sorting
4. ✅ **Folder Navigation** - Hierarchical and flat browsing modes
5. ✅ **Progress Tracking** - Database-based per-user reading progress
6. ✅ **Theme System** - Dark/Light mode with per-user persistence
7. ✅ **Database Enhancements** - User tables, reading progress, preferences, sessions, bookmarks
8. ✅ **Authentication System** - User login/logout, registration, session management, admin roles
9. ✅ **Navigation System** - Contextual sidebar, breadcrumbs, flatten mode, text wrapping

### Phase 1 Delivered Features

#### Authentication & User Management
- ✅ User registration with secure password hashing (bcrypt)
- ✅ Login/logout with session-based authentication
- ✅ HTTP-only session cookies with expiration
- ✅ Protected API routes requiring authentication
- ✅ Current user endpoint for session validation
- ✅ Admin role support (users can have 'user' or 'admin' role)
- ✅ Default admin user creation on startup (admin/admin123)

#### Database Infrastructure
- ✅ **users** table: Store user credentials, roles, and metadata
- ✅ **reading_progress** table: Per-user, per-comic progress tracking
- ✅ **user_preferences** table: Store theme, display mode, reading direction, zoom settings
- ✅ **sessions** table: Session token management with expiration
- ✅ **bookmarks** table: Per-page bookmarks for users

#### API Endpoints
- ✅ Full REST API for authentication (/api/auth/*)
- ✅ Reading progress CRUD operations (/api/progress/*)
- ✅ User preferences management (/api/preferences/*)
- ✅ Bookmarks system (/api/bookmarks/*)

#### Frontend Integration
- ✅ Login modal with username/password
- ✅ User registration flow
- ✅ Authentication state management
- ✅ Protected routes and API calls with session cookies
- ✅ Reading progress synced to database (no longer just localStorage)
- ✅ User preferences synced to database
- ✅ Bookmarks UI in reader with add/remove/toggle
- ✅ Bookmark navigation in reader sidebar
- ✅ "Continue Reading" section shows user-specific progress
- ✅ Navigation System with contextual sidebar and breadcrumbs
- ✅ Flatten mode as toggle with proper hierarchy support
- ✅ Text wrapping for long folder names

#### Navigation System
- ✅ Contextual sidebar showing only relevant folders at current level
- ✅ Back buttons in sidebar to navigate up hierarchy
- ✅ Inline breadcrumbs above title ("Library > Category > Subcategory")
- ✅ Large header showing current location
- ✅ Folder-based hierarchy: Root → Category → Subcategory → Title → Comics
- ✅ Flatten mode as a toggle checkbox (not separate view mode)
- ✅ Text wrapping for long folder names with truncation and tooltips

### Phase 2: Enhanced Library Management (Priority: High)
10. **Advanced Search & Filter**
    - Full-text search across all metadata
    - Filter by: Genre, Status, Author, Year, Tags
    - Advanced query syntax
    - Search history

11. ✅ **Metadata Integration** - COMPLETED (placeholder for future VibeManga integration)
    - Parse and display full series.json data (title, synopsis, authors, genres, tags, demographics, status, year, MAL/AniList IDs, etc.)
    - Store metadata in dedicated `series` database table
    - Rich title detail view with hero section, metadata badges, synopsis panel, stats bar
    - Chapter grid with thumbnails, progress bars, prev/next navigation
    - Display external links to MAL/AniList when IDs present (placeholder for future API integration via VibeManga project)
    - Reader chapter navigation with toolbar buttons and keyboard shortcuts

12. **Collection Management**
    - Custom collections/playlists
    - Reading lists: "Want to Read", "Currently Reading", "Finished"
    - Favorites and ratings
    - Tags and custom fields

### Phase 3: Enhanced Reader Experience (Priority: High)
13. **Reader Improvements**
    - Bookmarks for specific pages
    - Notes on pages
    - Quick jump to bookmarked pages
    - Reading timer and session tracking
    - Auto-advance option

14. **Offline Support**
    - PWA (Progressive Web App) capabilities
    - Cache comics for offline reading
    - Download manager
    - Background sync

### Phase 4: Advanced Features (Priority: Medium)
15. **External Integrations**
    - MyAnimeList API integration
    - AniList API integration
    - ComicVine for Western comics
    - AniDB for anime metadata

16. **Social Features**
    - Reading statistics dashboard
    - Reading streaks
    - Share progress
    - Optional activity feed

17. **Admin & Maintenance**
    - Web-based configuration panel
    - Manual library re-scan triggers
    - Cover regeneration
    - Database maintenance tools
    - Log viewer

### Phase 5: Performance & Polish (Priority: Medium)
18. **Performance Optimizations**
    - Image lazy loading with Intersection Observer
    - Progressive image loading (blur-up)
    - Database pagination for large libraries
    - Background pre-processing queue
    - CDN support for static assets

19. **Advanced UI/UX**
    - Keyboard shortcuts help panel
    - Customizable UI themes (beyond light/dark)
    - Gesture support for touch devices
    - Smooth page transitions
    - Skeleton screens for all loading states

## Technical Considerations

### Security
- Path traversal protection for comic files
- Input validation on all endpoints
- Rate limiting for scans
- Secure file serving
- XSS protection in frontend
- Password hashing with bcrypt
- HTTP-only session cookies
- Session expiration and validation
- Protected API routes requiring authentication
- SQL injection prevention via parameterized queries

### Scalability
- Support for large libraries (10k+ comics)
- Efficient database queries with pagination
- Lazy loading for large series lists
- Background processing for heavy operations
- Image caching strategies

### Cross-Platform
- Works on Windows, Linux, macOS
- Docker containerization support
- NAS/Synology compatibility
- Mobile-responsive design
- Tablet-optimized reader

## Recent Changes
- **2026-02-01**: ✅ IMPLEMENTED - Full Library Rescan with database wipe (Shift+Click on Scan button with confirmation).
- **2026-02-01**: ✅ IMPROVED - Nested folder support for `series.json`. Scanner now searches parent directories for metadata.
- **2026-02-01**: ✅ OVERHAUL - Title View UI redesigned for better readability (Synopsis first, Big Header, refined Action Bar).
- **2026-02-01**: ✅ FIXED - Sorting logic now places volumes before loose chapters and handles multi-digit numbering correctly.
- **2026-02-01**: ✅ FIXED - Various JS syntax errors and quote escaping issues in library navigation and module imports.
- **2026-02-01**: ✅ REFACTOR - Modularized Backend and Frontend Codebase
- **2026-02-01**: Created `series` database table for storing complete metadata (title, synopsis, authors, genres, tags, status, year, MAL/AniList IDs)
- **2026-02-01**: Enhanced scanner to parse all series.json fields and create series records
- **2026-02-01**: Added API endpoints: `/api/series` and `/api/series/{name}` with full metadata and progress
- **2026-02-01**: Implemented beautiful title detail UI with hero section, synopsis, metadata tags, stats bar
- **2026-02-01**: Added chapter grid with thumbnails, progress bars, and prev/next navigation
- **2026-02-01**: Implemented reader chapter navigation (toolbar buttons + Shift+←/→ shortcuts)
- **2026-02-01**: Added comic end modal with continue to next/previous chapter options
- **2026-02-01**: Added external links to MyAnimeList and AniList when IDs present in series.json
- **2026-02-01**: Updated keyboard shortcuts documentation with chapter navigation
- **2025-02-01**: Modularized frontend - separated CSS and JS into external files
- **2025-02-01**: Added multiple view modes (Grid, List, Detailed)
- **2025-02-01**: Implemented hierarchical folder navigation with breadcrumbs
- **2025-02-01**: Added flat view with multiple sorting options
- **2025-02-01**: Created reader with multiple display modes and settings
- **2025-02-01**: ✅ PHASE 1 COMPLETE - Implemented authentication system
- **2025-02-01**: Added user registration and login with session cookies
- **2025-02-01**: Created database tables: users, reading_progress, user_preferences, sessions, bookmarks
- **2025-02-01**: Migrated progress tracking from localStorage to per-user database storage
- **2025-02-01**: Migrated theme preferences to per-user database storage
- **2025-02-01**: Implemented bookmarks system for saving page positions
- **2025-02-01**: Added admin role support with default admin user (admin/admin123)
- **2026-02-01**: Implemented contextual sidebar with back buttons
- **2026-02-01**: Consolidated breadcrumbs above title (inline format)
- **2026-02-01**: Fixed folder-based navigation with proper hierarchy (Root → Category → Subcategory → Title → Comics)
- **2026-02-01**: Fixed flatten mode to respect current location as toggle
- **2026-02-01**: Fixed text wrapping for long folder names with truncation and tooltips
- **2026-02-01**: Fixed apostrophe handling in title names (e.g., "You Can't Bluff...")
- **2026-02-01**: Fixed root-level navigation in flatten mode
- **2026-02-01**: Various bug fixes for title name extraction and display

## Code Quality Goals
- ✅ Modular file structure (CSS/JS separated from HTML)
- ✅ Modular JavaScript with component-based architecture
- ⏳ Add ESLint/Prettier for JavaScript
- ⏳ Add CSS linting
- ⏳ Add Python type hints throughout
- ⏳ Unit tests for backend API
- ⏳ Integration tests for frontend
- ⏳ Documentation for all functions

## Next Immediate Steps (Phase 2)
1. ✅ COMPLETED - Add proper database table for reading progress (moved from localStorage)
2. ✅ COMPLETED - Implement user authentication system
3. ✅ COMPLETED - Add bookmark functionality in reader
4. ✅ COMPLETED - Implement hierarchical navigation system with sidebar and breadcrumbs
5. ✅ COMPLETED - Add series.json parsing and display (with nested folder support)
6. Create admin configuration panel
7. Add database migration system
8. Implement external metadata fetching (MAL/AniList)
9. Add notes functionality on pages
10. Implement advanced search and filtering
