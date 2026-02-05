# Vibe CBR Reader - Developer Context (GEMINI)

This file provides the technical context for AI agents and developers working on the codebase.

## Overview
**Backend**: Python (FastAPI)
**Frontend**: HTML/JS (Modular Vanilla ES6)
**Database**: SQLite

## Project Structure

### Backend Modules
- **server.py**: Entry point, app initialization, and router inclusion.
- **routes/**: API route logic (auth, library, users, series, admin).
- **scanner.py**: Two-phase library scanning and metadata extraction logic.
- **database.py**: Raw SQLite schema definitions and connection management (no ORM).
- **config.py**: Global configuration and paths.

### Frontend Architecture
- **static/js/main.js**: Application entry point and window function exposure.
- **static/js/components/**: Unified UI components (card-renderers, fan-renderer).
- **static/js/utils/**: Specialized logic (progress, sorting, api helpers).
- **static/js/state.js**: Global state management (centralized `state` object).
- **static/js/library.js**: Core library browsing, folder tree generation, and navigation logic.
- **static/js/reader.js**: Reader engine supporting Single, Double Page, and Long Strip modes.
- **static/css/**: Modularized CSS files.

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

-- User accounts
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,             -- Currently SHA256 (needs bcrypt migration)
    email TEXT,
    role TEXT DEFAULT 'reader' CHECK(role IN ('admin', 'reader')),
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

-- User preferences (1:1 with users)
CREATE TABLE user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'dark' CHECK(theme IN ('dark', 'light')),
    default_view_mode TEXT DEFAULT 'grid' CHECK(default_view_mode IN ('grid', 'list', 'detailed')),
    default_nav_mode TEXT DEFAULT 'hierarchy' CHECK(default_nav_mode IN ('hierarchy', 'flat')),
    default_sort_by TEXT DEFAULT 'alpha-asc',
    reader_direction TEXT DEFAULT 'ltr' CHECK(reader_direction IN ('ltr', 'rtl')),
    reader_display TEXT DEFAULT 'single' CHECK(reader_display IN ('single', 'double', 'long')),
    reader_zoom TEXT DEFAULT 'fit' CHECK(reader_zoom IN ('fit', 'width', 'height')),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

-- Scan job tracking
CREATE TABLE scan_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
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
    errors TEXT,                             -- JSON string
    scan_type TEXT DEFAULT 'fast'
)

-- Indexes
CREATE INDEX idx_scan_jobs_status ON scan_jobs(status);
CREATE INDEX idx_comics_series_id ON comics(series_id);
```

## API Endpoints (Complete)

### Auth (`routes/auth.py`)
- `POST /api/auth/register`: Create user (⚠️ accepts arbitrary role — bug)
- `POST /api/auth/login`: Login, returns 30-day session cookie
- `POST /api/auth/logout`: Invalidate session
- `GET /api/auth/me`: Current user info (requires auth)
- `GET /api/auth/check`: Auth status check (returns null if not logged in)

### Library (`routes/library.py`)
- `GET /api/config`: Exposes normalized `COMICS_DIR` for frontend path relativization
- `GET /api/books`: List all comics (requires auth)
- `GET /api/cover/{comic_id}`: Serve cached thumbnail or generate on-demand (requires auth)
- `GET /api/read/{comic_id}`: Reader metadata with lazy page counting (requires auth)
- `GET /api/read/{comic_id}/page/{page_num}`: Serve page image binary (requires auth)
- `POST /api/scan`: Start fast scan in background (admin only)
- `POST /api/rescan`: Full database wipe + rescan (admin only)
- `GET /api/scan/status`: Latest scan job metrics (⚠️ no auth check — bug)

### Users (`routes/users.py`)
- `GET /api/progress`: All reading progress for current user
- `GET /api/progress/recent`: Last 12 read comics
- `GET /api/progress/{comic_id}`: Single comic progress (returns default if none)
- `POST /api/progress`: Update reading progress
- `GET /api/preferences`: User settings
- `PUT /api/preferences`: Update settings (whitelisted fields only)
- `GET /api/bookmarks`: All bookmarks for user
- `GET /api/bookmarks/{comic_id}`: Comic-specific bookmarks
- `POST /api/bookmarks`: Add bookmark
- `DELETE /api/bookmarks/{comic_id}/{page_number}`: Remove bookmark

### Series (`routes/series.py`)
- `GET /api/series`: All series with optional category/subcategory filtering
- `POST /api/series/tags/filter`: Filter by tags, returns matching series + related tag counts
- `GET /api/series/{series_name}`: Full series detail with comics, stats, and continue-reading

### Admin (`routes/admin.py`)
- `GET /api/admin/users`: List all users (admin only)
- `DELETE /api/admin/users/{user_id}`: Delete user, prevents self-deletion (admin only)

## Scanning Architecture (Two-Phase)
- **Phase 1: Syncing**: Fast directory walk. Detects new, deleted, and changed files (via `mtime` and `size_bytes`). Updates folder structure and series records without opening archives.
- **Phase 2: Processing**: Background worker that opens archives to count pages and extract thumbnails for "pending" items.
- **On-Demand**: The `/api/read/{id}` endpoint performs "lazy" page counting if a comic hasn't been processed yet, ensuring the reader always has correct totals.

## Navigation System
- **Hierarchical Browsing**: Root → Category → Subcategory → Title.
- **Dynamic Relativization**: Frontend fetches `COMICS_DIR` from backend to accurately "subtract" the root path and derive categories, regardless of library location.
- **Contextual Back Button**: Smart navigation that remembers search queries and previous views.

## Known Bugs & Security Issues

### HIGH Severity
1. **SHA256 Password Hashing** (`database.py:248,273`): Uses `hashlib.sha256()` with no salt. README incorrectly claims bcrypt. Vulnerable to rainbow table attacks. Migrate to `bcrypt` or `argon2id`.
2. **Role Escalation on Registration** (`routes/auth.py:14,28`): The `UserCreate` Pydantic model accepts an arbitrary `role` string. Any user can POST `{"role": "admin"}` to `/api/auth/register` and become admin. The DB CHECK constraint accepts "admin" as valid. Fix: hardcode role to "reader" in the route, ignore client-supplied value.

### MEDIUM Severity
3. **Hardcoded COMICS_DIR** (`config.py:4`): Set to `Z:/ArrData/media/comics/manga`. No environment variable fallback. Not portable across machines or to Docker.
4. **Default Admin Credentials** (`server.py:44`): Creates `admin/admin123` on first run and prints credentials to stdout. No mechanism to force password change.

### LOW Severity
5. **SQL String Formatting** (`database.py:298`): `create_session()` uses `.format(expires_hours)` inside a SQL string instead of a parameterized query. Input is controlled (integer), but the pattern is unsafe.
6. **Session Expiry Default Mismatch** (`database.py:291` vs `routes/auth.py:44`): Function default is 24h but login passes 720h. Any direct caller using the default gets shorter sessions.
7. **Scan Status No Auth** (`routes/library.py:167`): `/api/scan/status` endpoint has no `Depends(get_current_user)`. All other library endpoints require auth. Minor info leak.
8. **Wrong Content Type for Pages** (`routes/library.py:335`): Always returns `media_type="image/jpeg"` regardless of actual image format (PNG, WebP, GIF, BMP are all supported in archives).

## Implemented Feature Set

### Authentication & Users
- User registration with username/password validation
- Login with 30-day session tokens (HttpOnly + SameSite cookies)
- Admin role with scan/user management privileges
- User preferences (theme, reader settings, view mode, sort)
- Logout with session cleanup

### Library Management
- Hierarchical navigation (Category > Subcategory > Title)
- Flatten mode (view all titles in subtree)
- Three view modes (grid, list, detailed)
- Multiple sort criteria (alpha, date, pages, size, recent)
- Global search with scoped/everywhere toggle
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
- Series result cards with cover fan display

### Library Scanning
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
- Cover "fan" display on folder and title cards

## Recent Changes
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
- ⏳ Migrate password hashing to bcrypt/argon2id
- ⏳ Fix role escalation on registration
- ⏳ Environment variable config support
- ⏳ Python type hints completion
- ⏳ Backend Unit Tests
- ⏳ ESLint/Prettier integration
- ⏳ Split library.js (1000+ lines) into smaller modules
- ⏳ Replace inline onclick handlers with event delegation
- ⏳ Structured logging (Python logging module)