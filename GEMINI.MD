# Vibe CBR Reader - Developer Context (GEMINI)

This file provides the technical context for AI agents and developers working on the codebase.

## Overview
**Backend**: Python (FastAPI)
**Frontend**: HTML/JS (Modular Vanilla ES6)
**Database**: SQLite

## Project Structure

### Backend Architecture (Modular)
- **server.py**: Entry point, app initialization, and router inclusion.
- **db/**: Database package.
    - `connection.py`: SQLite connection management (WAL mode, timeouts).
    - `users.py`: User accounts, session management, and `bcrypt` authentication.
    - `comics.py`: Core comic metadata storage and retrieval.
    - `series.py`: Series metadata and optimized tag-based filtering.
    - `progress.py`: Reading progress and user preferences.
    - `annotations.py`: Page-level annotations CRUD.
    - `jobs.py`: Scan job tracking and metrics.
- **scanner/**: Library scanning package.
    - `tasks.py`: Phase 1 (Sync) and Phase 2 (Process) background workers.
    - `archives.py`: CBR/CBZ extraction and thumbnail generation.
    - `utils.py`: Natural sorting and filename parsing.
- **routes/**: API route logic (auth, library, users, series, annotations, admin).
- **logger.py**: Centralized `vibe` logger with rotating file handler (`vibe.log`).
- **config.py**: Portable configuration using `python-dotenv`.

### Frontend Architecture (Modular Vanilla ES6)
- **static/js/main.js**: Application entry point and window function exposure.
- **static/js/library/**: Modular library browsing logic.
    - `navigation.js`: Hierarchical path management and breadcrumbs.
    - `view-renderers.js`: UI rendering for folders, titles, and comics. Includes `buildFolderDescription()` for clickable title links in detailed view.
    - `search.js`: Global and scoped search implementation. Returns `match_fields` badges (Title, Synopsis, Author, etc.) for "everywhere" scope.
    - `selection.js`: Click dispatch and selection mode logic.
- **static/js/components/**: Unified UI components (card-renderers, fan-renderer).
- **static/js/reader.js**: Advanced reader engine (Single, Double, Long Strip).
- **static/js/discovery.js**: Discovery tab (Continue Reading, New Additions, Suggestions carousels).
- **static/js/state.js**: Centralized global state object. Includes `_sidebarExpanded` Set for Finder tree state.
- **static/css/**: Modularized CSS files (base, layout, views, components).

## MANGA LIBARAY Structure[
[CATEGORY]
    +--[SUBCATEGORY]
        +--[TITLE]
            +--[TITLE] v01.cbz
            +--[TITLE] v02.cbz [...] etc.
OR
            +--[TITLE] [c001/unit001/001].cbz
            +--[TITLE] [c002/unit002/002].cbz
OR
           +-- [TITLE] [v01-vXX]
                +-- [TITLE] v01.cbz
                +-- [TITLE] v02.cbz
                [...]
                +-- [TITLE] vXX.cbz
            +-- [TITLE] [vXX+1]
                +-- [TITLE] [c100/unit100/100].cbz
                +-- [TITLE] [c101/unit101/101].cbz [...]

## Database Schema (9 tables)

```sql
-- Core comic storage (id = MD5 of filepath)
CREATE TABLE comics (
    id TEXT PRIMARY KEY,
    path TEXT UNIQUE,
    title TEXT,
    series TEXT,
    category TEXT,
    filename TEXT,
    size_str TEXT,
    size_bytes INTEGER,
    mtime INTEGER,
    pages INTEGER,                          -- NULL until processed or lazy-counted
    processed BOOLEAN DEFAULT 0,
    has_thumbnail BOOLEAN DEFAULT 0,        -- Added via ALTER TABLE
    thumbnail_ext TEXT DEFAULT 'webp',      -- Added via ALTER TABLE
    volume REAL,
    chapter REAL,
    series_id INTEGER REFERENCES series(id) -- Added via ALTER TABLE
)

-- Series metadata (from series.json)
CREATE TABLE series (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    title TEXT,
    title_english TEXT,
    title_japanese TEXT,
    synonyms TEXT,       -- JSON array
    authors TEXT,        -- JSON array
    synopsis TEXT,
    genres TEXT,          -- JSON array
    tags TEXT,            -- JSON array
    demographics TEXT,    -- JSON array
    status TEXT,
    total_volumes INTEGER,
    total_chapters INTEGER,
    release_year INTEGER,
    mal_id INTEGER,
    anilist_id INTEGER,
    cover_comic_id TEXT,
    category TEXT,
    subcategory TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

-- FTS5 Virtual Table for deep search
CREATE VIRTUAL TABLE series_fts USING fts5(
    name, title, title_english, synonyms, authors, synopsis,
    content='series',
    content_rowid='id'
)

-- User ratings
CREATE TABLE ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, series_id)
)

-- User accounts
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,             -- Currently SHA256 (needs bcrypt migration)
    email TEXT,
    role TEXT DEFAULT 'reader' CHECK(role IN ('admin', 'reader')),
    approved BOOLEAN DEFAULT 1,             -- Added via ALTER TABLE (gate for new users)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
)

-- Session tokens (30-day expiry via login route)
CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,             -- 32-byte URL-safe token
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
)

-- Per-user reading progress
CREATE TABLE reading_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
    current_page INTEGER DEFAULT 0,
    total_pages INTEGER,
    completed BOOLEAN DEFAULT 0,
    last_read TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, comic_id)
)

-- Per-page bookmarks with optional notes
CREATE TABLE bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, comic_id, page_number)
)

-- Page-level annotations (notes and highlights)
CREATE TABLE page_annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    note TEXT,
    highlight_text TEXT,
    x REAL,
    y REAL,
    width REAL,
    height REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, comic_id, page_number, x, y)
)

-- User preferences (1:1 with users)
CREATE TABLE user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'dark' CHECK(theme IN ('dark', 'light')),
    ereader BOOLEAN DEFAULT 0,
    default_view_mode TEXT DEFAULT 'grid' CHECK(default_view_mode IN ('grid', 'list', 'detailed')),
    default_nav_mode TEXT DEFAULT 'hierarchy' CHECK(default_nav_mode IN ('hierarchy', 'flat')),
    default_sort_by TEXT DEFAULT 'alpha-asc',
    reader_direction TEXT DEFAULT 'ltr' CHECK(reader_direction IN ('ltr', 'rtl')),
    reader_display TEXT DEFAULT 'single' CHECK(reader_display IN ('single', 'double', 'long')),
    reader_zoom TEXT DEFAULT 'fit' CHECK(reader_zoom IN ('fit', 'width', 'height')),
    title_card_style TEXT DEFAULT 'fan' CHECK(title_card_style IN ('fan', 'single')),
    brightness REAL DEFAULT 1.0,
    contrast REAL DEFAULT 1.0,
    saturation REAL DEFAULT 1.0,
    invert REAL DEFAULT 0.0,
    tone_value REAL DEFAULT 0.0,
    tone_mode TEXT DEFAULT 'sepia',
    auto_advance_interval INTEGER DEFAULT 10,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

-- Admin settings (key-value store)
CREATE TABLE admin_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

-- Scan job tracking
CREATE TABLE scan_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed', 'cancelled')),
    total_comics INTEGER DEFAULT 0,
    processed_comics INTEGER DEFAULT 0,
    current_file TEXT,
    phase TEXT,
    new_comics INTEGER DEFAULT 0,
    deleted_comics INTEGER DEFAULT 0,
    changed_comics INTEGER DEFAULT 0,
    processed_pages INTEGER DEFAULT 0,
    page_errors INTEGER DEFAULT 0,
    processed_thumbnails INTEGER DEFAULT 0,
    thumbnail_errors INTEGER DEFAULT 0,
    thumb_bytes_written INTEGER DEFAULT 0,
    thumb_bytes_saved INTEGER DEFAULT 0,
    errors TEXT,                             -- JSON string
    scan_type TEXT DEFAULT 'fast',
    cancel_requested BOOLEAN DEFAULT 0
)

-- Tag modifications (unified blacklist, whitelist/rename, merge)
CREATE TABLE tag_modifications (
    source_norm TEXT PRIMARY KEY,
    action TEXT NOT NULL CHECK(action IN ('blacklist', 'whitelist', 'merge')),
    target_norm TEXT,
    display_name TEXT
)

-- Indexes
CREATE INDEX idx_scan_jobs_status ON scan_jobs(status);
CREATE INDEX idx_comics_series_id ON comics(series_id);
```

## API Endpoints (Complete)

### Auth (`routes/auth.py`)
- `POST /api/auth/register`: Create user
- `POST /api/auth/login`: Login, returns 30-day session cookie
- `POST /api/auth/logout`: Invalidate session
- `GET /api/auth/me`: Current user info (requires auth)
- `GET /api/auth/check`: Auth status check

### Library (`routes/library.py`)
- `GET /api/config`: Exposes normalized `COMICS_DIR`
- `GET /api/books`: List all comics with series metadata (requires auth)
- `GET /api/search`: FTS5 deep metadata search (requires auth)
- `GET /api/cover/{comic_id}`: Serve cached thumbnail or generate on-demand (requires auth)
- `GET /api/read/{comic_id}`: Reader metadata with lazy page counting (requires auth)
- `GET /api/read/{comic_id}/page/{page_num}`: Serve page image binary (requires auth)
- `POST /api/export/cbz`: Start background export job (requires auth)
- `GET /api/export/status/{job_id}`: Poll export progress + disk stats (requires auth)
- `DELETE /api/export/cancel/{job_id}`: Stop export task (requires auth)
- `GET /api/export/download/{job_id}`: Stream final CBZ (requires auth)

### Users (`routes/users.py`)
- `GET /api/progress`: All reading progress for current user
- `GET /api/progress/recent`: Last 12 read comics
- `GET /api/progress/{comic_id}`: Single comic progress
- `POST /api/progress`: Update reading progress
- `DELETE /api/progress`: Clear all reading history
- `DELETE /api/progress/{comic_id}`: Delete specific comic history
- `GET /api/users/me/stats`: Dashboard metrics (started, completed, pages, time)
- `POST /api/users/me/password`: Change own password (requires verification)
- `GET /api/preferences`: User settings
- `PUT /api/preferences`: Update settings
- `GET /api/bookmarks`: All bookmarks for user
- `GET /api/bookmarks/{comic_id}`: Comic-specific bookmarks
- `POST /api/bookmarks`: Add bookmark
- `DELETE /api/bookmarks/{comic_id}/{page_number}`: Remove bookmark

### Annotations (`routes/annotations.py`)
- `GET /api/annotations/{comic_id}`: List all annotations for a comic (requires auth)
- `GET /api/annotations/{comic_id}/{page_number}`: List annotations for specific page (requires auth)
- `POST /api/annotations`: Create annotation with note and optional highlight coordinates (requires auth)
- `PUT /api/annotations/{annotation_id}`: Update annotation (requires auth)
- `DELETE /api/annotations/{annotation_id}`: Delete annotation (requires auth)

### Series (`routes/series.py`)
- `GET /api/series`: All series with filtering
- `GET /api/series/metadata`: Unique genres and statuses for UI filters
- `POST /api/series/rating`: Rate a series (1-5 stars)
- `GET /api/series/rating/{series_id}`: Get avg/user rating
- `POST /api/series/tags/filter`: Filter by tags
- `GET /api/series/{series_name}`: Full series detail

### Discovery (`routes/discovery.py`)
- `GET /api/discovery/continue-reading`: Recently read comics for current user (requires auth)
- `GET /api/discovery/new-additions`: Recently added comics to library (requires auth)
- `GET /api/discovery/suggestions`: Tag-based series suggestions with validated cover images (requires auth)

### Admin (`routes/admin.py`)
- `GET /api/admin/settings`: Get all admin settings (thumbnails, approval)
- `PUT /api/admin/settings`: Update settings
- `GET /api/admin/users`: List all users with reading stats (admin only)
- `PUT /api/admin/users/{user_id}/role`: Update role (admin only)
- `PUT /api/admin/users/{user_id}/password`: Force password reset (admin only)
- `PUT /api/admin/users/{user_id}/approve`: Approve new user (admin only)
- `DELETE /api/admin/users/{user_id}`: Delete user (admin only)
- `GET /api/admin/gaps`: Sequence gap detection report (admin only)
- `GET /api/admin/tags`: Full tag management data with modification status (admin only)
- `POST /api/admin/tags/blacklist`: Blacklist a tag (admin only)
- `POST /api/admin/tags/whitelist`: Whitelist or rename a tag (admin only)
- `POST /api/admin/tags/merge`: Merge one tag into another (admin only)
- `DELETE /api/admin/tags/modification/{norm}`: Remove a modification (admin only)
- `POST /api/admin/system/reload`: Rebuild all metadata caches (admin only)
- `POST /api/admin/system/restart`: Gracefully restart server process (admin only)
- `POST /api/scan`: Start incremental scan (admin only)
- `POST /api/rescan`: Start full rescan (admin only)
- `POST /api/scan/thumbnails`: Start thumbnail rescan (admin only)
- `POST /api/scan/metadata`: Start metadata rescan (admin only)
- `GET /api/scan/status`: Latest scan job metrics (admin only)

## Security Implementation
- **Hashing**: `bcrypt` with automated lazy migration from SHA256.
- **Sessions**: 32-byte URL-safe tokens, 30-day expiry, HttpOnly cookies.
- **Admin**: Environment-configurable credentials (`VIBE_ADMIN_USER`); default account forces password change.
- **Validation**: Strict role-based access control (RBAC) on `/api/admin/*` and `/api/scan/*`.
- **SQL Safety**: 100% parameterized queries using `?` placeholders.

## Scanning Architecture
- **Modes**:
    - **Incremental**: Fast directory walk (syncs new/deleted/changed).
    - **Full**: Wipes database and resyncs from scratch.
    - **Thumbnails**: Regenerates all thumbnails using current settings.
    - **Metadata**: Re-parses `series.json` without touching archives.
- **Phase 1: Syncing**: Fast directory walk. Detects new, deleted, and changed files (via `mtime` and `size_bytes`). Updates folder structure and series records without opening archives.
- **Phase 2: Processing**: Background worker that opens archives to count pages and extract thumbnails for "pending" items.
- **Thumbnail Engine**: Supports WebP, PNG, JPG, and "Pick Best" (smallest file). Configurable quality, ratio, and resolution.
- **On-Demand**: The `/api/read/{id}` endpoint performs "lazy" page counting if a comic hasn't been processed yet, ensuring the reader always has correct totals.

## Navigation System
- **Hierarchical Browsing**: Root → Category → Subcategory → Title.
- **Finder-Style Sidebar Tree**: Recursive expand/collapse tree (categories → subcategories → titles) with `▶` arrow icons. State tracked in `state._sidebarExpanded` Set with keys like `cat:Action` and `sub:Action/Battle Shonen`. Auto-expands to current location on render.
- **Dynamic Relativization**: Frontend fetches `COMICS_DIR` from backend to accurately "subtract" the root path and derive categories, regardless of library location.
- **Contextual Back Button**: Smart navigation that remembers search queries and previous views.

## TODO & Roadmap
For a detailed list of planned features, known bugs, and code quality goals, please see [TODO.md](TODO.md).

## Implemented Feature Set

### Authentication & Users
- User registration with username/password validation
- Login with 30-day session tokens (HttpOnly + SameSite cookies)
- Admin role with scan/user management privileges
- User approval flow (registration gate + admin toggle)
- User preferences (theme, reader settings, view mode, sort)
- Logout with session cleanup

### Library Management
- Hierarchical navigation (Category > Subcategory > Title)
- Finder-style sidebar tree with recursive expand/collapse
- Flatten mode (view all titles in subtree)
- Three view modes (grid, list, detailed)
- Comic-book-cover shaped folder cards with fan hover animation and sample title names
- Detailed view shows clickable links to top 5 most voluminous titles per folder
- Multiple sort criteria (alpha, date, pages, size, recent)
- Global search with scoped/everywhere toggle; match-field badges (Title, Synopsis, Author, etc.)
- Admin user management panel

### Reading Experience
- Single page mode (fully working)
- Double page mode (CSS exists, JS logic incomplete)
- Long strip mode (partially implemented)
- LTR/RTL reading directions
- Zoom modes (fit, width, height)
- Keyboard navigation (arrows, A/D, space, shift+arrows)
- Reading progress tracking (per-user, per-comic)
- Continue reading from series page
- End-of-comic detection with next comic suggestion

### Bookmarks & Progress
- Per-page bookmarks with optional notes
- Per-comic reading progress (current page, completed flag)
- Series progress summary (pages read, volumes completed, %)
- Recently read comics view (last 12)

### Series Metadata
- Parses `series.json` from directories (with parent directory inheritance)
- Stores: title, genres, tags, authors, synopsis, demographics
- MAL ID and AniList ID
- Cover comic assignment

### Tag-Based Filtering
- Filter series by tags/genres
- Related tag refinement (shows remaining tags with counts)
- Tag cards use comic-cover-card style with fan covers and sample series names (parity with library folder cards)
- Detailed view shows clickable series name links per tag
- **Normalization Logic**: 
    - **Punctuation-Blind**: All non-alphanumeric characters are treated as spaces.
    - **Accent-Insensitive**: Diacritics are removed (Pokémon -> pokemon).
    - **Auto-Singularization**: English plural forms are automatically merged (Video Games -> video game).
    - **Recursive Resolution**: Merged tags are resolved to their final target for all counts and matching.

### Library Scanning
- Four scan modes: Incremental, Full, Thumbnails Only, Metadata Only
- Configurable thumbnail settings (Format, Quality, Ratio, Pick Best)
- Two-phase scan (fast sync + background processing)
- Full rescan with database wipe
- Change detection via `mtime` + `size_bytes`
- Real-time progress dashboard (phase, file, metrics)
- On-demand thumbnail generation with 10s timeout
- On-demand (lazy) page counting in reader
- Batch database operations (500 inserts, 50 updates)

### UI/UX
- Dark/light theme toggle (persisted)
- Responsive mobile layout
- Toast notifications
- Modal dialogs (auth, preferences, bookmarks)
- Breadcrumb navigation
- Cover "fan" display on folder and title cards with hover scale animation
- Discovery tab with Continue Reading, New Additions, and Suggestions carousels

## Recent Changes
- **2026-02-13**: BROWSING UX - Finder-style sidebar tree, comic-cover folder cards with fan animation, clickable title links in detailed view, search match-field badges, tags view parity. Fixed discovery suggestion covers.
- **2026-02-11**: READER UX - Touch UI auto-hide, e-reader light mode fix, rating system fix, series navigation from reader.
- **2026-02-07**: OVERHAUL - Admin page consolidated (Scan controls, User management, Settings). Added thumbnail config (Pick Best), user approval flow, and reading stats.
- **2026-02-05**: ENHANCED - Phase 2 completion (User Profile, Stats, FTS5 Deep Search, Background Export, Ratings, Selection Mode).
- **2026-02-05**: OPTIMIZED - Boot sequence warming (FTS rebuild + Tag cache) and consolidated frontend loading.
- **2026-02-03**: AUDIT - Full codebase review. 8 bugs confirmed and documented. Roadmap expanded to 7 phases.
- **2026-02-01**: IMPLEMENTED - Robust two-phase scanner with change detection (`mtime`/`size`) and deletion handling.
- **2026-02-01**: IMPLEMENTED - Real-time scan metrics dashboard (Phase tracking, New/Changed/Deleted counts, Success/Error rates).
- **2026-02-01**: IMPLEMENTED - On-demand page counting in reader to support "Fast Scan" entry.
- **2026-02-01**: ENHANCED - Robust path relativization in frontend using backend-supplied `COMICS_DIR`.
- **2026-02-01**: FIXED - "Database is locked" issues using WAL mode and 30s connection timeouts.

## Code Quality Goals
- ✅ Modularized JS/CSS components
- ✅ Robust Error Handling in Scan Tasks
- ✅ Centralized state management (state.js)
- ✅ API abstraction layer (api.js)
- ✅ Dependency injection for auth (dependencies.py)

## Domain Model & Nomenclature

This section defines the consistent terminology used throughout the codebase. Using these terms correctly prevents confusion when working with the hierarchical manga library structure.

### Core Concepts

| Term | Definition | Example | Code Reference |
|------|------------|---------|----------------|
| **Comic** | A single archive file (.cbz, .cbr) containing pages of a manga. The atomic unit. | `One Piece v01.cbz`, `Naruto c001.cbz` | `comics` table, `comic` object in JS |
| **Chapter** | Generic term for a comic entry within a Title. Used for display/count purposes regardless of whether the file is a volume, chapter, or unit. | "5 chapters" (might be 3 volumes + 2 chapters) | UI display, `comics.length` |
| **Title** | A manga series or story. Contains multiple chapters. The leaf node in the hierarchy. | "One Piece", "Attack on Titan" | `title` in folder tree, `series` in DB |
| **Series** | Metadata record for a Title. Contains synopsis, genres, tags, etc. | Series table with name="One Piece" | `series` table |
| **Subcategory** | Intermediate grouping folder between Category and Title. Usually a genre/theme. | "Battle Shonen", "Romance", "Sci-Fi" | `subcategories` in folder tree |
| **Category** | Top-level folder in the library hierarchy. Usually a broad classification. | "Action, Adventure & Adrenaline", "Romance & Drama" | `categories` in folder tree |
| **Tag** | Generic metadata label including: genres, demographics, themes, or custom tags. Used for filtering. | "Shonen", "Action", "School Life", "Mecha" | `tags` in series table, consolidated in tags view |

### Folder Hierarchy (Physical → Logical)

```
Physical Path:                              Logical Structure:
────────────────────────────────────────    ───────────────────────
/manga/                                     Root
    /Action, Adventure & Adrenaline/        → Category
        /Battle Shonen & Supernatural/      → Subcategory  
            /One Piece/                     → Title
                One Piece v01.cbz           → Chapter (Comic)
                One Piece v02.cbz           → Chapter (Comic)
                One Piece c501.cbz          → Chapter (Comic)
```

### Navigation Levels

| Level | In Code | User Sees | Example |
|-------|---------|-----------|---------|
| **Root** | `state.currentLevel === 'root'` | Categories grid | "Action, Adventure...", "Romance & Drama..." cards |
| **Category** | `state.currentLevel === 'category'` | Subcategories grid | "Battle Shonen", "Supernatural Powers" cards |
| **Subcategory** | `state.currentLevel === 'subcategory'` | Titles grid | "One Piece", "Naruto", "Bleach" cards |
| **Title** | `state.currentLevel === 'title'` | Title detail + chapters | Synopsis, metadata, chapter list |

### Database Terminology

| DB Term | Maps To | Notes |
|---------|---------|-------|
| `comics.path` | File path | Full filesystem path to .cbz/.cbr |
| `comics.series` | Title name | Often null, populated from filename parsing |
| `comics.series_id` | → Series record | Foreign key to series metadata |
| `series.name` | Title identifier | Unique, used for matching |
| `series.genres` | JSON array | Shonen, Action, etc. |
| `series.tags` | JSON array | Custom tags beyond genres |
| `series.demographics` | JSON array | Shonen, Seinen, Josei, etc. |

### User-Facing vs Internal Terms

| User Sees | Internal/Code | Why Different |
|-----------|---------------|---------------|
| "Chapter" | `comic` | Users don't care about volumes vs chapters vs units |
| "Title" | `series` or `title` | "Series" is metadata, "Title" is the thing they click |
| "Tags" | `genres` + `tags` + `demographics` | Consolidated for filtering UX |
| "Reading" | `in_progress` | Status filter value |

### Common Confusions to Avoid

❌ **DON'T**: Say "the Series folder" - Series is metadata, not a folder  
✅ **DO**: Say "the Title folder" or "the folder containing chapters"

❌ **DON'T**: Check `comic.chapter` for chapter count - that's the parsed chapter number  
✅ **DO**: Use `title.comics.length` for "X chapters" display

❌ **DON'T**: Call everything "manga" - too generic  
✅ **DO**: Use "Comic" for files, "Title" for series, "Chapter" for count display

❌ **DON'T**: Mix "tag" (filter concept) with "genre" (metadata field)  
✅ **DO**: Use "Tag" as the generic UI term that includes genres, demographics, and custom tags

## Common Patterns & Gotchas

### Window Exports for Cross-Module Access
When a function needs to be called from HTML event handlers or other modules:
```javascript
// At end of module, export to window:
window.functionName = functionName;

// Example: renderTagsGrid in tags.js must be exported for setViewMode in library.js
```

### Event Delegation
Global event delegation is set up in `main.js` on the document level to catch clicks from any view:
```javascript
document.addEventListener('click', (event) => {
    const actionElement = event.target.closest('[data-action]');
    // ... handle card-click, toggle-selection, etc.
});
```

### Filter Application
Filters are applied in `getTitlesInLocation()` for library view and manually in `renderSearchResults()` for search view. The `titleMatchesFilter()` helper checks genre, status, and read progress.